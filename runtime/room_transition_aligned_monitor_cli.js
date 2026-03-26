"use strict";

const path = require("node:path");

const { runOpsLoopAction } = require("./ops_loop_cli");
const { runRequestBuilderAction } = require("./room_transition_request_builder_cli");
const { runMonitorAction, getMonitorExitCode } = require("./room_transition_monitor_cli");

function parsePositiveInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return value;
}

function parseRate(rawValue, optionName) {
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${optionName} must be a number between 0 and 1.`);
  }
  return value;
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseArgs(argv) {
  function readValue(index, option) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${option}`);
    }
    return value;
  }

  const validationsDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    fixture: null,
    queuePath: null,
    workflowStatePath: null,
    now: new Date().toISOString(),
    baseDir: path.resolve(__dirname, "output"),
    queueActor: "aligned_monitor_runner",
    workflowActor: "aligned_monitor_runner",
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    slaMinutes: 120,
    replayLimit: 50,
    pendingLimit: 10,
    taskLimit: 20,
    staleMinutes: 15,
    requestPath: path.join(validationsDir, "latest.aligned.request.json"),
    snapshotPath: null,
    recordsDir: path.join(validationsDir, "records"),
    summariesDir: validationsDir,
    checkpointPath: path.join(validationsDir, "latest.checkpoint.json"),
    trendPath: path.join(validationsDir, "latest.trend.json"),
    freshnessPath: path.join(validationsDir, "latest.intent-freshness.json"),
    briefPath: path.join(validationsDir, "latest.operator-brief.md"),
    windowHours: 168,
    maxFiles: 500,
    maxPoints: 20,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnIncompleteWindow: false,
    failOnNoGo: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--fixture") {
      args.fixture = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--queue-path") {
      args.queuePath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else if (token === "--base-dir") {
      args.baseDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--queue-actor") {
      args.queueActor = readValue(index, token);
      index += 1;
    } else if (token === "--workflow-actor") {
      args.workflowActor = readValue(index, token);
      index += 1;
    } else if (token === "--workflow-stale-minutes") {
      args.workflowStaleMinutes = parsePositiveInteger(readValue(index, token), "--workflow-stale-minutes");
      index += 1;
    } else if (token === "--due-soon-minutes") {
      args.dueSoonMinutes = parsePositiveInteger(readValue(index, token), "--due-soon-minutes");
      index += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = parsePositiveInteger(readValue(index, token), "--sla-minutes");
      index += 1;
    } else if (token === "--replay-limit") {
      args.replayLimit = parsePositiveInteger(readValue(index, token), "--replay-limit");
      index += 1;
    } else if (token === "--pending-limit") {
      args.pendingLimit = parsePositiveInteger(readValue(index, token), "--pending-limit");
      index += 1;
    } else if (token === "--task-limit") {
      args.taskLimit = parsePositiveInteger(readValue(index, token), "--task-limit");
      index += 1;
    } else if (token === "--stale-minutes") {
      args.staleMinutes = parsePositiveInteger(readValue(index, token), "--stale-minutes");
      index += 1;
    } else if (token === "--request-path") {
      args.requestPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--snapshot-path") {
      args.snapshotPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--records-dir") {
      args.recordsDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--summaries-dir") {
      args.summariesDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--checkpoint-path") {
      args.checkpointPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--trend-path") {
      args.trendPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--freshness-path") {
      args.freshnessPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--brief-path") {
      args.briefPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--window-hours") {
      args.windowHours = parsePositiveInteger(readValue(index, token), "--window-hours");
      index += 1;
    } else if (token === "--max-files") {
      args.maxFiles = parsePositiveInteger(readValue(index, token), "--max-files");
      index += 1;
    } else if (token === "--max-points") {
      args.maxPoints = parsePositiveInteger(readValue(index, token), "--max-points");
      index += 1;
    } else if (token === "--min-runs") {
      args.minRuns = parsePositiveInteger(readValue(index, token), "--min-runs");
      index += 1;
    } else if (token === "--min-allowed-rate") {
      args.minAllowedRate = parseRate(readValue(index, token), "--min-allowed-rate");
      index += 1;
    } else if (token === "--max-parse-errors") {
      args.maxParseErrors = parseNonNegativeInteger(readValue(index, token), "--max-parse-errors");
      index += 1;
    } else if (token === "--max-critical-failures") {
      args.maxCriticalFailures = parseNonNegativeInteger(
        readValue(index, token),
        "--max-critical-failures"
      );
      index += 1;
    } else if (token === "--all") {
      args.all = true;
    } else if (token === "--fail-on-incomplete-window") {
      args.failOnIncompleteWindow = true;
    } else if (token === "--fail-on-no-go") {
      args.failOnNoGo = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.fixture) {
    throw new Error("--fixture is required.");
  }
  if (!args.queuePath) {
    throw new Error("--queue-path is required.");
  }
  if (!isIsoDateTime(args.now)) {
    throw new Error("--now must be ISO-8601 datetime.");
  }

  return args;
}

