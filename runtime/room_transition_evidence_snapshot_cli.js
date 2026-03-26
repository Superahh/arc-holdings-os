"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runEvidenceAction } = require("./room_transition_evidence_cli");

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

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
  function readValue(index, option) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${option}`);
    }
    return value;
  }

  const defaultDir = path.resolve(__dirname, "output", "room_transition_validations");
  const args = {
    inputsDir: defaultDir,
    summariesDir: defaultDir,
    now: new Date().toISOString(),
    windowHours: 168,
    maxFiles: 500,
    all: false,
    minRuns: 30,
    minAllowedRate: 0.95,
    maxParseErrors: 0,
    maxCriticalFailures: 0,
    failOnNotReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--inputs-dir") {
      args.inputsDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--summaries-dir") {
      args.summariesDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else if (token === "--window-hours") {
      args.windowHours = parsePositiveInteger(readValue(index, token), "--window-hours");
      index += 1;
    } else if (token === "--max-files") {
      args.maxFiles = parsePositiveInteger(readValue(index, token), "--max-files");
      index += 1;
    } else if (token === "--min-runs") {
      args.minRuns = parsePositiveInteger(readValue(index, token), "--min-runs");
      index += 1;
    } else if (token === "--min-allowed-rate") {
      args.minAllowedRate = parseRate(readValue(index, token), "--min-allowed-rate");
      index += 1;
    } else if (token === "--max-parse-errors") {
      args.maxParseErrors = parseNonNegativeInteger(
        readValue(index, token),
        "--max-parse-errors"
      );
      index += 1;
    } else if (token === "--max-critical-failures") {
      args.maxCriticalFailures = parseNonNegativeInteger(
        readValue(index, token),
        "--max-critical-failures"
      );
      index += 1;
    } else if (token === "--all") {
      args.all = true;
    } else if (token === "--fail-on-not-ready") {
      args.failOnNotReady = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!isIsoDateTime(args.now)) {
    throw new Error("--now must be ISO-8601 datetime.");
  }
  return args;
}

function timestampToken(nowIso) {
  return nowIso.replaceAll(":", "").replaceAll("-", "").replaceAll(".", "").replaceAll("Z", "Z");
}

function runEvidenceSnapshotAction(options) {
  fs.mkdirSync(options.summariesDir, { recursive: true });
  const fileToken = timestampToken(options.now);
  const timestampedPath = path.join(
    options.summariesDir,
    `room-transition-evidence-${fileToken}.json`
  );
  const latestPath = path.join(options.summariesDir, "latest.summary.json");

  const summary = runEvidenceAction({
    inputsDir: options.inputsDir,
    outputPath: timestampedPath,
    now: options.now,
    windowHours: options.windowHours,
    maxFiles: options.maxFiles,
    all: options.all,
    minRuns: options.minRuns,
    minAllowedRate: options.minAllowedRate,
    maxParseErrors: options.maxParseErrors,
    maxCriticalFailures: options.maxCriticalFailures,
  });

  fs.writeFileSync(latestPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return {
    generated_at: options.now,
    timestamped_path: timestampedPath,
    latest_path: latestPath,
    readiness: summary.readiness,
    coverage: summary.coverage,
    totals: summary.totals,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runEvidenceSnapshotAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (args.failOnNotReady && !result.readiness.eligible_for_writable_review) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runEvidenceSnapshotAction,
};
