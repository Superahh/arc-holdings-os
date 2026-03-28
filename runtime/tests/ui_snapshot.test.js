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
  "buy_now",
  "buy_after_verification",
  "skip",
  "part_out_only",
  "repair_if_cost_holds",
  "wait_for_better_price",
  "manual_review",
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
  assert.equal(snapshot.capital_controls.status, "manual_only");
  assert.equal(snapshot.capital_strategy, null);
  assert.equal(snapshot.workflow.opportunities.length, 1);
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.opportunity_record.opportunity_id,
    "opp-2026-03-25-001"
  );
  const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
  assert.ok(recommendation);
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
  const explicitAction =
    (snapshot.workflow.opportunities[0].latest_task &&
      snapshot.workflow.opportunities[0].latest_task.next_action) ||
    (snapshot.workflow.opportunities[0].contract_bundle.handoff_packet &&
      snapshot.workflow.opportunities[0].contract_bundle.handoff_packet.next_action) ||
    (snapshot.workflow.opportunities[0].queue_item &&
      snapshot.workflow.opportunities[0].queue_item.ticket &&
      snapshot.workflow.opportunities[0].queue_item.ticket.reasoning_summary) ||
    "";
  if (explicitAction && explicitAction.trim()) {
    assert.equal(recommendation.next_action, explicitAction.trim());
  }
  assert.equal(
    snapshot.workflow.opportunities[0].contract_bundle.handoff_packet.next_action,
    "Request remote IMEI proof and verify carrier status."
  );
  assert.match(
    snapshot.office.company_board_snapshot.capital_note,
    /deposit, reserve, approval, and withdrawal/i
  );
  assert.equal(snapshot.office.presence[0].zone_label, "Decision Desk");
  assert.equal(snapshot.office.presence[0].visual_state, "needs_approval");
  assert.equal(snapshot.office.presence[0].motion_state, "needs_approval");
  assert.equal(snapshot.office.presence[0].lane_stage, "verification");
  assert.match(snapshot.office.presence[0].bubble_text, /approval queue is waiting on owner action/i);
  assert.equal(snapshot.office.presence[1].visual_state, "blocked");
  assert.equal(snapshot.office.handoff_signals[0].from_agent, "Valuation Agent");
  assert.equal(snapshot.office.handoff_signals[0].to_agent, "Risk and Compliance Agent");
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
  assert.equal(snapshot.capital_controls.ledger_integrity.ok, true);
  assert.equal(snapshot.capital_controls.latest_request.action, "deposit");
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

