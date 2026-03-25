"use strict";

const fs = require("node:fs");
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

function minutesToDue(nowIso, dueByIso) {
  const now = Date.parse(nowIso);
  const dueBy = Date.parse(dueByIso);
  if (Number.isNaN(now) || Number.isNaN(dueBy)) {
    return null;
  }
  return Math.round((dueBy - now) / 60000);
}

function isDueSoon(nowIso, dueByIso, dueSoonMinutes) {
  const now = Date.parse(nowIso);
  const dueBy = Date.parse(dueByIso);
  if (Number.isNaN(now) || Number.isNaN(dueBy)) {
    return false;
  }
  const deltaMinutes = Math.round((dueBy - now) / 60000);
  return deltaMinutes >= 0 && deltaMinutes <= dueSoonMinutes;
}

function deriveUrgency(overdue, dueSoon) {
  if (overdue) {
    return "overdue";
  }
  if (dueSoon) {
    return "due_soon";
  }
  return "normal";
}

function getLatestRunArtifactForOpportunity(baseDir, opportunityId) {
  const runsDir = path.join(baseDir, "runs");
  if (!fs.existsSync(runsDir)) {
    return null;
  }
  const files = fs
    .readdirSync(runsDir)
    .filter((entry) => entry.endsWith(".artifact.json"))
    .map((entry) => path.join(runsDir, entry));
  if (files.length === 0) {
    return null;
  }

  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const filePath of files) {
    try {
      const artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (artifact.opportunity_id === opportunityId && artifact.output && artifact.output.handoff_packet) {
        return artifact;
      }
    } catch {
      // Ignore malformed artifacts and continue scanning.
    }
  }
  return null;
}

function buildPendingApprovalTasks(pendingTickets, nowIso, dueSoonMinutes = 30) {
  return pendingTickets.map((ticket) => {
    const dueBy = toIso(ticket.ticket.required_by || ticket.created_at);
    const overdue = Date.parse(nowIso) > Date.parse(dueBy);
    const dueSoon = !overdue && isDueSoon(nowIso, dueBy, dueSoonMinutes);
    const minutesToDueValue = minutesToDue(nowIso, dueBy);
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
      due_soon: dueSoon,
      urgency: deriveUrgency(overdue, dueSoon),
      minutes_to_due: minutesToDueValue,
      age_minutes: ageMinutes,
      updated_at: ticket.created_at,
    };
  });
}

function buildWorkflowTasks(workflowState, nowIso, baseDir = null, dueSoonMinutes = 30) {
  const tasks = [];
  for (const record of Object.values(workflowState.opportunities)) {
    const rule = WORKFLOW_TASK_RULES[record.current_status];
    if (!rule) {
      continue;
    }
    let nextAction = rule.next_action;
    let dueBy = buildDueBy(record.last_updated_at, rule.due_minutes);
    if (baseDir) {
      const latestArtifact = getLatestRunArtifactForOpportunity(baseDir, record.opportunity_id);
      if (latestArtifact && latestArtifact.output && latestArtifact.output.handoff_packet) {
        const handoff = latestArtifact.output.handoff_packet;
        if (typeof handoff.next_action === "string" && handoff.next_action) {
          nextAction = handoff.next_action;
        }
        if (typeof handoff.due_by === "string" && !Number.isNaN(Date.parse(handoff.due_by))) {
          dueBy = new Date(handoff.due_by).toISOString();
        }
      }
    }
    const overdue = Date.parse(nowIso) > Date.parse(dueBy);
    const dueSoon = !overdue && isDueSoon(nowIso, dueBy, dueSoonMinutes);
    const minutesToDueValue = minutesToDue(nowIso, dueBy);
    tasks.push({
      source: "workflow_state",
      owner: rule.owner,
      opportunity_id: record.opportunity_id,
      ticket_id: record.approval_ticket_id || null,
      status: record.current_status,
      next_action: nextAction,
      due_by: dueBy,
      overdue,
      due_soon: dueSoon,
      urgency: deriveUrgency(overdue, dueSoon),
      minutes_to_due: minutesToDueValue,
      age_minutes: minutesBetween(record.last_updated_at, nowIso),
      updated_at: record.last_updated_at,
    });
  }
  return tasks;
}

function sortAwaitingTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const rank = {
      overdue: 0,
      due_soon: 1,
      normal: 2,
    };
    const aRank = rank[a.urgency] ?? 3;
    const bRank = rank[b.urgency] ?? 3;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    if (a.minutes_to_due != null && b.minutes_to_due != null && a.minutes_to_due !== b.minutes_to_due) {
      return a.minutes_to_due - b.minutes_to_due;
    }
    return Date.parse(a.due_by) - Date.parse(b.due_by);
  });
}

function parseArgs(argv) {
  const args = {
    queuePath: null,
    workflowStatePath: null,
    baseDir: path.join(__dirname, "output"),
    now: new Date().toISOString(),
    slaMinutes: 120,
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
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
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
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
    } else if (token === "--due-soon-minutes") {
      args.dueSoonMinutes = Number(argv[i + 1]);
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
    ["--due-soon-minutes", args.dueSoonMinutes],
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
  const baseDir = path.resolve(args.baseDir);
  const queuePath = path.resolve(args.queuePath);
  const queue = loadQueue(queuePath);
  const queueHealth = computeHealth(queue, nowIso, args.slaMinutes);
  const pending = getPendingTickets(queue).slice(0, args.pendingLimit);
  const pendingTasks = buildPendingApprovalTasks(getPendingTickets(queue), nowIso, args.dueSoonMinutes);

  let workflow = null;
  let workflowTasks = [];
  if (args.workflowStatePath) {
    const workflowPath = path.resolve(args.workflowStatePath);
    const workflowState = loadWorkflowState(workflowPath);
    const workflowHealth = computeWorkflowHealth(workflowState, nowIso, args.workflowStaleMinutes);
    workflowTasks = buildWorkflowTasks(workflowState, nowIso, baseDir, args.dueSoonMinutes);
    workflow = {
      state_path: workflowPath,
      health: workflowHealth,
      stale_opportunities: workflowHealth.stale_opportunities.slice(0, args.staleLimit),
    };
  }

  const awaitingTasks = sortAwaitingTasks([...pendingTasks, ...workflowTasks]).slice(0, args.taskLimit);
  const overdueCount = awaitingTasks.filter((task) => task.overdue).length;
  const dueSoonCount = awaitingTasks.filter((task) => task.due_soon).length;
  const urgencyCounts = {
    overdue: awaitingTasks.filter((task) => task.urgency === "overdue").length,
    due_soon: awaitingTasks.filter((task) => task.urgency === "due_soon").length,
    normal: awaitingTasks.filter((task) => task.urgency === "normal").length,
  };

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
      due_soon_count: dueSoonCount,
      urgency_counts: urgencyCounts,
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
