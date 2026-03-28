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
const { runBootstrapAction } = require("../capital_bootstrap_cli");
const { runMovementAction } = require("../capital_movement_cli");
const { loadCapitalState, saveCapitalState, submitWithdrawalRequest } = require("../capital_state");
const { buildUiSnapshot } = require("../ui_snapshot");
const {
  validateOfficeZoneAnchor,
  validateOfficeHandoffSignal,
  validateOfficeRouteHint,
  validateOfficeEvent,
  validateOfficeMovementIntent,
  validateCapitalStrategyHistoryEntry,
  validateCapitalFitAnnotation,
} = require("../contracts");

const ALLOWED_RECOMMENDATION_TYPES = new Set([
  "approve_now",
  "buy_after_verification",
  "hold_for_info",
  "reject_now",
]);
const ALLOWED_HANDOFF_STATES = new Set([
  "handoff_ready",
  "handoff_blocked",
  "handoff_waiting",
  "handoff_return_required",
]);
const ALLOWED_EXECUTION_STATES = new Set([
  "execution_ready",
  "execution_waiting_intake",
  "execution_waiting_parts",
  "execution_blocked",
  "execution_not_applicable",
]);
const ALLOWED_MARKET_STATES = new Set([
  "market_ready",
  "market_waiting_pricing",
  "market_waiting_listing",
  "market_blocked",
  "market_not_applicable",
]);
const ALLOWED_ROUTE_STATES = new Set([
  "pursue_now",
  "pursue_after_verification",
  "prepare_execution",
  "prepare_market",
  "hold",
  "stop",
]);

function loadGoldenFixture() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "golden-scenario.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function seedFixtureEnvironment(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-ui-snapshot-"));
  const baseDir = path.join(tempDir, "output");
  const queuePath = path.join(tempDir, "approval_queue.json");
  const workflowStatePath = path.join(tempDir, "workflow_state.json");
  const now = options.now || "2026-03-25T19:00:00.000Z";
  const enqueueApproval = options.enqueueApproval !== false;
  const fixture = options.fixture || loadGoldenFixture();
  const output = runOpportunityPipeline(fixture, now);

  const queue = createEmptyQueue(now);
  if (enqueueApproval) {
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
  }
  saveQueue(queuePath, queue, "2026-03-25T19:02:00.000Z");

  const workflowState = createEmptyWorkflowState(now);
  upsertFromPipeline(workflowState, output, "pipeline_runner", now);
  saveWorkflowState(workflowStatePath, workflowState, now);

  writeRunArtifact(baseDir, buildRunArtifact(fixture, output, now));

  return {
    baseDir,
    queuePath,
    workflowStatePath,
    capitalStatePath: path.join(tempDir, "capital_state.json"),
  };
}

function mutateSeededRecommendationInputs(env, mutateFn) {
  const workflowState = JSON.parse(fs.readFileSync(env.workflowStatePath, "utf8"));
  const opportunityId = Object.keys(workflowState.opportunities || {})[0];
  assert.ok(opportunityId, "Expected seeded workflow state to include an opportunity.");
  const workflowRecord = workflowState.opportunities[opportunityId];

  const runsDir = path.join(env.baseDir, "runs");
  const artifactName = fs
    .readdirSync(runsDir)
    .filter((entry) => entry.endsWith(".artifact.json"))
    .sort()[0];
  assert.ok(artifactName, "Expected seeded output to include a run artifact.");
  const artifactPath = path.join(runsDir, artifactName);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.ok(artifact && artifact.output, "Expected run artifact to include output payload.");
  const opportunityRecord = artifact.output.opportunity_record;
  assert.ok(opportunityRecord, "Expected run artifact to include opportunity_record.");

  mutateFn({
    workflowRecord,
    opportunityRecord,
    artifactOutput: artifact.output,
  });

  workflowState.opportunities[opportunityId] = workflowRecord;
  fs.writeFileSync(env.workflowStatePath, JSON.stringify(workflowState, null, 2));
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
}

function normalizeTextKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactTextToken(value) {
  return normalizeTextKey(value).replace(/[^a-z0-9]+/g, "");
}

function assertRecommendationTextContract(recommendation) {
  assert.equal(typeof recommendation.recommendation_reason, "string");
  assert.equal(recommendation.recommendation_reason.trim().length > 0, true);
  assert.equal(typeof recommendation.next_action, "string");
  assert.equal(recommendation.next_action.trim().length > 0, true);
  assert.equal(typeof recommendation.change_condition, "string");
  assert.equal(recommendation.change_condition.trim().length > 0, true);

  const reasonKey = normalizeTextKey(recommendation.recommendation_reason);
  const actionKey = normalizeTextKey(recommendation.next_action);
  const changeKey = normalizeTextKey(recommendation.change_condition);
  assert.notEqual(reasonKey, actionKey, "reason and next_action should not duplicate");
  assert.notEqual(reasonKey, changeKey, "reason and change_condition should not duplicate");
  assert.notEqual(actionKey, changeKey, "next_action and change_condition should not duplicate");

  const labelToken = compactTextToken(recommendation.recommendation_label);
  const reasonToken = compactTextToken(recommendation.recommendation_reason);
  assert.notEqual(reasonToken, labelToken, "reason should not trivially restate the label");
  assert.notEqual(reasonToken, `recommendation${labelToken}`, "reason should not parrot the label");
}

