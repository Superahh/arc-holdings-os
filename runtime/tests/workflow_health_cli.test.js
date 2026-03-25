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
const { parseArgs, computeWorkflowHealth, runWorkflowHealthAction } = require("../workflow_health_cli");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function seedWorkflowState() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-health-"));
  const statePath = path.join(tempDir, "workflow_state.json");
  const state = createEmptyWorkflowState("2026-03-25T18:00:00.000Z");

  const goldenOutput = runOpportunityPipeline(loadFixture("golden-scenario.json"), "2026-03-25T18:00:00.000Z");
  upsertFromPipeline(state, goldenOutput, "pipeline_runner", "2026-03-25T18:00:00.000Z");

  const rejectionOutput = runOpportunityPipeline(
    loadFixture("rejection-scenario.json"),
    "2026-03-25T18:10:00.000Z"
  );
  upsertFromPipeline(state, rejectionOutput, "pipeline_runner", "2026-03-25T18:10:00.000Z");
  applyDecisionToOpportunity(
    state,
    rejectionOutput.approval_ticket.ticket_id,
    "reject",
    "owner_operator",
    "2026-03-25T18:20:00.000Z"
  );

  saveWorkflowState(statePath, state, "2026-03-25T18:20:00.000Z");
  return { statePath, state };
}

test("parseArgs validates required state path and stale threshold", () => {
  assert.throws(() => parseArgs([]), /--state-path/);
  assert.throws(
    () => parseArgs(["--state-path", "state.json", "--stale-minutes", "0"]),
    /positive integer/
  );
});

test("computeWorkflowHealth reports stale non-terminal opportunities", () => {
  const { state } = seedWorkflowState();
  const health = computeWorkflowHealth(state, "2026-03-25T22:30:00.000Z", 120);

  assert.equal(health.workflow_totals.opportunities, 2);
  assert.equal(health.workflow_totals.status_counts.rejected, 1);
  assert.equal(health.workflow_totals.status_counts.researching, 1);
  assert.equal(health.kpis.stale_non_terminal_count, 1);
  assert.equal(health.observations.workflow_health, "at_risk");
});

test("runWorkflowHealthAction writes health artifact", () => {
  const { statePath } = seedWorkflowState();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-health-output-"));

  const result = runWorkflowHealthAction({
    statePath,
    baseDir: tempDir,
    now: "2026-03-25T22:30:00.000Z",
    staleMinutes: 120,
  });

  assert.equal(result.workflow_health, "at_risk");
  assert.equal(result.stale_non_terminal_count, 1);
  assert.ok(fs.existsSync(result.health_artifact_path), "Expected workflow health artifact file.");

  const artifact = JSON.parse(fs.readFileSync(result.health_artifact_path, "utf8"));
  assert.equal(artifact.kpis.stale_non_terminal_count, 1);
  assert.equal(artifact.observations.workflow_health, "at_risk");
});
