"use strict";

const path = require("node:path");

const { loadQueue } = require("./approval_queue");
const { writeHealthArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    baseDir: path.join(__dirname, "output"),
    now: new Date().toISOString(),
    slaMinutes: 120,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
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
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (!Number.isInteger(args.slaMinutes) || args.slaMinutes <= 0) {
    throw new Error("--sla-minutes must be a positive integer.");
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

function computeHealth(queue, nowIso, slaMinutes) {
  const totals = {
    total_tickets: queue.items.length,
    pending: 0,
    approve: 0,
    reject: 0,
    request_more_info: 0,
  };

  const pendingAges = [];
  const decidedTurnaround = [];

  for (const item of queue.items) {
    if (totals[item.status] !== undefined) {
      totals[item.status] += 1;
    }

    if (item.status === "pending") {
      const age = minutesBetween(item.created_at, nowIso);
      if (age != null) {
        pendingAges.push(age);
      }
    } else if (item.decided_at) {
      const turnaround = minutesBetween(item.created_at, item.decided_at);
      if (turnaround != null) {
        decidedTurnaround.push(turnaround);
      }
    }
  }

  const pendingOverSla = pendingAges.filter((age) => age > slaMinutes).length;
  const decidedCount = totals.approve + totals.reject + totals.request_more_info;
  const decisionRate = totals.total_tickets === 0 ? 0 : decidedCount / totals.total_tickets;

  return {
    queue_totals: totals,
    kpis: {
      decision_rate: Math.round(decisionRate * 10000) / 10000,
      avg_decision_turnaround_minutes: safeAverage(decidedTurnaround),
      max_pending_age_minutes: pendingAges.length ? Math.max(...pendingAges) : null,
      pending_over_sla_count: pendingOverSla,
      sla_minutes: slaMinutes,
    },
    observations: {
      queue_health:
        pendingOverSla > 0
          ? "at_risk"
          : totals.pending > 0
          ? "watch"
          : "healthy",
      note:
        pendingOverSla > 0
          ? "Pending tickets exceed SLA."
          : totals.pending > 0
          ? "Pending tickets within SLA."
          : "No pending approvals.",
    },
  };
}

function runHealthAction(args) {
  const queuePath = path.resolve(args.queuePath);
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const queue = loadQueue(queuePath);

  const health = computeHealth(queue, nowIso, args.slaMinutes);
  const healthArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: path.basename(queuePath, path.extname(queuePath)),
    source_queue_path: queuePath,
    ...health,
  };

  const healthPath = writeHealthArtifact(baseDir, healthArtifact);
  return {
    queue_path: queuePath,
    health_artifact_path: healthPath,
    queue_health: health.observations.queue_health,
    pending_count: health.queue_totals.pending,
    pending_over_sla_count: health.kpis.pending_over_sla_count,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runHealthAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  computeHealth,
  runHealthAction,
  main,
};
