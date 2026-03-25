"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  createEmptyQueue,
  enqueueApprovalTicket,
  decideApproval,
  getPendingTickets,
  saveQueue,
  loadQueue,
} = require("../approval_queue");

function loadGoldenFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("enqueue adds pending ticket and audit event", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");
  assert.ok(output.approval_ticket, "Expected approval ticket.");

  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");

  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].status, "pending");
  assert.equal(queue.audit_log.length, 1);
  assert.equal(queue.audit_log[0].action, "enqueue");
  assert.equal(getPendingTickets(queue).length, 1);
});

test("duplicate enqueue is rejected", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");
  assert.throws(
    () => enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:22:00.000Z"),
    /already exists/
  );
});

test("decide approval updates state and audit trail", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");
  decideApproval(
    queue,
    output.approval_ticket.ticket_id,
    "approve",
    "owner_operator",
    "Remote verification completed.",
    "2026-03-25T19:30:00.000Z"
  );

  assert.equal(queue.items[0].status, "approve");
  assert.equal(queue.items[0].decided_by, "owner_operator");
  assert.equal(queue.items[0].decision_note, "Remote verification completed.");
  assert.equal(queue.audit_log.length, 2);
  assert.equal(queue.audit_log[1].action, "approve");
  assert.equal(getPendingTickets(queue).length, 0);
});

test("cannot decide missing or already-decided tickets", () => {
  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  assert.throws(
    () => decideApproval(queue, "missing-ticket", "approve", "owner", "", "2026-03-25T19:21:00.000Z"),
    /not found/
  );

  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");
  decideApproval(
    queue,
    output.approval_ticket.ticket_id,
    "reject",
    "owner_operator",
    "Risk too high.",
    "2026-03-25T19:22:00.000Z"
  );

  assert.throws(
    () =>
      decideApproval(
        queue,
        output.approval_ticket.ticket_id,
        "approve",
        "owner_operator",
        "Second decision attempt.",
        "2026-03-25T19:23:00.000Z"
      ),
    /already decided/
  );
});

test("queue persists and reloads from disk", () => {
  const input = loadGoldenFixture();
  input.device.carrier_status = "verified";
  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, output.approval_ticket, "pipeline", "2026-03-25T19:21:00.000Z");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-queue-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:21:00.000Z");
  assert.ok(fs.existsSync(queuePath), "Expected queue file to exist.");

  const loadedQueue = loadQueue(queuePath);
  assert.equal(loadedQueue.items.length, 1);
  assert.equal(loadedQueue.items[0].ticket_id, output.approval_ticket.ticket_id);
});
