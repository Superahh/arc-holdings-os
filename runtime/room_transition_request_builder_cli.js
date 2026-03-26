"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { formatTimestampForFilename } = require("./output");
const { buildUiSnapshot } = require("./ui_snapshot");

const REQUIRED_POLICY_CHECKS = [
  "intent_exists",
  "non_terminal_opportunity",
  "no_capital_side_effects",
  "no_workflow_mutation",
  "audit_required",
];

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sanitizeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
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
    snapshotPath: null,
    queuePath: path.resolve(__dirname, "state", "approval_queue.json"),
    workflowStatePath: path.resolve(__dirname, "state", "workflow_state.json"),
    baseDir: path.resolve(__dirname, "output"),
    now: new Date().toISOString(),
    outputPath: path.join(validationsDir, "latest.request.json"),
    intentId: null,
    opportunityId: null,
    requestedBy: "owner_operator",
    reason: "Prepared from current snapshot intent for room-transition evidence monitoring.",
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
    } else if (token === "--output-path") {
      args.outputPath = path.resolve(readValue(index, token));
      index += 1;
    } else if (token === "--intent-id") {
      args.intentId = readValue(index, token);
      index += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = readValue(index, token);
      index += 1;
    } else if (token === "--requested-by") {
      args.requestedBy = readValue(index, token);
      index += 1;
    } else if (token === "--reason") {
      args.reason = readValue(index, token);
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

function selectIntent(movementIntents, options) {
  if (options.intentId) {
    const byIntentId = movementIntents.find((entry) => entry.intent_id === options.intentId);
    if (!byIntentId) {
      throw new Error(`No movement intent found for --intent-id ${options.intentId}.`);
    }
    return byIntentId;
  }

  if (options.opportunityId) {
    const byOpportunity = movementIntents.filter(
      (entry) => entry.opportunity_id === options.opportunityId
    );
    if (byOpportunity.length === 0) {
      throw new Error(
        `No movement intent found for --opportunity-id ${options.opportunityId}.`
      );
    }
    return byOpportunity.sort(
      (left, right) => Date.parse(right.trigger_timestamp) - Date.parse(left.trigger_timestamp)
    )[0];
  }

  if (movementIntents.length === 0) {
    throw new Error("No movement intents available in snapshot.");
  }
  return movementIntents.sort(
    (left, right) => Date.parse(right.trigger_timestamp) - Date.parse(left.trigger_timestamp)
  )[0];
}

function buildRequestFromIntent(intent, options) {
  const requestToken = formatTimestampForFilename(options.now);
  return {
    request_id: `rtr-${requestToken}-${sanitizeId(intent.intent_id).slice(0, 24)}`,
    intent_id: intent.intent_id,
    opportunity_id: intent.opportunity_id,
    agent: intent.agent,
    from_zone_id: intent.from_zone_id,
    to_zone_id: intent.to_zone_id,
    requested_by: options.requestedBy,
    requested_at: new Date(options.now).toISOString(),
    reason: options.reason,
    mode: "manual_preview_commit",
    status: "requested",
    policy_checks: REQUIRED_POLICY_CHECKS,
  };
}

function runRequestBuilderAction(options) {
  const snapshot = getSnapshot(options);
  const movementIntents =
    snapshot &&
    snapshot.office &&
    Array.isArray(snapshot.office.movement_intents)
      ? snapshot.office.movement_intents
      : [];
  const intent = selectIntent(movementIntents, options);
  const request = buildRequestFromIntent(intent, options);

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

  return {
    output_path: options.outputPath,
    request,
    source_intent: {
      intent_id: intent.intent_id,
      trigger_type: intent.trigger_type || null,
      trigger_timestamp: intent.trigger_timestamp || null,
    },
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runRequestBuilderAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  selectIntent,
  buildRequestFromIntent,
  runRequestBuilderAction,
};
