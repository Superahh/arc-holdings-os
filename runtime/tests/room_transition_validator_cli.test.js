"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const {
  createEmptyWorkflowState,
  upsertFromPipeline,
  saveWorkflowState,
} = require("../workflow_state");
const { buildUiSnapshot } = require("../ui_snapshot");
const {
  parseArgs,
  validateRoomTransitionRequest,
} = require("../room_transition_validator_cli");

function seedFixtureEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-transition-validator-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  enqueueApprovalTicket(
    queue,
    {
      ticket_id: "apr-room-transition-001",
      opportunity_id: output.opportunity_record.opportunity_id,
      action_type: "acquisition",
      requested_by: "CEO Agent",
      recommended_option: "request_more_info",
      decision_options: ["approve", "reject", "request_more_info"],
      max_exposure_usd: 460,
      reasoning_summary: "Hold capital until verification clears.",
      risk_summary: "IMEI and carrier verification remain open.",
      required_by: "2026-03-25T21:00:00.000Z",
    },
    "pipeline_runner",
    "2026-03-25T19:02:00.000Z"
  );
  saveQueue(queuePath, queue, "2026-03-25T19:02:00.000Z");

  const workflowState = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  upsertFromPipeline(workflowState, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");
  saveWorkflowState(workflowStatePath, workflowState, "2026-03-25T19:00:00.000Z");

  writeRunArtifact(baseDir, buildRunArtifact(fixture, output, "2026-03-25T19:00:00.000Z"));

  return {
    baseDir,
    queuePath,
    workflowStatePath,
  };
}

test("parseArgs enforces required and strict arguments", () => {
  assert.throws(() => parseArgs([]), /--request-path/);
  assert.throws(
    () => parseArgs(["--request-path", "request.json", "--stale-minutes", "0"]),
    /--stale-minutes/
  );
  assert.throws(
    () => parseArgs(["--request-path", "request.json", "--unknown"]),
    /Unknown argument/
  );
});

test("validateRoomTransitionRequest passes for valid manual boundary request", () => {
  const env = seedFixtureEnvironment();
  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
  });
  const intent = snapshot.office.movement_intents[0];

  const result = validateRoomTransitionRequest({
    request: {
      request_id: "rtr-001",
      intent_id: intent.intent_id,
      opportunity_id: intent.opportunity_id,
      agent: intent.agent,
      from_zone_id: intent.from_zone_id,
      to_zone_id: intent.to_zone_id,
      requested_by: "ui_operator",
      requested_at: "2026-03-25T19:10:30.000Z",
      reason: "Preview deterministic transition before manual commit.",
      mode: "manual_preview_commit",
      status: "requested",
      policy_checks: [
        "intent_exists",
        "non_terminal_opportunity",
        "no_capital_side_effects",
        "no_workflow_mutation",
        "audit_required",
      ],
    },
    snapshot,
    now: "2026-03-25T19:10:30.000Z",
    staleMinutes: 15,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.request_errors.length, 0);
  assert.equal(result.checks.every((check) => check.pass), true);
});

test("validateRoomTransitionRequest fails stale and mismatched requests", () => {
  const env = seedFixtureEnvironment();
  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
  });
  const intent = snapshot.office.movement_intents[0];

  const result = validateRoomTransitionRequest({
    request: {
      request_id: "rtr-002",
      intent_id: intent.intent_id,
      opportunity_id: intent.opportunity_id,
      agent: "Wrong Agent",
      from_zone_id: intent.from_zone_id,
      to_zone_id: intent.to_zone_id,
      requested_by: "ui_operator",
      requested_at: "2026-03-25T20:00:00.000Z",
      reason: "Deliberate negative test.",
      mode: "manual_preview_commit",
      status: "requested",
      policy_checks: [
        "intent_exists",
        "non_terminal_opportunity",
        "no_capital_side_effects",
        "no_workflow_mutation",
      ],
    },
    snapshot,
    now: "2026-03-25T20:00:00.000Z",
    staleMinutes: 15,
  });

  assert.equal(result.allowed, false);
  const failedChecks = result.checks.filter((check) => !check.pass).map((check) => check.name);
  assert.equal(failedChecks.includes("snapshot_identity_match"), true);
  assert.equal(failedChecks.includes("intent_fresh"), true);
  assert.equal(failedChecks.includes("policy_check_list_complete"), true);
});
