"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { parseArgs, runOpsReportAction } = require("../ops_report_cli");

function createFixtureQueue(tempDir) {
  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  const ticket = {
    ticket_id: "apr-ops-001",
    opportunity_id: "opp-ops-001",
    action_type: "acquisition",
    requested_by: "CEO Agent",
    recommended_option: "approve",
    decision_options: ["approve", "reject", "request_more_info"],
    max_exposure_usd: 300,
    reasoning_summary: "Healthy expected margin.",
    risk_summary: "Standard risk profile.",
    required_by: "2026-03-25T21:00:00.000Z",
  };
  enqueueApprovalTicket(queue, ticket, "pipeline", "2026-03-25T19:05:00.000Z");

  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:05:00.000Z");
  return queuePath;
}

function createWorkflowStateFixture(tempDir) {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");
  const state = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  upsertFromPipeline(state, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");

  const statePath = path.join(tempDir, "workflow_state.json");
  saveWorkflowState(statePath, state, "2026-03-25T19:00:00.000Z");
  return statePath;
}

function seedArtifact(baseDir, subDir, fileName, content) {
  const dir = path.join(baseDir, subDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("parseArgs validates required args and numeric bounds", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--pending-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--task-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--sla-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--workflow-stale-minutes", "0"]),
    /positive integer/
  );
});

test("runOpsReportAction creates JSON and Markdown reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-report-"));
  const queuePath = createFixtureQueue(tempDir);
  const workflowStatePath = createWorkflowStateFixture(tempDir);

  seedArtifact(tempDir, "runs", "sample.artifact.json", "{}\n");
  seedArtifact(tempDir, "decisions", "sample.decision.json", "{}\n");
  seedArtifact(tempDir, "timelines", "sample.timeline.json", "{}\n");
  seedArtifact(tempDir, "health", "approval_queue--20260325T191000Z.health.json", "{}\n");
  seedArtifact(tempDir, "health", "workflow_state_workflow--20260325T191001Z.health.json", "{}\n");
  seedArtifact(tempDir, "cycles", "sample.cycle.json", "{}\n");

  const result = runOpsReportAction({
    queuePath,
    baseDir: tempDir,
    now: "2026-03-25T19:10:00.000Z",
    pendingLimit: 10,
    taskLimit: 20,
    slaMinutes: 120,
    workflowStatePath,
    workflowStaleMinutes: 240,
  });

  assert.equal(result.queue_health, "watch");
  assert.equal(result.workflow_health, "watch");
  assert.equal(result.pending_count, 1);
  assert.ok(fs.existsSync(result.report_json_path), "Expected JSON report file.");
  assert.ok(fs.existsSync(result.report_markdown_path), "Expected Markdown report file.");

  const jsonReport = JSON.parse(fs.readFileSync(result.report_json_path, "utf8"));
  const markdownReport = fs.readFileSync(result.report_markdown_path, "utf8");

  assert.equal(jsonReport.pending_tickets.length, 1);
  assert.equal(jsonReport.awaiting_tasks.total_count, 2);
  assert.equal(jsonReport.awaiting_tasks.returned_count, 2);
  assert.equal(jsonReport.awaiting_tasks.overdue_count, 0);
  assert.ok(jsonReport.workflow_health, "Expected workflow health block in report.");
  assert.ok(jsonReport.latest_artifacts.run, "Expected latest run artifact reference.");
  assert.ok(jsonReport.latest_artifacts.queue_health, "Expected latest queue health artifact reference.");
  assert.ok(jsonReport.latest_artifacts.workflow_health, "Expected latest workflow health artifact reference.");
  assert.ok(markdownReport.includes("# ARC Runtime Ops Report"));
  assert.ok(markdownReport.includes("Queue health: watch"));
  assert.ok(markdownReport.includes("Workflow health: watch"));
  assert.ok(markdownReport.includes("## Awaiting tasks"));
});
