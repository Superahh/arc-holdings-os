"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { buildUiSnapshot } = require("./ui_snapshot");

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

  const args = {
    snapshotPath: null,
    queuePath: path.resolve(__dirname, "state", "approval_queue.json"),
    workflowStatePath: path.resolve(__dirname, "state", "workflow_state.json"),
    baseDir: path.resolve(__dirname, "output"),
    now: new Date().toISOString(),
    staleMinutes: 15,
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--snapshot-path") {
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
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else if (token === "--stale-minutes") {
      args.staleMinutes = parsePositiveInteger(readValue(index, token), "--stale-minutes");
      index += 1;
    } else if (token === "--output-path") {
      args.outputPath = path.resolve(readValue(index, token));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!isIsoDateTime(args.now)) {
    throw new Error("--now must be ISO-8601 datetime.");
  }

  return args;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label} JSON at ${filePath}: ${message}`);
  }
}

function getSnapshot(options) {
  if (options.snapshotPath) {
    return readJson(options.snapshotPath, "snapshot");
  }
  return buildUiSnapshot({
    queuePath: options.queuePath,
    workflowStatePath: options.workflowStatePath,
    baseDir: options.baseDir,
    now: options.now,
  });
}

function toAgeMinutes(nowIso, triggerTimestamp) {
  const nowMs = Date.parse(nowIso);
  const triggerMs = Date.parse(triggerTimestamp);
  if (!Number.isFinite(nowMs) || !Number.isFinite(triggerMs)) {
    return null;
  }
  return Number(((nowMs - triggerMs) / (60 * 1000)).toFixed(4));
}

function runIntentFreshnessAction(options) {
  const snapshot = getSnapshot(options);
  const movementIntents =
    snapshot && snapshot.office && Array.isArray(snapshot.office.movement_intents)
      ? snapshot.office.movement_intents
      : [];
  const threshold = options.staleMinutes;

  const intents = movementIntents.map((intent) => {
    const ageMinutes = toAgeMinutes(options.now, intent.trigger_timestamp);
    return {
      intent_id: intent.intent_id,
      opportunity_id: intent.opportunity_id,
      trigger_type: intent.trigger_type || null,
      trigger_timestamp: intent.trigger_timestamp || null,
      age_minutes: ageMinutes,
      fresh: ageMinutes !== null && ageMinutes >= 0 && ageMinutes <= threshold,
    };
  });

  const freshIntents = intents.filter((entry) => entry.fresh);
  const staleIntents = intents.filter((entry) => !entry.fresh);
  const sortedByAge = intents
    .filter((entry) => typeof entry.age_minutes === "number")
    .sort((left, right) => left.age_minutes - right.age_minutes);

  const result = {
    generated_at: options.now,
    stale_minutes: threshold,
    totals: {
      movement_intent_count: intents.length,
      fresh_count: freshIntents.length,
      stale_or_invalid_count: staleIntents.length,
    },
    freshest_intent:
      sortedByAge.length > 0
        ? {
            intent_id: sortedByAge[0].intent_id,
            age_minutes: sortedByAge[0].age_minutes,
            fresh: sortedByAge[0].fresh,
          }
        : null,
    intents,
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return result;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runIntentFreshnessAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  runIntentFreshnessAction,
};
