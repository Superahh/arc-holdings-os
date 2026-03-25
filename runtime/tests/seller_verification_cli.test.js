"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { parseArgs, runSellerVerificationAction } = require("../seller_verification_cli");

function seedWorkflowState() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-seller-verification-"));
  const statePath = path.join(tempDir, "workflow_state.json");

  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  const record = upsertFromPipeline(state, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");
  saveWorkflowState(statePath, state, "2026-03-25T19:00:00.000Z");
  return { statePath, opportunityId: record.opportunity_id };
}

test("parseArgs validates action and response requirements", () => {
  assert.throws(() => parseArgs([]), /--state-path/);
  assert.throws(
    () => parseArgs(["--state-path", "wf.json", "--opportunity-id", "opp-1", "--action", "bad"]),
    /invalid --action/i
  );
  assert.throws(
    () =>
      parseArgs(["--state-path", "wf.json", "--opportunity-id", "opp-1", "--action", "response"]),
    /--response-status/
  );
  assert.throws(
    () =>
      parseArgs([
        "--state-path",
        "wf.json",
        "--opportunity-id",
        "opp-1",
        "--action",
        "request",
        "--priority",
        "critical",
      ]),
    /--priority/
  );
});

test("request action sets awaiting_seller_verification and blocks purchase", () => {
  const { statePath, opportunityId } = seedWorkflowState();
  const result = runSellerVerificationAction({
    statePath,
    opportunityId,
    action: "request",
    actor: "risk_agent",
    now: "2026-03-25T19:05:00.000Z",
    message: "Please send IMEI proof and carrier verification immediately.",
    reason: "Immediate seller verification required.",
    priority: "urgent",
    responseStatus: null,
    responseNotes: "",
    imeiVerified: null,
    carrierVerified: null,
  });

  assert.equal(result.action, "request");
  assert.equal(result.current_status, "awaiting_seller_verification");
  assert.equal(result.priority, "urgent");
  assert.equal(result.purchase_recommendation_blocked, true);
  assert.equal(result.seller_verification.response_status, "pending");
});

test("unsatisfactory response downgrades confidence and flags alternatives", () => {
  const { statePath, opportunityId } = seedWorkflowState();
  runSellerVerificationAction({
    statePath,
    opportunityId,
    action: "request",
    actor: "risk_agent",
    now: "2026-03-25T19:05:00.000Z",
    message: "Please send IMEI proof and carrier verification immediately.",
    reason: "Immediate seller verification required.",
    priority: "urgent",
    responseStatus: null,
    responseNotes: "",
    imeiVerified: null,
    carrierVerified: null,
  });

  const result = runSellerVerificationAction({
    statePath,
    opportunityId,
    action: "response",
    actor: "risk_agent",
    now: "2026-03-25T19:20:00.000Z",
    message: "",
    reason: "",
    priority: "urgent",
    responseStatus: "unsatisfactory",
    responseNotes: "Seller did not provide complete verification.",
    imeiVerified: false,
    carrierVerified: false,
  });

  assert.equal(result.action, "response");
  assert.equal(result.current_status, "awaiting_seller_verification");
  assert.equal(result.confidence, "low");
  assert.equal(result.alternative_opportunities_required, true);
  assert.equal(result.purchase_recommendation_blocked, true);
});
