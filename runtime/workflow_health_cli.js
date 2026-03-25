"use strict";

const path = require("node:path");

const { OPPORTUNITY_STATES, loadWorkflowState } = require("./workflow_state");
const { writeHealthArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    statePath: null,
    baseDir: path.join(__dirname, "output"),
    now: new Date().toISOString(),
    staleMinutes: 240,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--state-path") {
      args.statePath = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--stale-minutes") {
      args.staleMinutes = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.statePath) {
    throw new Error("Missing required argument: --state-path <path-to-workflow-state-json>");
  }
  if (!Number.isInteger(args.staleMinutes) || args.staleMinutes <= 0) {
    throw new Error("--stale-minutes must be a positive integer.");
  }
  return args;
}

function minutesBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

function safeAverage(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function computeWorkflowHealth(state, nowIso, staleMinutes) {
  const opportunities = Object.values(state.opportunities);
  const statusCounts = {};
  for (const status of OPPORTUNITY_STATES) {
    statusCounts[status] = 0;
  }

  const stale = [];
  const historyLengths = [];
  const terminalDurations = [];
  const terminalStatuses = new Set(["closed", "rejected"]);

  for (const record of opportunities) {
    if (statusCounts[record.current_status] === undefined) {
      statusCounts[record.current_status] = 0;
    }
    statusCounts[record.current_status] += 1;

    const age = minutesBetween(record.last_updated_at, nowIso);
    if (
      age != null &&
      age > staleMinutes &&
      !terminalStatuses.has(record.current_status)
    ) {
      stale.push({
        opportunity_id: record.opportunity_id,
        current_status: record.current_status,
        age_minutes: age,
        last_updated_at: record.last_updated_at,
      });
    }

    const history = Array.isArray(record.status_history) ? record.status_history : [];
    historyLengths.push(history.length);

    if (history.length >= 2) {
      const firstTs = history[0].timestamp;
      const last = history[history.length - 1];
      if (terminalStatuses.has(last.status)) {
        const duration = minutesBetween(firstTs, last.timestamp);
        if (duration != null) {
          terminalDurations.push(duration);
        }
      }
    }
  }

  const transitionsTotal = historyLengths.reduce((acc, value) => acc + value, 0);
  const nonTerminalCount =
    opportunities.length - (statusCounts.closed || 0) - (statusCounts.rejected || 0);

  const healthLabel =
    stale.length > 0
      ? "at_risk"
      : nonTerminalCount > 0
      ? "watch"
      : "healthy";

  return {
    workflow_totals: {
      opportunities: opportunities.length,
      events: state.event_log.length,
      status_counts: statusCounts,
    },
    kpis: {
      stale_minutes_threshold: staleMinutes,
      stale_non_terminal_count: stale.length,
      avg_status_transitions_per_opportunity:
        opportunities.length === 0 ? 0 : Math.round((transitionsTotal / opportunities.length) * 100) / 100,
      avg_terminal_duration_minutes: safeAverage(terminalDurations),
      non_terminal_count: nonTerminalCount,
    },
    stale_opportunities: stale,
    observations: {
      workflow_health: healthLabel,
      note:
        healthLabel === "at_risk"
          ? "Non-terminal opportunities are stale beyond threshold."
          : healthLabel === "watch"
          ? "Active opportunities exist and require monitoring."
          : "No active non-terminal opportunities.",
    },
  };
}

function runWorkflowHealthAction(args) {
  const statePath = path.resolve(args.statePath);
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const state = loadWorkflowState(statePath);

  const health = computeWorkflowHealth(state, nowIso, args.staleMinutes);
  const sourceLabel = `${path.basename(statePath, path.extname(statePath))}_workflow`;
  const healthArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: sourceLabel,
    source_workflow_state_path: statePath,
    ...health,
  };
  const healthPath = writeHealthArtifact(baseDir, healthArtifact);

  return {
    state_path: statePath,
    health_artifact_path: healthPath,
    workflow_health: health.observations.workflow_health,
    stale_non_terminal_count: health.kpis.stale_non_terminal_count,
    non_terminal_count: health.kpis.non_terminal_count,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runWorkflowHealthAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  computeWorkflowHealth,
  runWorkflowHealthAction,
  main,
};
