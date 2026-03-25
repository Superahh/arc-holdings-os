"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runOpportunityPipeline } = require("./pipeline");
const { loadQueue, enqueueApprovalTicket, saveQueue, getPendingTickets } = require("./approval_queue");
const { buildRunArtifact, writeRunArtifact, writeCycleArtifact } = require("./output");
const { computeHealth } = require("./queue_health_cli");

function parseArgs(argv) {
  const args = {
    fixture: null,
    now: new Date().toISOString(),
    baseDir: path.join(__dirname, "output"),
    queuePath: null,
    queueActor: "cycle_runner",
    slaMinutes: 120,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--fixture") {
      args.fixture = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--queue-actor") {
      args.queueActor = argv[i + 1];
      i += 1;
    } else if (token === "--sla-minutes") {
      args.slaMinutes = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.fixture) {
    throw new Error("Missing required argument: --fixture <path-to-json>");
  }
  if (!Number.isInteger(args.slaMinutes) || args.slaMinutes <= 0) {
    throw new Error("--sla-minutes must be a positive integer.");
  }
  return args;
}

function runCycleAction(args) {
  const fixturePath = path.resolve(args.fixture);
  const baseDir = path.resolve(args.baseDir);
  const nowIso = new Date(args.now).toISOString();
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  const output = runOpportunityPipeline(fixture, nowIso);
  const runArtifact = buildRunArtifact(fixture, output, nowIso);
  const runArtifactPath = writeRunArtifact(baseDir, runArtifact);

  let queueSummary = null;
  let queuePath = null;
  if (args.queuePath) {
    queuePath = path.resolve(args.queuePath);
    const queue = loadQueue(queuePath);
    let enqueuedTicketId = null;
    if (output.approval_ticket) {
      try {
        enqueueApprovalTicket(queue, output.approval_ticket, args.queueActor, nowIso);
        enqueuedTicketId = output.approval_ticket.ticket_id;
      } catch (err) {
        if (!String(err.message).includes("already exists")) {
          throw err;
        }
      }
    }
    saveQueue(queuePath, queue, nowIso);
    const pending = getPendingTickets(queue);
    const health = computeHealth(queue, nowIso, args.slaMinutes);
    queueSummary = {
      queue_path: queuePath,
      enqueued_ticket_id: enqueuedTicketId,
      pending_count: pending.length,
      health,
    };
  }

  const cycleArtifact = {
    schema_version: "v1",
    generated_at: nowIso,
    source_label: "company_cycle",
    fixture_path: fixturePath,
    run_artifact_path: runArtifactPath,
    opportunity_id: output.opportunity_record.opportunity_id,
    recommendation: output.opportunity_record.recommendation,
    approval_ticket_id: output.approval_ticket ? output.approval_ticket.ticket_id : null,
    handoff_target: output.handoff_packet.to_agent,
    queue_summary: queueSummary,
  };

  const cycleArtifactPath = writeCycleArtifact(baseDir, cycleArtifact);
  return {
    cycle_artifact_path: cycleArtifactPath,
    run_artifact_path: runArtifactPath,
    queue_summary: queueSummary,
    opportunity_id: output.opportunity_record.opportunity_id,
    recommendation: output.opportunity_record.recommendation,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runCycleAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runCycleAction,
  main,
};
