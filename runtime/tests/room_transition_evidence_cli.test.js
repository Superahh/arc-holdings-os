"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runEvidenceAction,
} = require("../room_transition_evidence_cli");

test("parseArgs validates unknown and numeric arguments", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(
    () => parseArgs(["--window-hours", "0"]),
    /--window-hours/
  );
  assert.throws(
    () => parseArgs(["--max-files", "0"]),
    /--max-files/
  );
  assert.throws(
    () => parseArgs(["--min-allowed-rate", "1.2"]),
    /--min-allowed-rate/
  );
  assert.throws(
    () => parseArgs(["--max-parse-errors", "-1"]),
    /--max-parse-errors/
  );
});

test("runEvidenceAction summarizes allowed and denied records", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-room-transition-evidence-"));
  const inputsDir = path.join(tempDir, "evidence");
  fs.mkdirSync(inputsDir, { recursive: true });

  fs.writeFileSync(
    path.join(inputsDir, "allowed-001.json"),
    JSON.stringify(
      {
        validated_at: "2026-03-25T19:10:00.000Z",
        allowed: true,
        request_id: "rtr-001",
        checks: [{ name: "intent_exists", pass: true }],
        summary: "pass",
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(inputsDir, "denied-001.json"),
    JSON.stringify(
      {
        validated_at: "2026-03-25T19:15:00.000Z",
        allowed: false,
        request_id: "rtr-002",
        checks: [
          { name: "intent_fresh", pass: false },
          { name: "policy_check_list_complete", pass: false },
        ],
        summary: "fail",
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(inputsDir, "broken.json"), "{", "utf8");

  const summary = runEvidenceAction({
    inputsDir,
    outputPath: null,
    now: "2026-03-25T19:20:00.000Z",
    windowHours: 2,
    maxFiles: 100,
    all: false,
    minRuns: 2,
    minAllowedRate: 0.4,
    maxParseErrors: 1,
    maxCriticalFailures: 1,
  });

  assert.equal(summary.totals.files_scanned, 3);
  assert.equal(summary.totals.parse_errors, 1);
  assert.equal(summary.totals.records_considered, 2);
  assert.equal(summary.totals.allowed_count, 1);
  assert.equal(summary.totals.denied_count, 1);
  assert.equal(summary.failed_check_counts[0].check_name, "intent_fresh");
  assert.equal(summary.latest_records.length, 2);
  assert.equal(summary.readiness.eligible_for_writable_review, true);
  assert.equal(summary.readiness.checks.find((check) => check.name === "minimum_runs").pass, true);
});