function assertHandoffTextContract(handoff) {
  assert.equal(typeof handoff.handoff_state, "string");
  assert.equal(ALLOWED_HANDOFF_STATES.has(handoff.handoff_state), true);
  assert.equal(typeof handoff.handoff_label, "string");
  assert.equal(handoff.handoff_label.trim().length > 0, true);
  assert.equal(typeof handoff.handoff_reason, "string");
  assert.equal(handoff.handoff_reason.trim().length > 0, true);
  assert.equal(typeof handoff.current_owner_action, "string");
  assert.equal(handoff.current_owner_action.trim().length > 0, true);
  assert.equal(typeof handoff.next_owner, "string");
  assert.equal(handoff.next_owner.trim().length > 0, true);
  assert.equal(typeof handoff.handoff_clear_condition, "string");
  assert.equal(handoff.handoff_clear_condition.trim().length > 0, true);
}

function assertExecutionTextContract(execution) {
  assert.equal(typeof execution.execution_state, "string");
  assert.equal(ALLOWED_EXECUTION_STATES.has(execution.execution_state), true);
  assert.equal(typeof execution.execution_label, "string");
  assert.equal(execution.execution_label.trim().length > 0, true);
  assert.equal(typeof execution.execution_reason, "string");
  assert.equal(execution.execution_reason.trim().length > 0, true);
  assert.equal(typeof execution.execution_next_step, "string");
  assert.equal(execution.execution_next_step.trim().length > 0, true);
  assert.equal(typeof execution.execution_clear_condition, "string");
  assert.equal(execution.execution_clear_condition.trim().length > 0, true);
}

function assertMarketTextContract(market) {
  assert.equal(typeof market.market_state, "string");
  assert.equal(ALLOWED_MARKET_STATES.has(market.market_state), true);
  assert.equal(typeof market.market_label, "string");
  assert.equal(market.market_label.trim().length > 0, true);
  assert.equal(typeof market.market_reason, "string");
  assert.equal(market.market_reason.trim().length > 0, true);
  assert.equal(typeof market.market_next_step, "string");
  assert.equal(market.market_next_step.trim().length > 0, true);
  assert.equal(typeof market.market_clear_condition, "string");
  assert.equal(market.market_clear_condition.trim().length > 0, true);
}

