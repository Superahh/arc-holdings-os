"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runCycleAction } = require("../company_cycle_cli");
const { loadQueue } = require("../approval_queue");

function buildFixture(tempDir, carrierStatus = "verified") {
  const sourcePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fixture.device.carrier_status = carrierStatus;
  const fixturePath = path.join(tempDir, `fixture-${carrierStatus}.json`);
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixturePath;
}

test("parseArgs validates required values", () => {
  assert.throws(() => parseArgs([]), /--fixture/);
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--sla-minutes", "0"]),
    /positive integer/
  );
});

test("runCycleAction writes cycle artifact and enqueues when approval exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cycle-"));
  const fixturePath = buildFixture(tempDir, "verified");
  const queuePath = path.join(tempDir, "approval_queue.json");

  const result = runCycleAction({
    fixture: fixturePath,
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
    queuePath,
    queueActor: "cycle_runner",
    slaMinutes: 120,
  });

  assert.ok(fs.existsSync(result.cycle_artifact_path), "Expected cycle artifact.");
  assert.ok(fs.existsSync(result.run_artifact_path), "Expected run artifact.");
  assert.equal(result.recommendation, "acquire");

  const queue = loadQueue(queuePath);
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].status, "pending");
});

test("runCycleAction does not enqueue when approval ticket is absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cycle-"));
  const fixturePath = buildFixture(tempDir, "unverified");
  const queuePath = path.join(tempDir, "approval_queue.json");

  const result = runCycleAction({
    fixture: fixturePath,
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
    queuePath,
    queueActor: "cycle_runner",
    slaMinutes: 120,
  });

  assert.equal(result.recommendation, "request_more_info");
  const queue = loadQueue(queuePath);
  assert.equal(queue.items.length, 0);
});

test("runCycleAction updates workflow state when workflow path is provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cycle-"));
  const fixturePath = buildFixture(tempDir, "verified");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowPath = path.join(tempDir, "workflow_state.json");

  const result = runCycleAction({
    fixture: fixturePath,
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
    queuePath,
    queueActor: "cycle_runner",
    workflowStatePath: workflowPath,
    workflowActor: "workflow_runner",
    slaMinutes: 120,
  });

  assert.ok(result.workflow_summary, "Expected workflow summary.");
  assert.equal(result.workflow_summary.current_status, "awaiting_approval");
  assert.ok(fs.existsSync(workflowPath), "Expected workflow state file.");
});
