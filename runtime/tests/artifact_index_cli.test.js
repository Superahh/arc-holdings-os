"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  listFilesSortedByMtime,
  summarizeDirectory,
  runIndexAction,
} = require("../artifact_index_cli");

function writeFileWithDelay(filePath, content = "{}\n") {
  fs.writeFileSync(filePath, content, "utf8");
}

test("parseArgs validates numeric top-n", () => {
  assert.throws(() => parseArgs(["--top-n", "0"]), /positive integer/);
});

test("listFilesSortedByMtime and summarizeDirectory work", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-index-list-"));
  const fileA = path.join(tempDir, "a.json");
  const fileB = path.join(tempDir, "b.json");

  writeFileWithDelay(fileA);
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileWithDelay(fileB);

  const files = listFilesSortedByMtime(tempDir);
  assert.equal(files.length, 2);
  assert.equal(files[0], fileB);
  assert.equal(files[1], fileA);

  const summary = summarizeDirectory(tempDir, 1);
  assert.equal(summary.count, 2);
  assert.equal(summary.latest_path, fileB);
  assert.equal(summary.recent_paths.length, 1);
});

test("runIndexAction writes index artifact with totals", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-index-run-"));
  const runsDir = path.join(tempDir, "runs");
  const reportsDir = path.join(tempDir, "reports");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  writeFileWithDelay(path.join(runsDir, "one.artifact.json"), "{ \"a\": 1 }\n");
  writeFileWithDelay(path.join(reportsDir, "one.report.json"), "{ \"b\": 2 }\n");

  const result = runIndexAction({
    baseDir: tempDir,
    now: "2026-03-25T20:00:00.000Z",
    topN: 5,
  });

  assert.ok(fs.existsSync(result.index_artifact_path), "Expected index artifact file.");
  assert.ok(result.total_files >= 2);
  assert.ok(result.total_bytes > 0);

  const indexArtifact = JSON.parse(fs.readFileSync(result.index_artifact_path, "utf8"));
  assert.ok(indexArtifact.by_type.runs.count >= 1);
  assert.ok(indexArtifact.by_type.reports.count >= 1);
});