function assertRouteTextContract(route) {
  assert.equal(typeof route.operator_route_state, "string");
  assert.equal(ALLOWED_ROUTE_STATES.has(route.operator_route_state), true);
  assert.equal(typeof route.operator_route_label, "string");
  assert.equal(route.operator_route_label.trim().length > 0, true);
  assert.equal(typeof route.operator_route_reason, "string");
  assert.equal(route.operator_route_reason.trim().length > 0, true);
  assert.equal(typeof route.operator_route_next_step, "string");
  assert.equal(route.operator_route_next_step.trim().length > 0, true);
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
  assert.equal(snapshot.office.zone_anchors.length >= 4, true);
  assert.equal(snapshot.office.route_hints.length, 1);
  assert.equal(snapshot.office.movement_intents.length >= 1, true);
  assert.equal(snapshot.office.handoff_signals.length, 1);
  assert.equal(snapshot.office.events.length >= 3, true);
  assert.equal(snapshot.office.flow_events.length, 1);
  assert.equal(snapshot.office.company_board_snapshot.approvals_waiting, 1);
  assert.ok(snapshot.office.office_view);
  assert.equal(Array.isArray(snapshot.office.office_view.zones), true);
  assert.equal(snapshot.office.office_view.zones.length, 4);
  assert.equal(Array.isArray(snapshot.office.office_view.handoffs), true);
  assert.ok(snapshot.office.office_view.company_board_summary);
  assert.equal(snapshot.capital_controls.status, "manual_only");
  assert.equal(snapshot.capital_strategy, null);
  assert.equal(snapshot.workflow.opportunities.length, 1);
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.opportunity_record.opportunity_id,
    "opp-2026-03-25-001"
  );
  const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
  const handoff = snapshot.workflow.opportunities[0].operational_handoff;
  const execution = snapshot.workflow.opportunities[0].operational_execution;
  const market = snapshot.workflow.opportunities[0].operational_market;
  const route = snapshot.workflow.opportunities[0].operational_route;
  assert.ok(recommendation);
  assert.ok(handoff);
  assert.ok(execution);
  assert.ok(market);
  assert.ok(route);
  assert.equal(ALLOWED_RECOMMENDATION_TYPES.has(recommendation.recommendation_type), true);
  assert.equal(typeof recommendation.recommendation_label, "string");
  assert.equal(recommendation.recommendation_label.length > 0, true);
  assert.equal(typeof recommendation.recommendation_reason, "string");
  assert.equal(recommendation.recommendation_reason.length > 0, true);
  assert.equal(typeof recommendation.next_action, "string");
  assert.equal(recommendation.next_action.length > 0, true);
  assert.equal(typeof recommendation.change_condition, "string");
  assert.equal(recommendation.change_condition.length > 0, true);
  assertRecommendationTextContract(recommendation);
  assert.equal(typeof recommendation.primary_driver, "string");
  assert.equal(recommendation.primary_driver.length > 0, true);
  assert.equal(typeof recommendation.blocking_type, "string");
  assert.equal(recommendation.blocking_type.length > 0, true);
  assert.equal(typeof recommendation.actionability, "string");
  assert.equal(recommendation.actionability.length > 0, true);
  assert.equal(recommendation.recommendation_type, "buy_after_verification");
  assertHandoffTextContract(handoff);
  assert.equal(handoff.handoff_state, "handoff_blocked");
  assertExecutionTextContract(execution);
  assert.equal(execution.execution_state, "execution_blocked");
  assertMarketTextContract(market);
  assert.equal(market.market_state, "market_blocked");
  assertRouteTextContract(route);
  assert.equal(route.operator_route_state, "hold");
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.handoff_packet.next_action,
    "Request remote IMEI proof and verify carrier status."
  );
  assert.match(
    snapshot.office.company_board_snapshot.capital_note,
    /withdrawal request\/approve\/cancel|runtime-manual/i
  );
  assert.equal(snapshot.office.presence[0].zone_label, "Decision Desk");
  assert.equal(snapshot.office.presence[0].visual_state, "needs_approval");
  assert.equal(snapshot.office.presence[0].motion_state, "needs_approval");
  assert.equal(snapshot.office.presence[0].lane_stage, "verification");
  assert.match(snapshot.office.presence[0].bubble_text, /approval blocker: owner decision is required/i);
  assert.equal(snapshot.office.presence[1].visual_state, "blocked");
  assert.equal(snapshot.office.handoff_signals[0].from_agent, "Valuation Agent");
  assert.equal(snapshot.office.handoff_signals[0].to_agent, "Risk and Compliance Agent");
  assert.equal(snapshot.office.handoff_signals[0].handoff_state, handoff.handoff_state);
  assert.equal(
    snapshot.office.handoff_signals[0].current_owner_action,
    handoff.current_owner_action
  );
  assert.equal(snapshot.office.handoff_signals[0].from_zone_id, "company-floor");
  assert.equal(snapshot.office.handoff_signals[0].to_zone_id, "verification-bay");
  assert.equal(snapshot.office.route_hints[0].from_zone_id, "company-floor");
  assert.equal(snapshot.office.route_hints[0].to_zone_id, "verification-bay");
  assert.equal(snapshot.office.route_hints[0].path_zone_ids.length >= 2, true);
  assert.equal(snapshot.office.route_hints[0].waypoints.length >= 2, true);
  assert.equal(snapshot.office.movement_intents[0].trigger_type, "approval_waiting");
  assert.equal(snapshot.office.movement_intents[0].transition_state, "in_flight");
  assert.equal(snapshot.office.events[0].type, "approval_waiting");
  assert.equal(snapshot.office.events[1].type, "handoff_completed");
  assert.equal(snapshot.office.flow_events[0].action, "status_update");
  assert.equal(snapshot.office.flow_events[0].lane_stage, "verification");
  const allowedVisualStates = new Set([
    "idle",
    "active",
    "reviewing",
    "waiting",
    "blocked",
    "needs_approval",
  ]);
  for (const presence of snapshot.office.presence) {
    assert.equal(
      allowedVisualStates.has(presence.visual_state),
      true,
      `Unexpected visual_state in office presence: ${presence.visual_state}`
    );
  }
  const expectedZones = [
    { id: "executive-suite", title: "Decision Desk", role_label: "CEO Agent" },
    {
      id: "verification-bay",
      title: "Sourcing & Verification",
      role_label: "Risk and Compliance Agent",
    },
    {
      id: "routing-desk",
      title: "Ops & Diagnostics",
      role_label: "Operations Coordinator Agent",
    },
    {
      id: "market-floor",
      title: "Sales & Market",
      role_label: "Department Operator Agent",
    },
  ];
  assert.deepEqual(
    snapshot.office.office_view.zones.map((zone) => ({
      id: zone.id,
      title: zone.title,
      role_label: zone.role_label,
    })),
    expectedZones
  );
  for (const zone of snapshot.office.office_view.zones) {
    assert.equal(typeof zone.avatar_label, "string");
    assert.equal(zone.avatar_label.length > 0, true);
    assert.equal(typeof zone.current_focus, "string");
    assert.equal(zone.current_focus.length > 0, true);
    assert.equal(typeof zone.now_summary, "string");
    assert.equal(zone.now_summary.length > 0, true);
    assert.equal(allowedVisualStates.has(zone.state), true);
  }
  assert.equal(
    snapshot.office.office_view.company_board_summary.key_counts.length >= 3,
    true
  );
  assert.equal(
    typeof snapshot.office.office_view.company_board_summary.headline === "string" &&
      snapshot.office.office_view.company_board_summary.headline.length > 0,
    true
  );
  for (const handoff of snapshot.office.office_view.handoffs) {
    assert.equal(typeof handoff.from_zone, "string");
    assert.equal(handoff.from_zone.length > 0, true);
    assert.equal(typeof handoff.to_zone, "string");
    assert.equal(handoff.to_zone.length > 0, true);
    assert.equal(typeof handoff.status, "string");
    assert.equal(new Set(["active", "blocked"]).has(handoff.status), true);
    assert.equal(typeof handoff.label, "string");
    assert.equal(handoff.label.length > 0, true);
  }

  for (const zone of snapshot.office.zone_anchors) {
    assert.equal(
      validateOfficeZoneAnchor(zone).length,
      0,
      "Expected zone_anchors to conform to OfficeZoneAnchor contract."
    );
  }
  for (const signal of snapshot.office.handoff_signals) {
    assert.equal(
      validateOfficeHandoffSignal(signal).length,
      0,
      "Expected handoff_signals to conform to OfficeHandoffSignal contract."
    );
  }
  for (const hint of snapshot.office.route_hints) {
    assert.equal(
      validateOfficeRouteHint(hint).length,
      0,
      "Expected route_hints to conform to OfficeRouteHint contract."
    );
  }
  for (const event of snapshot.office.events) {
    assert.equal(
      validateOfficeEvent(event).length,
      0,
      "Expected office.events to conform to OfficeEvent contract."
    );
  }
  for (const intent of snapshot.office.movement_intents) {
    assert.equal(
      validateOfficeMovementIntent(intent).length,
      0,
      "Expected movement_intents to conform to OfficeMovementIntent contract."
    );
  }
});

