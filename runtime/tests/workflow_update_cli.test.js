"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { parseArgs, runUpdateAction } = require("../workflow_update_cli");

function seedWorkflowState() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-workflow-update-"));
  const statePath = path.join(tempDir, "workflow_state.json");

  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  const record = upsertFromPipeline(state, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");
  saveWorkflowState(statePath, state, "2026-03-25T19:00:00.000Z");
  return { statePath, opportunityId: record.opportunity_id };
}

test("parseArgs validates required fields and status enum", () => {
  assert.throws(() => parseArgs([]), /--state-path/);
  assert.throws(
    () => parseArgs(["--state-path", "s.json", "--opportunity-id", "opp-1"]),
    /--status/
  );
  assert.throws(
    () =>
      parseArgs(["--state-path", "s.json", "--opportunity-id", "opp-1", "--status", "invalid_status"]),
    /Invalid --status/
  );
});

test("runUpdateAction applies valid transition", () => {
  const { statePath, opportunityId } = seedWorkflowState();
  const result = runUpdateAction({
    statePath,
    opportunityId,
    status: "awaiting_approval",
    actor: "risk_agent",
    reason: "Remote verification complete; waiting approval gate.",
    now: "2026-03-25T19:10:00.000Z",
    forceTransition: false,
  });

  assert.equal(result.previous_status, "researching");
  assert.equal(result.current_status, "awaiting_approval");
  assert.equal(result.force_transition, false);
});

test("runUpdateAction rejects invalid transition unless forced", () => {
  const { statePath, opportunityId } = seedWorkflowState();

  assert.throws(
    () =>
      runUpdateAction({
        statePath,
        opportunityId,
        status: "monetizing",
        actor: "ops_agent",
        reason: "Jumping ahead should fail.",
        now: "2026-03-25T19:10:00.000Z",
        forceTransition: false,
      }),
    /Invalid status transition/
  );

  const forced = runUpdateAction({
    statePath,
    opportunityId,
    status: "monetizing",
    actor: "ops_agent",
    reason: "Forced recovery transition.",
    now: "2026-03-25T19:15:00.000Z",
    forceTransition: true,
  });
  assert.equal(forced.current_status, "monetizing");
  assert.equal(forced.force_transition, true);
});
