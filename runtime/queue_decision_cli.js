"use strict";

const path = require("node:path");

const { loadQueue, saveQueue, decideApproval } = require("./approval_queue");
const { buildDecisionOfficeState } = require("./decision_state");
const { writeDecisionArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    ticketId: null,
    decision: null,
    actor: "owner_operator",
    note: "",
    now: new Date().toISOString(),
    baseDir: path.join(__dirname, "output"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--ticket-id") {
      args.ticketId = argv[i + 1];
      i += 1;
    } else if (token === "--decision") {
      args.decision = argv[i + 1];
      i += 1;
    } else if (token === "--actor") {
      args.actor = argv[i + 1];
      i += 1;
    } else if (token === "--note") {
      args.note = argv[i + 1];
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (!args.ticketId) {
    throw new Error("Missing required argument: --ticket-id <approval-ticket-id>");
  }
  if (!args.decision) {
    throw new Error("Missing required argument: --decision <approve|reject|request_more_info>");
  }
  return args;
}

function runDecisionAction(args) {
  const queuePath = path.resolve(args.queuePath);
  const baseOutputDir = path.resolve(args.baseDir);
  const queue = loadQueue(queuePath);

  decideApproval(queue, args.ticketId, args.decision, args.actor, args.note, args.now);
  const savedQueuePath = saveQueue(queuePath, queue, args.now);

  const decidedItem = queue.items.find((item) => item.ticket_id === args.ticketId);
  const officeState = buildDecisionOfficeState(queue, decidedItem, new Date(args.now).toISOString());

  const decisionArtifact = {
    schema_version: "v1",
    ticket_id: decidedItem.ticket_id,
    opportunity_id: decidedItem.opportunity_id,
    decision: decidedItem.status,
    decided_by: decidedItem.decided_by,
    decided_at: decidedItem.decided_at,
    decision_note: decidedItem.decision_note,
    queue_counts: officeState.queue_counts,
    office_state: {
      agent_status_cards: officeState.agent_status_cards,
      company_board_snapshot: officeState.company_board_snapshot,
    },
  };
  const artifactPath = writeDecisionArtifact(baseOutputDir, decisionArtifact);

  return {
    queue_path: savedQueuePath,
    decision_artifact_path: artifactPath,
    ticket_id: decidedItem.ticket_id,
    decision: decidedItem.status,
    pending_count: officeState.queue_counts.pending,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runDecisionAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runDecisionAction,
  main,
};