test("buildUiSnapshot surfaces capital account snapshot when capital runtime state exists", () => {
  const env = seedFixtureEnvironment();
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: env.capitalStatePath,
    action: "deposit",
    amountUsd: 900,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed account for UI snapshot visibility test.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_controls.status, "manual_only");
  assert.equal(snapshot.capital_controls.account_snapshot.available_usd, 900);
  assert.equal(snapshot.capital_controls.capital_left_usd, 900);
  assert.equal(snapshot.capital_controls.ledger_integrity.ok, true);
  assert.equal(snapshot.capital_controls.latest_request.action, "deposit");
  assert.equal(Array.isArray(snapshot.capital_controls.pending_withdrawal_requests), true);
  assert.equal(snapshot.capital_controls.pending_withdrawal_requests.length, 0);
  assert.equal(Array.isArray(snapshot.capital_controls.recent_ledger_entries), true);
  assert.equal(snapshot.capital_controls.recent_ledger_entries.length >= 1, true);
  assert.equal(snapshot.capital_strategy.capital_mode, "constrained");
  assert.equal(snapshot.capital_strategy.source_capital_account_id, "arc-main-usd");
  assert.equal(snapshot.capital_strategy.board_history.length, 1);
  assert.deepEqual(snapshot.capital_strategy.approved_strategy_priorities.slice(0, 2), [
    "resale_only",
    "arbitrage",
  ]);
  assert.match(snapshot.capital_strategy.capital_mode_reason, /tighter relative to exposure|safe working posture/i);
  assert.equal(
    validateCapitalStrategyHistoryEntry(snapshot.capital_strategy.board_history[0]).length,
    0,
    "Expected capital strategy board_history entries to conform to contract."
  );
  assert.equal(snapshot.office.presence[0].capital_mode, "constrained");
  assert.match(snapshot.office.presence[0].headline, /constrained mode/i);
  assert.equal(snapshot.workflow.opportunities[0].capital_fit.stance, "neutral");
  assert.match(
    snapshot.workflow.opportunities[0].capital_fit.reason,
    /remains viable, but current capital mode does not create a strong fit signal/i
  );
  assert.equal(
    validateCapitalFitAnnotation(snapshot.workflow.opportunities[0].capital_fit).length,
    0,
    "Expected capital_fit to conform to CapitalFitAnnotation contract."
  );
});

test("buildUiSnapshot keeps capital board history empty when no eligible ledger-backed snapshots exist", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_strategy.capital_mode, "recovery");
  assert.deepEqual(snapshot.capital_strategy.board_history, []);
});

test("buildUiSnapshot includes pending withdrawal request preview fields", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: env.capitalStatePath,
    action: "deposit",
    amountUsd: 1000,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed for withdrawal preview coverage.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });

  const state = loadCapitalState(env.capitalStatePath);
  submitWithdrawalRequest(
    state,
    {
      amount_usd: 125,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Owner withdrawal request",
    },
    { now: "2026-03-25T19:07:00.000Z" }
  );
  saveCapitalState(env.capitalStatePath, state, "2026-03-25T19:07:00.000Z");

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_controls.account_snapshot.available_usd, 875);
  assert.equal(snapshot.capital_controls.account_snapshot.pending_withdrawal_usd, 125);
  assert.equal(snapshot.capital_controls.pending_withdrawal_requests.length, 1);
  assert.equal(snapshot.capital_controls.pending_withdrawal_requests[0].request_id, "cap-req-000002");
  assert.equal(
    snapshot.capital_controls.pending_withdrawal_requests[0].resulting_available_usd_after_execution,
    875
  );
});

