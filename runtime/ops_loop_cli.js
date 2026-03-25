"use strict";

const path = require("node:path");

const { runCycleAction } = require("./company_cycle_cli");
const { runReplayAction } = require("./queue_replay_cli");
const { runHealthAction } = require("./queue_health_cli");
const { runWorkflowHealthAction } = require("./workflow_health_cli");
const { runOpsReportAction } = require("./ops_report_cli");
const { writeLoopArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    fixture: null,
    queuePath: null,
    now: new Date().toISOString(),
    baseDir: path.join(__dirname, "output"),
    queueActor: "ops_loop_runner",
    workflowStatePath: null,
    workflowActor: "ops_loop_runner",
    workflowStaleMinutes: 240,
    dueSoonMinutes: 30,
    slaMinutes: 120,
    replayLimit: 50,
    pendingLimit: 10,
    taskLimit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fixture") {
      args.fixture = argv[i + 1];
      i += 1;
    } else if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--queue-actor") {
      args.queueActor = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-state-path") {
      args.workflowStatePath = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-actor") {
      args.workflowActor = argv[i + 1];
      i += 1;
    } else if (token === "--workflow-stale-minutes") {
      args.workflowStaleMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--due-soon-minutes") {
      args.dueSoonMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--replay-limit") {
      args.replayLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--pending-limit") {
      args.pendingLimit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--task-limit") {
      args.taskLimit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.fixture) {
    throw new Error("Missing required argument: --fixture <path-to-json>");
  }
  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (!Number.isInteger(args.slaMinutes) || args.slaMinutes <= 0) {
    throw new Error("--sla-minutes must be a positive integer.");
  }
  if (!Number.isInteger(args.replayLimit) || args.replayLimit <= 0) {
    throw new Error("--replay-limit must be a positive integer.");
  }
  if (!Number.isInteger(args.pendingLimit) || args.pendingLimit <= 0) {
    throw new Error("--pending-limit must be a positive integer.");
  }
  if (!Number.isInteger(args.taskLimit) || args.taskLimit <= 0) {
    throw new Error("--task-limit must be a positive integer.");
  }
  if (!Number.isInteger(args.workflowStaleMinutes) || args.workflowStaleMinutes <= 0) {
    throw new Error("--workflow-stale-minutes must be a positive integer.");
  }
  if (!Number.isInteger(args.dueSoonMinutes) || args.dueSoonMinutes <= 0) {
    throw new Error("--due-soon-minutes must be a positive integer.");
  }
  return args;
}

function runOpsLoopAction(args) {
  const nowIso = new Date(args.now).toISOString();
  const baseDir = path.resolve(args.baseDir);
  const fixturePath = path.resolve(args.fixture);
  const queuePath = path.resolve(args.queuePath);

  const cycle = runCycleAction({
    fixture: fixturePath,
    now: nowIso,
    baseDir,
    queuePath,
    queueActor: args.queueActor,
    workflowStatePath: args.workflowStatePath,
    workflowActor: args.workflowActor,
    slaMinutes: args.slaMinutes,
  });

  const replay = runReplayAction({
    queuePath,
    baseDir,
    ticketId: null,
    limit: args.replayLimit,
    now: nowIso,
  });

  const health = runHealthAction({
    queuePath,
    baseDir,
    now: nowIso,
    slaMinutes: args.slaMinutes,
  });

  const workflowHealth = args.workflowStatePath
    ? runWorkflowHealthAction({
        statePath: args.workflowStatePath,
        baseDir,
        now: nowIso,
        staleMinutes: args.workflowStaleMinutes,
      })
    : null;

  const report = runOpsReportAction({
    queuePath,
    baseDir,
    now: nowIso,
    pendingLimit: args.pendingLimit,
    taskLimit: args.taskLimit,
    slaMinutes: args.slaMinutes,
    dueSoonMinutes: args.dueSoonMinutes,
    workflowStatePath: args.workflowStatePath,
    workflowStaleMinutes: args.workflowStaleMinutes,
  });

  const loopArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: "ops_loop",
    fixture_path: fixturePath,
    queue_path: queuePath,
    outputs: {
      cycle_artifact_path: cycle.cycle_artifact_path,
      run_artifact_path: cycle.run_artifact_path,
      workflow_state_path: cycle.workflow_summary ? cycle.workflow_summary.workflow_state_path : null,
      timeline_artifact_path: replay.timeline_artifact_path,
      health_artifact_path: health.health_artifact_path,
      workflow_health_artifact_path: workflowHealth ? workflowHealth.health_artifact_path : null,
      report_json_path: report.report_json_path,
      report_markdown_path: report.report_markdown_path,
    },
    summary: {
      recommendation: cycle.recommendation,
      queue_health: health.queue_health,
      workflow_health: workflowHealth ? workflowHealth.workflow_health : null,
      pending_count: health.pending_count,
      pending_over_sla_count: health.pending_over_sla_count,
      awaiting_due_soon_count: report.awaiting_due_soon_count,
      awaiting_overdue_count: report.awaiting_overdue_count,
      stale_non_terminal_count: workflowHealth ? workflowHealth.stale_non_terminal_count : null,
    },
  };

  const loopArtifactPath = writeLoopArtifact(baseDir, loopArtifact);
  return {
    loop_artifact_path: loopArtifactPath,
    workflow_state_path: cycle.workflow_summary ? cycle.workflow_summary.workflow_state_path : null,
    recommendation: cycle.recommendation,
    queue_health: health.queue_health,
    workflow_health: workflowHealth ? workflowHealth.workflow_health : null,
    pending_count: health.pending_count,
    awaiting_due_soon_count: report.awaiting_due_soon_count,
    awaiting_overdue_count: report.awaiting_overdue_count,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runOpsLoopAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runOpsLoopAction,
  main,
};
