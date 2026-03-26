"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runRecommendationAction,
} = require("../room_transition_recommendation_cli");

test("parseArgs validates unknown and format arguments", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--format", "txt"]), /--format/);
  assert.throws(() => parseArgs(["--summary-path"]), /Missing value/);
});

test("runRecommendationAction returns no-go when window is incomplete", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-recommendation-no-go-"));
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
          eligible_for_writable_review: true,
          recommendation: { state: "candidate_for_review" },
          checks: [],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runRecommendationAction({
    summaryPath,
    outputPath: null,
    format: "json",
    failOnNoGo: false,
  });

  assert.equal(result.report.promotion_decision, "no_go");
  assert.match(result.report.reason, /full 7-day evidence window/i);
});

test("runRecommendationAction returns candidate_for_review when gate is satisfied", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-recommendation-go-"));
  const summaryPath = path.join(tempDir, "latest.summary.json");
  const outputPath = path.join(tempDir, "recommendation.md");

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

  const result = runRecommendationAction({
    summaryPath,
    outputPath,
    format: "markdown",
    failOnNoGo: false,
  });

  assert.equal(result.report.promotion_decision, "candidate_for_review");
  assert.equal(fs.existsSync(outputPath), true);
  const markdown = fs.readFileSync(outputPath, "utf8");
  assert.match(markdown, /Promotion decision: candidate_for_review/);
});
