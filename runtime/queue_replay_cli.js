"use strict";

const path = require("node:path");

const { loadQueue, getPendingTickets } = require("./approval_queue");
const { writeTimelineArtifact } = require("./output");

function parseArgs(argv) {
  const args = {
    queuePath: null,
    baseDir: path.join(__dirname, "output"),
    ticketId: null,
    limit: null,
    now: new Date().toISOString(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--base-dir") {
      args.baseDir = argv[i + 1];
      i += 1;
    } else if (token === "--ticket-id") {
      args.ticketId = argv[i + 1];
      i += 1;
    } else if (token === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--now") {
      args.now = argv[i + 1];
      i += 1;
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }
  return args;
}

function enrichEvents(queue, ticketIdFilter = null) {
  const ticketIndex = new Map(queue.items.map((item) => [item.ticket_id, item]));
  const filtered = queue.audit_log.filter((event) =>
    ticketIdFilter ? event.ticket_id === ticketIdFilter : true
  );
  const sorted = [...filtered].sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    if (a.event_id < b.event_id) return -1;
    if (a.event_id > b.event_id) return 1;
    return 0;
  });

  return sorted.map((event, index) => {
    const ticket = ticketIndex.get(event.ticket_id) || null;
    return {
      index: index + 1,
      timestamp: event.timestamp,
      event_id: event.event_id,
      ticket_id: event.ticket_id,
      opportunity_id: ticket ? ticket.opportunity_id : null,
      current_status: ticket ? ticket.status : null,
      action: event.action,
      actor: event.actor,
      note: event.note,
    };
  });
}

function applyLimitToTail(events, limit) {
  if (limit == null || events.length <= limit) {
    return events;
  }
  return events.slice(events.length - limit);
}

function runReplayAction(args) {
  const queuePath = path.resolve(args.queuePath);
  const baseDir = path.resolve(args.baseDir);
  const queue = loadQueue(queuePath);
  const pendingCount = getPendingTickets(queue).length;

  const events = enrichEvents(queue, args.ticketId);
  const timelineEvents = applyLimitToTail(events, args.limit);

  const timelineArtifact = {
    schema_version: "v1",
    generated_at: new Date(args.now).toISOString(),
    source_label: path.basename(queuePath, path.extname(queuePath)),
    source_queue_path: queuePath,
    filter: {
      ticket_id: args.ticketId,
      limit: args.limit,
    },
    totals: {
      tickets_total: queue.items.length,
      pending_total: pendingCount,
      audit_events_total: queue.audit_log.length,
      filtered_events_total: events.length,
      emitted_events_total: timelineEvents.length,
    },
    events: timelineEvents,
  };

  const timelinePath = writeTimelineArtifact(baseDir, timelineArtifact);
  return {
    queue_path: queuePath,
    timeline_artifact_path: timelinePath,
    event_count: timelineEvents.length,
    pending_count: pendingCount,
    filter: timelineArtifact.filter,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runReplayAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runReplayAction,
  main,
};