test("buildUiSnapshot covers favored, neutral, and discouraged capital_fit stances", () => {
  const normalEnv = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: normalEnv.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: normalEnv.capitalStatePath,
    action: "deposit",
    amountUsd: 2500,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed healthy capital posture for neutral capital-fit coverage.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });
  const normalSnapshot = buildUiSnapshot({
    queuePath: normalEnv.queuePath,
    workflowStatePath: normalEnv.workflowStatePath,
    capitalStatePath: normalEnv.capitalStatePath,
    baseDir: normalEnv.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  const favoredFixture = loadGoldenFixture();
  favoredFixture.opportunity_id = "opp-capital-fit-favored";
  favoredFixture.ask_price_usd = 220;
  favoredFixture.device.carrier_status = "verified";
  favoredFixture.device.imei_proof_verified = true;
  const favoredEnv = seedFixtureEnvironment({ fixture: favoredFixture, enqueueApproval: false });
  runBootstrapAction({
    statePath: favoredEnv.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: favoredEnv.capitalStatePath,
    action: "deposit",
    amountUsd: 900,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed constrained posture for favored capital-fit coverage.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });
  const favoredSnapshot = buildUiSnapshot({
    queuePath: favoredEnv.queuePath,
    workflowStatePath: favoredEnv.workflowStatePath,
    capitalStatePath: favoredEnv.capitalStatePath,
    baseDir: favoredEnv.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  const discouragedFixture = loadGoldenFixture();
  discouragedFixture.opportunity_id = "opp-capital-fit-discouraged";
  discouragedFixture.ask_price_usd = 750;
  discouragedFixture.device.carrier_status = "verified";
  discouragedFixture.device.imei_proof_verified = true;
  const discouragedEnv = seedFixtureEnvironment({
    fixture: discouragedFixture,
    enqueueApproval: false,
  });
  runBootstrapAction({
    statePath: discouragedEnv.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: discouragedEnv.capitalStatePath,
    action: "deposit",
    amountUsd: 900,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed constrained posture for discouraged capital-fit coverage.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });
  const discouragedSnapshot = buildUiSnapshot({
    queuePath: discouragedEnv.queuePath,
    workflowStatePath: discouragedEnv.workflowStatePath,
    capitalStatePath: discouragedEnv.capitalStatePath,
    baseDir: discouragedEnv.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(normalSnapshot.capital_strategy.capital_mode, "normal");
  assert.equal(normalSnapshot.workflow.opportunities[0].capital_fit.stance, "neutral");
  assert.equal(favoredSnapshot.capital_strategy.capital_mode, "constrained");
  assert.equal(favoredSnapshot.workflow.opportunities[0].capital_fit.stance, "favored");
  assert.equal(discouragedSnapshot.capital_strategy.capital_mode, "constrained");
  assert.equal(discouragedSnapshot.workflow.opportunities[0].capital_fit.stance, "discouraged");

  for (const snapshot of [normalSnapshot, favoredSnapshot, discouragedSnapshot]) {
    assert.equal(
      validateCapitalFitAnnotation(snapshot.workflow.opportunities[0].capital_fit).length,
      0,
      "Expected capital_fit to conform to CapitalFitAnnotation contract."
    );
  }
});

test("buildUiSnapshot surfaces bounded capital board history from recent ledger posture", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath: env.capitalStatePath,
    action: "deposit",
    amountUsd: 1200,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed account for board history coverage.",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-25T19:06:00.000Z",
  });
  runMovementAction({
    statePath: env.capitalStatePath,
    action: "reserve",
    amountUsd: 250,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Reserve capital for approved operating exposure.",
    notes: "",
    opportunityId: "opp-2026-03-25-001",
    approvalTicketId: "apr-ui-001",
    requestId: null,
    now: "2026-03-25T19:07:00.000Z",
  });

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_strategy.board_history.length, 2);
  assert.equal(snapshot.capital_strategy.board_history[0].timestamp, "2026-03-25T19:06:00.000Z");
  assert.equal(snapshot.capital_strategy.board_history[1].timestamp, "2026-03-25T19:07:00.000Z");
  assert.match(
    snapshot.capital_strategy.board_history[0].rationale_snapshot,
    /supporting normal operating posture/i
  );
  assert.doesNotMatch(
    snapshot.capital_strategy.board_history[0].rationale_snapshot,
    /Seed account for board history coverage/i
  );
  assert.match(
    snapshot.capital_strategy.board_history[1].rationale_snapshot,
    /tighter operating headroom|tighter relative to exposure\/reserve posture|recovery posture|normal operating posture/i
  );
  assert.doesNotMatch(
    snapshot.capital_strategy.board_history[1].rationale_snapshot,
    /Reserve capital for approved operating exposure/i
  );
  assert.equal(
    snapshot.capital_strategy.board_history[1].capital_mode,
    snapshot.capital_strategy.capital_mode
  );
  assert.equal(
    snapshot.capital_strategy.board_history[1].rationale_snapshot,
    snapshot.capital_strategy.capital_mode_reason
  );
  for (const entry of snapshot.capital_strategy.board_history) {
    assert.equal(
      validateCapitalStrategyHistoryEntry(entry).length,
      0,
      "Expected capital strategy board_history entries to conform to contract."
    );
  }
});

test("buildUiSnapshot caps capital board history to the latest four snapshots in chronological order", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });

  const movements = [
    { action: "deposit", amountUsd: 1600, opportunityId: null, approvalTicketId: null, now: "2026-03-25T19:06:00.000Z" },
    { action: "reserve", amountUsd: 200, opportunityId: "opp-2026-03-25-001", approvalTicketId: "apr-ui-001", now: "2026-03-25T19:07:00.000Z" },
    { action: "release_reserve", amountUsd: 100, opportunityId: "opp-2026-03-25-001", approvalTicketId: "apr-ui-001", now: "2026-03-25T19:08:00.000Z" },
    { action: "adjustment", amountUsd: 50, opportunityId: null, approvalTicketId: null, now: "2026-03-25T19:09:00.000Z" },
    { action: "withdraw", amountUsd: 75, opportunityId: null, approvalTicketId: null, now: "2026-03-25T19:10:00.000Z" },
  ];

  for (const movement of movements) {
    runMovementAction({
      statePath: env.capitalStatePath,
      action: movement.action,
      amountUsd: movement.amountUsd,
      requestedBy: "owner_operator",
      performedBy: "owner_operator",
      authorizedBy: "owner_operator",
      reason: `Board history coverage for ${movement.action}.`,
      notes: "",
      opportunityId: movement.opportunityId,
      approvalTicketId: movement.approvalTicketId,
      requestId: null,
      now: movement.now,
    });
  }

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:11:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_strategy.board_history.length, 4);
  assert.deepEqual(
    snapshot.capital_strategy.board_history.map((entry) => entry.timestamp),
    [
      "2026-03-25T19:07:00.000Z",
      "2026-03-25T19:08:00.000Z",
      "2026-03-25T19:09:00.000Z",
      "2026-03-25T19:10:00.000Z",
    ]
  );
});

