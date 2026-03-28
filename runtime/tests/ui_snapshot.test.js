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
  assert.equal(snapshot.office.presence[0].lane_stage, "verification");
  assert.match(snapshot.office.presence[0].bubble_text, /approval queue is waiting on owner action/i);
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
