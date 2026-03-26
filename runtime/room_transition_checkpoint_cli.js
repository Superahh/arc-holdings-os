"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runEvidenceSnapshotAction } = require("./room_transition_evidence_snapshot_cli");
const { runWindowStatusAction } = require("./room_transition_window_status_cli");
const { buildRecommendation } = require("./room_transition_recommendation_cli");

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

function parseArgs(argv) {
  const defaultDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    inputsDir: defaultDir,
    summariesDir: defaultDir,
    checkpointPath: path.join(defaultDir, "latest.checkpoint.json"),
    now: new Date().toISOString(),
    windowHours: 168,
    maxFiles: 500,
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
    const readValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for argument: ${token}`);
      }
      index += 1;
      return value;
    };

    if (token === "--inputs-dir") {
      args.inputsDir = path.resolve(readValue());
    } else if (token === "--summaries-dir") {
      args.summariesDir = path.resolve(readValue());
    } else if (token === "--checkpoint-path") {
      args.checkpointPath = path.resolve(readValue());
    } else if (token === "--now") {
      args.now = readValue();
    } else if (token === "--window-hours") {
      args.windowHours = parsePositiveInteger(readValue(), "--window-hours");
    } else if (token === "--max-files") {
      args.maxFiles = parsePositiveInteger(readValue(), "--max-files");
    } else if (token === "--min-runs") {
      args.minRuns = parsePositiveInteger(readValue(), "--min-runs");
    } else if (token === "--min-allowed-rate") {
      args.minAllowedRate = parseRate(readValue(), "--min-allowed-rate");
    } else if (token === "--max-parse-errors") {
      args.maxParseErrors = parseNonNegativeInteger(readValue(), "--max-parse-errors");
    } else if (token === "--max-critical-failures") {
      args.maxCriticalFailures = parseNonNegativeInteger(readValue(), "--max-critical-failures");
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

  return args;
}

function runCheckpointAction(options) {
  const snapshot = runEvidenceSnapshotAction({
    inputsDir: options.inputsDir,
    summariesDir: options.summariesDir,
    now: options.now,
    windowHours: options.windowHours,
    maxFiles: options.maxFiles,
    all: options.all,
    minRuns: options.minRuns,
    minAllowedRate: options.minAllowedRate,
    maxParseErrors: options.maxParseErrors,
    maxCriticalFailures: options.maxCriticalFailures,
    failOnNotReady: false,
  });

  const windowStatus = runWindowStatusAction({
    summaryPath: snapshot.latest_path,
  });
  const recommendation = buildRecommendation(windowStatus);

  const checkpoint = {
    generated_at: options.now,
    snapshot,
    window_status: windowStatus,
    recommendation,
  };

  fs.mkdirSync(path.dirname(options.checkpointPath), { recursive: true });
  fs.writeFileSync(options.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");

  return checkpoint;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const checkpoint = runCheckpointAction(args);
    process.stdout.write(`${JSON.stringify(checkpoint, null, 2)}\n`);

    if (args.failOnIncompleteWindow && !checkpoint.window_status.window.full_window_observed) {
      process.exitCode = 2;
    } else if (
      args.failOnNoGo &&
      checkpoint.recommendation.promotion_decision !== "candidate_for_review"
    ) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runCheckpointAction,
};
