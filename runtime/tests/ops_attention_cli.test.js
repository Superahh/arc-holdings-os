"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { parseArgs, runAttentionAction, writeAttentionOutput } = require("../ops_attention_cli");

function seedQueue(tempDir, requiredBy) {
  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  const ticket = {
    ticket_id: "apr-attention-001",
    opportunity_id: "opp-attention-001",
    action_type: "acquisition",
    requested_by: "CEO Agent",
    recommended_option: "approve",
    decision_options: ["approve", "reject", "request_more_info"],
    max_exposure_usd: 200,
    reasoning_summary: "Attention test fixture.",
    risk_summary: "No critical blocker.",
    required_by: requiredBy,
  };
  enqueueApprovalTicket(queue, ticket, "attention_test", "2026-03-25T19:05:00.000Z");
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:05:00.000Z");
  return queuePath;
}

test("parseArgs keeps status args and detects --fail-on-overdue flag", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "queue.json", "--nudge-limit", "0"]),
    /--nudge-limit/
  );
  const parsed = parseArgs([
    "--queue-path",
    "queue.json",
    "--pending-limit",
    "5",
    "--task-limit",
    "10",
    "--nudge-limit",
    "3",
    "--output",
    "attention.json",
    "--fail-on-overdue",
  ]);
  assert.equal(parsed.queuePath, "queue.json");
  assert.equal(parsed.nudgeLimit, 3);
  assert.equal(parsed.outputPath, "attention.json");
  assert.equal(parsed.failOnOverdue, true);
});

test("runAttentionAction passes when no overdue tasks exist", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-attention-"));
  const queuePath = seedQueue(tempDir, "2026-03-25T21:00:00.000Z");

  const result = runAttentionAction({
    queuePath,
    workflowStatePath: null,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 10,
    nudgeLimit: 5,
    failOnOverdue: true,
  });

  assert.equal(result.result, "pass");
  assert.equal(result.awaiting_tasks.overdue_count, 0);
  assert.ok(result.attention.top_task, "Expected top task summary.");
  assert.equal(result.attention.top_task.source, "approval_queue");
  assert.equal(result.nudges.length, 0);
});

test("runAttentionAction fails when overdue tasks exist and flag is enabled", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-attention-"));
  const queuePath = seedQueue(tempDir, "2026-03-25T19:10:00.000Z");

  const result = runAttentionAction({
    queuePath,
    workflowStatePath: null,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 10,
    nudgeLimit: 5,
    failOnOverdue: true,
  });

  assert.equal(result.result, "fail_overdue_tasks");
  assert.equal(result.awaiting_tasks.overdue_count, 1);
  assert.equal(result.attention.top_task.overdue, true);
  assert.equal(result.nudges.length, 1);
  assert.equal(result.nudges[0].severity, "high");
  assert.match(result.nudges[0].message, /Review and decide approval ticket/);
});

test("writeAttentionOutput persists attention summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-attention-"));
  const queuePath = seedQueue(tempDir, "2026-03-25T21:00:00.000Z");
  const outputPath = path.join(tempDir, "attention.json");
  const result = runAttentionAction({
    queuePath,
    workflowStatePath: null,
    baseDir: tempDir,
    now: "2026-03-25T19:30:00.000Z",
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 10,
    nudgeLimit: 5,
    failOnOverdue: false,
  });
  const writtenPath = writeAttentionOutput(outputPath, result);

  assert.equal(writtenPath, outputPath);
  assert.equal(fs.existsSync(writtenPath), true);
  const written = JSON.parse(fs.readFileSync(writtenPath, "utf8"));
  assert.equal(written.result, "pass");
  assert.ok(written.attention);
});
