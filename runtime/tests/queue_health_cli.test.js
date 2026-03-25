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
const { parseArgs, runHealthAction, computeHealth } = require("../queue_health_cli");

function buildQueueForHealth() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  input.device.carrier_status = "verified";
  input.device.imei_proof_verified = true;

  const output = runOpportunityPipeline(input, "2026-03-25T19:00:00.000Z");
  const baseTicket = output.approval_ticket;
  const ticket2 = {
    ...baseTicket,
    ticket_id: `${baseTicket.ticket_id}-2`,
    opportunity_id: `${baseTicket.opportunity_id}-2`,
  };
  const ticket3 = {
    ...baseTicket,
    ticket_id: `${baseTicket.ticket_id}-3`,
    opportunity_id: `${baseTicket.opportunity_id}-3`,
  };

  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  enqueueApprovalTicket(queue, baseTicket, "pipeline", "2026-03-25T19:00:00.000Z");
  decideApproval(
    queue,
    baseTicket.ticket_id,
    "approve",
    "owner_operator",
    "Approved quickly.",
    "2026-03-25T19:10:00.000Z"
  );
  enqueueApprovalTicket(queue, ticket2, "pipeline", "2026-03-25T19:05:00.000Z");
  enqueueApprovalTicket(queue, ticket3, "pipeline", "2026-03-25T18:00:00.000Z");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-health-"));
  const queuePath = path.join(tempDir, "approval_queue.json");
  saveQueue(queuePath, queue, "2026-03-25T19:10:00.000Z");
  return { tempDir, queuePath, queue };
}

test("parseArgs validates required queue path and sla", () => {
  assert.throws(() => parseArgs([]), /--queue-path/);
  assert.throws(
    () => parseArgs(["--queue-path", "q.json", "--sla-minutes", "0"]),
    /positive integer/
  );
});

test("computeHealth returns expected KPI shape", () => {
  const { queue } = buildQueueForHealth();
  const health = computeHealth(queue, "2026-03-25T19:40:00.000Z", 60);

  assert.equal(health.queue_totals.total_tickets, 3);
  assert.equal(health.queue_totals.pending, 2);
  assert.equal(health.queue_totals.approve, 1);
  assert.equal(health.kpis.avg_decision_turnaround_minutes, 10);
  assert.equal(health.kpis.max_pending_age_minutes, 100);
  assert.equal(health.kpis.pending_over_sla_count, 1);
  assert.equal(health.observations.queue_health, "at_risk");
});

test("runHealthAction writes health artifact", () => {
  const { tempDir, queuePath } = buildQueueForHealth();
  const result = runHealthAction({
    queuePath,
    baseDir: tempDir,
    now: "2026-03-25T19:40:00.000Z",
    slaMinutes: 60,
  });

  assert.equal(result.queue_health, "at_risk");
  assert.equal(result.pending_count, 2);
  assert.equal(result.pending_over_sla_count, 1);
  assert.ok(fs.existsSync(result.health_artifact_path), "Expected health artifact file.");

  const artifact = JSON.parse(fs.readFileSync(result.health_artifact_path, "utf8"));
  assert.equal(artifact.queue_totals.total_tickets, 3);
  assert.equal(artifact.kpis.pending_over_sla_count, 1);
});
