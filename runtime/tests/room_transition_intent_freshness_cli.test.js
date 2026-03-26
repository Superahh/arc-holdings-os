"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runIntentFreshnessAction,
} = require("../room_transition_intent_freshness_cli");

test("parseArgs validates unknown and required formats", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--stale-minutes", "0"]), /--stale-minutes/);
  assert.throws(() => parseArgs(["--now", "not-iso"]), /--now must be ISO-8601 datetime/);
});

test("runIntentFreshnessAction reports fresh vs stale intent counts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-intent-freshness-"));
  const snapshotPath = path.join(tempDir, "snapshot.json");

  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        office: {
          movement_intents: [
            {
              intent_id: "intent-fresh",
              opportunity_id: "opp-1",
              trigger_type: "handoff_started",
              trigger_timestamp: "2026-03-26T14:05:00.000Z",
            },
            {
              intent_id: "intent-stale",
              opportunity_id: "opp-2",
              trigger_type: "handoff_completed",
              trigger_timestamp: "2026-03-26T13:40:00.000Z",
            },
          ],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runIntentFreshnessAction({
    snapshotPath,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    baseDir: path.join(tempDir, "output"),
    now: "2026-03-26T14:10:00.000Z",
    staleMinutes: 15,
    outputPath: null,
  });

  assert.equal(result.totals.movement_intent_count, 2);
  assert.equal(result.totals.fresh_count, 1);
  assert.equal(result.totals.stale_or_invalid_count, 1);
  assert.equal(result.freshest_intent.intent_id, "intent-fresh");
  assert.equal(result.freshest_intent.trigger_timestamp, "2026-03-26T14:05:00.000Z");
  assert.equal(result.freshest_intent.fresh, true);
  assert.equal(result.freshest_intent.freshness_gap_minutes, 0);
  assert.equal(result.classification.status, "fresh_intents_available");
  assert.equal(result.classification.generated, true);
  assert.equal(result.classification.picked_up_by_monitor, true);
});

test("runIntentFreshnessAction classifies stale-only snapshots as aging out before capture", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-intent-freshness-stale-"));
  const snapshotPath = path.join(tempDir, "snapshot.json");

  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        office: {
          movement_intents: [
            {
              intent_id: "intent-stale",
              opportunity_id: "opp-2",
              trigger_type: "handoff_completed",
              trigger_timestamp: "2026-03-26T13:40:00.000Z",
            },
          ],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runIntentFreshnessAction({
    snapshotPath,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    baseDir: path.join(tempDir, "output"),
    now: "2026-03-26T14:10:00.000Z",
    staleMinutes: 15,
    outputPath: null,
  });

  assert.equal(result.totals.movement_intent_count, 1);
  assert.equal(result.totals.fresh_count, 0);
  assert.equal(result.freshest_intent.trigger_timestamp, "2026-03-26T13:40:00.000Z");
  assert.equal(result.freshest_intent.freshness_gap_minutes, 15);
  assert.equal(result.classification.status, "all_intents_stale");
  assert.equal(result.classification.generated, true);
  assert.equal(result.classification.persisted, true);
  assert.equal(result.classification.picked_up_by_monitor, true);
  assert.equal(result.classification.aging_out_before_capture, true);
  assert.match(result.classification.reason, /freshest intent is 30 minutes old/i);
});
