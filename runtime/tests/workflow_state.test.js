"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  createEmptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  upsertFromPipeline,
  applyDecisionToOpportunity,
} = require("../workflow_state");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("workflow state persists and reloads", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-"));
  const statePath = path.join(tempDir, "workflow_state.json");

  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  const saved = saveWorkflowState(statePath, state, "2026-03-25T19:00:00.000Z");
  const reloaded = loadWorkflowState(saved);

  assert.equal(reloaded.schema_version, "v1");
  assert.deepEqual(reloaded.opportunities, {});
  assert.equal(Array.isArray(reloaded.event_log), true);
});

test("upsertFromPipeline maps request_more_info to researching", () => {
  const input = loadFixture("golden-scenario.json");
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const state = createEmptyWorkflowState("2026-03-25T19:20:00.000Z");
  const record = upsertFromPipeline(state, output, "pipeline_runner", "2026-03-25T19:20:00.000Z");

  assert.equal(record.current_status, "researching");
  assert.equal(record.approval_ticket_id, null);
  assert.equal(record.status_history.length, 1);
});

test("upsertFromPipeline maps acquisition recommendation to awaiting_approval", () => {
  const input = loadFixture("rejection-scenario.json");
  const output = runOpportunityPipeline(input, "2026-03-26T15:00:00.000Z");

  const state = createEmptyWorkflowState("2026-03-26T15:00:00.000Z");
  const record = upsertFromPipeline(state, output, "pipeline_runner", "2026-03-26T15:00:00.000Z");

  assert.equal(record.current_status, "awaiting_approval");
  assert.ok(record.approval_ticket_id, "Expected approval_ticket_id on awaiting_approval.");
});

test("applyDecisionToOpportunity transitions to rejected and approved", () => {
  const input = loadFixture("rejection-scenario.json");
  const output = runOpportunityPipeline(input, "2026-03-26T15:00:00.000Z");

  const state = createEmptyWorkflowState("2026-03-26T15:00:00.000Z");
  const seeded = upsertFromPipeline(state, output, "pipeline_runner", "2026-03-26T15:00:00.000Z");
  assert.equal(seeded.current_status, "awaiting_approval");

  const rejected = applyDecisionToOpportunity(
    state,
    output.approval_ticket.ticket_id,
    "reject",
    "owner_operator",
    "2026-03-26T15:15:00.000Z"
  );
  assert.equal(rejected.current_status, "rejected");

  const approved = applyDecisionToOpportunity(
    state,
    output.approval_ticket.ticket_id,
    "approve",
    "owner_operator",
    "2026-03-26T15:30:00.000Z"
  );
  assert.equal(approved.current_status, "approved");
});
