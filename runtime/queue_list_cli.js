"use strict";

const path = require("node:path");

const { loadQueue, getPendingTickets } = require("./approval_queue");

const MODES = new Set(["pending", "all", "history", "ticket"]);

function parseArgs(argv) {
  const args = {
    queuePath: null,
    mode: "pending",
    ticketId: null,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--queue-path") {
      args.queuePath = argv[i + 1];
      i += 1;
    } else if (token === "--mode") {
      args.mode = argv[i + 1];
      i += 1;
    } else if (token === "--ticket-id") {
      args.ticketId = argv[i + 1];
      i += 1;
    } else if (token === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.queuePath) {
    throw new Error("Missing required argument: --queue-path <path-to-queue-json>");
  }
  if (!MODES.has(args.mode)) {
    throw new Error("Invalid --mode. Use pending|all|history|ticket.");
  }
  if (args.mode === "ticket" && !args.ticketId) {
    throw new Error("Mode 'ticket' requires --ticket-id.");
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }
  return args;
}

function applyLimit(items, limit) {
  if (limit == null) {
    return items;
  }
  return items.slice(0, limit);
}

function runListAction(args) {
  const queuePath = path.resolve(args.queuePath);
  const queue = loadQueue(queuePath);
  const pending = getPendingTickets(queue);
  let result;

  if (args.mode === "pending") {
    result = applyLimit(pending, args.limit);
  } else if (args.mode === "all") {
    result = applyLimit(queue.items, args.limit);
  } else if (args.mode === "history") {
    const sortedHistory = [...queue.audit_log].sort((a, b) => {
      if (a.timestamp < b.timestamp) return 1;
      if (a.timestamp > b.timestamp) return -1;
      return 0;
    });
    result = applyLimit(sortedHistory, args.limit);
  } else {
    const ticket = queue.items.find((item) => item.ticket_id === args.ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${args.ticketId} not found.`);
    }
    const history = queue.audit_log.filter((event) => event.ticket_id === args.ticketId);
    result = {
      ticket,
      history,
    };
  }

  return {
    queue_path: queuePath,
    mode: args.mode,
    updated_at: queue.updated_at,
    total_count: queue.items.length,
    pending_count: pending.length,
    result,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runListAction(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runListAction,
  main,
};
