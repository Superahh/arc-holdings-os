"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, listFixtureFiles, runBatchOpsAction } = require("../batch_ops_cli");

function writeFixture(filePath, carrierStatus) {
  const sourcePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fixture.opportunity_id = `${fixture.opportunity_id}-${carrierStatus}`;
  fixture.device.carrier_status = carrierStatus;
  fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}

test("parseArgs validates required args and numeric bounds", () => {
  assert.throws(() => parseArgs([]), /--fixtures-dir/);
  assert.throws(
    () => parseArgs(["--fixtures-dir", "f", "--queue-path", "q", "--sla-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixtures-dir", "f", "--queue-path", "q", "--file-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixtures-dir", "f", "--queue-path", "q", "--task-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixtures-dir", "f", "--queue-path", "q", "--due-soon-minutes", "0"]),
    /positive integer/
  );
});

test("listFixtureFiles returns sorted json files with limit", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-batch-list-"));
  fs.writeFileSync(path.join(tempDir, "b.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "a.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "ignore.txt"), "x\n", "utf8");

  const files = listFixtureFiles(tempDir);
  assert.equal(files.length, 2);
  assert.ok(files[0].endsWith("a.json"));
  assert.ok(files[1].endsWith("b.json"));

  const limited = listFixtureFiles(tempDir, 1);
  assert.equal(limited.length, 1);
});

test("runBatchOpsAction executes loop across fixtures and writes batch artifact", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-batch-run-"));
  const fixturesDir = path.join(tempDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  writeFixture(path.join(fixturesDir, "f1_verified.json"), "verified");
  writeFixture(path.join(fixturesDir, "f2_unverified.json"), "unverified");

  const result = runBatchOpsAction({
    fixturesDir,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    workflowActor: "workflow_runner",
    dueSoonMinutes: 30,
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
    queueActor: "batch_runner",
    slaMinutes: 120,
    replayLimit: 10,
    pendingLimit: 5,
    taskLimit: 20,
    fileLimit: null,
  });

  assert.ok(fs.existsSync(result.batch_artifact_path), "Expected batch artifact file.");
  assert.equal(result.total_runs, 2);
  assert.equal(result.acquire_count + result.request_more_info_count + result.skip_count, 2);
  assert.ok(result.workflow_state_path, "Expected workflow_state_path in summary.");
  assert.equal(result.final_workflow_health, "watch");
  assert.equal(typeof result.final_awaiting_due_soon_count, "number");
  assert.equal(typeof result.final_awaiting_overdue_count, "number");

  const batch = JSON.parse(fs.readFileSync(result.batch_artifact_path, "utf8"));
  assert.equal(batch.runs.length, 2);
  assert.ok(fs.existsSync(batch.runs[0].loop_artifact_path));
  assert.ok(fs.existsSync(batch.runs[1].loop_artifact_path));
  assert.ok(fs.existsSync(batch.summary.workflow_state_path));
  assert.equal(batch.summary.final_workflow_health, "watch");
  assert.equal(batch.summary.final_awaiting_due_soon_count, result.final_awaiting_due_soon_count);
  assert.equal(batch.summary.final_awaiting_overdue_count, result.final_awaiting_overdue_count);
});
