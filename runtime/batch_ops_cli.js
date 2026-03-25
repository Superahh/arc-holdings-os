"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runOpsLoopAction } = require("./ops_loop_cli");
const { writeBatchArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    fixturesDir: null,
    queuePath: null,
    now: new Date().toISOString(),
    baseDir: path.join(__dirname, "output"),
    queueActor: "batch_runner",
    workflowStatePath: null,
    workflowActor: "batch_runner",
    slaMinutes: 120,
    replayLimit: 50,
    pendingLimit: 10,
    fileLimit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fixtures-dir") {
      args.fixturesDir = argv[i + 1];
      i += 1;
    } else if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--queue-actor") {
      args.queueActor = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-actor") {
      args.workflowActor = argv[i + 1];
      i += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--replay-limit") {
      args.replayLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--pending-limit") {
      args.pendingLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--file-limit") {
      args.fileLimit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.fixturesDir) {
    throw new Error("Missing required argument: --fixtures-dir <path-to-fixtures-dir>");
  }
  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  for (const [name, value] of [
    ["--sla-minutes", args.slaMinutes],
    ["--replay-limit", args.replayLimit],
    ["--pending-limit", args.pendingLimit],
  ]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  if (args.fileLimit !== null && (!Number.isInteger(args.fileLimit) || args.fileLimit <= 0)) {
    throw new Error("--file-limit must be a positive integer.");
  }
  return args;
}

function listFixtureFiles(fixturesDir, fileLimit = null) {
  const dir = path.resolve(fixturesDir);
  const files = fs
    .readdirSync(dir)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort()
    .map((entry) => path.join(dir, entry));

  if (fileLimit == null) {
    return files;
  }
  return files.slice(0, fileLimit);
}

function offsetIso(baseIso, secondsOffset) {
  const base = new Date(baseIso);
  base.setSeconds(base.getSeconds() + secondsOffset);
  return base.toISOString();
}

function runBatchOpsAction(args) {
  const baseDir = path.resolve(args.baseDir);
  const queuePath = path.resolve(args.queuePath);
  const fixtureFiles = listFixtureFiles(args.fixturesDir, args.fileLimit);

  if (fixtureFiles.length === 0) {
    throw new Error("No JSON fixture files found in --fixtures-dir.");
  }

  const runs = [];
  for (let i = 0; i < fixtureFiles.length; i += 1) {
    const fixturePath = fixtureFiles[i];
    const runNow = offsetIso(args.now, i);
    const runResult = runOpsLoopAction({
      fixture: fixturePath,
      queuePath,
      now: runNow,
      baseDir,
      queueActor: args.queueActor,
      workflowStatePath: args.workflowStatePath,
      workflowActor: args.workflowActor,
      slaMinutes: args.slaMinutes,
      replayLimit: args.replayLimit,
      pendingLimit: args.pendingLimit,
    });
    runs.push({
      fixture_path: fixturePath,
      run_now: runNow,
      ...runResult,
    });
  }

  const summary = {
    total_runs: runs.length,
    acquire_count: runs.filter((run) => run.recommendation === "acquire").length,
    request_more_info_count: runs.filter((run) => run.recommendation === "request_more_info").length,
    skip_count: runs.filter((run) => run.recommendation === "skip").length,
    final_queue_health: runs[runs.length - 1].queue_health,
    final_pending_count: runs[runs.length - 1].pending_count,
    workflow_state_path: runs[runs.length - 1].workflow_state_path || null,
  };

  const batchArtifact = {
    schema_version: "v1",
    generated_at: new Date(args.now).toISOString(),
    source_label: "ops_batch",
    fixtures_dir: path.resolve(args.fixturesDir),
    queue_path: queuePath,
    summary,
    runs,
  };

  const batchArtifactPath = writeBatchArtifact(baseDir, batchArtifact);
  return {
    batch_artifact_path: batchArtifactPath,
    ...summary,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runBatchOpsAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  listFixtureFiles,
  runBatchOpsAction,
  main,
};
