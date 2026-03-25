"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  listArtifactFilesByNewest,
  planPrune,
  runPruneAction,
} = require("../artifact_prune_cli");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

test("parseArgs validates keep and types", () => {
  assert.throws(() => parseArgs(["--keep", "-1"]), /integer >= 0/);
  assert.throws(() => parseArgs(["--types", ""]), /at least one artifact type/);
});

test("listArtifactFilesByNewest excludes .gitkeep and sorts descending by mtime", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-prune-list-"));
  const typeDir = path.join(tempDir, "runs");
  fs.mkdirSync(typeDir, { recursive: true });
  writeFile(path.join(typeDir, ".gitkeep"), "\n");
  writeFile(path.join(typeDir, "a.artifact.json"), "{}\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFile(path.join(typeDir, "b.artifact.json"), "{}\n");

  const files = listArtifactFilesByNewest(typeDir);
  assert.equal(files.length, 2);
  assert.ok(files[0].endsWith("b.artifact.json"));
  assert.ok(files[1].endsWith("a.artifact.json"));
});

test("planPrune splits keep/remove correctly", () => {
  const files = ["f1", "f2", "f3"];
  const plan = planPrune(files, 2);
  assert.deepEqual(plan.keep, ["f1", "f2"]);
  assert.deepEqual(plan.remove, ["f3"]);
});

test("runPruneAction dry-run returns candidates without deleting", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-prune-dry-"));
  const runsDir = path.join(tempDir, "runs");
  writeFile(path.join(runsDir, "a.artifact.json"), "{}\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFile(path.join(runsDir, "b.artifact.json"), "{}\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFile(path.join(runsDir, "c.artifact.json"), "{}\n");

  const result = runPruneAction({
    baseDir: tempDir,
    keep: 1,
    apply: false,
    types: ["runs"],
  });

  assert.equal(result.total_candidates, 2);
  assert.equal(result.total_removed, 0);
  assert.equal(result.by_type.runs.would_remove.length, 2);
  assert.ok(fs.existsSync(path.join(runsDir, "a.artifact.json")));
  assert.ok(fs.existsSync(path.join(runsDir, "b.artifact.json")));
  assert.ok(fs.existsSync(path.join(runsDir, "c.artifact.json")));
});

test("runPruneAction apply deletes files beyond keep count", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-prune-apply-"));
  const runsDir = path.join(tempDir, "runs");
  writeFile(path.join(runsDir, ".gitkeep"), "\n");
  writeFile(path.join(runsDir, "a.artifact.json"), "{}\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFile(path.join(runsDir, "b.artifact.json"), "{}\n");

  const result = runPruneAction({
    baseDir: tempDir,
    keep: 1,
    apply: true,
    types: ["runs"],
  });

  assert.equal(result.total_removed, 1);
  assert.equal(result.by_type.runs.removed.length, 1);
  assert.equal(fs.existsSync(path.join(runsDir, ".gitkeep")), true);
  assert.equal(listArtifactFilesByNewest(runsDir).length, 1);
});