test("buildUiSnapshot recommendation mapping covers the four v1 recommendation states", () => {
  const scenarios = [
    {
      name: "approve_now",
      expected: {
        state: "approve_now",
        label: "Approve now",
        primary_driver: "ready_to_execute",
        blocking_type: "none",
        actionability: "ready",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        opportunityRecord.ask_price_usd = 320;
        opportunityRecord.estimated_value_range_usd = [330, 480];
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
    {
      name: "buy_after_verification",
      expected: {
        state: "buy_after_verification",
        label: "Buy after verification",
        primary_driver: "verification_pending",
        blocking_type: "verification",
        actionability: "gated",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
          response_status: "pending",
        };
      },
    },
    {
      name: "hold_for_info",
      expected: {
        state: "hold_for_info",
        label: "Hold for info",
        primary_driver: "missing_decision_input",
        blocking_type: "decision_input_missing",
        actionability: "hold",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
    {
      name: "reject_now",
      expected: {
        state: "reject_now",
        label: "Reject now",
        primary_driver: "critical_blocker",
        blocking_type: "non_viable_fit",
        actionability: "stop",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
  ];

  const observedTypes = new Set();
  for (const scenario of scenarios) {
    const env = seedFixtureEnvironment({ enqueueApproval: false });
    mutateSeededRecommendationInputs(env, scenario.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
    assert.equal(ALLOWED_RECOMMENDATION_TYPES.has(recommendation.recommendation_type), true);
    assert.equal(recommendation.recommendation_state, scenario.expected.state, scenario.name);
    assert.equal(recommendation.recommendation_type, scenario.expected.state, scenario.name);
    assert.equal(recommendation.recommendation_label, scenario.expected.label, scenario.name);
    assert.equal(recommendation.primary_driver, scenario.expected.primary_driver, scenario.name);
    assert.equal(recommendation.blocking_type, scenario.expected.blocking_type, scenario.name);
    assert.equal(recommendation.actionability, scenario.expected.actionability, scenario.name);
    assertRecommendationTextContract(recommendation);
    observedTypes.add(recommendation.recommendation_type);
  }

  assert.deepEqual(new Set([...observedTypes].sort()), new Set([...ALLOWED_RECOMMENDATION_TYPES].sort()));
});

test("buildUiSnapshot recommendation next_action and change_condition remain deterministic", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, opportunityRecord, artifactOutput }) => {
    opportunityRecord.recommendation = "acquire";
    opportunityRecord.recommended_path = "repair_and_resale";
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.seller_verification = {
      imei_proof_verified: true,
      carrier_status_verified: true,
      response_status: "verified",
    };
    artifactOutput.handoff_packet.next_action = "Owner packet review in progress.";
  });

  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_recommendation;
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_recommendation;

  assert.equal(first.next_action, second.next_action);
  assert.equal(first.change_condition, second.change_condition);
  assert.equal(first.next_action.trim().length > 0, true);
  assert.equal(first.change_condition.trim().length > 0, true);
});

test("buildUiSnapshot canonicalizes blocker text by blocker class", () => {
  const env = seedFixtureEnvironment();
  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.match(
    snapshot.office.presence[0].bubble_text,
    /^Approval blocker: owner decision is required in the approval queue\.$/i
  );
  assert.match(
    snapshot.office.presence[1].bubble_text,
    /^Approval blocker: purchase recommendation is blocked pending owner decision\.$/i
  );
});

test("buildUiSnapshot approval ticket summary aligns with recommendation and consequence fields", () => {
  const env = seedFixtureEnvironment();
  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });
  const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
  const queueItem = snapshot.approval_queue.items[0];

  assert.ok(queueItem);
  assert.ok(recommendation);
  assert.match(queueItem.ticket.reasoning_summary, new RegExp(`^${recommendation.recommendation_label}:`));
  assert.match(queueItem.ticket.reasoning_summary, new RegExp(recommendation.next_action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(queueItem.ticket.risk_summary, recommendation.change_condition);
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
  assert.match(queueItem.reject_consequence, /stop/i);
});

test("buildUiSnapshot approval consequence fields remain deterministic", () => {
  const env = seedFixtureEnvironment();
  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).approval_queue.items[0];
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).approval_queue.items[0];
  assert.equal(first.approve_consequence, second.approve_consequence);
  assert.equal(first.reject_consequence, second.reject_consequence);
  assert.equal(first.more_info_consequence, second.more_info_consequence);
  assert.equal(first.resume_owner, second.resume_owner);
  assert.equal(first.resume_condition, second.resume_condition);
});

