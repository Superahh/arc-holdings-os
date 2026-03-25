"use strict";

const path = require("node:path");

const { loadQueue, getPendingTickets } = require("./approval_queue");
const { computeHealth } = require("./queue_health_cli");
const { loadWorkflowState } = require("./workflow_state");
const { computeWorkflowHealth } = require("./workflow_health_cli");

const WORKFLOW_TASK_RULES = {
  discovered: {
    owner: "Intake Agent",
    next_action: "Normalize opportunity details for valuation.",
    due_minutes: 60,
  },
  researching: {
    owner: "Risk and Compliance Agent",
    next_action: "Collect missing verification data and unblock decision.",
    due_minutes: 120,
  },
  awaiting_approval: {
    owner: "CEO Agent",
    next_action: "Review and decide approval ticket.",
    due_minutes: 60,
  },
  approved: {
    owner: "Operations Coordinator Agent",
    next_action: "Execute approved acquisition workflow.",
    due_minutes: 120,
  },
  acquired: {
    owner: "Operations Coordinator Agent",
    next_action: "Route inventory to next monetization lane.",
    due_minutes: 180,
  },
  routed: {
    owner: "Department Operator Agent",
    next_action: "Prepare listing and pricing execution tasks.",
    due_minutes: 180,
  },
  monetizing: {
    owner: "Department Operator Agent",
    next_action: "Track monetization progress and close outcome.",
    due_minutes: 1440,
  },
};

function toIso(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function minutesBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

function buildDueBy(baseIso, dueMinutes) {
  const base = new Date(baseIso);
  base.setMinutes(base.getMinutes() + dueMinutes);
  return base.toISOString();
}

function buildPendingApprovalTasks(pendingTickets, nowIso) {
  return pendingTickets.map((ticket) => {
    const dueBy = toIso(ticket.ticket.required_by || ticket.created_at);
    const overdue = Date.parse(nowIso) > Date.parse(dueBy);
    const ageMinutes = minutesBetween(ticket.created_at, nowIso);
    return {
      source: "approval_queue",
      owner: "CEO Agent",
      opportunity_id: ticket.opportunity_id,
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      next_action: "Review and decide approval ticket.",
      due_by: dueBy,
      overdue,
      age_minutes: ageMinutes,
      updated_at: ticket.created_at,
    };
  });
}

function buildWorkflowTasks(workflowState, nowIso) {
  const tasks = [];
  for (const record of Object.values(workflowState.opportunities)) {
    const rule = WORKFLOW_TASK_RULES[record.current_status];
    if (!rule) {
      continue;
    }
    const dueBy = buildDueBy(record.last_updated_at, rule.due_minutes);
    const overdue = Date.parse(nowIso) > Date.parse(dueBy);
    tasks.push({
      source: "workflow_state",
      owner: rule.owner,
      opportunity_id: record.opportunity_id,
      ticket_id: record.approval_ticket_id || null,
      status: record.current_status,
      next_action: rule.next_action,
      due_by: dueBy,
      overdue,
      age_minutes: minutesBetween(record.last_updated_at, nowIso),
      updated_at: record.last_updated_at,
    });
  }
  return tasks;
}

function sortAwaitingTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.overdue !== b.overdue) {
      return a.overdue ? -1 : 1;
    }
    return Date.parse(a.due_by) - Date.parse(b.due_by);
  });
}

function parseArgs(argv) {
  const args = {
    queuePath: null,
    workflowStatePath: null,
    now: new Date().toISOString(),
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    pendingLimit: 5,
    staleLimit: 5,
    taskLimit: 20,
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
    } else if (token === "--task-limit") {
      args.taskLimit = Number(argv[i + 1]);
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
    ["--task-limit", args.taskLimit],
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
  const pendingTasks = buildPendingApprovalTasks(getPendingTickets(queue), nowIso);

  let workflow = null;
  let workflowTasks = [];
  if (args.workflowStatePath) {
    const workflowPath = path.resolve(args.workflowStatePath);
    const workflowState = loadWorkflowState(workflowPath);
    const workflowHealth = computeWorkflowHealth(workflowState, nowIso, args.workflowStaleMinutes);
    workflowTasks = buildWorkflowTasks(workflowState, nowIso);
    workflow = {
      state_path: workflowPath,
      health: workflowHealth,
      stale_opportunities: workflowHealth.stale_opportunities.slice(0, args.staleLimit),
    };
  }

  const awaitingTasks = sortAwaitingTasks([...pendingTasks, ...workflowTasks]).slice(0, args.taskLimit);
  const overdueCount = awaitingTasks.filter((task) => task.overdue).length;

  return {
    schema_version: "v1",
    generated_at: nowIso,
    queue: {
      path: queuePath,
      health: queueHealth,
      pending_tickets: pending,
    },
    workflow,
    awaiting_tasks: {
      total_count: pendingTasks.length + workflowTasks.length,
      returned_count: awaitingTasks.length,
      overdue_count: overdueCount,
      tasks: awaitingTasks,
    },
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
  buildPendingApprovalTasks,
  buildWorkflowTasks,
  sortAwaitingTasks,
  main,
};
