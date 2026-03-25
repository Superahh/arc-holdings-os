"use strict";

const path = require("node:path");
const {
  PRIORITY_LEVELS,
  loadWorkflowState,
  saveWorkflowState,
  requestSellerVerification,
  applySellerVerificationResponse,
} = require("./workflow_state");

function parseBooleanFlag(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error("Boolean flags must be true or false.");
}

function parseArgs(argv) {
  const args = {
    statePath: null,
    opportunityId: null,
    action: null,
    actor: "risk_and_compliance_agent",
    now: new Date().toISOString(),
    message: "",
    reason: "",
    priority: "urgent",
    responseStatus: null,
    responseNotes: "",
    imeiVerified: null,
    carrierVerified: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--state-path") {
      args.statePath = argv[i + 1];
      i += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = argv[i + 1];
      i += 1;
    } else if (token === "--action") {
      args.action = argv[i + 1];
      i += 1;
    } else if (token === "--actor") {
      args.actor = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--message") {
      args.message = argv[i + 1];
      i += 1;
    } else if (token === "--reason") {
      args.reason = argv[i + 1];
      i += 1;
    } else if (token === "--priority") {
      args.priority = argv[i + 1];
      i += 1;
    } else if (token === "--response-status") {
      args.responseStatus = argv[i + 1];
      i += 1;
    } else if (token === "--response-notes") {
      args.responseNotes = argv[i + 1];
      i += 1;
    } else if (token === "--imei-verified") {
      args.imeiVerified = parseBooleanFlag(argv[i + 1]);
      i += 1;
    } else if (token === "--carrier-verified") {
      args.carrierVerified = parseBooleanFlag(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.statePath) {
    throw new Error("Missing required argument: --state-path <path-to-workflow-state-json>");
  }
  if (!args.opportunityId) {
    throw new Error("Missing required argument: --opportunity-id <opportunity-id>");
  }
  if (!["request", "response"].includes(args.action)) {
    throw new Error("Missing or invalid --action. Must be one of: request, response.");
  }
  if (!PRIORITY_LEVELS.has(args.priority)) {
    throw new Error(`Invalid --priority value. Must be one of: ${[...PRIORITY_LEVELS].join(", ")}`);
  }
  if (Number.isNaN(Date.parse(args.now))) {
    throw new Error("Invalid --now value. Must be ISO-8601 datetime.");
  }
  if (args.action === "response" && !["satisfactory", "unsatisfactory"].includes(args.responseStatus)) {
    throw new Error("For --action response, --response-status must be satisfactory or unsatisfactory.");
  }
  return args;
}

function runSellerVerificationAction(args) {
  const statePath = path.resolve(args.statePath);
  const nowIso = new Date(args.now).toISOString();
  const state = loadWorkflowState(statePath);

  let record;
  if (args.action === "request") {
    record = requestSellerVerification(state, args.opportunityId, args.actor, nowIso, {
      message: args.message,
      reason: args.reason,
      priority: args.priority,
    });
  } else {
    record = applySellerVerificationResponse(state, args.opportunityId, args.responseStatus, args.actor, nowIso, {
      notes: args.responseNotes,
      imeiVerified: args.imeiVerified,
      carrierVerified: args.carrierVerified,
    });
  }

  const savedPath = saveWorkflowState(statePath, state, nowIso);
  return {
    state_path: savedPath,
    opportunity_id: record.opportunity_id,
    action: args.action,
    current_status: record.current_status,
    priority: record.priority,
    purchase_recommendation_blocked: record.purchase_recommendation_blocked,
    alternative_opportunities_required: record.alternative_opportunities_required,
    confidence: record.confidence,
    seller_verification: record.seller_verification,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runSellerVerificationAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runSellerVerificationAction,
  main,
};