test("buildUiSnapshot recommendation fallback remains non-blank with incomplete data", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, artifactOutput }) => {
    artifactOutput.opportunity_record = null;
    workflowRecord.recommendation = null;
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.current_status = "researching";
    workflowRecord.seller_verification = null;
    artifactOutput.handoff_packet.next_action = "Owner packet rebuild required.";
  });

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  });
  const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
  assert.equal(ALLOWED_RECOMMENDATION_TYPES.has(recommendation.recommendation_state), true);
  assert.equal(recommendation.recommendation_reason.trim().length > 0, true);
  assert.equal(recommendation.next_action.trim().length > 0, true);
  assert.equal(recommendation.change_condition.trim().length > 0, true);
});

test("buildUiSnapshot handoff mapping covers ready blocked waiting and return-required states", () => {
  const scenarios = [
    {
      name: "handoff_ready",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "handoff_blocked",
      enqueueApproval: true,
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = true;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: false,
          response_status: "pending",
        };
      },
    },
    {
      name: "handoff_waiting",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
          response_status: "pending",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "handoff_return_required",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
  ];

  for (const scenario of scenarios) {
    const env = seedFixtureEnvironment({ enqueueApproval: scenario.enqueueApproval });
    mutateSeededRecommendationInputs(env, scenario.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const opportunity = snapshot.workflow.opportunities[0];
    const handoff = opportunity.operational_handoff;
    const signal = snapshot.office.handoff_signals[0];
    assertHandoffTextContract(handoff);
    assert.equal(handoff.handoff_state, scenario.name, scenario.name);
    assert.equal(opportunity.handoff_state, scenario.name, scenario.name);
    assert.equal(signal.handoff_state, scenario.name, scenario.name);
    assert.equal(signal.current_owner_action, handoff.current_owner_action, scenario.name);
    assert.equal(signal.next_owner, handoff.next_owner, scenario.name);
    assert.equal(signal.handoff_clear_condition, handoff.handoff_clear_condition, scenario.name);
  }
});

test("buildUiSnapshot handoff action and clear condition remain deterministic", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, opportunityRecord }) => {
    opportunityRecord.recommendation = "acquire";
    opportunityRecord.recommended_path = "resale_as_is";
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.seller_verification = {
      imei_proof_verified: true,
      carrier_status_verified: true,
      response_status: "verified",
    };
  });

  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_handoff;
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_handoff;

  assert.equal(first.current_owner_action, second.current_owner_action);
  assert.equal(first.handoff_clear_condition, second.handoff_clear_condition);
  assert.equal(first.next_owner, second.next_owner);
});

test("buildUiSnapshot execution mapping covers ready waiting-intake waiting-parts blocked and not-applicable states", () => {
  const scenarios = [
    {
      name: "execution_ready",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "execution_waiting_intake",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "awaiting_seller_verification";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
          response_status: "pending",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "execution_waiting_parts",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "execution_blocked",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = true;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
    {
      name: "execution_not_applicable",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "researching";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
  ];

  for (const scenario of scenarios) {
    const env = seedFixtureEnvironment({ enqueueApproval: scenario.enqueueApproval });
    mutateSeededRecommendationInputs(env, scenario.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const opportunity = snapshot.workflow.opportunities[0];
    const execution = opportunity.operational_execution;
    assertExecutionTextContract(execution);
    assert.equal(execution.execution_state, scenario.name, scenario.name);
    assert.equal(opportunity.execution_state, scenario.name, scenario.name);
  }
});

test("buildUiSnapshot execution next step and clear condition remain deterministic", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, opportunityRecord, artifactOutput }) => {
    opportunityRecord.recommendation = "acquire";
    opportunityRecord.recommended_path = "resale_as_is";
    workflowRecord.current_status = "approved";
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.seller_verification = {
      imei_proof_verified: true,
      carrier_status_verified: true,
      response_status: "verified",
    };
    artifactOutput.handoff_packet.blocking_items = [];
  });

  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_execution;
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_execution;

  assert.equal(first.execution_next_step, second.execution_next_step);
  assert.equal(first.execution_clear_condition, second.execution_clear_condition);
});

test("buildUiSnapshot market mapping covers ready waiting-pricing waiting-listing blocked and not-applicable states", () => {
  const scenarios = [
    {
      name: "market_ready",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "market_waiting_pricing",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "market_waiting_listing",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "awaiting_seller_verification";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
          response_status: "pending",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "market_blocked",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = true;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
    {
      name: "market_not_applicable",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "researching";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
  ];

  for (const scenario of scenarios) {
    const env = seedFixtureEnvironment({ enqueueApproval: scenario.enqueueApproval });
    mutateSeededRecommendationInputs(env, scenario.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const opportunity = snapshot.workflow.opportunities[0];
    const market = opportunity.operational_market;
    assertMarketTextContract(market);
    assert.equal(market.market_state, scenario.name, scenario.name);
    assert.equal(opportunity.market_state, scenario.name, scenario.name);
  }
});

test("buildUiSnapshot market next step and clear condition remain deterministic", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, opportunityRecord, artifactOutput }) => {
    opportunityRecord.recommendation = "acquire";
    opportunityRecord.recommended_path = "resale_as_is";
    workflowRecord.current_status = "approved";
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.seller_verification = {
      imei_proof_verified: true,
      carrier_status_verified: true,
      response_status: "verified",
    };
    artifactOutput.handoff_packet.blocking_items = [];
  });

  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_market;
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_market;

  assert.equal(first.market_next_step, second.market_next_step);
  assert.equal(first.market_clear_condition, second.market_clear_condition);
});

