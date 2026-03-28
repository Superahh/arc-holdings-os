"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const { buildRunArtifact, writeRunArtifact } = require("../output");
const { createEmptyQueue, enqueueApprovalTicket, saveQueue } = require("../approval_queue");
const { createEmptyWorkflowState, upsertFromPipeline, saveWorkflowState } = require("../workflow_state");
const { runBootstrapAction } = require("../capital_bootstrap_cli");
const { runMovementAction } = require("../capital_movement_cli");
const { createUiServer } = require("../../ui/server");

function seedFixtureEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-server-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const capitalStatePath = path.join(tempDir, "capital_state.json");
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const output = runOpportunityPipeline(fixture, "2026-03-25T19:00:00.000Z");

  const queue = createEmptyQueue("2026-03-25T19:00:00.000Z");
  enqueueApprovalTicket(
    queue,
    {
      ticket_id: "apr-ui-server-001",
      opportunity_id: output.opportunity_record.opportunity_id,
      action_type: "acquisition",
      requested_by: "CEO Agent",
      recommended_option: "request_more_info",
      decision_options: ["approve", "reject", "request_more_info"],
      max_exposure_usd: 460,
      reasoning_summary: "Review after remote verification evidence arrives.",
      risk_summary: "Carrier and IMEI checks remain open.",
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
  runBootstrapAction({
    statePath: capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:00:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: capitalStatePath,
    action: "deposit",
    amountUsd: 1000,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed capital for ui_server tests.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:01:00.000Z",
  });

  return {
    baseDir,
    queuePath,
    workflowStatePath,
    capitalStatePath,
  };
}

function request(server, route, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: route,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body,
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("createUiServer serves shell html and runtime snapshot endpoint", async () => {
  const env = seedFixtureEnvironment();
  const server = createUiServer({
    rootDir: path.join(__dirname, "..", "..", "ui"),
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const htmlResponse = await request(server, "/");
    assert.equal(htmlResponse.statusCode, 200);
    assert.match(htmlResponse.headers["content-type"], /text\/html/);
    assert.match(htmlResponse.body, /Desktop Command Floor/);

    const snapshotResponse = await request(server, "/api/snapshot?now=2026-03-25T19:10:00.000Z");
    assert.equal(snapshotResponse.statusCode, 200);
    assert.match(snapshotResponse.headers["content-type"], /application\/json/);

    const snapshot = JSON.parse(snapshotResponse.body);
    assert.equal(snapshot.schema_version, "v1");
    assert.equal(snapshot.kpis.approvals_waiting, 1);
    assert.equal(snapshot.office.agent_status_cards[0].agent, "CEO Agent");
    assert.equal(snapshot.office.presence[0].zone_label, "Decision Desk");
    assert.equal(snapshot.office.presence[0].visual_state, "needs_approval");
    assert.equal(snapshot.office.presence[0].lane_stage, "verification");
    assert.equal(snapshot.office.zone_anchors.length >= 4, true);
    assert.equal(snapshot.office.route_hints.length, 1);
    assert.equal(snapshot.office.movement_intents.length >= 1, true);
    assert.equal(snapshot.office.handoff_signals[0].from_agent, "Valuation Agent");
    assert.equal(snapshot.office.handoff_signals[0].to_zone_id, "verification-bay");
    assert.equal(snapshot.office.handoff_signals[0].handoff_state, "handoff_blocked");
    assert.equal(
      typeof snapshot.office.handoff_signals[0].current_owner_action === "string" &&
        snapshot.office.handoff_signals[0].current_owner_action.length > 0,
      true
    );
    assert.equal(
      typeof snapshot.office.handoff_signals[0].next_owner === "string" &&
        snapshot.office.handoff_signals[0].next_owner.length > 0,
      true
    );
    assert.equal(
      typeof snapshot.office.handoff_signals[0].handoff_clear_condition === "string" &&
        snapshot.office.handoff_signals[0].handoff_clear_condition.length > 0,
      true
    );
    assert.equal(snapshot.office.route_hints[0].to_zone_id, "verification-bay");
    assert.equal(snapshot.office.route_hints[0].source, "handoff_signal");
    assert.equal(snapshot.office.events[0].type, "approval_waiting");
    assert.equal(snapshot.office.events[0].source, "approval_queue");
    assert.equal(snapshot.office.events[0].lane_stage, "approval");
    assert.equal(snapshot.office.flow_events[0].action, "status_update");
    assert.match(snapshot.office.presence[1].bubble_text, /approval blocker: purchase recommendation is blocked/i);
    assert.ok(snapshot.office.office_view);
    assert.equal(Array.isArray(snapshot.office.office_view.zones), true);
    assert.equal(snapshot.office.office_view.zones.length, 4);
    assert.deepEqual(
      snapshot.office.office_view.zones.map((zone) => zone.id),
      ["executive-suite", "verification-bay", "routing-desk", "market-floor"]
    );
    assert.equal(
      typeof snapshot.office.office_view.company_board_summary.headline === "string" &&
        snapshot.office.office_view.company_board_summary.headline.length > 0,
      true
    );
    assert.equal(Array.isArray(snapshot.office.office_view.handoffs), true);
    assert.equal(
      typeof snapshot.office.office_view.handoffs[0].opportunity_id === "string" &&
        snapshot.office.office_view.handoffs[0].opportunity_id.length > 0,
      true
    );
    assert.equal(
      typeof snapshot.office.office_view.handoffs[0].to_agent === "string" &&
        snapshot.office.office_view.handoffs[0].to_agent.length > 0,
      true
    );
    assert.equal(
      snapshot.workflow.opportunities[0].operational_recommendation.recommendation_type,
      "buy_after_verification"
    );
    assert.equal(
      snapshot.workflow.opportunities[0].operational_recommendation.recommendation_state,
      "buy_after_verification"
    );
    assert.equal(
      snapshot.workflow.opportunities[0].operational_recommendation.primary_driver,
      "verification_pending"
    );
    assert.equal(
      snapshot.workflow.opportunities[0].operational_recommendation.blocking_type,
      "verification"
    );
    assert.equal(
      snapshot.workflow.opportunities[0].operational_recommendation.actionability,
      "gated"
    );
    const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
    const execution = snapshot.workflow.opportunities[0].operational_execution;
    const market = snapshot.workflow.opportunities[0].operational_market;
    const route = snapshot.workflow.opportunities[0].operational_route;
    assert.equal(typeof recommendation.recommendation_reason, "string");
    assert.equal(recommendation.recommendation_reason.trim().length > 0, true);
    assert.equal(typeof recommendation.next_action, "string");
    assert.equal(recommendation.next_action.trim().length > 0, true);
    assert.equal(typeof recommendation.change_condition, "string");
    assert.equal(recommendation.change_condition.trim().length > 0, true);
    assert.notEqual(
      recommendation.recommendation_reason.trim().toLowerCase(),
      recommendation.next_action.trim().toLowerCase()
    );
    assert.notEqual(
      recommendation.recommendation_reason.trim().toLowerCase(),
      recommendation.change_condition.trim().toLowerCase()
    );
    assert.notEqual(
      recommendation.next_action.trim().toLowerCase(),
      recommendation.change_condition.trim().toLowerCase()
    );
    assert.match(
      snapshot.workflow.opportunities[0].operational_recommendation.change_condition,
      /verification|approval|resolve|gate/i
    );
    assert.equal(
      typeof execution.execution_state === "string" && execution.execution_state.length > 0,
      true
    );
    assert.equal(
      typeof execution.execution_next_step === "string" && execution.execution_next_step.length > 0,
      true
    );
    assert.equal(
      typeof execution.execution_clear_condition === "string" &&
        execution.execution_clear_condition.length > 0,
      true
    );
    assert.equal(typeof market.market_state === "string" && market.market_state.length > 0, true);
    assert.equal(
      typeof market.market_next_step === "string" && market.market_next_step.length > 0,
      true
    );
    assert.equal(
      typeof market.market_clear_condition === "string" &&
        market.market_clear_condition.length > 0,
      true
    );
    assert.equal(
      typeof route.operator_route_state === "string" && route.operator_route_state.length > 0,
      true
    );
    assert.equal(
      typeof route.operator_route_next_step === "string" &&
        route.operator_route_next_step.length > 0,
      true
    );
    const capacity = snapshot.workflow.opportunities[0].operational_capacity;
    assert.equal(
      typeof capacity.capacity_state === "string" && capacity.capacity_state.length > 0,
      true
    );
    assert.equal(
      typeof capacity.capacity_reason === "string" && capacity.capacity_reason.length > 0,
      true
    );
    assert.equal(
      typeof capacity.capacity_next_step === "string" && capacity.capacity_next_step.length > 0,
      true
    );
    const sellthrough = snapshot.workflow.opportunities[0].operational_sellthrough;
    assert.equal(
      typeof sellthrough.sellthrough_state === "string" &&
        sellthrough.sellthrough_state.length > 0,
      true
    );
    assert.equal(
      typeof sellthrough.sellthrough_reason === "string" &&
        sellthrough.sellthrough_reason.length > 0,
      true
    );
    assert.equal(
      typeof sellthrough.sellthrough_next_step === "string" &&
        sellthrough.sellthrough_next_step.length > 0,
      true
    );
    const intakePriority = snapshot.workflow.opportunities[0].operational_intake_priority;
    assert.equal(
      typeof intakePriority.intake_priority_state === "string" &&
        intakePriority.intake_priority_state.length > 0,
      true
    );
    assert.equal(
      typeof intakePriority.intake_priority_reason === "string" &&
        intakePriority.intake_priority_reason.length > 0,
      true
    );
    assert.equal(
      intakePriority.intake_priority_rank === null ||
        Number.isInteger(intakePriority.intake_priority_rank),
      true
    );
    assert.equal(
      typeof intakePriority.intake_priority_next_step === "string" &&
        intakePriority.intake_priority_next_step.length > 0,
      true
    );
    const opportunityQuality = snapshot.workflow.opportunities[0].operational_opportunity_quality;
    assert.equal(
      typeof opportunityQuality.opportunity_quality_state === "string" &&
        opportunityQuality.opportunity_quality_state.length > 0,
      true
    );
    assert.equal(
      typeof opportunityQuality.opportunity_quality_reason === "string" &&
        opportunityQuality.opportunity_quality_reason.length > 0,
      true
    );
    assert.equal(
      typeof opportunityQuality.opportunity_quality_next_step === "string" &&
        opportunityQuality.opportunity_quality_next_step.length > 0,
      true
    );
    assert.equal(
      typeof opportunityQuality.opportunity_quality_upgrade_condition === "string" &&
        opportunityQuality.opportunity_quality_upgrade_condition.length > 0,
      true
    );
    const queueItem = snapshot.approval_queue.items[0];
    assert.equal(typeof queueItem.approve_consequence, "string");
    assert.equal(queueItem.approve_consequence.trim().length > 0, true);
    assert.equal(typeof queueItem.reject_consequence, "string");
    assert.equal(queueItem.reject_consequence.trim().length > 0, true);
    assert.equal(typeof queueItem.more_info_consequence, "string");
    assert.equal(queueItem.more_info_consequence.trim().length > 0, true);
    assert.equal(typeof queueItem.resume_owner, "string");
    assert.equal(queueItem.resume_owner.trim().length > 0, true);
    assert.equal(typeof queueItem.resume_condition, "string");
    assert.equal(queueItem.resume_condition.trim().length > 0, true);

    const decisionResponse = await request(server, "/api/approval-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket_id: "apr-ui-server-001",
        decision: "approve",
        actor: "ui_test_operator",
        note: "Submitting decision from ui_server integration test.",
      }),
    });
    assert.equal(decisionResponse.statusCode, 200);
    const decisionPayload = JSON.parse(decisionResponse.body);
    assert.equal(decisionPayload.ok, true);
    assert.equal(decisionPayload.result.decision, "approve");

    const postDecisionSnapshotResponse = await request(
      server,
      "/api/snapshot?now=2026-03-25T19:12:00.000Z"
    );
    assert.equal(postDecisionSnapshotResponse.statusCode, 200);
    const postDecisionSnapshot = JSON.parse(postDecisionSnapshotResponse.body);
    assert.equal(postDecisionSnapshot.kpis.approvals_waiting, 0);
    assert.equal(postDecisionSnapshot.approval_queue.items[0].status, "approve");
    assert.equal(postDecisionSnapshot.office.movement_intents.length >= 1, true);
    const resolvedEvent = postDecisionSnapshot.office.events.find(
      (event) =>
        event.type === "approval_resolved" && event.ticket_id === "apr-ui-server-001"
    );
    assert.ok(resolvedEvent);
    assert.equal(resolvedEvent.decision, "approve");
    assert.equal(resolvedEvent.severity, "info");

    const missingFieldResponse = await request(server, "/api/approval-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket_id: "apr-ui-server-001",
      }),
    });
    assert.equal(missingFieldResponse.statusCode, 400);
    const missingFieldPayload = JSON.parse(missingFieldResponse.body);
    assert.equal(missingFieldPayload.error, "invalid_request");
    assert.equal(missingFieldPayload.retryable, false);

    const invalidDecisionResponse = await request(server, "/api/approval-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket_id: "apr-ui-server-001",
        decision: "ship_now",
      }),
    });
    assert.equal(invalidDecisionResponse.statusCode, 422);
    const invalidDecisionPayload = JSON.parse(invalidDecisionResponse.body);
    assert.equal(invalidDecisionPayload.error, "invalid_decision");
    assert.equal(invalidDecisionPayload.retryable, false);

    const capitalWriteResponse = await request(server, "/api/capital-movement", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "deposit",
        amount_usd: 1000,
      }),
    });
    assert.equal(capitalWriteResponse.statusCode, 404);

    const roomTransitionWriteResponse = await request(server, "/api/room-transition", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: "rtr-test-001",
      }),
    });
    assert.equal(roomTransitionWriteResponse.statusCode, 404);

    const withdrawalRequestResponse = await request(server, "/api/capital-withdrawal/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount_usd: 120,
        reason: "Owner withdrawal request from UI server test.",
        actor: "owner_operator",
      }),
    });
    assert.equal(withdrawalRequestResponse.statusCode, 200);
    const withdrawalRequestPayload = JSON.parse(withdrawalRequestResponse.body);
    assert.equal(withdrawalRequestPayload.ok, true);
    assert.equal(withdrawalRequestPayload.result.request.action, "request_withdrawal");
    assert.equal(withdrawalRequestPayload.result.request.status, "requested");

    const withdrawalSnapshotResponse = await request(
      server,
      "/api/snapshot?now=2026-03-25T19:13:00.000Z"
    );
    assert.equal(withdrawalSnapshotResponse.statusCode, 200);
    const withdrawalSnapshot = JSON.parse(withdrawalSnapshotResponse.body);
    assert.equal(withdrawalSnapshot.capital_controls.account_snapshot.available_usd, 880);
    assert.equal(withdrawalSnapshot.capital_controls.account_snapshot.pending_withdrawal_usd, 120);
    assert.equal(withdrawalSnapshot.capital_controls.pending_withdrawal_requests.length, 1);

    const withdrawalApproveResponse = await request(server, "/api/capital-withdrawal/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: withdrawalSnapshot.capital_controls.pending_withdrawal_requests[0].request_id,
        actor: "owner_operator",
        confirm_irreversible: true,
      }),
    });
    assert.equal(withdrawalApproveResponse.statusCode, 200);
    const withdrawalApprovePayload = JSON.parse(withdrawalApproveResponse.body);
    assert.equal(withdrawalApprovePayload.ok, true);
    assert.equal(withdrawalApprovePayload.result.request.status, "executed");

    const secondWithdrawalRequest = await request(server, "/api/capital-withdrawal/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount_usd: 50,
        reason: "Cancel flow coverage.",
        actor: "owner_operator",
      }),
    });
    assert.equal(secondWithdrawalRequest.statusCode, 200);
    const secondRequestPayload = JSON.parse(secondWithdrawalRequest.body);
    const cancelResponse = await request(server, "/api/capital-withdrawal/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: secondRequestPayload.result.request.request_id,
        actor: "owner_operator",
        reason: "User canceled request.",
      }),
    });
    assert.equal(cancelResponse.statusCode, 200);
    const cancelPayload = JSON.parse(cancelResponse.body);
    assert.equal(cancelPayload.ok, true);
    assert.equal(cancelPayload.result.request.status, "cancelled");

    const thirdWithdrawalRequest = await request(server, "/api/capital-withdrawal/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount_usd: 40,
        reason: "Reject flow coverage.",
        actor: "owner_operator",
      }),
    });
    assert.equal(thirdWithdrawalRequest.statusCode, 200);
    const thirdRequestPayload = JSON.parse(thirdWithdrawalRequest.body);
    const rejectResponse = await request(server, "/api/capital-withdrawal/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: thirdRequestPayload.result.request.request_id,
        actor: "owner_operator",
        reason: "User rejected request.",
      }),
    });
    assert.equal(rejectResponse.statusCode, 200);
    const rejectPayload = JSON.parse(rejectResponse.body);
    assert.equal(rejectPayload.ok, true);
    assert.equal(rejectPayload.result.request.status, "rejected");

    const missingConfirmResponse = await request(server, "/api/capital-withdrawal/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: "cap-req-missing",
        actor: "owner_operator",
      }),
    });
    assert.equal(missingConfirmResponse.statusCode, 400);

    const finalSnapshotResponse = await request(server, "/api/snapshot?now=2026-03-25T19:14:00.000Z");
    assert.equal(finalSnapshotResponse.statusCode, 200);
    const finalSnapshot = JSON.parse(finalSnapshotResponse.body);
    assert.equal(finalSnapshot.capital_controls.account_snapshot.available_usd, 880);
    assert.equal(finalSnapshot.capital_controls.account_snapshot.pending_withdrawal_usd, 0);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
