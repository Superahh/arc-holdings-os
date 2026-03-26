"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runAlignedMonitorAction,
  getAlignedMonitorExitCode,
} = require("../room_transition_aligned_monitor_cli");

test("parseArgs validates required and numeric arguments", () => {
  assert.throws(() => parseArgs([]), /--fixture is required/);
  assert.throws(() => parseArgs(["--fixture", "fixture.json"]), /--queue-path is required/);
  assert.throws(
    () =>
      parseArgs([
        "--fixture",
        "fixture.json",
        "--queue-path",
        "queue.json",
        "--stale-minutes",
        "0",
      ]),
    /--stale-minutes/
  );
  assert.throws(
    () =>
      parseArgs([
        "--fixture",
        "fixture.json",
        "--queue-path",
        "queue.json",
        "--now",
        "not-iso",
      ]),
    /--now must be ISO-8601 datetime/
  );
});

test("runAlignedMonitorAction runs ops loop then immediate request build and monitor capture", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-aligned-monitor-"));
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const baseDir = path.join(tempDir, "output");
  const validationsDir = path.join(baseDir, "room_transition_validations");

  const result = runAlignedMonitorAction({
    fixture: fixturePath,
    queuePath,
    workflowStatePath,
    now: "2026-03-26T14:00:00.000Z",
    baseDir,
    queueActor: "aligned_monitor_runner",
    workflowActor: "aligned_monitor_runner",
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    slaMinutes: 120,
    replayLimit: 50,
    pendingLimit: 10,
    taskLimit: 20,
    staleMinutes: 15,
    requestPath: path.join(validationsDir, "latest.aligned.request.json"),
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

  assert.equal(result.aligned_activity, "ops_loop");
  assert.equal(result.request_builder.satisfied, true);
  assert.equal(result.request_builder.source_intent.trigger_type, "handoff_completed");
  assert.equal(result.monitor.preflight.satisfied, true);
  assert.equal(result.monitor.capture.allowed, true);
  assert.equal(fs.existsSync(result.request_builder.output_path), true);
  assert.equal(fs.existsSync(result.monitor.freshness_path), true);
  assert.equal(
    getAlignedMonitorExitCode(result, {
      failOnIncompleteWindow: false,
      failOnNoGo: false,
    }),
    0
  );
});
