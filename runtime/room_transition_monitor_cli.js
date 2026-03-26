"use strict";

const path = require("node:path");

const { runValidationCaptureAction } = require("./room_transition_validation_capture_cli");
const { runCheckpointAction } = require("./room_transition_checkpoint_cli");
const { runTrendAction } = require("./room_transition_trend_cli");
const { runOperatorBriefAction } = require("./room_transition_operator_brief_cli");

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

  const defaultDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    requestPath: null,
    snapshotPath: null,
    queuePath: path.resolve(__dirname, "state", "approval_queue.json"),
    workflowStatePath: path.resolve(__dirname, "state", "workflow_state.json"),
    baseDir: path.resolve(__dirname, "output"),
    staleMinutes: 15,
    now: new Date().toISOString(),
    recordsDir: path.join(defaultDir, "records"),
    summariesDir: defaultDir,
    checkpointPath: path.join(defaultDir, "latest.checkpoint.json"),
    trendPath: path.join(defaultDir, "latest.trend.json"),
    briefPath: path.join(defaultDir, "latest.operator-brief.md"),
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
    if (token === "--request-path") {
      args.requestPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--snapshot-path") {
      args.snapshotPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--queue-path") {
      args.queuePath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--base-dir") {
      args.baseDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--stale-minutes") {
      args.staleMinutes = parsePositiveInteger(readValue(index, token), "--stale-minutes");
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
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

  if (!args.requestPath) {
    throw new Error("--request-path is required.");
  }
  if (!isIsoDateTime(args.now)) {
    throw new Error("--now must be ISO-8601 datetime.");
  }

  return args;
}

function runMonitorAction(options) {
  const capture = runValidationCaptureAction({
    requestPath: options.requestPath,
    snapshotPath: options.snapshotPath,
    queuePath: options.queuePath,
    workflowStatePath: options.workflowStatePath,
    baseDir: options.baseDir,
    staleMinutes: options.staleMinutes,
    now: options.now,
    outputDir: options.recordsDir,
    outputPath: null,
  });

  const checkpoint = runCheckpointAction({
    inputsDir: options.recordsDir,
    summariesDir: options.summariesDir,
    checkpointPath: options.checkpointPath,
    now: options.now,
    windowHours: options.windowHours,
    maxFiles: options.maxFiles,
    all: options.all,
    minRuns: options.minRuns,
    minAllowedRate: options.minAllowedRate,
    maxParseErrors: options.maxParseErrors,
    maxCriticalFailures: options.maxCriticalFailures,
    failOnIncompleteWindow: false,
    failOnNoGo: false,
  });

  const trend = runTrendAction({
    summariesDir: options.summariesDir,
    maxPoints: options.maxPoints,
    outputPath: options.trendPath,
  });

  const brief = runOperatorBriefAction({
    checkpointPath: options.checkpointPath,
    trendPath: options.trendPath,
    outputPath: options.briefPath,
  });

  return {
    generated_at: options.now,
    capture,
    checkpoint_path: options.checkpointPath,
    trend_path: options.trendPath,
    brief_path: brief.output_path,
    gate: {
      promotion_decision:
        checkpoint.recommendation && checkpoint.recommendation.promotion_decision
          ? checkpoint.recommendation.promotion_decision
          : "unknown",
      recommendation_state:
        checkpoint.recommendation && checkpoint.recommendation.recommendation_state
          ? checkpoint.recommendation.recommendation_state
          : "unknown",
      full_window_observed:
        checkpoint.window_status &&
        checkpoint.window_status.window &&
        checkpoint.window_status.window.full_window_observed === true,
    },
  };
}

function getMonitorExitCode(result, options) {
  if (
    options.failOnIncompleteWindow &&
    result &&
    result.gate &&
    result.gate.full_window_observed !== true
  ) {
    return 2;
  }
  if (
    options.failOnNoGo &&
    result &&
    result.gate &&
    result.gate.promotion_decision !== "candidate_for_review"
  ) {
    return 2;
  }
  return 0;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runMonitorAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = getMonitorExitCode(result, args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runMonitorAction,
  getMonitorExitCode,
};
