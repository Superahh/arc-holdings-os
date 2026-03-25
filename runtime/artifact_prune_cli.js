"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TYPES = [
  "runs",
  "decisions",
  "timelines",
  "health",
  "cycles",
  "reports",
  "loops",
  "batches",
  "indexes",
];

function parseArgs(argv) {
  const args = {
    baseDir: path.join(__dirname, "output"),
    keep: 20,
    apply: false,
    types: [...DEFAULT_TYPES],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--keep") {
      args.keep = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--types") {
      args.types = argv[i + 1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      i += 1;
    } else if (token === "--apply") {
      args.apply = true;
    }
  }

  if (!Number.isInteger(args.keep) || args.keep < 0) {
    throw new Error("--keep must be an integer >= 0.");
  }
  if (!Array.isArray(args.types) || args.types.length === 0) {
    throw new Error("--types must include at least one artifact type.");
  }
  return args;
}

function listArtifactFilesByNewest(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs
    .readdirSync(directoryPath)
    .map((entry) => path.join(directoryPath, entry))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => path.basename(filePath) !== ".gitkeep")
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function planPrune(files, keepCount) {
  const keep = files.slice(0, keepCount);
  const remove = files.slice(keepCount);
  return { keep, remove };
}

function runPruneAction(args) {
  const baseDir = path.resolve(args.baseDir);
  const byType = {};
  let totalCandidates = 0;
  let totalRemoved = 0;

  for (const type of args.types) {
    const typeDir = path.join(baseDir, type);
    const files = listArtifactFilesByNewest(typeDir);
    const plan = planPrune(files, args.keep);
    const removedPaths = [];

    if (args.apply) {
      for (const filePath of plan.remove) {
        fs.unlinkSync(filePath);
        removedPaths.push(filePath);
      }
    }

    byType[type] = {
      dir: typeDir,
      total_files: files.length,
      keep_count: plan.keep.length,
      remove_count: plan.remove.length,
      would_remove: args.apply ? [] : plan.remove,
      removed: removedPaths,
      kept: plan.keep,
    };
    totalCandidates += plan.remove.length;
    totalRemoved += removedPaths.length;
  }

  return {
    base_dir: baseDir,
    apply: args.apply,
    keep: args.keep,
    types: args.types,
    total_candidates: totalCandidates,
    total_removed: totalRemoved,
    by_type: byType,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runPruneAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TYPES,
  parseArgs,
  listArtifactFilesByNewest,
  planPrune,
  runPruneAction,
  main,
};
