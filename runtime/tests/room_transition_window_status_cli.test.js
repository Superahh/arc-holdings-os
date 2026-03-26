"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runWindowStatusAction,
} = require("../room_transition_window_status_cli");

test("parseArgs validates unknown tokens and flags", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--summary-path"]), /Missing value/);
  const parsed = parseArgs(["--fail-on-incomplete-window", "--fail-on-not-ready"]);
  assert.equal(parsed.failOnIncompleteWindow, true);
  assert.equal(parsed.failOnNotReady, true);
});

test("runWindowStatusAction summarizes incomplete window progress", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-window-status-"));
  const summaryPath = path.join(tempDir, "latest.summary.json");

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generated_at: "2026-03-26T10:00:00.000Z",
        coverage: {
          target_window_hours: 168,
          observed_hours: 24,
          full_window_observed: false,
          oldest_validated_at: "2026-03-25T10:00:00.000Z",
          newest_validated_at: "2026-03-26T10:00:00.000Z",
        },
        readiness: {
          eligible_for_writable_review: false,
          recommendation: { state: "insufficient_data" },
          checks: [{ name: "minimum_runs", pass: false }],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const status = runWindowStatusAction({ summaryPath });
  assert.equal(status.recommendation_state, "insufficient_data");
  assert.equal(status.eligible_for_writable_review, false);
  assert.equal(status.window.full_window_observed, false);
  assert.equal(status.window.remaining_hours, 144);
  assert.equal(status.window.next_review_at, "2026-04-01T10:00:00.000Z");
});

test("runWindowStatusAction reports full window and zero remaining time", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-window-status-full-"));
  const summaryPath = path.join(tempDir, "latest.summary.json");

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generated_at: "2026-04-03T10:00:00.000Z",
        coverage: {
          target_window_hours: 168,
          observed_hours: 168,
          full_window_observed: true,
          oldest_validated_at: "2026-03-27T10:00:00.000Z",
          newest_validated_at: "2026-04-03T10:00:00.000Z",
        },
        readiness: {
          eligible_for_writable_review: true,
          recommendation: { state: "candidate_for_review" },
          checks: [{ name: "minimum_runs", pass: true }],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const status = runWindowStatusAction({ summaryPath });
  assert.equal(status.recommendation_state, "candidate_for_review");
  assert.equal(status.eligible_for_writable_review, true);
  assert.equal(status.window.full_window_observed, true);
  assert.equal(status.window.remaining_hours, 0);
  assert.equal(status.window.next_review_at, null);
});
