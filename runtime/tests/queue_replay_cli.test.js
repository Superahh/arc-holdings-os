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
const { parseArgs, runReplayAction } = require("../queue_replay_cli");

function buildQueueForReplay() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  input.device.carrier_status = "verified";

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
    "All checks complete.",
    "2026-03-25T19:30:00.000Z"
  );
  enqueueApprovalTicket(queue, ticketB, "pipeline", "2026-03-25T19:35:00.000Z");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-replay-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:35:00.000Z");
  return { tempDir, queuePath, ticketA, ticketB };
}

test("parseArgs validates required args and limit", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "x.json", "--limit", "0"]),
    /positive integer/
  );
});

test("runReplayAction writes timeline artifact with all events", () => {
  const { tempDir, queuePath } = buildQueueForReplay();
  const result = runReplayAction({
    queuePath,
    baseDir: tempDir,
    ticketId: null,
    limit: null,
    now: "2026-03-25T19:40:00.000Z",
  });

  assert.ok(fs.existsSync(result.timeline_artifact_path), "Expected timeline artifact file.");
  assert.equal(result.event_count, 3);

  const artifact = JSON.parse(fs.readFileSync(result.timeline_artifact_path, "utf8"));
  assert.equal(artifact.totals.audit_events_total, 3);
  assert.equal(artifact.totals.emitted_events_total, 3);
  assert.equal(artifact.events[0].action, "enqueue");
});

test("ticket filter and limit work as expected", () => {
  const { tempDir, queuePath, ticketA } = buildQueueForReplay();
  const filtered = runReplayAction({
    queuePath,
    baseDir: tempDir,
    ticketId: ticketA.ticket_id,
    limit: null,
    now: "2026-03-25T19:41:00.000Z",
  });
  const filteredArtifact = JSON.parse(fs.readFileSync(filtered.timeline_artifact_path, "utf8"));
  assert.equal(filteredArtifact.events.length, 2);
  assert.ok(filteredArtifact.events.every((event) => event.ticket_id === ticketA.ticket_id));

  const limited = runReplayAction({
    queuePath,
    baseDir: tempDir,
    ticketId: null,
    limit: 1,
    now: "2026-03-25T19:42:00.000Z",
  });
  const limitedArtifact = JSON.parse(fs.readFileSync(limited.timeline_artifact_path, "utf8"));
  assert.equal(limitedArtifact.events.length, 1);
});
