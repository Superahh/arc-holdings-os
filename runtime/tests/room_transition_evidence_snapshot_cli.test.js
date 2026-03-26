"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runEvidenceSnapshotAction,
} = require("../room_transition_evidence_snapshot_cli");

test("parseArgs validates required formats", () => {
  assert.throws(
    () => parseArgs(["--unknown"]),
    /Unknown argument/
  );
  assert.throws(
    () => parseArgs(["--min-allowed-rate", "1.1"]),
    /--min-allowed-rate/
  );
  assert.throws(
    () => parseArgs(["--now", "bad-time"]),
    /--now/
  );
});

test("runEvidenceSnapshotAction writes timestamped and latest summaries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-transition-snapshot-"));
  const inputsDir = path.join(tempDir, "inputs");
  const summariesDir = path.join(tempDir, "summaries");
  fs.mkdirSync(inputsDir, { recursive: true });

  fs.writeFileSync(
    path.join(inputsDir, "allowed-001.json"),
    JSON.stringify(
      {
        validated_at: "2026-03-25T19:10:00.000Z",
        allowed: true,
        request_id: "rtr-001",
        checks: [{ name: "intent_exists", pass: true }],
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runEvidenceSnapshotAction({
    inputsDir,
    summariesDir,
    now: "2026-03-25T19:20:00.000Z",
    windowHours: 24,
    maxFiles: 50,
    all: false,
    minRuns: 1,
    minAllowedRate: 0.9,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnNotReady: false,
  });

  assert.equal(fs.existsSync(result.timestamped_path), true);
  assert.equal(fs.existsSync(result.latest_path), true);
  assert.equal(result.readiness.eligible_for_writable_review, true);
  assert.equal(result.coverage.records_with_timestamp, 1);
  assert.equal(result.coverage.full_window_observed, false);
});
