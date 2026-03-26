"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { formatTimestampForFilename } = require("./output");
const { runRoomTransitionValidationAction } = require("./room_transition_validator_cli");

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
    requestPath: null,
    snapshotPath: null,
    queuePath: path.resolve(__dirname, "state", "approval_queue.json"),
    workflowStatePath: path.resolve(__dirname, "state", "workflow_state.json"),
    baseDir: path.resolve(__dirname, "output"),
    staleMinutes: 15,
    now: new Date().toISOString(),
    outputDir: path.join(validationsDir, "records"),
    outputPath: null,
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
    } else if (token === "--output-dir") {
      args.outputDir = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--output-path") {
      args.outputPath = path.resolve(readValue(index, token));
      index += 1;
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

function buildDefaultOutputPath(outputDir, nowIso) {
  const token = formatTimestampForFilename(nowIso);
  return path.join(outputDir, `room-transition-validation-${token}.json`);
}

function runValidationCaptureAction(options) {
  const outputPath = options.outputPath || buildDefaultOutputPath(options.outputDir, options.now);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = runRoomTransitionValidationAction({
    requestPath: options.requestPath,
    snapshotPath: options.snapshotPath,
    queuePath: options.queuePath,
    workflowStatePath: options.workflowStatePath,
    baseDir: options.baseDir,
    staleMinutes: options.staleMinutes,
    now: options.now,
    outputPath,
  });
  return {
    output_path: outputPath,
    validated_at: result.validated_at,
    request_id: result.request_id,
    allowed: result.allowed,
    summary: result.summary,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runValidationCaptureAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.allowed ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  buildDefaultOutputPath,
  runValidationCaptureAction,
};
