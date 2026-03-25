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
  saveQueue,
} = require("../approval_queue");
const { parseArgs, runListAction } = require("../queue_list_cli");

function buildQueueFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = true;

  const output = runOpportunityPipeline(input, "2026-03-25T19:20:00.000Z");
  const ticketA = output.approval_ticket;
  const ticketB = {
    ...ticketA,
    ticket_id: `${ticketA.ticket_id}-2`,
    opportunity_id: `${ticketA.opportunity_id}-2`,
  };

  const queue = createEmptyQueue("2026-03-25T19:20:00.000Z");
  enqueueApprovalTicket(queue, ticketA, "pipeline", "2026-03-25T19:21:00.000Z");
  decideApproval(
    queue,
    ticketA.ticket_id,
    "approve",
    "owner_operator",
    "Checks complete.",
    "2026-03-25T19:30:00.000Z"
  );
  enqueueApprovalTicket(queue, ticketB, "pipeline", "2026-03-25T19:35:00.000Z");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-queue-list-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:35:00.000Z");
  return { queuePath, ticketA, ticketB };
}

test("parseArgs enforces required values", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "x.json", "--mode", "bad"]),
    /Invalid --mode/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "x.json", "--mode", "ticket"]),
    /requires --ticket-id/
  );
  assert.throws(
    () => parseArgs(["--queue-path", "x.json", "--mode", "all", "--limit", "0"]),
    /positive integer/
  );
});

test("pending mode returns only pending tickets", () => {
  const { queuePath, ticketB } = buildQueueFixture();
  const result = runListAction({
    queuePath,
    mode: "pending",
    ticketId: null,
    limit: null,
  });

  assert.equal(result.total_count, 2);
  assert.equal(result.pending_count, 1);
  assert.equal(result.result.length, 1);
  assert.equal(result.result[0].ticket_id, ticketB.ticket_id);
});

test("all and history modes support limits", () => {
  const { queuePath } = buildQueueFixture();

  const allResult = runListAction({
    queuePath,
    mode: "all",
    ticketId: null,
    limit: 1,
  });
  assert.equal(allResult.result.length, 1);

  const historyResult = runListAction({
    queuePath,
    mode: "history",
    ticketId: null,
    limit: 2,
  });
  assert.equal(historyResult.result.length, 2);
});

test("ticket mode returns ticket detail and per-ticket history", () => {
  const { queuePath, ticketA } = buildQueueFixture();
  const result = runListAction({
    queuePath,
    mode: "ticket",
    ticketId: ticketA.ticket_id,
    limit: null,
  });

  assert.equal(result.result.ticket.ticket_id, ticketA.ticket_id);
  assert.ok(Array.isArray(result.result.history));
  assert.ok(result.result.history.length >= 2);
  assert.throws(
    () =>
      runListAction({
        queuePath,
        mode: "ticket",
        ticketId: "missing-ticket",
        limit: null,
      }),
    /not found/
  );
});
