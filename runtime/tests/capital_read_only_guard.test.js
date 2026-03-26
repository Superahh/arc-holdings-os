"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runPipelineAction } = require("../run_pipeline");
const { runDecisionAction } = require("../queue_decision_cli");
const { runOpsLoopAction } = require("../ops_loop_cli");

function fixturePath(name) {
  return path.join(__dirname, "..", "fixtures", name);
}

function listFilesRecursive(rootDir) {
  const results = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function writeFixture(tempDir, carrierStatus = "verified") {
  const sourcePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fixture.device.carrier_status = carrierStatus;
  fixture.device.imei_proof_verified = carrierStatus === "verified";
  const fixturePath = path.join(tempDir, `fixture-${carrierStatus}.json`);
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixturePath;
}

test("pipeline and decision flows do not create capital write-state files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-capital-read-only-"));
  const queuePath = path.join(tempDir, "state", "approval_queue.json");
  const workflowPath = path.join(tempDir, "state", "workflow_state.json");

  const pipelineResult = runPipelineAction({
    fixture: fixturePath("rejection-scenario.json"),
    now: "2026-03-26T16:00:00.000Z",
    baseDir: tempDir,
    queuePath,
    queueActor: "pipeline_runner",
    workflowStatePath: workflowPath,
    workflowActor: "workflow_runner",
    updateSnapshot: false,
    checkSnapshot: false,
  });

  const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  assert.equal(queue.items.length, 1);
  const ticketId = queue.items[0].ticket_id;
  assert.equal(typeof ticketId, "string");

  const decisionResult = runDecisionAction({
    queuePath,
    workflowStatePath: workflowPath,
    ticketId,
    decision: "approve",
    actor: "owner_operator",
    note: "Approval for guardrail validation.",
    now: "2026-03-26T16:05:00.000Z",
    baseDir: tempDir,
  });

  const allFiles = listFilesRecursive(tempDir).map((filePath) =>
    path.relative(tempDir, filePath).replaceAll("\\", "/")
  );
  const capitalNamedFiles = allFiles.filter((filePath) =>
    /capital/i.test(path.basename(filePath))
  );

  assert.equal(pipelineResult.recommendation, "acquire");
  assert.equal(decisionResult.decision, "approve");
  assert.equal(capitalNamedFiles.length, 0);

  const decisionArtifact = JSON.parse(fs.readFileSync(decisionResult.decision_artifact_path, "utf8"));
  assert.equal(typeof decisionArtifact.office_state.company_board_snapshot.capital_note, "string");
  assert.equal("capital_ledger" in decisionArtifact, false);
  assert.equal("capital_movements" in decisionArtifact, false);
});

test("ops loop flow does not create capital write-state files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-capital-ops-loop-"));
  const fixturePath = writeFixture(tempDir, "verified");
  const queuePath = path.join(tempDir, "state", "approval_queue.json");
  const workflowPath = path.join(tempDir, "state", "workflow_state.json");

  const result = runOpsLoopAction({
    fixture: fixturePath,
    queuePath,
    now: "2026-03-26T17:00:00.000Z",
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

  const allFiles = listFilesRecursive(tempDir).map((filePath) =>
    path.relative(tempDir, filePath).replaceAll("\\", "/")
  );
  const capitalNamedFiles = allFiles.filter((filePath) => /capital/i.test(path.basename(filePath)));

  assert.equal(typeof result.loop_artifact_path, "string");
  assert.equal(capitalNamedFiles.length, 0);
});
