"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  listSummaryFiles,
  runTrendAction,
} = require("../room_transition_trend_cli");

test("parseArgs validates unknown and numeric arguments", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--max-points", "0"]), /--max-points/);
  assert.throws(() => parseArgs(["--summaries-dir"]), /Missing value/);
});

test("listSummaryFiles filters and limits evidence summary files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-trend-files-"));
  fs.writeFileSync(path.join(tempDir, "room-transition-evidence-a.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "room-transition-evidence-b.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "latest.summary.json"), "{}\n", "utf8");
  const files = listSummaryFiles(tempDir, 1);
  assert.equal(files.length, 1);
  assert.match(path.basename(files[0]), /^room-transition-evidence-/);
});

test("runTrendAction computes latest and delta metrics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-trend-run-"));
  const firstPath = path.join(tempDir, "room-transition-evidence-20260326T010000000Z.json");
  const secondPath = path.join(tempDir, "room-transition-evidence-20260326T020000000Z.json");

  fs.writeFileSync(
    firstPath,
    JSON.stringify(
      {
        generated_at: "2026-03-26T01:00:00.000Z",
        totals: { records_considered: 5, allowed_rate: 0.6 },
        coverage: { observed_hours: 24, full_window_observed: false },
        readiness: { recommendation: { state: "insufficient_data" } },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    secondPath,
    JSON.stringify(
      {
        generated_at: "2026-03-26T02:00:00.000Z",
        totals: { records_considered: 12, allowed_rate: 0.75 },
        coverage: { observed_hours: 30, full_window_observed: false },
        readiness: { recommendation: { state: "no_go" } },
      },
      null,
      2
    ),
    "utf8"
  );

  const trend = runTrendAction({
    summariesDir: tempDir,
    maxPoints: 10,
    outputPath: null,
  });

  assert.equal(trend.points_count, 2);
  assert.equal(trend.latest.records_considered, 12);
  assert.equal(trend.latest.recommendation_state, "no_go");
  assert.equal(trend.deltas_from_previous.records_considered, 7);
  assert.equal(trend.deltas_from_previous.observed_hours, 6);
  assert.equal(trend.deltas_from_previous.allowed_rate, 0.15);
});
