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
const { parseArgs, runWorkflowReplayAction } = require("../workflow_replay_cli");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function seedWorkflowState() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-replay-"));
  const statePath = path.join(tempDir, "workflow_state.json");
  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");

  const goldenOutput = runOpportunityPipeline(loadFixture("golden-scenario.json"), "2026-03-25T19:00:00.000Z");
  upsertFromPipeline(state, goldenOutput, "pipeline_runner", "2026-03-25T19:00:00.000Z");

  const rejectionOutput = runOpportunityPipeline(
    loadFixture("rejection-scenario.json"),
    "2026-03-25T19:10:00.000Z"
  );
  upsertFromPipeline(state, rejectionOutput, "pipeline_runner", "2026-03-25T19:10:00.000Z");
  applyDecisionToOpportunity(
    state,
    rejectionOutput.approval_ticket.ticket_id,
    "reject",
    "owner_operator",
    "2026-03-25T19:20:00.000Z"
  );

  saveWorkflowState(statePath, state, "2026-03-25T19:20:00.000Z");
  return { tempDir, statePath, rejectionId: rejectionOutput.opportunity_record.opportunity_id };
}

test("parseArgs validates required state path and positive limit", () => {
  assert.throws(() => parseArgs([]), /--state-path/);
  assert.throws(
    () => parseArgs(["--state-path", "state.json", "--limit", "0"]),
    /positive integer/
  );
});

test("runWorkflowReplayAction writes timeline artifact for all events", () => {
  const { tempDir, statePath } = seedWorkflowState();
  const result = runWorkflowReplayAction({
    statePath,
    baseDir: tempDir,
    opportunityId: null,
    limit: 50,
    now: "2026-03-25T19:30:00.000Z",
  });

  assert.ok(fs.existsSync(result.timeline_artifact_path), "Expected timeline artifact file.");
  assert.equal(result.total_events, 3);
  assert.equal(result.included_events, 3);
});

test("runWorkflowReplayAction filters by opportunity and applies limit", () => {
  const { tempDir, statePath, rejectionId } = seedWorkflowState();
  const result = runWorkflowReplayAction({
    statePath,
    baseDir: tempDir,
    opportunityId: rejectionId,
    limit: 1,
    now: "2026-03-25T19:30:00.000Z",
  });

  assert.equal(result.opportunity_id, rejectionId);
  assert.equal(result.total_events, 2);
  assert.equal(result.included_events, 1);

  const artifact = JSON.parse(fs.readFileSync(result.timeline_artifact_path, "utf8"));
  assert.equal(artifact.events.length, 1);
  assert.equal(artifact.events[0].opportunity_id, rejectionId);
});
