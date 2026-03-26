"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runOperatorBriefAction,
} = require("../room_transition_operator_brief_cli");

test("parseArgs validates unknown and missing values", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--checkpoint-path"]), /Missing value/);
  const parsed = parseArgs([]);
  assert.match(parsed.freshnessPath.replaceAll("\\", "/"), /latest\.intent-freshness\.json$/);
});

test("runOperatorBriefAction writes consolidated markdown brief", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-operator-brief-"));
  const checkpointPath = path.join(tempDir, "checkpoint.json");
  const trendPath = path.join(tempDir, "trend.json");
  const freshnessPath = path.join(tempDir, "freshness.json");
  const outputPath = path.join(tempDir, "brief.md");

  fs.writeFileSync(
    checkpointPath,
    JSON.stringify(
      {
        generated_at: "2026-03-26T01:10:15.978Z",
        recommendation: {
          promotion_decision: "no_go",
          recommendation_state: "insufficient_data",
          reason: "Hold promotion decision until the full 7-day evidence window is observed.",
          window: {
            target_hours: 168,
            observed_hours: 24,
            remaining_hours: 144,
            full_window_observed: false,
            next_review_at: "2026-04-02T00:00:00.000Z",
          },
          failed_checks: ["minimum_runs", "minimum_allowed_rate"],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    trendPath,
    JSON.stringify(
      {
        latest: {
          generated_at: "2026-03-26T01:10:15.978Z",
          records_considered: 12,
          allowed_rate: 0.75,
          recommendation_state: "no_go",
        },
        deltas_from_previous: {
          records_considered: 2,
          allowed_rate: 0.05,
          observed_hours: 6,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    freshnessPath,
    JSON.stringify(
      {
        stale_minutes: 15,
        totals: {
          fresh_count: 0,
          stale_or_invalid_count: 8,
        },
        classification: {
          status: "all_intents_stale",
          generated: true,
          persisted: true,
          picked_up_by_monitor: true,
          aging_out_before_capture: true,
          reason: "Movement intents exist and are visible to the monitor, but the freshest intent is 285.1487 minutes old.",
        },
        freshest_intent: {
          intent_id: "intent-office-handoff-001",
          age_minutes: 285.1487,
          fresh: false,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runOperatorBriefAction({
    checkpointPath,
    trendPath,
    freshnessPath,
    outputPath,
  });

  assert.equal(fs.existsSync(outputPath), true);
  assert.match(result.markdown, /Promotion decision: no_go/);
  assert.match(result.markdown, /remaining_hours: 144/);
  assert.match(result.markdown, /records_considered: \+2/);
  assert.match(result.markdown, /fresh_count: 0/);
  assert.match(result.markdown, /freshest_intent_age_minutes: 285.1487/);
  assert.match(result.markdown, /classification_status: all_intents_stale/);
  assert.match(result.markdown, /intents_picked_up_by_monitor: true/);
  assert.match(result.markdown, /aging_out_before_capture: true/);
});
