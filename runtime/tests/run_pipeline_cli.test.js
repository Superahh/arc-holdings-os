"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runPipelineAction } = require("../run_pipeline");

function fixturePath(name) {
  return path.join(__dirname, "..", "fixtures", name);
}

test("parseArgs enforces required fixture", () => {
  assert.throws(() => parseArgs([]), /--fixture/);
});

test("runPipelineAction writes workflow state for request_more_info path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-run-pipeline-"));
  const workflowPath = path.join(tempDir, "workflow_state.json");

  const result = runPipelineAction({
    fixture: fixturePath("golden-scenario.json"),
    now: "2026-03-25T19:20:00.000Z",
    baseDir: tempDir,
    queuePath: null,
    queueActor: "pipeline_runner",
    workflowStatePath: workflowPath,
    workflowActor: "workflow_runner",
    updateSnapshot: false,
    checkSnapshot: false,
  });

  assert.equal(result.recommendation, "request_more_info");
  assert.ok(result.workflow_result, "Expected workflow result.");
  assert.equal(result.workflow_result.current_status, "awaiting_seller_verification");
  assert.ok(fs.existsSync(workflowPath), "Expected workflow state to be persisted.");
});

test("runPipelineAction enqueues approval and sets awaiting_approval in workflow", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-run-pipeline-"));
  const workflowPath = path.join(tempDir, "workflow_state.json");
  const queuePath = path.join(tempDir, "approval_queue.json");

  const result = runPipelineAction({
    fixture: fixturePath("rejection-scenario.json"),
    now: "2026-03-26T15:00:00.000Z",
    baseDir: tempDir,
    queuePath,
    queueActor: "pipeline_runner",
    workflowStatePath: workflowPath,
    workflowActor: "workflow_runner",
    updateSnapshot: false,
    checkSnapshot: false,
  });

  assert.equal(result.recommendation, "acquire");
  assert.ok(result.queue_result, "Expected queue result.");
  assert.equal(result.queue_result.pending_count, 1);
  assert.ok(result.workflow_result, "Expected workflow result.");
  assert.equal(result.workflow_result.current_status, "awaiting_approval");
});
