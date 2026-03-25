"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadQueue, getPendingTickets } = require("./approval_queue");
const { computeHealth } = require("./queue_health_cli");
const { loadWorkflowState } = require("./workflow_state");
const { computeWorkflowHealth } = require("./workflow_health_cli");
const { writeReportArtifacts } = require("./output");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    baseDir: path.join(__dirname, "output"),
    now: new Date().toISOString(),
    pendingLimit: 10,
    slaMinutes: 120,
    workflowStatePath: null,
    workflowStaleMinutes: 240,
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
    } else if (token === "--pending-limit") {
      args.pendingLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-stale-minutes") {
      args.workflowStaleMinutes = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (!Number.isInteger(args.pendingLimit) || args.pendingLimit <= 0) {
    throw new Error("--pending-limit must be a positive integer.");
  }
  if (!Number.isInteger(args.slaMinutes) || args.slaMinutes <= 0) {
    throw new Error("--sla-minutes must be a positive integer.");
  }
  if (!Number.isInteger(args.workflowStaleMinutes) || args.workflowStaleMinutes <= 0) {
    throw new Error("--workflow-stale-minutes must be a positive integer.");
  }
  return args;
}

function getLatestFilePath(directoryPath, suffix, includeFilter = null) {
  if (!fs.existsSync(directoryPath)) {
    return null;
  }
  const entries = fs
    .readdirSync(directoryPath)
    .filter((entry) => entry.endsWith(suffix))
    .filter((entry) => (includeFilter ? includeFilter(entry) : true))
    .map((entry) => path.join(directoryPath, entry));

  if (entries.length === 0) {
    return null;
  }
  entries.sort((a, b) => {
    const aMtime = fs.statSync(a).mtimeMs;
    const bMtime = fs.statSync(b).mtimeMs;
    return bMtime - aMtime;
  });
  return entries[0];
}

function collectLatestArtifacts(baseDir) {
  const healthDir = path.join(baseDir, "health");
  const queueHealth = getLatestFilePath(
    healthDir,
    ".health.json",
    (entry) => !entry.includes("_workflow--")
  );
  const workflowHealth = getLatestFilePath(
    healthDir,
    ".health.json",
    (entry) => entry.includes("_workflow--")
  );
  return {
    run: getLatestFilePath(path.join(baseDir, "runs"), ".artifact.json"),
    decision: getLatestFilePath(path.join(baseDir, "decisions"), ".decision.json"),
    timeline: getLatestFilePath(path.join(baseDir, "timelines"), ".timeline.json"),
    health: queueHealth,
    queue_health: queueHealth,
    workflow_health: workflowHealth,
    cycle: getLatestFilePath(path.join(baseDir, "cycles"), ".cycle.json"),
  };
}

function buildMarkdownReport(report) {
  const pendingRows =
    report.pending_tickets.length === 0
      ? "- none"
      : report.pending_tickets
          .map(
            (ticket) =>
              `- ${ticket.ticket_id} | ${ticket.opportunity_id} | created ${ticket.created_at} | status ${ticket.status}`
          )
          .join("\n");

  const workflowLines =
    report.workflow_health == null
      ? ["- Workflow health: not provided (no workflow state path)."]
      : [
          `- Workflow health: ${report.workflow_health.observations.workflow_health}`,
          `- Note: ${report.workflow_health.observations.note}`,
          `- Non-terminal opportunities: ${report.workflow_health.kpis.non_terminal_count}`,
          `- Stale non-terminal opportunities: ${report.workflow_health.kpis.stale_non_terminal_count}`,
        ];

  return [
    "# ARC Runtime Ops Report",
    "",
    `Generated: ${report.generated_at}`,
    `Queue path: ${report.queue_path}`,
    "",
    "## Health",
    `- Queue health: ${report.health.observations.queue_health}`,
    `- Note: ${report.health.observations.note}`,
    `- Pending: ${report.health.queue_totals.pending}`,
    `- Pending over SLA: ${report.health.kpis.pending_over_sla_count}`,
    `- Avg turnaround (min): ${report.health.kpis.avg_decision_turnaround_minutes}`,
    "",
    "## Workflow health",
    ...workflowLines,
    "",
    "## Pending tickets",
    pendingRows,
    "",
    "## Latest artifacts",
    `- Run: ${report.latest_artifacts.run || "none"}`,
    `- Decision: ${report.latest_artifacts.decision || "none"}`,
    `- Timeline: ${report.latest_artifacts.timeline || "none"}`,
    `- Queue health: ${report.latest_artifacts.queue_health || report.latest_artifacts.health || "none"}`,
    `- Workflow health: ${report.latest_artifacts.workflow_health || "none"}`,
    `- Cycle: ${report.latest_artifacts.cycle || "none"}`,
  ].join("\n");
}

function runOpsReportAction(args) {
  const queuePath = path.resolve(args.queuePath);
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const queue = loadQueue(queuePath);
  const health = computeHealth(queue, nowIso, args.slaMinutes);
  const pending = getPendingTickets(queue).slice(0, args.pendingLimit);
  const latestArtifacts = collectLatestArtifacts(baseDir);
  let workflowHealth = null;
  let workflowStatePath = null;
  if (args.workflowStatePath) {
    workflowStatePath = path.resolve(args.workflowStatePath);
    const workflowState = loadWorkflowState(workflowStatePath);
    workflowHealth = computeWorkflowHealth(workflowState, nowIso, args.workflowStaleMinutes);
  }

  const reportArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: "ops_report",
    queue_path: queuePath,
    workflow_state_path: workflowStatePath,
    pending_tickets: pending,
    health,
    workflow_health: workflowHealth,
    latest_artifacts: latestArtifacts,
  };

  const markdown = buildMarkdownReport(reportArtifact);
  const reportPaths = writeReportArtifacts(baseDir, reportArtifact, markdown);
  return {
    report_json_path: reportPaths.jsonPath,
    report_markdown_path: reportPaths.markdownPath,
    queue_health: health.observations.queue_health,
    workflow_health: workflowHealth ? workflowHealth.observations.workflow_health : null,
    pending_count: health.queue_totals.pending,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runOpsReportAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runOpsReportAction,
  buildMarkdownReport,
  collectLatestArtifacts,
  main,
};
