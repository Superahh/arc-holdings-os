"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runCheckpointAction,
} = require("../room_transition_checkpoint_cli");

test("parseArgs validates unknown and numeric arguments", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--window-hours", "0"]), /--window-hours/);
  assert.throws(() => parseArgs(["--min-allowed-rate", "2"]), /--min-allowed-rate/);
  assert.throws(() => parseArgs(["--max-parse-errors", "-1"]), /--max-parse-errors/);
});

test("runCheckpointAction writes checkpoint with no-go recommendation when data is insufficient", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-checkpoint-"));
  const inputsDir = path.join(tempDir, "inputs");
  const summariesDir = path.join(tempDir, "summaries");
  const checkpointPath = path.join(tempDir, "checkpoint.json");
  fs.mkdirSync(inputsDir, { recursive: true });

  const checkpoint = runCheckpointAction({
    inputsDir,
    summariesDir,
    checkpointPath,
    now: "2026-03-26T12:00:00.000Z",
    windowHours: 168,
    maxFiles: 100,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnIncompleteWindow: false,
    failOnNoGo: false,
  });

  assert.equal(fs.existsSync(checkpointPath), true);
  assert.equal(checkpoint.window_status.window.full_window_observed, false);
  assert.equal(checkpoint.recommendation.promotion_decision, "no_go");
  assert.match(checkpoint.recommendation.reason, /full 7-day evidence window/i);
});
