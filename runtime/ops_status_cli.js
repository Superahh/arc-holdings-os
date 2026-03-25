"use strict";

const path = require("node:path");

const { loadQueue, getPendingTickets } = require("./approval_queue");
const { computeHealth } = require("./queue_health_cli");
const { loadWorkflowState } = require("./workflow_state");
const { computeWorkflowHealth } = require("./workflow_health_cli");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    workflowStatePath: null,
    now: new Date().toISOString(),
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    pendingLimit: 5,
    staleLimit: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--workflow-stale-minutes") {
      args.workflowStaleMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--pending-limit") {
      args.pendingLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--stale-limit") {
      args.staleLimit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  for (const [name, value] of [
    ["--sla-minutes", args.slaMinutes],
    ["--workflow-stale-minutes", args.workflowStaleMinutes],
    ["--pending-limit", args.pendingLimit],
    ["--stale-limit", args.staleLimit],
  ]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  return args;
}

function runStatusAction(args) {
  const nowIso = new Date(args.now).toISOString();
  const queuePath = path.resolve(args.queuePath);
  const queue = loadQueue(queuePath);
  const queueHealth = computeHealth(queue, nowIso, args.slaMinutes);
  const pending = getPendingTickets(queue).slice(0, args.pendingLimit);

  let workflow = null;
  if (args.workflowStatePath) {
    const workflowPath = path.resolve(args.workflowStatePath);
    const workflowState = loadWorkflowState(workflowPath);
    const workflowHealth = computeWorkflowHealth(workflowState, nowIso, args.workflowStaleMinutes);
    workflow = {
      state_path: workflowPath,
      health: workflowHealth,
      stale_opportunities: workflowHealth.stale_opportunities.slice(0, args.staleLimit),
    };
  }

  return {
    schema_version: "v1",
    generated_at: nowIso,
    queue: {
      path: queuePath,
      health: queueHealth,
      pending_tickets: pending,
    },
    workflow,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runStatusAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runStatusAction,
  main,
};
