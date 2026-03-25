"use strict";

const path = require("node:path");

const { loadWorkflowState, OPPORTUNITY_STATES } = require("./workflow_state");

const MODES = new Set(["summary", "opportunities", "history", "opportunity"]);

function parseArgs(argv) {
  const args = {
    statePath: null,
    mode: "summary",
    opportunityId: null,
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--state-path") {
      args.statePath = argv[i + 1];
      i += 1;
    } else if (token === "--mode") {
      args.mode = argv[i + 1];
      i += 1;
    } else if (token === "--opportunity-id") {
      args.opportunityId = argv[i + 1];
      i += 1;
    } else if (token === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.statePath) {
    throw new Error("Missing required argument: --state-path <path-to-workflow-state-json>");
  }
  if (!MODES.has(args.mode)) {
    throw new Error("Invalid --mode. Expected one of: summary, opportunities, history, opportunity.");
  }
  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  if (args.mode === "opportunity" && !args.opportunityId) {
    throw new Error("--opportunity-id is required when --mode opportunity is used.");
  }
  return args;
}

function sortByLastUpdatedDesc(records) {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.last_updated_at || 0);
    const bTs = Date.parse(b.last_updated_at || 0);
    return bTs - aTs;
  });
}

function countByStatus(records) {
  const counts = {};
  for (const status of OPPORTUNITY_STATES) {
    counts[status] = 0;
  }
  for (const record of records) {
    if (counts[record.current_status] === undefined) {
      counts[record.current_status] = 0;
    }
    counts[record.current_status] += 1;
  }
  return counts;
}

function runListAction(args) {
  const statePath = path.resolve(args.statePath);
  const state = loadWorkflowState(statePath);
  const opportunities = sortByLastUpdatedDesc(Object.values(state.opportunities));

  if (args.mode === "summary") {
    return {
      state_path: statePath,
      mode: "summary",
      updated_at: state.updated_at,
      totals: {
        opportunities: opportunities.length,
        events: state.event_log.length,
      },
      status_counts: countByStatus(opportunities),
      recent_opportunities: opportunities.slice(0, args.limit).map((record) => ({
        opportunity_id: record.opportunity_id,
        current_status: record.current_status,
        recommendation: record.recommendation,
        last_updated_at: record.last_updated_at,
      })),
    };
  }

  if (args.mode === "opportunities") {
    return {
      state_path: statePath,
      mode: "opportunities",
      count: opportunities.length,
      opportunities: opportunities.slice(0, args.limit),
    };
  }

  if (args.mode === "history") {
    if (args.opportunityId) {
      const record = state.opportunities[args.opportunityId];
      if (!record) {
        throw new Error(`Opportunity not found: ${args.opportunityId}`);
      }
      return {
        state_path: statePath,
        mode: "history",
        opportunity_id: args.opportunityId,
        count: record.status_history.length,
        status_history: record.status_history.slice(-args.limit).reverse(),
      };
    }
    return {
      state_path: statePath,
      mode: "history",
      count: state.event_log.length,
      events: state.event_log.slice(-args.limit).reverse(),
    };
  }

  const record = state.opportunities[args.opportunityId];
  if (!record) {
    throw new Error(`Opportunity not found: ${args.opportunityId}`);
  }
  return {
    state_path: statePath,
    mode: "opportunity",
    opportunity: record,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runListAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runListAction,
  main,
};
