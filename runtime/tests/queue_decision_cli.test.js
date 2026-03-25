"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue, loadQueue } = require("../approval_queue");
const { parseArgs, runDecisionAction } = require("../queue_decision_cli");

function loadGoldenFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("parseArgs enforces required arguments", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(() => parseArgs(["--queue-path", "x.json"]), /--ticket-id/);
  assert.throws(
    () => parseArgs(["--queue-path", "x.json", "--ticket-id", "apr-1"]),
    /--decision/
  );
});

test("runDecisionAction updates queue and writes decision artifact", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");
  assert.ok(output.approval_ticket, "Expected approval ticket.");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-decision-cli-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");
  saveQueue(queuePath, queue, "2026-03-25T19:21:00.000Z");

  const result = runDecisionAction({
    queuePath,
    ticketId: output.approval_ticket.ticket_id,
    decision: "approve",
    actor: "owner_operator",
    note: "Remote checks passed.",
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
  });

  assert.equal(result.ticket_id, output.approval_ticket.ticket_id);
  assert.equal(result.decision, "approve");
  assert.equal(result.pending_count, 0);
  assert.ok(fs.existsSync(result.queue_path), "Expected queue file to exist.");
  assert.ok(fs.existsSync(result.decision_artifact_path), "Expected decision artifact file to exist.");

  const updatedQueue = loadQueue(queuePath);
  assert.equal(updatedQueue.items[0].status, "approve");
  assert.equal(updatedQueue.items[0].decided_by, "owner_operator");

  const artifact = JSON.parse(fs.readFileSync(result.decision_artifact_path, "utf8"));
  assert.equal(artifact.decision, "approve");
  assert.equal(artifact.office_state.company_board_snapshot.approvals_waiting, 0);
  assert.equal(Array.isArray(artifact.office_state.agent_status_cards), true);
});

test("request_more_info decision marks blocked state in office artifact", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-decision-cli-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");
  saveQueue(queuePath, queue, "2026-03-25T19:21:00.000Z");

  const result = runDecisionAction({
    queuePath,
    ticketId: output.approval_ticket.ticket_id,
    decision: "request_more_info",
    actor: "owner_operator",
    note: "Need clearer IMEI media.",
    now: "2026-03-25T19:35:00.000Z",
    baseDir: tempDir,
  });

  const artifact = JSON.parse(fs.readFileSync(result.decision_artifact_path, "utf8"));
  assert.equal(artifact.decision, "request_more_info");
  assert.equal(artifact.office_state.company_board_snapshot.blocked_count, 1);
});
