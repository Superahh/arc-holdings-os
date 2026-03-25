"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  runAcceptanceAction,
  evaluateHandoffDeliveryMode,
  isShippingOnlyScenario,
} = require("../acceptance_cli");

test("parseArgs validates timestamp inputs", () => {
  assert.throws(() => parseArgs(["--now-golden", "not-a-date"]), /--now-golden/);
  assert.throws(() => parseArgs(["--now-rejection", "not-a-date"]), /--now-rejection/);
});

test("runAcceptanceAction passes for default fixtures", () => {
  const report = runAcceptanceAction(parseArgs([]));
  assert.equal(report.summary.result, "pass");
  assert.equal(report.summary.fail_count, 0);
  assert.ok(report.checks.length > 0, "Expected non-empty check list.");
  assert.equal(
    report.checks.some(
      (check) => check.id === "golden.workflow_awaiting_seller_verification" && check.pass === true
    ),
    true
  );
  assert.equal(
    report.checks.some(
      (check) => check.id === "rejection.workflow_awaiting_approval" && check.pass === true
    ),
    true
  );
  assert.equal(
    report.checks.some((check) => check.id === "golden.remote_safe_handoff" && check.pass === true),
    true
  );
  assert.equal(
    report.checks.some((check) => check.id === "rejection.remote_safe_handoff" && check.pass === true),
    true
  );
  assert.equal(
    report.checks.some((check) => check.id === "rejection.workflow_rejected" && check.pass === true),
    true
  );
});

test("runAcceptanceAction writes report file when output path is provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-acceptance-"));
  const outputPath = path.join(tempDir, "acceptance.json");
  const report = runAcceptanceAction(parseArgs(["--output", outputPath]));

  assert.equal(report.summary.result, "pass");
  assert.equal(fs.existsSync(outputPath), true);

  const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(written.summary.result, "pass");
  assert.equal(written.summary.fail_count, 0);
});

test("runAcceptanceAction fails when golden fixture does not hit request_more_info path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-acceptance-"));
  const goldenPath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const modifiedGoldenPath = path.join(tempDir, "golden-modified.json");
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  golden.device.carrier_status = "verified";
  golden.device.imei_proof_verified = true;
  fs.writeFileSync(modifiedGoldenPath, `${JSON.stringify(golden, null, 2)}\n`, "utf8");

  const rejectionPath = path.join(__dirname, "..", "fixtures", "rejection-scenario.json");
  const report = runAcceptanceAction(
    parseArgs(["--golden-fixture", modifiedGoldenPath, "--rejection-fixture", rejectionPath])
  );

  assert.equal(report.summary.result, "fail");
  assert.ok(report.summary.fail_count > 0);
  assert.equal(
    report.checks.some((check) => check.id === "golden.request_more_info" && check.pass === false),
    true
  );
  assert.equal(
    report.checks.some(
      (check) => check.id === "golden.workflow_awaiting_seller_verification" && check.pass === false
    ),
    true
  );
});

test("delivery-mode guardrail requires remote-safe handoff for shipping-only scenarios", () => {
  assert.equal(
    isShippingOnlyScenario({ seller_notes: "Shipping only, IMEI video available." }),
    true
  );

  const passResult = evaluateHandoffDeliveryMode(
    { seller_notes: "Shipping only, IMEI video available." },
    { handoff_packet: { next_action: "Request remote IMEI proof and verify carrier status." } }
  );
  assert.equal(passResult.pass, true);

  const failResult = evaluateHandoffDeliveryMode(
    { seller_notes: "Shipping only, IMEI video available." },
    { handoff_packet: { next_action: "Schedule in-person meetup to inspect device." } }
  );
  assert.equal(failResult.pass, false);
  assert.match(failResult.detail, /remote-safe/);
});