test("buildUiSnapshot recommendation derivation keeps v1 labels exclusive with deterministic provenance", () => {
  const scenarios = [
    {
      name: "buy_now",
      expected: {
        type: "buy_now",
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
        };
      },
    },
    {
      name: "buy_after_verification",
      expected: {
        type: "buy_after_verification",
        primary_driver: "verification_pending",
        blocking_type: "verification",
        actionability: "gated",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        opportunityRecord.ask_price_usd = 300;
        opportunityRecord.estimated_value_range_usd = [330, 470];
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "skip",
      expected: {
        type: "skip",
        primary_driver: "clear_negative",
        blocking_type: "none",
        actionability: "ready",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "skip";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "part_out_only",
      expected: {
        type: "part_out_only",
        primary_driver: "part_out_advantage",
        blocking_type: "none",
        actionability: "ready",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "part_out";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "repair_if_cost_holds",
      expected: {
        type: "repair_if_cost_holds",
        primary_driver: "repair_cost_uncertain",
        blocking_type: "repair_cost",
        actionability: "gated",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "wait_for_better_price",
      expected: {
        type: "wait_for_better_price",
        primary_driver: "price_too_high",
        blocking_type: "price",
        actionability: "watching",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        opportunityRecord.ask_price_usd = 690;
        opportunityRecord.estimated_value_range_usd = [430, 520];
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "manual_review",
      expected: {
        type: "manual_review",
        primary_driver: "ambiguous_evidence",
        blocking_type: "ambiguity",
        actionability: "ambiguous",
      },
      mutate: ({ workflowRecord, artifactOutput }) => {
        artifactOutput.opportunity_record = null;
        workflowRecord.recommendation = null;
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
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
    assert.equal(recommendation.recommendation_type, scenario.expected.type, scenario.name);
    assert.equal(recommendation.primary_driver, scenario.expected.primary_driver, scenario.name);
    assert.equal(recommendation.blocking_type, scenario.expected.blocking_type, scenario.name);
    assert.equal(recommendation.actionability, scenario.expected.actionability, scenario.name);
    assertRecommendationTextContract(recommendation);
    if (scenario.expected.type === "buy_now") {
      assert.match(recommendation.recommendation_reason, /verification|gate/i, scenario.name);
      assert.match(recommendation.change_condition, /disqualifying|risk|blocker/i, scenario.name);
    } else if (scenario.expected.type === "buy_after_verification") {
      assert.match(recommendation.recommendation_reason, /verification|approval|gate|open/i, scenario.name);
      assert.match(recommendation.change_condition, /resolve|verification|approval|proceed|re-route/i, scenario.name);
    } else if (scenario.expected.type === "skip") {
      assert.match(recommendation.recommendation_reason, /reject|stop|evidence/i, scenario.name);
      assert.match(recommendation.change_condition, /contradictory|overturn/i, scenario.name);
    } else if (scenario.expected.type === "part_out_only") {
      assert.match(recommendation.recommendation_reason, /parts|whole-unit/i, scenario.name);
      assert.match(recommendation.change_condition, /whole-unit|part-out|economics/i, scenario.name);
    } else if (scenario.expected.type === "repair_if_cost_holds") {
      assert.match(recommendation.recommendation_reason, /repair|cost|bound|viable/i, scenario.name);
      assert.match(recommendation.change_condition, /repair|quote|cost|bound/i, scenario.name);
    } else if (scenario.expected.type === "wait_for_better_price") {
      assert.match(recommendation.recommendation_reason, /ask|price|ceiling|entry/i, scenario.name);
      assert.match(recommendation.change_condition, /ask|falls|below|price|range/i, scenario.name);
    } else if (scenario.expected.type === "manual_review") {
      assert.match(recommendation.recommendation_reason, /conflict|incomplete|safe|decision|evidence/i, scenario.name);
      assert.match(recommendation.change_condition, /conflict|resolves|path/i, scenario.name);
    }
    observedTypes.add(recommendation.recommendation_type);
  }

  assert.deepEqual(new Set([...observedTypes].sort()), new Set([...ALLOWED_RECOMMENDATION_TYPES].sort()));
});

test("buildUiSnapshot recommendation tie-breaks stay deterministic at near-boundary conditions", () => {
  const cases = [
    {
      name: "verification_pending_beats_price_borderline",
      expectedType: "buy_after_verification",
      expectedProvenance: {
        primary_driver: "verification_pending",
        blocking_type: "verification",
        actionability: "gated",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "resale_as_is";
        opportunityRecord.ask_price_usd = 501;
        opportunityRecord.estimated_value_range_usd = [420, 500];
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: true,
        };
      },
    },
    {
      name: "repair_path_beats_generic_missing_evidence",
      expectedType: "repair_if_cost_holds",
      expectedProvenance: {
        primary_driver: "repair_cost_uncertain",
        blocking_type: "repair_cost",
        actionability: "gated",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: false,
        };
      },
    },
    {
      name: "part_out_advantage_beats_overpriced_whole_unit",
      expectedType: "part_out_only",
      expectedProvenance: {
        primary_driver: "part_out_advantage",
        blocking_type: "none",
        actionability: "ready",
      },
      mutate: ({ workflowRecord, opportunityRecord }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "part_out";
        opportunityRecord.ask_price_usd = 760;
        opportunityRecord.estimated_value_range_usd = [450, 520];
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
      },
    },
  ];

  for (const fixtureCase of cases) {
    const env = seedFixtureEnvironment({ enqueueApproval: false });
    mutateSeededRecommendationInputs(env, fixtureCase.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
    assert.equal(recommendation.recommendation_type, fixtureCase.expectedType, fixtureCase.name);
    assert.equal(
      recommendation.primary_driver,
      fixtureCase.expectedProvenance.primary_driver,
      fixtureCase.name
    );
    assert.equal(
      recommendation.blocking_type,
      fixtureCase.expectedProvenance.blocking_type,
      fixtureCase.name
    );
    assert.equal(
      recommendation.actionability,
      fixtureCase.expectedProvenance.actionability,
      fixtureCase.name
    );
    assertRecommendationTextContract(recommendation);
  }
});

test("buildUiSnapshot recommendation text remains collision-safe in adversarial wording contexts", () => {
  const cases = [
    {
      name: "buy_after_verification_with_approval_and_verification_language",
      expectedType: "buy_after_verification",
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "request_more_info";
        opportunityRecord.recommended_path = "resale_as_is";
        workflowRecord.purchase_recommendation_blocked = true;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: false,
        };
        artifactOutput.handoff_packet.next_action =
          "Clear approval hold and gather missing IMEI and carrier evidence.";
      },
      checks: (recommendation) => {
        assert.match(recommendation.recommendation_reason, /verification|approval|open/i);
        assert.match(recommendation.change_condition, /verification|approval|resolve/i);
      },
    },
    {
      name: "repair_if_cost_holds_with_nearby_missing_evidence",
      expectedType: "repair_if_cost_holds",
      mutate: ({ workflowRecord, opportunityRecord, artifactOutput }) => {
        opportunityRecord.recommendation = "acquire";
        opportunityRecord.recommended_path = "repair_and_resale";
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: false,
          carrier_status_verified: false,
        };
        artifactOutput.handoff_packet.next_action = "Collect missing evidence while confirming repair quote.";
      },
      checks: (recommendation) => {
        assert.match(recommendation.recommendation_reason, /repair|cost|bound/i);
        assert.match(recommendation.change_condition, /repair|quote|cost|bound/i);
      },
    },
    {
      name: "manual_review_with_partial_conflicting_path_signals",
      expectedType: "manual_review",
      mutate: ({ workflowRecord, artifactOutput }) => {
        artifactOutput.opportunity_record = null;
        workflowRecord.recommendation = null;
        workflowRecord.purchase_recommendation_blocked = false;
        workflowRecord.seller_verification = {
          imei_proof_verified: true,
          carrier_status_verified: true,
        };
        artifactOutput.handoff_packet.next_action =
          "Review conflicting path assumptions before selecting execution path.";
      },
      checks: (recommendation) => {
        assert.match(recommendation.recommendation_reason, /conflict|incomplete|safe|decision|evidence/i);
        assert.match(recommendation.change_condition, /conflict|resolves|path/i);
      },
    },
  ];

  for (const fixtureCase of cases) {
    const env = seedFixtureEnvironment({ enqueueApproval: false });
    mutateSeededRecommendationInputs(env, fixtureCase.mutate);
    const snapshot = buildUiSnapshot({
      queuePath: env.queuePath,
      workflowStatePath: env.workflowStatePath,
      baseDir: env.baseDir,
      now: "2026-03-25T19:10:00.000Z",
      dueSoonMinutes: 60,
    });
    const recommendation = snapshot.workflow.opportunities[0].operational_recommendation;
    assert.equal(recommendation.recommendation_type, fixtureCase.expectedType, fixtureCase.name);
    assertRecommendationTextContract(recommendation);
    fixtureCase.checks(recommendation);
  }
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
