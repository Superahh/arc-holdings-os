"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  validateOpportunityRecord,
  validateApprovalTicket,
  validateHandoffPacket,
  validateAgentStatusCard,
  validateCompanyBoardSnapshot,
} = require("../contracts");

function loadGoldenFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

const IN_PERSON_ACTION_PATTERN = /\b(in[- ]person|face[- ]to[- ]face|meet(?:ing)?|pickup|on[- ]site|onsite)\b/i;

test("golden scenario produces a valid OpportunityRecord", () => {
  const input = loadGoldenFixture();
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const recordErrors = validateOpportunityRecord(output.opportunity_record);
  assert.equal(recordErrors.length, 0, `Unexpected OpportunityRecord errors: ${recordErrors.join(", ")}`);
  assert.equal(output.opportunity_record.opportunity_id, input.opportunity_id);

  const handoffErrors = validateHandoffPacket(output.handoff_packet);
  assert.equal(handoffErrors.length, 0, `Unexpected HandoffPacket errors: ${handoffErrors.join(", ")}`);
  assert.equal(output.agent_status_cards.length, 3);
  for (const card of output.agent_status_cards) {
    const cardErrors = validateAgentStatusCard(card);
    assert.equal(cardErrors.length, 0, `Unexpected AgentStatusCard errors: ${cardErrors.join(", ")}`);
  }
  const boardErrors = validateCompanyBoardSnapshot(output.company_board_snapshot);
  assert.equal(
    boardErrors.length,
    0,
    `Unexpected CompanyBoardSnapshot errors: ${boardErrors.join(", ")}`
  );
});

test("unverified carrier yields request_more_info and no approval ticket", () => {
  const input = loadGoldenFixture();
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  assert.equal(output.opportunity_record.recommendation, "request_more_info");
  assert.equal(output.approval_ticket, null);
  assert.equal(output.handoff_packet.from_agent, "Valuation Agent");
  assert.equal(output.handoff_packet.to_agent, "Risk and Compliance Agent");
  assert.equal(output.handoff_packet.payload_type, "OpportunityRecord");
  assert.match(output.handoff_packet.next_action, /remote/i);
  assert.equal(IN_PERSON_ACTION_PATTERN.test(output.handoff_packet.next_action), false);
  assert.equal(output.company_board_snapshot.approvals_waiting, 0);
});

test("verified carrier yields acquisition path with valid ApprovalTicket", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = true;
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  assert.equal(output.opportunity_record.recommendation, "acquire");
  assert.ok(output.approval_ticket, "Expected approval ticket for acquisition recommendation.");

  const ticketErrors = validateApprovalTicket(output.approval_ticket);
  assert.equal(ticketErrors.length, 0, `Unexpected ApprovalTicket errors: ${ticketErrors.join(", ")}`);
  assert.equal(output.approval_ticket.opportunity_id, input.opportunity_id);
  assert.equal(output.handoff_packet.payload_type, "ApprovalTicket");
  assert.equal(output.handoff_packet.to_agent, "Operations Coordinator Agent");
  assert.match(output.handoff_packet.next_action, /remote/i);
  assert.equal(IN_PERSON_ACTION_PATTERN.test(output.handoff_packet.next_action), false);
  assert.equal(output.company_board_snapshot.approvals_waiting, 1);
  assert.equal(output.agent_status_cards[0].status, "awaiting_approval");
});

test("verified carrier without IMEI proof stays blocked at request_more_info", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = false;
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  assert.equal(output.opportunity_record.recommendation, "request_more_info");
  assert.equal(output.opportunity_record.recommended_path, "request_more_info");
  assert.equal(output.approval_ticket, null);
  assert.equal(output.opportunity_record.risks.includes("imei proof unverified"), true);
});

test("weak economics yields skip recommendation", () => {
  const input = loadGoldenFixture();
  input.ask_price_usd = 1000;
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = true;
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  assert.equal(output.opportunity_record.recommendation, "skip");
  assert.equal(output.opportunity_record.recommended_path, "skip");
  assert.equal(output.approval_ticket, null);
  assert.equal(output.handoff_packet.to_agent, "Operations Coordinator Agent");
  assert.equal(output.handoff_packet.payload_type, "OpportunityRecord");
  assert.equal(IN_PERSON_ACTION_PATTERN.test(output.handoff_packet.next_action), false);
  assert.equal(output.handoff_packet.blocking_items.length, 0);
  assert.equal(output.company_board_snapshot.approvals_waiting, 0);
});
