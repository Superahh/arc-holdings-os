"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  buildRunArtifact,
  writeRunArtifact,
  writeSnapshot,
  compareWithSnapshot,
  getRunArtifactFilename,
  formatTimestampForFilename,
} = require("../output");

function loadGoldenFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("filename formatter is deterministic", () => {
  const iso = "2026-03-25T19:20:00.000Z";
  const formatted = formatTimestampForFilename(iso);
  assert.equal(formatted, "20260325T192000Z");

  const fileNameA = getRunArtifactFilename("opp-2026-03-25-001", iso);
  const fileNameB = getRunArtifactFilename("opp-2026-03-25-001", iso);
  assert.equal(fileNameA, fileNameB);
});

test("run artifact is persisted to deterministic path", () => {
  const input = loadGoldenFixture();
  const nowIso = "2026-03-25T19:20:00.000Z";
  const output = runOpportunityPipeline(input, nowIso);
  const artifact = buildRunArtifact(input, output, nowIso);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-runtime-"));
  const artifactPath = writeRunArtifact(tempDir, artifact);
  assert.ok(fs.existsSync(artifactPath), "Expected artifact file to exist.");

  const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(parsed.opportunity_id, input.opportunity_id);
  assert.ok(parsed.output.handoff_packet, "Expected handoff_packet in persisted output.");
});

test("snapshot comparison passes for equivalent output and fails on regression", () => {
  const input = loadGoldenFixture();
  const nowIso = "2026-03-25T19:20:00.000Z";
  const output = runOpportunityPipeline(input, nowIso);
  const artifact = buildRunArtifact(input, output, nowIso);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-runtime-"));
  writeSnapshot(tempDir, artifact);

  const passResult = compareWithSnapshot(tempDir, artifact);
  assert.equal(passResult.exists, true);
  assert.equal(passResult.matches, true);

  const regressedArtifact = buildRunArtifact(
    input,
    {
      ...output,
      opportunity_record: {
        ...output.opportunity_record,
        recommendation: "skip",
      },
    },
    nowIso
  );
  const failResult = compareWithSnapshot(tempDir, regressedArtifact);
  assert.equal(failResult.exists, true);
  assert.equal(failResult.matches, false);
  assert.ok(
    failResult.differing_keys.includes("opportunity_record"),
    "Expected regression to be detected in opportunity_record."
  );
});
