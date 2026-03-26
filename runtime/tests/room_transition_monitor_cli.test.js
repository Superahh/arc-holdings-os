"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runMonitorAction,
  getMonitorExitCode,
} = require("../room_transition_monitor_cli");

test("parseArgs validates required and numeric arguments", () => {
  assert.throws(() => parseArgs([]), /--request-path is required/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(
    () => parseArgs(["--request-path", "req.json", "--window-hours", "0"]),
    /--window-hours/
  );
  assert.throws(
    () => parseArgs(["--request-path", "req.json", "--min-allowed-rate", "2"]),
    /--min-allowed-rate/
  );
  const parsed = parseArgs(["--request-path", "req.json", "--fail-on-no-go"]);
  assert.equal(parsed.failOnNoGo, true);
});

test("runMonitorAction runs capture + checkpoint + trend + brief", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-monitor-"));
  const validationsDir = path.join(tempDir, "room_transition_validations");
  const recordsDir = path.join(validationsDir, "records");
  const summariesDir = validationsDir;
  const checkpointPath = path.join(validationsDir, "latest.checkpoint.json");
  const trendPath = path.join(validationsDir, "latest.trend.json");
  const briefPath = path.join(validationsDir, "latest.operator-brief.md");
  const requestPath = path.join(
    __dirname,
    "..",
    "fixtures",
    "room-transition-request.sample.json"
  );
  const snapshotPath = path.join(tempDir, "snapshot.json");

  const snapshot = {
    workflow: {
      opportunities: [
        {
          opportunity_id: "opp-2026-03-25-001",
          current_status: "awaiting_approval",
        },
      ],
    },
    office: {
      movement_intents: [
        {
          intent_id: "intent-office-approval-waiting-apr-001-2026-03-25T19:02:00.000Z",
          opportunity_id: "opp-2026-03-25-001",
          agent: "CEO Agent",
          from_zone_id: "executive-suite",
          to_zone_id: "executive-suite",
          trigger_timestamp: "2026-03-26T13:55:00.000Z",
          trigger_type: "approval_waiting",
        },
      ],
    },
  };
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const result = runMonitorAction({
    requestPath,
    snapshotPath,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    baseDir: path.join(tempDir, "output"),
    staleMinutes: 15,
    now: "2026-03-26T14:00:00.000Z",
    recordsDir,
    summariesDir,
    checkpointPath,
    trendPath,
    briefPath,
    windowHours: 168,
    maxFiles: 500,
    maxPoints: 20,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    requireFreshIntent: false,
  });

  assert.equal(result.capture.allowed, true);
  assert.equal(result.preflight.satisfied, true);
  assert.equal(fs.existsSync(result.capture.output_path), true);
  assert.equal(fs.existsSync(checkpointPath), true);
  assert.equal(fs.existsSync(trendPath), true);
  assert.equal(fs.existsSync(briefPath), true);
  assert.equal(result.gate.promotion_decision, "no_go");

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  assert.equal(checkpoint.snapshot.totals.records_considered, 1);
});

test("getMonitorExitCode enforces optional gate failures", () => {
  const failingResult = {
    gate: {
      promotion_decision: "no_go",
      full_window_observed: false,
    },
  };
  assert.equal(
    getMonitorExitCode(failingResult, {
      failOnIncompleteWindow: true,
      failOnNoGo: false,
      requireFreshIntent: false,
    }),
    2
  );
  assert.equal(
    getMonitorExitCode(failingResult, {
      failOnIncompleteWindow: false,
      failOnNoGo: true,
      requireFreshIntent: false,
    }),
    2
  );
  assert.equal(
    getMonitorExitCode(
      {
        gate: {
          promotion_decision: "candidate_for_review",
          full_window_observed: true,
        },
      },
      {
        failOnIncompleteWindow: true,
        failOnNoGo: true,
        requireFreshIntent: false,
      }
    ),
    0
  );
});

test("runMonitorAction can fail preflight when fresh intent is required", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-monitor-preflight-"));
  const requestPath = path.join(
    __dirname,
    "..",
    "fixtures",
    "room-transition-request.sample.json"
  );
  const snapshotPath = path.join(tempDir, "snapshot.json");

  const snapshot = {
    workflow: {
      opportunities: [
        {
          opportunity_id: "opp-2026-03-25-001",
          current_status: "awaiting_approval",
        },
      ],
    },
    office: {
      movement_intents: [
        {
          intent_id: "intent-office-approval-waiting-apr-001-2026-03-25T19:02:00.000Z",
          opportunity_id: "opp-2026-03-25-001",
          agent: "CEO Agent",
          from_zone_id: "executive-suite",
          to_zone_id: "executive-suite",
          trigger_timestamp: "2026-03-26T13:00:00.000Z",
          trigger_type: "approval_waiting",
        },
      ],
    },
  };
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const result = runMonitorAction({
    requestPath,
    snapshotPath,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    baseDir: path.join(tempDir, "output"),
    staleMinutes: 15,
    now: "2026-03-26T14:00:00.000Z",
    recordsDir: path.join(tempDir, "records"),
    summariesDir: path.join(tempDir, "summaries"),
    checkpointPath: path.join(tempDir, "latest.checkpoint.json"),
    trendPath: path.join(tempDir, "latest.trend.json"),
    briefPath: path.join(tempDir, "latest.operator-brief.md"),
    windowHours: 168,
    maxFiles: 500,
    maxPoints: 20,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    requireFreshIntent: true,
  });

  assert.equal(result.preflight.satisfied, false);
  assert.equal(result.skipped_capture, true);
  assert.match(result.reason, /No fresh movement intents/i);
  assert.equal(result.capture, undefined);
  assert.equal(
    getMonitorExitCode(result, {
      failOnIncompleteWindow: false,
      failOnNoGo: false,
      requireFreshIntent: true,
    }),
    2
  );
});
