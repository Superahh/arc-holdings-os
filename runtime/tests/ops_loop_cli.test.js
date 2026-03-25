"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runOpsLoopAction } = require("../ops_loop_cli");

function writeFixture(tempDir, carrierStatus = "verified") {
  const sourcePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fixture.device.carrier_status = carrierStatus;
  fixture.device.imei_proof_verified = carrierStatus === "verified";
  const fixturePath = path.join(tempDir, `fixture-${carrierStatus}.json`);
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixturePath;
}

test("parseArgs validates required values", () => {
  assert.throws(() => parseArgs([]), /--fixture/);
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--sla-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--replay-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--pending-limit", "0"]),
    /positive integer/
  );
  assert.throws(
    () =>
      parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--workflow-stale-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--due-soon-minutes", "0"]),
    /positive integer/
  );
  assert.throws(
    () => parseArgs(["--fixture", "f.json", "--queue-path", "q.json", "--task-limit", "0"]),
    /positive integer/
  );
});

test("runOpsLoopAction writes loop artifact and downstream artifacts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ops-loop-"));
  const fixturePath = writeFixture(tempDir, "verified");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowPath = path.join(tempDir, "workflow_state.json");

  const result = runOpsLoopAction({
    fixture: fixturePath,
    queuePath,
    now: "2026-03-25T19:30:00.000Z",
    baseDir: tempDir,
    queueActor: "ops_loop_runner",
    workflowStatePath: workflowPath,
    workflowActor: "workflow_runner",
    dueSoonMinutes: 30,
    slaMinutes: 120,
    replayLimit: 50,
    pendingLimit: 10,
    taskLimit: 20,
  });

  assert.ok(fs.existsSync(result.loop_artifact_path), "Expected loop artifact file.");
  const loopArtifact = JSON.parse(fs.readFileSync(result.loop_artifact_path, "utf8"));
  assert.ok(fs.existsSync(loopArtifact.outputs.cycle_artifact_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.run_artifact_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.workflow_state_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.timeline_artifact_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.health_artifact_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.workflow_health_artifact_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.report_json_path));
  assert.ok(fs.existsSync(loopArtifact.outputs.report_markdown_path));
  assert.equal(loopArtifact.summary.awaiting_due_soon_count, 0);
  assert.equal(loopArtifact.summary.awaiting_overdue_count, 0);
  assert.equal(result.workflow_health, "watch");
  assert.equal(result.awaiting_due_soon_count, 0);
  assert.equal(result.awaiting_overdue_count, 0);
});
