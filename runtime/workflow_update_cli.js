"use strict";

const path = require("node:path");

const {
  OPPORTUNITY_STATES,
  PRIORITY_LEVELS,
  loadWorkflowState,
  saveWorkflowState,
  updateOpportunityStatus,
  updateOpportunityPriority,
} = require("./workflow_state");

function parseArgs(argv) {
  const args = {
    statePath: null,
    opportunityId: null,
    status: null,
    actor: "owner_operator",
    reason: "",
    now: new Date().toISOString(),
    forceTransition: false,
    priority: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--state-path") {
      args.statePath = argv[i + 1];
      i += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = argv[i + 1];
      i += 1;
    } else if (token === "--status") {
      args.status = argv[i + 1];
      i += 1;
    } else if (token === "--actor") {
      args.actor = argv[i + 1];
      i += 1;
    } else if (token === "--reason") {
      args.reason = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--force-transition") {
      args.forceTransition = true;
    } else if (token === "--priority") {
      args.priority = argv[i + 1];
      i += 1;
    }
  }

  if (!args.statePath) {
    throw new Error("Missing required argument: --state-path <path-to-workflow-state-json>");
  }
  if (!args.opportunityId) {
    throw new Error("Missing required argument: --opportunity-id <opportunity-id>");
  }
  if (!args.status) {
    throw new Error("Missing required argument: --status <target-status>");
  }
  if (!OPPORTUNITY_STATES.has(args.status)) {
    throw new Error(`Invalid --status value. Must be one of: ${[...OPPORTUNITY_STATES].join(", ")}`);
  }
  if (args.priority !== null && !PRIORITY_LEVELS.has(args.priority)) {
    throw new Error(`Invalid --priority value. Must be one of: ${[...PRIORITY_LEVELS].join(", ")}`);
  }
  if (Number.isNaN(Date.parse(args.now))) {
    throw new Error("Invalid --now value. Must be ISO-8601 datetime.");
  }
  return args;
}

function runUpdateAction(args) {
  const statePath = path.resolve(args.statePath);
  const nowIso = new Date(args.now).toISOString();
  const state = loadWorkflowState(statePath);
  const existing = state.opportunities[args.opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${args.opportunityId}`);
  }
  const previousStatus = existing.current_status;

  const updated = updateOpportunityStatus(
    state,
    args.opportunityId,
    args.status,
    args.actor,
    args.reason,
    nowIso,
    { forceTransition: args.forceTransition }
  );
  if (typeof args.priority === "string") {
    updateOpportunityPriority(
      state,
      args.opportunityId,
      args.priority,
      args.actor,
      args.reason || `Priority set to ${args.priority}`,
      nowIso
    );
  }
  const savedPath = saveWorkflowState(statePath, state, nowIso);
  const current = state.opportunities[args.opportunityId];

  return {
    state_path: savedPath,
    opportunity_id: updated.opportunity_id,
    previous_status: previousStatus,
    current_status: updated.current_status,
    priority: current.priority,
    status_history_count: updated.status_history.length,
    force_transition: args.forceTransition,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runUpdateAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runUpdateAction,
  main,
};