test("buildUiSnapshot route summary mapping covers pursue-now verification execution market hold and stop states", () => {
  const scenarios = [
    {
      name: "pursue_now",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.recommendation = "acquire";
        workflowRecord.current_status = "researching";
        workflowRecord.purchase_recommendation_blocked = false;
        delete workflowRecord.seller_verification;
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "pursue_after_verification",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "awaiting_seller_verification";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
          response_status: "pending",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "prepare_execution",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "prepare_market",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
    {
      name: "hold",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "approved";
        workflowRecord.purchase_recommendation_blocked = true;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
      },
    },
    {
      name: "stop",
      enqueueApproval: false,
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.current_status = "researching";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
          response_status: "verified",
        };
        artifactOutput.handoff_packet.blocking_items = [];
      },
    },
  ];

  for (const scenario of scenarios) {
    const env = seedFixtureEnvironment({ enqueueApproval: scenario.enqueueApproval });
    mutateSeededRecommendationInputs(env, scenario.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const opportunity = snapshot.workflow.opportunities[0];
    const route = opportunity.operational_route;
    assertRouteTextContract(route);
    assert.equal(route.operator_route_state, scenario.name, scenario.name);
    assert.equal(opportunity.operator_route_state, scenario.name, scenario.name);
  }
});

test("buildUiSnapshot route next step remains deterministic", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  mutateSeededRecommendationInputs(env, ({ workflowRecord, opportunityRecord, artifactOutput }) => {
    opportunityRecord.recommendation = "acquire";
    opportunityRecord.recommended_path = "resale_as_is";
    workflowRecord.current_status = "approved";
    workflowRecord.purchase_recommendation_blocked = false;
    workflowRecord.seller_verification = {
      imei_proof_verified: true,
      carrier_status_verified: true,
      response_status: "verified",
    };
    artifactOutput.handoff_packet.blocking_items = [];
  });

  const first = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_route;
  const second = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:10:00.000Z",
    dueSoonMinutes: 60,
  }).workflow.opportunities[0].operational_route;

  assert.equal(first.operator_route_next_step, second.operator_route_next_step);
  assert.equal(first.operator_route_reason, second.operator_route_reason);
});

test("buildUiSnapshot preserves repeated consecutive same-mode entries in capital board history", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });

  const movements = [
    { action: "deposit", amountUsd: 1200, now: "2026-03-25T19:06:00.000Z" },
    { action: "adjustment", amountUsd: 25, now: "2026-03-25T19:07:00.000Z" },
    { action: "adjustment", amountUsd: 25, now: "2026-03-25T19:08:00.000Z" },
  ];

  for (const movement of movements) {
    runMovementAction({
      statePath: env.capitalStatePath,
      action: movement.action,
      amountUsd: movement.amountUsd,
      requestedBy: "owner_operator",
      performedBy: "owner_operator",
      authorizedBy: "owner_operator",
      reason: `Board history repeat coverage for ${movement.action}.`,
      notes: "",
      opportunityId: null,
      approvalTicketId: null,
      requestId: null,
      now: movement.now,
    });
  }

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:09:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_strategy.board_history.length, 3);
  assert.deepEqual(
    snapshot.capital_strategy.board_history.map((entry) => entry.capital_mode),
    ["normal", "normal", "normal"]
  );
});

test("buildUiSnapshot preserves repeated same-mode entries when capital board history is truncated", () => {
  const env = seedFixtureEnvironment({ enqueueApproval: false });
  runBootstrapAction({
    statePath: env.capitalStatePath,
    accountId: "arc-main-usd",
    now: "2026-03-25T19:05:00.000Z",
    force: false,
  });

  const movements = [
    { action: "deposit", amountUsd: 1500, now: "2026-03-25T19:06:00.000Z" },
    { action: "adjustment", amountUsd: 20, now: "2026-03-25T19:07:00.000Z" },
    { action: "adjustment", amountUsd: 20, now: "2026-03-25T19:08:00.000Z" },
    { action: "adjustment", amountUsd: 20, now: "2026-03-25T19:09:00.000Z" },
    { action: "adjustment", amountUsd: 20, now: "2026-03-25T19:10:00.000Z" },
  ];

  for (const movement of movements) {
    runMovementAction({
      statePath: env.capitalStatePath,
      action: movement.action,
      amountUsd: movement.amountUsd,
      requestedBy: "owner_operator",
      performedBy: "owner_operator",
      authorizedBy: "owner_operator",
      reason: `Board history truncation repeat coverage for ${movement.action}.`,
      notes: "",
      opportunityId: null,
      approvalTicketId: null,
      requestId: null,
      now: movement.now,
    });
  }

  const snapshot = buildUiSnapshot({
    queuePath: env.queuePath,
    workflowStatePath: env.workflowStatePath,
    capitalStatePath: env.capitalStatePath,
    baseDir: env.baseDir,
    now: "2026-03-25T19:11:00.000Z",
    dueSoonMinutes: 60,
  });

  assert.equal(snapshot.capital_strategy.board_history.length, 4);
  assert.deepEqual(
    snapshot.capital_strategy.board_history.map((entry) => entry.capital_mode),
    ["normal", "normal", "normal", "normal"]
  );
  assert.deepEqual(
    snapshot.capital_strategy.board_history.map((entry) => entry.timestamp),
    [
      "2026-03-25T19:07:00.000Z",
      "2026-03-25T19:08:00.000Z",
      "2026-03-25T19:09:00.000Z",
      "2026-03-25T19:10:00.000Z",
    ]
  );
});
