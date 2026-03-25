"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { buildUiSnapshot } = require("../ui_snapshot");

function seedFixtureEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-snapshot-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  enqueueApprovalTicket(
    queue,
    {
      ticket_id: "apr-ui-001",
      opportunity_id: output.opportunity_record.opportunity_id,
      action_type: "acquisition",
      requested_by: "CEO Agent",
      recommended_option: "request_more_info",
      decision_options: ["approve", "reject", "request_more_info"],
      max_exposure_usd: 460,
      reasoning_summary: "Hold capital until verification clears.",
      risk_summary: "IMEI and carrier verification remain open.",
      required_by: "2026-03-25T21:00:00.000Z",
    },
    "pipeline_runner",
    "2026-03-25T19:02:00.000Z"
  );
  saveQueue(queuePath, queue, "2026-03-25T19:02:00.000Z");

  const workflowState = createEmptyWorkflowState("2026-03-25T19:00:00.000Z");
  upsertFromPipeline(workflowState, output, "pipeline_runner", "2026-03-25T19:00:00.000Z");
  saveWorkflowState(workflowStatePath, workflowState, "2026-03-25T19:00:00.000Z");

  writeRunArtifact(baseDir, buildRunArtifact(fixture, output, "2026-03-25T19:00:00.000Z"));

  return {
    baseDir,
    queuePath,
    workflowStatePath,
  };
}

test("buildUiSnapshot composes contract-driven shell data from runtime state", () => {
  const env = seedFixtureEnvironment();

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.schema_version, "v1");
  assert.equal(snapshot.kpis.approvals_waiting, 1);
  assert.equal(snapshot.office.agent_status_cards.length, 4);
  assert.equal(snapshot.office.presence.length, 4);
  assert.equal(snapshot.office.company_board_snapshot.approvals_waiting, 1);
  assert.equal(snapshot.capital_controls.status, "manual_only");
  assert.equal(snapshot.workflow.opportunities.length, 1);
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.opportunity_record.opportunity_id,
    "opp-2026-03-25-001"
  );
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.handoff_packet.next_action,
    "Request remote IMEI proof and verify carrier status."
  );
  assert.match(
    snapshot.office.company_board_snapshot.capital_note,
    /deposit, reserve, approval, and withdrawal/i
  );
  assert.equal(snapshot.office.presence[0].zone_label, "Executive Suite");
  assert.equal(snapshot.office.presence[0].motion_state, "awaiting_approval");
  assert.match(snapshot.office.presence[0].bubble_text, /approval queue is waiting on owner action/i);
});
