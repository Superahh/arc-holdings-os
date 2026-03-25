"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DECISIONS = new Set(["approve", "reject", "request_more_info"]);

function nowIso(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function createEmptyQueue(timestamp = new Date().toISOString()) {
  return {
    schema_version: "v1",
    updated_at: nowIso(timestamp),
    items: [],
    audit_log: [],
  };
}

function ensureQueueShape(queue) {
  if (!queue || typeof queue !== "object") {
    throw new Error("Queue state must be an object.");
  }
  if (queue.schema_version !== "v1") {
    throw new Error("Unsupported queue schema_version.");
  }
  if (!Array.isArray(queue.items) || !Array.isArray(queue.audit_log)) {
    throw new Error("Queue state must include items[] and audit_log[].");
  }
}

function loadQueue(queuePath) {
  const absolutePath = path.resolve(queuePath);
  if (!fs.existsSync(absolutePath)) {
    return createEmptyQueue();
  }
  const queue = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  ensureQueueShape(queue);
  return queue;
}

function saveQueue(queuePath, queue, timestamp = new Date().toISOString()) {
  ensureQueueShape(queue);
  queue.updated_at = nowIso(timestamp);
  const absolutePath = path.resolve(queuePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  return absolutePath;
}

function buildEventId(queue, action) {
  return `evt-${action}-${String(queue.audit_log.length + 1).padStart(6, "0")}`;
}

function enqueueApprovalTicket(queue, ticket, actor = "system", timestamp = new Date().toISOString()) {
  ensureQueueShape(queue);
  if (!ticket || typeof ticket !== "object" || typeof ticket.ticket_id !== "string" || !ticket.ticket_id) {
    throw new Error("A valid ApprovalTicket with ticket_id is required.");
  }

  const existing = queue.items.find((item) => item.ticket_id === ticket.ticket_id);
  if (existing) {
    throw new Error(`ApprovalTicket ${ticket.ticket_id} already exists in queue.`);
  }

  const createdAt = nowIso(timestamp);
  queue.items.push({
    ticket_id: ticket.ticket_id,
    opportunity_id: ticket.opportunity_id,
    ticket,
    status: "pending",
    created_at: createdAt,
    decided_at: null,
    decided_by: null,
    decision_note: null,
  });

  queue.audit_log.push({
    event_id: buildEventId(queue, "enqueue"),
    ticket_id: ticket.ticket_id,
    action: "enqueue",
    actor,
    timestamp: createdAt,
    note: "Ticket added to approval queue.",
  });

  queue.updated_at = createdAt;
  return queue;
}

function decideApproval(
  queue,
  ticketId,
  decision,
  actor = "human_reviewer",
  decisionNote = "",
  timestamp = new Date().toISOString()
) {
  ensureQueueShape(queue);
  if (!DECISIONS.has(decision)) {
    throw new Error("Decision must be one of: approve, reject, request_more_info.");
  }

  const item = queue.items.find((entry) => entry.ticket_id === ticketId);
  if (!item) {
    throw new Error(`ApprovalTicket ${ticketId} not found in queue.`);
  }
  if (item.status !== "pending") {
    throw new Error(`ApprovalTicket ${ticketId} is already decided (${item.status}).`);
  }

  const decidedAt = nowIso(timestamp);
  item.status = decision;
  item.decided_at = decidedAt;
  item.decided_by = actor;
  item.decision_note = typeof decisionNote === "string" ? decisionNote : "";

  queue.audit_log.push({
    event_id: buildEventId(queue, decision),
    ticket_id: ticketId,
    action: decision,
    actor,
    timestamp: decidedAt,
    note: item.decision_note,
  });

  queue.updated_at = decidedAt;
  return queue;
}

function getPendingTickets(queue) {
  ensureQueueShape(queue);
  return queue.items.filter((item) => item.status === "pending");
}

module.exports = {
  createEmptyQueue,
  loadQueue,
  saveQueue,
  enqueueApprovalTicket,
  decideApproval,
  getPendingTickets,
};
