"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  createEmptyWorkflowState,
  upsertFromPipeline,
  applyDecisionToOpportunity,
  saveWorkflowState,
} = require("../workflow_state");
const { parseArgs, runListAction } = require("../workflow_list_cli");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function seedWorkflowState() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-list-"));
  const statePath = path.join(tempDir, "workflow_state.json");
  const state = createEmptyWorkflowState("2026-03-26T15:00:00.000Z");

  const goldenOutput = runOpportunityPipeline(loadFixture("golden-scenario.json"), "2026-03-25T19:20:00.000Z");
  upsertFromPipeline(state, goldenOutput, "pipeline_runner", "2026-03-25T19:20:00.000Z");

  const rejectionOutput = runOpportunityPipeline(
    loadFixture("rejection-scenario.json"),
    "2026-03-26T15:00:00.000Z"
  );
  upsertFromPipeline(state, rejectionOutput, "pipeline_runner", "2026-03-26T15:00:00.000Z");
  applyDecisionToOpportunity(
    state,
    rejectionOutput.approval_ticket.ticket_id,
    "reject",
    "owner_operator",
    "2026-03-26T15:10:00.000Z"
  );

  saveWorkflowState(statePath, state, "2026-03-26T15:10:00.000Z");
  return { statePath, goldenOutput, rejectionOutput };
}

test("parseArgs validates required arguments", () => {
  assert.throws(() => parseArgs([]), /--state-path/);
  assert.throws(
    () => parseArgs(["--state-path", "wf.json", "--mode", "invalid"]),
    /Invalid --mode/
  );
  assert.throws(
    () => parseArgs(["--state-path", "wf.json", "--mode", "opportunity"]),
    /--opportunity-id/
  );
});

test("summary mode reports status counts", () => {
  const { statePath } = seedWorkflowState();
  const result = runListAction({
    statePath,
    mode: "summary",
    opportunityId: null,
    limit: 10,
  });

  assert.equal(result.mode, "summary");
  assert.equal(result.totals.opportunities, 2);
  assert.equal(result.status_counts.awaiting_seller_verification, 1);
  assert.equal(result.status_counts.rejected, 1);
});

test("opportunity mode returns the specific record", () => {
  const { statePath, rejectionOutput } = seedWorkflowState();
  const result = runListAction({
    statePath,
    mode: "opportunity",
    opportunityId: rejectionOutput.opportunity_record.opportunity_id,
    limit: 10,
  });

  assert.equal(result.mode, "opportunity");
  assert.equal(result.opportunity.current_status, "rejected");
  assert.equal(result.opportunity.approval_ticket_id, rejectionOutput.approval_ticket.ticket_id);
});

test("history mode returns opportunity status history in reverse chronological order", () => {
  const { statePath, rejectionOutput } = seedWorkflowState();
  const result = runListAction({
    statePath,
    mode: "history",
    opportunityId: rejectionOutput.opportunity_record.opportunity_id,
    limit: 10,
  });

  assert.equal(result.mode, "history");
  assert.equal(result.opportunity_id, rejectionOutput.opportunity_record.opportunity_id);
  assert.ok(result.status_history.length >= 2);
  assert.equal(result.status_history[0].status, "rejected");
});
