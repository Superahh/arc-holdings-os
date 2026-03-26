"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const {
  parseArgs,
  runDecisionAlignedMonitorAction,
  getDecisionAlignedMonitorExitCode,
} = require("../room_transition_decision_aligned_monitor_cli");

test("parseArgs validates required and numeric arguments", () => {
  assert.throws(() => parseArgs([]), /--queue-path is required/);
  assert.throws(() => parseArgs(["--queue-path", "queue.json"]), /--ticket-id is required/);
  assert.throws(
    () => parseArgs(["--queue-path", "queue.json", "--ticket-id", "apr-1"]),
    /--decision is required/
  );
  assert.throws(
    () =>
      parseArgs([
        "--queue-path",
        "queue.json",
        "--ticket-id",
        "apr-1",
        "--decision",
        "approve",
        "--stale-minutes",
        "0",
      ]),
    /--stale-minutes/
  );
});

test("runDecisionAlignedMonitorAction captures fresh approval-resolved intent after decision", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-decision-aligned-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const validationsDir = path.join(baseDir, "room_transition_validations");
  const input = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "fixtures", "golden-scenario.json"), "utf8")
  );
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = true;
  const output = runOpportunityPipeline(input, "2026-03-26T15:00:00.000Z");

  const queue = createEmptyQueue("2026-03-26T15:00:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline_runner", "2026-03-26T15:01:00.000Z");
  saveQueue(queuePath, queue, "2026-03-26T15:01:00.000Z");

  const workflow = createEmptyWorkflowState("2026-03-26T15:00:00.000Z");
  upsertFromPipeline(workflow, output, "pipeline_runner", "2026-03-26T15:00:00.000Z");
  saveWorkflowState(workflowStatePath, workflow, "2026-03-26T15:00:00.000Z");

  const result = runDecisionAlignedMonitorAction({
    queuePath,
    ticketId: output.approval_ticket.ticket_id,
    decision: "approve",
    actor: "owner_operator",
    workflowActor: "owner_operator",
    workflowStatePath,
    note: "Aligned decision capture test.",
    now: "2026-03-26T15:05:00.000Z",
    baseDir,
    staleMinutes: 15,
    requestPath: path.join(validationsDir, "latest.decision-aligned.request.json"),
    snapshotPath: null,
    recordsDir: path.join(validationsDir, "records"),
    summariesDir: validationsDir,
    checkpointPath: path.join(validationsDir, "latest.checkpoint.json"),
    trendPath: path.join(validationsDir, "latest.trend.json"),
    freshnessPath: path.join(validationsDir, "latest.intent-freshness.json"),
    briefPath: path.join(validationsDir, "latest.operator-brief.md"),
    windowHours: 168,
    maxFiles: 500,
    maxPoints: 20,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnIncompleteWindow: false,
    failOnNoGo: false,
  });

  assert.equal(result.aligned_activity, "approval_decision");
  assert.equal(result.request_builder.satisfied, true);
  assert.equal(result.request_builder.source_intent.trigger_type, "approval_resolved");
  assert.equal(result.monitor.preflight.satisfied, true);
  assert.equal(result.monitor.preflight.freshness.totals.fresh_count >= 1, true);
  assert.equal(result.monitor.capture.allowed, true);
  assert.equal(fs.existsSync(result.request_builder.output_path), true);
  assert.equal(fs.existsSync(result.monitor.freshness_path), true);
  assert.equal(
    getDecisionAlignedMonitorExitCode(result, {
      failOnIncompleteWindow: false,
      failOnNoGo: false,
    }),
    0
  );
});
