"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  selectIntent,
  buildRequestFromIntent,
  runRequestBuilderAction,
} = require("../room_transition_request_builder_cli");

test("parseArgs validates unknown and datetime values", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--now", "bad-time"]), /--now must be ISO-8601 datetime/);
  assert.throws(
    () => parseArgs(["--fresh-within-minutes", "0"]),
    /--fresh-within-minutes must be a positive integer/
  );
});

test("selectIntent supports explicit filters and latest fallback", () => {
  const intents = [
    {
      intent_id: "intent-old",
      opportunity_id: "opp-1",
      trigger_timestamp: "2026-03-26T13:00:00.000Z",
    },
    {
      intent_id: "intent-new",
      opportunity_id: "opp-1",
      trigger_timestamp: "2026-03-26T14:00:00.000Z",
    },
  ];

  const byId = selectIntent(intents, { intentId: "intent-old", opportunityId: null });
  assert.equal(byId.intent_id, "intent-old");

  const byOpportunity = selectIntent(intents, { intentId: null, opportunityId: "opp-1" });
  assert.equal(byOpportunity.intent_id, "intent-new");

  const latest = selectIntent(intents, { intentId: null, opportunityId: null });
  assert.equal(latest.intent_id, "intent-new");

  const fresh = selectIntent(intents, {
    intentId: null,
    opportunityId: null,
    freshWithinMinutes: 30,
    now: "2026-03-26T14:10:00.000Z",
  });
  assert.equal(fresh.intent_id, "intent-new");

  assert.throws(
    () =>
      selectIntent(intents, {
        intentId: null,
        opportunityId: null,
        freshWithinMinutes: 5,
        now: "2026-03-26T14:10:00.000Z",
      }),
    /No movement intent found within --fresh-within-minutes 5/
  );
});

test("buildRequestFromIntent creates contract-shaped request", () => {
  const request = buildRequestFromIntent(
    {
      intent_id: "intent-office-approval-001",
      opportunity_id: "opp-2026-03-25-001",
      agent: "CEO Agent",
      from_zone_id: "executive-suite",
      to_zone_id: "verification-bay",
    },
    {
      now: "2026-03-26T14:00:00.000Z",
      requestedBy: "owner_operator",
      reason: "Test reason",
    }
  );

  assert.equal(request.mode, "manual_preview_commit");
  assert.equal(request.status, "requested");
  assert.equal(request.intent_id, "intent-office-approval-001");
  assert.equal(request.policy_checks.includes("intent_exists"), true);
});

test("runRequestBuilderAction writes request from snapshot movement intent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-request-builder-"));
  const snapshotPath = path.join(tempDir, "snapshot.json");
  const outputPath = path.join(tempDir, "latest.request.json");

  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        office: {
          movement_intents: [
            {
              intent_id: "intent-office-approval-001",
              opportunity_id: "opp-2026-03-25-001",
              agent: "CEO Agent",
              from_zone_id: "executive-suite",
              to_zone_id: "verification-bay",
              trigger_timestamp: "2026-03-26T13:55:00.000Z",
              trigger_type: "approval_waiting",
            },
          ],
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = runRequestBuilderAction({
    snapshotPath,
    queuePath: path.join(tempDir, "approval_queue.json"),
    workflowStatePath: path.join(tempDir, "workflow_state.json"),
    baseDir: path.join(tempDir, "output"),
    now: "2026-03-26T14:00:00.000Z",
    outputPath,
    intentId: null,
    opportunityId: null,
    freshWithinMinutes: null,
    requestedBy: "owner_operator",
    reason: "Prepared from snapshot.",
  });

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(result.request.intent_id, "intent-office-approval-001");
  assert.equal(result.source_intent.trigger_type, "approval_waiting");
});
