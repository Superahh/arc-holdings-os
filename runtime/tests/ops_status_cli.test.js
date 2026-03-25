"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { parseArgs, runStatusAction } = require("../ops_status_cli");

function seedQueue(tempDir) {
  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  const ticket = {
    ticket_id: "apr-status-001",
    opportunity_id: "opp-status-001",
    action_type: "acquisition",
    requested_by: "CEO Agent",
    recommended_option: "approve",
    decision_options: ["approve", "reject", "request_more_info"],
    max_exposure_usd: 250,
    reasoning_summary: "Healthy margin band.",
    risk_summary: "No critical blocker.",
    required_by: "2026-03-25T22:00:00.000Z",
  };
  enqueueApprovalTicket(queue, ticket, "pipeline_runner", "2026-03-25T19:05:00.000Z");
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:05:00.000Z");
  return queuePath;
}

function seedWorkflow(tempDir) {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");
  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  upsertFromPipeline(state, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");

  const statePath = path.join(tempDir, "workflow_state.json");
  saveWorkflowState(statePath, state, "2026-03-25T19:00:00.000Z");
  return statePath;
}

function seedRunArtifact(tempDir, opportunityId, nextAction, dueBy) {
  const runsDir = path.join(tempDir, "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const artifactPath = path.join(runsDir, `${opportunityId}--test.artifact.json`);
  const artifact = {
    schema_version: "v1",
    generated_at: "2026-03-25T19:05:00.000Z",
    opportunity_id: opportunityId,
    output: {
      handoff_packet: {
        next_action: nextAction,
        due_by: dueBy,
      },
    },
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

test("parseArgs validates required and numeric arguments", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--pending-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--workflow-stale-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--task-limit", "0"]),
    /positive integer/
  );
});

test("runStatusAction returns queue-only summary when workflow path is absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-status-"));
  const queuePath = seedQueue(tempDir);

  const result = runStatusAction({
    queuePath,
    workflowStatePath: null,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 20,
  });

  assert.equal(result.queue.health.queue_totals.pending, 1);
  assert.equal(result.queue.health.observations.queue_health, "watch");
  assert.equal(result.workflow, null);
  assert.equal(result.awaiting_tasks.total_count, 1);
  assert.equal(result.awaiting_tasks.returned_count, 1);
  assert.equal(result.awaiting_tasks.tasks[0].source, "approval_queue");
});

test("runStatusAction returns queue and workflow summary when workflow path is provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-status-"));
  const queuePath = seedQueue(tempDir);
  const workflowStatePath = seedWorkflow(tempDir);

  const result = runStatusAction({
    queuePath,
    workflowStatePath,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 20,
  });

  assert.equal(result.queue.health.observations.queue_health, "watch");
  assert.ok(result.workflow, "Expected workflow summary.");
  assert.equal(result.workflow.health.observations.workflow_health, "watch");
  assert.equal(Array.isArray(result.workflow.stale_opportunities), true);
  assert.equal(result.awaiting_tasks.total_count, 2);
  assert.equal(result.awaiting_tasks.returned_count, 2);
  assert.equal(
    result.awaiting_tasks.tasks.some((task) => task.source === "workflow_state" && task.status === "researching"),
    true
  );
});

test("runStatusAction uses latest handoff next_action and due_by when available", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-status-"));
  const queuePath = seedQueue(tempDir);
  const workflowStatePath = seedWorkflow(tempDir);

  seedRunArtifact(
    tempDir,
    "opp-2026-03-25-001",
    "Request remote IMEI proof and verify carrier status.",
    "2026-03-25T20:00:00.000Z"
  );

  const result = runStatusAction({
    queuePath,
    workflowStatePath,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 20,
  });

  const workflowTask = result.awaiting_tasks.tasks.find((task) => task.source === "workflow_state");
  assert.ok(workflowTask, "Expected workflow task.");
  assert.equal(workflowTask.next_action, "Request remote IMEI proof and verify carrier status.");
  assert.equal(workflowTask.due_by, "2026-03-25T20:00:00.000Z");
});
