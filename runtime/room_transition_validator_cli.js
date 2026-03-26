"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { buildUiSnapshot } = require("./ui_snapshot");

const TERMINAL_OPPORTUNITY_STATES = new Set(["closed", "rejected"]);
const REQUEST_MODES = new Set(["manual_preview_commit"]);
const REQUEST_STATUSES = new Set(["requested", "approved", "rejected", "executed", "cancelled"]);
const REQUIRED_POLICY_CHECKS = [
  "intent_exists",
  "non_terminal_opportunity",
  "no_capital_side_effects",
  "no_workflow_mutation",
  "audit_required",
];
const REQUEST_FIELDS = new Set([
  "request_id",
  "intent_id",
  "opportunity_id",
  "agent",
  "from_zone_id",
  "to_zone_id",
  "requested_by",
  "requested_at",
  "reason",
  "mode",
  "status",
  "policy_checks",
]);

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label} JSON at ${filePath}: ${message}`);
  }
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
    requestPath: null,
    snapshotPath: null,
    queuePath: path.resolve(__dirname, "state", "approval_queue.json"),
    workflowStatePath: path.resolve(__dirname, "state", "workflow_state.json"),
    baseDir: path.resolve(__dirname, "output"),
    staleMinutes: 15,
    now: new Date().toISOString(),
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--request-path") {
      args.requestPath = readValue(index, token);
      index += 1;
    } else if (token === "--snapshot-path") {
      args.snapshotPath = readValue(index, token);
      index += 1;
    } else if (token === "--queue-path") {
      args.queuePath = readValue(index, token);
      index += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = readValue(index, token);
      index += 1;
    } else if (token === "--base-dir") {
      args.baseDir = readValue(index, token);
      index += 1;
    } else if (token === "--stale-minutes") {
      args.staleMinutes = parsePositiveInteger(readValue(index, token), "--stale-minutes");
      index += 1;
    } else if (token === "--now") {
      args.now = readValue(index, token);
      index += 1;
    } else if (token === "--output-path") {
      args.outputPath = readValue(index, token);
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

  args.requestPath = path.resolve(args.requestPath);
  if (args.snapshotPath) {
    args.snapshotPath = path.resolve(args.snapshotPath);
  }
  args.queuePath = path.resolve(args.queuePath);
  args.workflowStatePath = path.resolve(args.workflowStatePath);
  args.baseDir = path.resolve(args.baseDir);
  if (args.outputPath) {
    args.outputPath = path.resolve(args.outputPath);
  }

  return args;
}

function validateRequestShape(request) {
  const errors = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return ["request must be a JSON object."];
  }
  if (typeof request.request_id !== "string" || !request.request_id) {
    errors.push("request_id must be a non-empty string.");
  }
  if (typeof request.intent_id !== "string" || !request.intent_id) {
    errors.push("intent_id must be a non-empty string.");
  }
  if (typeof request.opportunity_id !== "string" || !request.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (typeof request.agent !== "string" || !request.agent) {
    errors.push("agent must be a non-empty string.");
  }
  if (typeof request.from_zone_id !== "string" || !request.from_zone_id) {
    errors.push("from_zone_id must be a non-empty string.");
  }
  if (typeof request.to_zone_id !== "string" || !request.to_zone_id) {
    errors.push("to_zone_id must be a non-empty string.");
  }
  if (typeof request.requested_by !== "string" || !request.requested_by) {
    errors.push("requested_by must be a non-empty string.");
  }
  if (!isIsoDateTime(request.requested_at)) {
    errors.push("requested_at must be ISO-8601 datetime.");
  }
  if (typeof request.reason !== "string" || !request.reason) {
    errors.push("reason must be a non-empty string.");
  }
  if (!REQUEST_MODES.has(request.mode)) {
    errors.push("mode must be manual_preview_commit.");
  }
  if (!REQUEST_STATUSES.has(request.status)) {
    errors.push("status contains invalid enum value.");
  }
  if (!Array.isArray(request.policy_checks)) {
    errors.push("policy_checks must be an array.");
  }
  return errors;
}

function findOpportunity(snapshot, opportunityId) {
  const opportunities =
    snapshot &&
    snapshot.workflow &&
    Array.isArray(snapshot.workflow.opportunities)
      ? snapshot.workflow.opportunities
      : [];
  return opportunities.find((entry) => entry.opportunity_id === opportunityId) || null;
}

function buildPolicyChecks(request, snapshot, nowIso, staleMinutes) {
  const movementIntents =
    snapshot &&
    snapshot.office &&
    Array.isArray(snapshot.office.movement_intents)
      ? snapshot.office.movement_intents
      : [];
  const intent =
    movementIntents.find((entry) => entry.intent_id === request.intent_id) || null;
  const opportunity = findOpportunity(snapshot, request.opportunity_id);
  const nowMs = Date.parse(nowIso);
  const triggerMs = intent ? Date.parse(intent.trigger_timestamp) : Number.NaN;
  const staleWindowMs = staleMinutes * 60 * 1000;
  const extraFields = Object.keys(request).filter((field) => !REQUEST_FIELDS.has(field));
  const hasRequiredPolicyCheckList =
    Array.isArray(request.policy_checks) &&
    REQUIRED_POLICY_CHECKS.every((name) => request.policy_checks.includes(name));

  return {
    intent,
    checks: [
      {
        name: "intent_exists",
        pass: Boolean(intent),
        message: intent
          ? "intent_id resolves to an OfficeMovementIntent."
          : "intent_id is missing from current snapshot movement_intents.",
      },
      {
        name: "manual_mode",
        pass: request.mode === "manual_preview_commit",
        message:
          request.mode === "manual_preview_commit"
            ? "mode is manual_preview_commit."
            : "mode must be manual_preview_commit.",
      },
      {
        name: "request_status_gate",
        pass: request.status === "requested",
        message:
          request.status === "requested"
            ? "status is requested for validation boundary."
            : "validator accepts writable boundary requests only at status=requested.",
      },
      {
        name: "snapshot_identity_match",
        pass: Boolean(
          intent &&
            intent.opportunity_id === request.opportunity_id &&
            intent.agent === request.agent &&
            intent.from_zone_id === request.from_zone_id &&
            intent.to_zone_id === request.to_zone_id
        ),
        message:
          intent &&
          intent.opportunity_id === request.opportunity_id &&
          intent.agent === request.agent &&
          intent.from_zone_id === request.from_zone_id &&
          intent.to_zone_id === request.to_zone_id
            ? "request identity fields match snapshot intent."
            : "request fields do not match snapshot intent identity.",
      },
      {
        name: "non_terminal_opportunity",
        pass: Boolean(
          opportunity && !TERMINAL_OPPORTUNITY_STATES.has(opportunity.current_status)
        ),
        message:
          opportunity && !TERMINAL_OPPORTUNITY_STATES.has(opportunity.current_status)
            ? "opportunity is non-terminal."
            : "opportunity is terminal or missing from workflow snapshot.",
      },
      {
        name: "intent_fresh",
        pass:
          intent &&
          !Number.isNaN(triggerMs) &&
          !Number.isNaN(nowMs) &&
          Math.max(0, nowMs - triggerMs) <= staleWindowMs,
        message:
          intent &&
          !Number.isNaN(triggerMs) &&
          !Number.isNaN(nowMs) &&
          Math.max(0, nowMs - triggerMs) <= staleWindowMs
            ? `intent trigger is within ${staleMinutes} minute freshness window.`
            : `intent is stale or timestamp is invalid for freshness window (${staleMinutes}m).`,
      },
      {
        name: "no_workflow_or_capital_mutation_fields",
        pass: extraFields.length === 0,
        message:
          extraFields.length === 0
            ? "request contains only allowed room-transition boundary fields."
            : `request contains unsupported fields: ${extraFields.join(", ")}.`,
      },
      {
        name: "policy_check_list_complete",
        pass: hasRequiredPolicyCheckList,
        message: hasRequiredPolicyCheckList
          ? "policy_checks includes required boundary checks."
          : "policy_checks is missing one or more required boundary check names.",
      },
    ],
  };
}

function validateRoomTransitionRequest(input) {
  const nowIso = input.now;
  const staleMinutes = input.staleMinutes || 15;
  const requestErrors = validateRequestShape(input.request);
  const { intent, checks } = buildPolicyChecks(
    input.request,
    input.snapshot,
    nowIso,
    staleMinutes
  );

  const allowed =
    requestErrors.length === 0 && checks.every((check) => Boolean(check.pass));

  return {
    validated_at: nowIso,
    stale_minutes: staleMinutes,
    allowed,
    request_id:
      input.request && typeof input.request.request_id === "string"
        ? input.request.request_id
        : null,
    intent_id:
      input.request && typeof input.request.intent_id === "string"
        ? input.request.intent_id
        : null,
    request_errors: requestErrors,
    checks,
    matched_intent: intent
      ? {
          intent_id: intent.intent_id,
          opportunity_id: intent.opportunity_id,
          trigger_type: intent.trigger_type,
          trigger_timestamp: intent.trigger_timestamp,
        }
      : null,
    summary: allowed
      ? "Room-transition request passes read-only policy boundary validation."
      : "Room-transition request fails one or more boundary checks.",
  };
}

function runRoomTransitionValidationAction(options) {
  const request = readJson(options.requestPath, "request");
  const snapshot = options.snapshotPath
    ? readJson(options.snapshotPath, "snapshot")
    : buildUiSnapshot({
        queuePath: options.queuePath,
        workflowStatePath: options.workflowStatePath,
        baseDir: options.baseDir,
        now: options.now,
      });
  const result = validateRoomTransitionRequest({
    request,
    snapshot,
    now: options.now,
    staleMinutes: options.staleMinutes,
  });

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runRoomTransitionValidationAction(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.allowed ? 0 : 2;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  validateRequestShape,
  buildPolicyChecks,
  validateRoomTransitionRequest,
  runRoomTransitionValidationAction,
};
