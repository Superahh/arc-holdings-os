"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runBootstrapAction } = require("../state_bootstrap_cli");

test("parseArgs requires at least one target and valid timestamp", () => {
  assert.throws(() => parseArgs([]), /at least one target/);
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--now", "not-a-date"]),
    /Invalid --now/
  );
});

test("runBootstrapAction writes queue and workflow files when absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-state-bootstrap-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowPath = path.join(tempDir, "workflow_state.json");

  const result = runBootstrapAction({
    queuePath,
    workflowStatePath: workflowPath,
    now: "2026-03-25T20:00:00.000Z",
    force: false,
  });

  assert.ok(fs.existsSync(queuePath), "Expected queue file.");
  assert.ok(fs.existsSync(workflowPath), "Expected workflow file.");
  assert.equal(result.queue.action, "written");
  assert.equal(result.workflow.action, "written");
});

test("runBootstrapAction skips existing files unless force is set", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-state-bootstrap-"));
  const queuePath = path.join(tempDir, "approval_queue.json");

  runBootstrapAction({
    queuePath,
    workflowStatePath: null,
    now: "2026-03-25T20:00:00.000Z",
    force: false,
  });
  const before = fs.readFileSync(queuePath, "utf8");

  const skipped = runBootstrapAction({
    queuePath,
    workflowStatePath: null,
    now: "2026-03-25T21:00:00.000Z",
    force: false,
  });
  assert.equal(skipped.queue.action, "skipped_existing");
  assert.equal(fs.readFileSync(queuePath, "utf8"), before);

  const forced = runBootstrapAction({
    queuePath,
    workflowStatePath: null,
    now: "2026-03-25T21:00:00.000Z",
    force: true,
  });
  assert.equal(forced.queue.action, "written");
  assert.notEqual(fs.readFileSync(queuePath, "utf8"), before);
});
