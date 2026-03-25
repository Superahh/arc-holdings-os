"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { writeIndexArtifact } = require("./output");

const ARTIFACT_DIRS = ["runs", "snapshots", "decisions", "timelines", "health", "cycles", "reports", "loops", "batches"];

function parseArgs(argv) {
  const args = {
    baseDir: path.join(__dirname, "output"),
    now: new Date().toISOString(),
    topN: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--top-n") {
      args.topN = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!Number.isInteger(args.topN) || args.topN <= 0) {
    throw new Error("--top-n must be a positive integer.");
  }
  return args;
}

function listFilesSortedByMtime(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
  return fs
    .readdirSync(directoryPath)
    .map((entry) => path.join(directoryPath, entry))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function summarizeDirectory(directoryPath, topN) {
  const files = listFilesSortedByMtime(directoryPath);
  const totalBytes = files.reduce((acc, filePath) => acc + fs.statSync(filePath).size, 0);
  const latest = files.length > 0 ? files[0] : null;
  return {
    count: files.length,
    total_bytes: totalBytes,
    latest_path: latest,
    recent_paths: files.slice(0, topN),
  };
}

function runIndexAction(args) {
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const byType = {};
  let totalFiles = 0;
  let totalBytes = 0;

  for (const dirName of ARTIFACT_DIRS) {
    const summary = summarizeDirectory(path.join(baseDir, dirName), args.topN);
    byType[dirName] = summary;
    totalFiles += summary.count;
    totalBytes += summary.total_bytes;
  }

  const artifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: "artifact_index",
    base_dir: baseDir,
    totals: {
      total_files: totalFiles,
      total_bytes: totalBytes,
    },
    by_type: byType,
  };

  const indexPath = writeIndexArtifact(baseDir, artifact);
  return {
    index_artifact_path: indexPath,
    ...artifact.totals,
    base_dir: baseDir,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runIndexAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  listFilesSortedByMtime,
  summarizeDirectory,
  runIndexAction,
  main,
};