function runAlignedMonitorAction(options) {
  const opsLoop = runOpsLoopAction({
    fixture: options.fixture,
    queuePath: options.queuePath,
    now: options.now,
    baseDir: options.baseDir,
    queueActor: options.queueActor,
    workflowStatePath: options.workflowStatePath,
    workflowActor: options.workflowActor,
    workflowStaleMinutes: options.workflowStaleMinutes,
    dueSoonMinutes: options.dueSoonMinutes,
    slaMinutes: options.slaMinutes,
    replayLimit: options.replayLimit,
    pendingLimit: options.pendingLimit,
    taskLimit: options.taskLimit,
  });

  let requestBuilder;
  try {
    requestBuilder = {
      satisfied: true,
      ...runRequestBuilderAction({
        snapshotPath: options.snapshotPath,
        queuePath: options.queuePath,
        workflowStatePath: options.workflowStatePath,
        baseDir: options.baseDir,
        now: options.now,
        outputPath: options.requestPath,
        intentId: null,
        opportunityId: null,
        freshWithinMinutes: options.staleMinutes,
        requestedBy: "aligned_monitor_runner",
        reason:
          "Prepared immediately after ops loop to capture a real, fresh movement intent for room-transition evidence monitoring.",
      }),
    };
  } catch (error) {
    requestBuilder = {
      satisfied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!requestBuilder.satisfied) {
    return {
      generated_at: options.now,
      aligned_activity: "ops_loop",
      ops_loop: opsLoop,
      request_builder: requestBuilder,
      skipped_monitor: true,
      reason:
        "Aligned ops loop completed, but no fresh movement intent was available for immediate evidence capture.",
    };
  }

  const monitor = runMonitorAction({
    requestPath: requestBuilder.output_path,
    snapshotPath: options.snapshotPath,
    queuePath: options.queuePath,
    workflowStatePath: options.workflowStatePath,
    baseDir: options.baseDir,
    staleMinutes: options.staleMinutes,
    now: options.now,
    recordsDir: options.recordsDir,
    summariesDir: options.summariesDir,
    checkpointPath: options.checkpointPath,
    trendPath: options.trendPath,
    freshnessPath: options.freshnessPath,
    briefPath: options.briefPath,
    windowHours: options.windowHours,
    maxFiles: options.maxFiles,
    maxPoints: options.maxPoints,
    all: options.all,
    minRuns: options.minRuns,
    minAllowedRate: options.minAllowedRate,
    maxParseErrors: options.maxParseErrors,
    maxCriticalFailures: options.maxCriticalFailures,
    failOnIncompleteWindow: false,
    failOnNoGo: false,
    requireFreshIntent: true,
  });

  return {
    generated_at: options.now,
    aligned_activity: "ops_loop",
    ops_loop: opsLoop,
    request_builder: requestBuilder,
    monitor,
  };
}

function getAlignedMonitorExitCode(result, options) {
  if (!result || !result.request_builder || result.request_builder.satisfied !== true) {
    return 2;
  }
  return getMonitorExitCode(result.monitor, {
    failOnIncompleteWindow: options.failOnIncompleteWindow,
    failOnNoGo: options.failOnNoGo,
    requireFreshIntent: true,
  });
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runAlignedMonitorAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = getAlignedMonitorExitCode(result, args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runAlignedMonitorAction,
  getAlignedMonitorExitCode,
};
