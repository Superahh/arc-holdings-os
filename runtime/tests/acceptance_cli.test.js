"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, runAcceptanceAction } = require("../acceptance_cli");

test("parseArgs validates timestamp inputs", () => {
  assert.throws(() => parseArgs(["--now-golden", "not-a-date"]), /--now-golden/);
  assert.throws(() => parseArgs(["--now-rejection", "not-a-date"]), /--now-rejection/);
});

test("runAcceptanceAction passes for default fixtures", () => {
  const report = runAcceptanceAction(parseArgs([]));
  assert.equal(report.summary.result, "pass");
  assert.equal(report.summary.fail_count, 0);
  assert.ok(report.checks.length > 0, "Expected non-empty check list.");
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
});
