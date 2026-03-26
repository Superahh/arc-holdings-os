"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  buildDefaultOutputPath,
  runValidationCaptureAction,
} = require("../room_transition_validation_capture_cli");

test("parseArgs validates required and strict arguments", () => {
  assert.throws(() => parseArgs([]), /--request-path is required/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(
    () => parseArgs(["--request-path", "req.json", "--stale-minutes", "0"]),
    /--stale-minutes/
  );
  assert.throws(
    () => parseArgs(["--request-path", "req.json", "--now", "not-iso"]),
    /--now must be ISO-8601 datetime/
  );
});

test("runValidationCaptureAction writes timestamped validator record", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-validation-capture-"));
  const requestPath = path.join(
    __dirname,
    "..",
    "fixtures",
    "room-transition-request.sample.json"
  );
  const snapshotPath = path.join(tempDir, "snapshot.json");
  const outputDir = path.join(tempDir, "records");
  const now = "2026-03-26T14:00:00.000Z";

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

  const result = runValidationCaptureAction({
    requestPath,
    snapshotPath,
    queuePath: path.join(tempDir, "queue.json"),
    workflowStatePath: path.join(tempDir, "workflow.json"),
    baseDir: path.join(tempDir, "output"),
    staleMinutes: 15,
    now,
    outputDir,
    outputPath: null,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.validated_at, now);
  assert.equal(result.request_id, "rtr-sample-001");
  assert.equal(fs.existsSync(result.output_path), true);

  const stored = JSON.parse(fs.readFileSync(result.output_path, "utf8"));
  assert.equal(stored.allowed, true);
  assert.equal(stored.validated_at, now);
  assert.equal(stored.request_id, "rtr-sample-001");
  assert.match(path.basename(result.output_path), /^room-transition-validation-\d{8}T\d{6}Z\.json$/);
});

test("buildDefaultOutputPath builds deterministic timestamped filename", () => {
  const outputPath = buildDefaultOutputPath("C:/tmp/records", "2026-03-26T14:00:00.000Z");
  assert.match(outputPath.replaceAll("\\", "/"), /room-transition-validation-20260326T140000Z\.json$/);
});
