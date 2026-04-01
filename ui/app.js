"use strict";

const TRANSITION_WINDOW_MS = 14000;
const DECISION_REQUEST_TIMEOUT_MS = 12000;
const DECISION_SUCCESS_MESSAGE_MS = 9000;
const CAPITAL_REQUEST_TIMEOUT_MS = 12000;
const CAPITAL_SUCCESS_MESSAGE_MS = 9000;
const V1_BOARD_CONTRACT = {
  maxVisibleHandoffs: 3,
  maxOpportunityMetadataChips: 2,
  maxDetailHeroChips: 2,
  laneCardKeys: [
    "avatar",
    "lane_label",
    "active_count",
    "top_live_item",
    "blocker_or_next_action",
  ],
};

function createEmptyTransitionState() {
  return {
    generatedAt: 0,
    handoffs: [],
    focusShiftAgents: new Set(),
    laneShiftAgents: new Set(),
    laneShiftOpportunities: new Set(),
    newFlowEventIds: new Set(),
  };
}

const state = {
  snapshot: null,
  selected: null,
  transitions: createEmptyTransitionState(),
  transitionTimerId: null,
  shellMessage: null,
  shellMessageLevel: "info",
  shellMessageTimerId: null,
  decisionInFlight: false,
  decisionMessage: null,
  decisionMessageLevel: "info",
  decisionMessageTimerId: null,
  lastDecisionRetry: null,
  sendBackInFlight: false,
  capitalActionInFlight: false,
  capitalMessage: null,
  capitalMessageLevel: "info",
  capitalMessageTimerId: null,
  intakeSubmitInFlight: false,
  routePlayback: {
    intentId: null,
    progress: 50,
  },
  detailFocusSection: null,
  sendBackComposerOpportunityId: null,
  localOperatorDrafts: {},
  latestIntakeDraft: null,
};

const elements = {
  generatedAt: document.querySelector("#generated-at"),
  focusTaskButton: document.querySelector("#focus-task-button"),
  ingestButton: document.querySelector("#ingest-button"),
  refreshButton: document.querySelector("#refresh-button"),
  kpiStrip: document.querySelector("#kpi-strip"),
  officeCanvas: document.querySelector("#office-canvas"),
  detailPanel: document.querySelector("#detail-panel"),
  companyBoard: document.querySelector("#company-board"),
  approvalQueue: document.querySelector("#approval-queue"),
  attentionNote: document.querySelector("#attention-note"),
  kpiCardTemplate: document.querySelector("#kpi-card-template"),
  intakeDialog: document.querySelector("#intake-dialog"),
  intakeForm: document.querySelector("#intake-form"),
  intakeCloseButton: document.querySelector("#intake-close-button"),
  intakeCancelButton: document.querySelector("#intake-cancel-button"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeToken(value) {
  return String(value || "")
    .replaceAll(/[^a-z0-9_]+/gi, "_")
    .toLowerCase();
}

function formatTimestamp(value) {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  if (typeof value !== "number") {
    return "N/A";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStrategyLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatCapitalFitLabel(value) {
  const labels = {
    favored: "Favored",
    neutral: "Neutral",
    discouraged: "Discouraged",
  };
  return labels[value] || "Neutral";
}

function formatStatusClass(value) {
  return `status-${normalizeToken(value || "unknown")}`;
}

function formatMotionClass(value) {
  return `motion-${normalizeToken(value || "idle")}`;
}

function formatBubbleClass(value) {
  return `bubble-${normalizeToken(value || "task")}`;
}

function formatVisualStateClass(value) {
  return `visual-state-${normalizeToken(value || "idle")}`;
}

function formatVisualStateFamilyClass(value) {
  const normalized = normalizeToken(value || "idle");
  if (normalized === "blocked") {
    return "state-family-interrupt";
  }
  if (normalized === "waiting" || normalized === "needs_approval") {
    return "state-family-hold";
  }
  return "state-family-neutral";
}

function formatLaneClass(value) {
  return `lane-${normalizeToken(value || "monitor")}`;
}

function formatFlowSeverityClass(value) {
  return `flow-${normalizeToken(value || "info")}`;
}

function formatOfficeEventType(value) {
  return String(value || "event")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatVisualStateLabel(value) {
  const labels = {
    idle: "Idle",
    active: "Active",
    reviewing: "Reviewing",
    waiting: "Waiting",
    blocked: "Blocked",
    needs_approval: "Needs approval",
  };
  return labels[normalizeToken(value || "idle")] || "Idle";
}

function formatApprovalOutcomeChip(event) {
  if (!event || event.type !== "approval_resolved") {
    return null;
  }

  const decision = normalizeToken(event.decision || "");
  if (decision === "approve") {
    return {
      label: "Approval success",
      tone: "success",
    };
  }
  if (decision === "reject") {
    return {
      label: "Approval failed",
      tone: "failure",
    };
  }
  if (decision === "request_more_info") {
    return {
      label: "Needs more info",
      tone: "attention",
    };
  }
  return {
    label: "Decision logged",
    tone: "neutral",
  };
}

function mapStatusToLaneStage(status) {
  if (["awaiting_seller_verification", "researching"].includes(status)) {
    return "verification";
  }
  if (status === "awaiting_approval") {
    return "approval";
  }
  if (["approved", "acquired"].includes(status)) {
    return "execution";
  }
  if (["routed", "monetizing"].includes(status)) {
    return "market";
  }
  return "monitor";
}

function formatLaneLabel(value) {
  const mapping = {
    verification: "Verification lane",
    approval: "Approval lane",
    execution: "Execution lane",
    market: "Market lane",
    monitor: "Monitor lane",
  };
  return mapping[value] || "Monitor lane";
}

function formatMovementKindLabel(value) {
  const mapping = {
    handoff: "Handoff movement",
    approval: "Approval movement",
    workflow: "Workflow movement",
  };
  return mapping[value] || "Movement";
}

function formatTransitionStateLabel(value) {
  return value === "in_flight" ? "In transit" : "Arrived";
}

function shortAgentLabel(agent) {
  const mapping = {
    "CEO Agent": "Desk",
    "Risk and Compliance Agent": "Source",
    "Operations Coordinator Agent": "Ops",
    "Department Operator Agent": "Sales",
  };
  return mapping[agent] || String(agent || "Agent");
}

function describeRole(agent) {
  const mapping = {
    "CEO Agent": {
      responsibility: "Owns approvals, priority setting, and final operating direction.",
      avatar: "Appears watchful when approvals stack up and steadier when the lanes are flowing.",
      flow: "Sits at the approval and escalation hinge between sourcing decisions and execution.",
    },
    "Risk and Compliance Agent": {
      responsibility: "Owns seller checks, evidence review, and verification blockers.",
      avatar: "Appears cautious when verification is incomplete and active when evidence is moving.",
      flow: "Catches weak listings early and hands cleared opportunities toward approval.",
    },
    "Operations Coordinator Agent": {
      responsibility: "Owns acquisition readiness, routing, and execution handoff.",
      avatar: "Appears busy when acquisitions are cleared and tense when blocked upstream.",
      flow: "Bridges approved opportunities into execution and downstream market work.",
    },
    "Department Operator Agent": {
      responsibility: "Owns listing, monetization, and active market-facing follow-through.",
      avatar: "Appears active when inventory is routed and quieter when no sellable units are ready.",
      flow: "Carries routed opportunities through listing and monetization.",
    },
  };
  return (
    mapping[agent] || {
      responsibility: "Owns a shared operating responsibility.",
      avatar: "Appears according to current task load and blockers.",
      flow: "Supports the live company flow.",
    }
  );
}

function getLaneStageForAgent(agent) {
  const mapping = {
    "CEO Agent": "approval",
    "Risk and Compliance Agent": "verification",
    "Operations Coordinator Agent": "execution",
    "Department Operator Agent": "market",
  };
  return mapping[agent] || "monitor";
}

function getTopLaneOpportunity(agent) {
  const laneStage = getLaneStageForAgent(agent);
  return (
    (state.snapshot.workflow.opportunities || []).find(
      (entry) => mapStatusToLaneStage(entry.current_status) === laneStage
    ) || null
  );
}

function getLaneActiveCount(agent) {
  const laneStage = getLaneStageForAgent(agent);
  return (state.snapshot.workflow.opportunities || []).filter(
    (entry) => mapStatusToLaneStage(entry.current_status) === laneStage
  ).length;
}

function getLaneEmptyCopy(agent) {
  const mapping = {
    "CEO Agent": "Waiting on qualified opportunities that need approval.",
    "Risk and Compliance Agent": "Waiting on new sourcing and verification tasks.",
    "Operations Coordinator Agent": "Waiting on approved opportunities from Decision Desk.",
    "Department Operator Agent": "Waiting on routed opportunities from Ops and Diagnostics.",
  };
  return mapping[agent] || "Waiting on lane-owned work.";
}

function normalizeCurrentFocusNextStep(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Reviewing owned queue.";
  }
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("blocked by") ||
    lower.startsWith("waiting on") ||
    lower.startsWith("needs approval") ||
    lower.startsWith("reviewing")
  ) {
    return raw;
  }
  return `Reviewing: ${raw.charAt(0).toLowerCase()}${raw.slice(1)}`;
}

function buildCurrentFocusModel({
  ownedBy,
  opportunityId,
  visualState,
  nextStep,
}) {
  return {
    ownedBy: ownedBy || "Unassigned",
    opportunityId: opportunityId || "None",
    visualState: visualState || "idle",
    nextStep: normalizeCurrentFocusNextStep(nextStep),
  };
}

function renderCurrentFocusStrip(focus) {
  return `
    <section class="detail-section current-focus-strip">
      <div class="current-focus-item">
        <p class="eyebrow">Currently owned by</p>
        <strong>${escapeHtml(focus.ownedBy)}</strong>
      </div>
      <div class="current-focus-item">
        <p class="eyebrow">Opportunity</p>
        <strong>${escapeHtml(focus.opportunityId)}</strong>
      </div>
      <div class="current-focus-item">
        <p class="eyebrow">Visual state</p>
        <span class="status-pill ${formatStatusClass(focus.visualState)}">${escapeHtml(
    formatVisualStateLabel(focus.visualState)
  )}</span>
      </div>
      <div class="current-focus-item">
        <p class="eyebrow">Next step or blocker</p>
        <strong>${escapeHtml(focus.nextStep)}</strong>
      </div>
    </section>
  `;
}

function buildWhyThisMattersNow({
  isBlocked,
  needsApproval,
  dueBy,
  handoffTarget,
  fallbackReason,
}) {
  if (isBlocked) {
    return "Work is blocked, so ownership cannot progress until the blocker clears.";
  }
  if (needsApproval) {
    return "Approval is required before this can move to the next owner lane.";
  }
  if (dueBy) {
    return `Handoff urgency: this should move by ${formatTimestamp(dueBy)}${handoffTarget ? ` to ${handoffTarget}` : ""}.`;
  }
  return fallbackReason || "Keeping this moving prevents idle queue time between lanes.";
}

function normalizeOneLineSummary(value, fallback) {
  const raw = String(value || "").trim();
  return raw || fallback;
}

function renderSupportContextSection(capitalStrategy, capitalFit) {
  if (!capitalStrategy) {
    return `
      <section class="detail-section detail-section-support">
        <h3>Support context</h3>
        <p class="muted">No active support posture is changing this lane right now.</p>
      </section>
    `;
  }
  return `
    <section class="detail-section detail-section-support">
      <h3>Support context</h3>
      <ul class="detail-list">
        <li>Capital mode: ${escapeHtml(capitalStrategy.capital_mode)}</li>
        <li>Posture reason: ${escapeHtml(capitalStrategy.capital_mode_reason)}</li>
        ${
          capitalFit
            ? `<li>Opportunity fit: ${escapeHtml(formatCapitalFitLabel(capitalFit.stance))}</li>
               <li>Fit rationale: ${escapeHtml(capitalFit.reason || "No fit note available.")}</li>`
            : ""
        }
      </ul>
    </section>
  `;
}

function getLaneDominantMessage(card, presence, opportunity) {
  const normalizeAction = (value) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return "Reviewing owned queue.";
    }
    const lower = raw.toLowerCase();
    if (lower.startsWith("blocked by")) {
      return raw;
    }
    if (lower.startsWith("waiting on")) {
      return raw;
    }
    if (lower.startsWith("needs approval")) {
      return raw;
    }
    if (lower.startsWith("reviewing")) {
      return raw;
    }
    return `Reviewing: ${raw.charAt(0).toLowerCase()}${raw.slice(1)}`;
  };
  if (card.blocker) {
    return { label: "Top blocker", text: `Blocked by: ${card.blocker}`, tone: "blocked" };
  }
  if (
    opportunity &&
    opportunity.workflow_record &&
    opportunity.workflow_record.purchase_recommendation_blocked
  ) {
    return {
      label: "Top blocker",
      text: "Blocked by: purchase recommendation remains blocked.",
      tone: "blocked",
    };
  }
  if (card.status === "awaiting_approval") {
    return {
      label: "Needs approval",
      text: `Needs approval: ${String(card.active_task || "Decision required.").replace(/\.$/, "")}.`,
      tone: "approval",
    };
  }
  if (opportunity && opportunity.latest_task && opportunity.latest_task.next_action) {
    return {
      label: "Next action",
      text: normalizeAction(opportunity.latest_task.next_action),
      tone: "active",
    };
  }
  if (presence && presence.bubble_text) {
    return {
      label: presence.bubble_label || "Next action",
      text: normalizeAction(presence.bubble_text),
      tone: "active",
    };
  }
  return { label: "Next action", text: normalizeAction(card.active_task), tone: "active" };
}

function summarizeOperationalFlow() {
  const opportunities = state.snapshot.workflow.opportunities || [];
  const lanes = [
    {
      key: "verification",
      label: "Verification",
      statuses: new Set(["awaiting_seller_verification", "researching"]),
    },
    {
      key: "approval",
      label: "Approval",
      statuses: new Set(["awaiting_approval"]),
    },
    {
      key: "execution",
      label: "Execution",
      statuses: new Set(["approved", "acquired"]),
    },
    {
      key: "market",
      label: "Market",
      statuses: new Set(["routed", "monetizing"]),
    },
  ];

  return lanes.map((lane) => {
    const entries = opportunities.filter((entry) => lane.statuses.has(entry.current_status));
    const owners = [...new Set(entries.map((entry) => opportunityTaskOwner(entry)).filter(Boolean))];
    return {
      ...lane,
      count: entries.length,
      lead: owners.length ? owners.map((item) => shortAgentLabel(item)).join(" | ") : "Idle",
      opportunities: entries.slice(0, 3).map((entry) => entry.opportunity_id),
    };
  });
}

function getRecentOperatingEvents(limit = 4) {
  const events = state.snapshot.office.events || [];
  return events
    .filter((event) =>
      ["handoff_started", "handoff_completed", "lane_changed", "approval_waiting", "approval_resolved"].includes(
        event.type
      )
    )
    .slice(0, limit);
}

function findAgentByName(name) {
  return state.snapshot.office.agent_status_cards.find((card) => card.agent === name) || null;
}

function findPresenceByAgent(name) {
  return state.snapshot.office.presence.find((entry) => entry.agent === name) || null;
}

function findZoneAnchorById(zoneId) {
  return (
    (state.snapshot.office.zone_anchors || []).find((entry) => entry.zone_id === zoneId) || null
  );
}

function findOpportunityById(opportunityId) {
  return (
    state.snapshot.workflow.opportunities.find((entry) => entry.opportunity_id === opportunityId) ||
    null
  );
}

function findOpportunityByIdInSnapshot(snapshot, opportunityId) {
  if (!snapshot || !snapshot.workflow || !Array.isArray(snapshot.workflow.opportunities)) {
    return null;
  }
  return (
    snapshot.workflow.opportunities.find((entry) => entry.opportunity_id === opportunityId) || null
  );
}

function findApprovalQueueItem(snapshot, ticketId) {
  if (!snapshot || !snapshot.approval_queue || !Array.isArray(snapshot.approval_queue.items)) {
    return null;
  }
  return snapshot.approval_queue.items.find((item) => item && item.ticket_id === ticketId) || null;
}

function findPendingApprovalQueueItemByOpportunity(snapshot, opportunityId) {
  if (
    !snapshot ||
    !snapshot.approval_queue ||
    !Array.isArray(snapshot.approval_queue.items) ||
    !opportunityId
  ) {
    return null;
  }
  return (
    snapshot.approval_queue.items.find(
      (item) =>
        item &&
        item.opportunity_id === opportunityId &&
        normalizeToken(item.status) === "pending"
    ) || null
  );
}

function findOfficeEventById(snapshot, eventId) {
  if (!snapshot || !snapshot.office || !Array.isArray(snapshot.office.events)) {
    return null;
  }
  return snapshot.office.events.find((event) => event && event.event_id === eventId) || null;
}

function findDecisionResolvedEvent(snapshot, ticketId) {
  if (!snapshot || !snapshot.office || !Array.isArray(snapshot.office.events)) {
    return null;
  }
  return (
    snapshot.office.events.find(
      (event) =>
        event &&
        event.type === "approval_resolved" &&
        event.ticket_id === ticketId
    ) || null
  );
}

function getMovementIntentById(intentId) {
  if (!state.snapshot || !intentId) {
    return null;
  }
  return (
    (state.snapshot.office.movement_intents || []).find((intent) => intent.intent_id === intentId) ||
    null
  );
}

function opportunityTaskOwner(opportunity) {
  if (!opportunity) {
    return null;
  }
  const latestTask = opportunity.latest_task;
  if (latestTask && typeof latestTask.owner === "string" && latestTask.owner) {
    return latestTask.owner;
  }
  const handoff = opportunity.contract_bundle && opportunity.contract_bundle.handoff_packet;
  if (handoff && typeof handoff.to_agent === "string" && handoff.to_agent) {
    return handoff.to_agent;
  }
  return null;
}

function resolveOpportunityFollowThroughText(entry) {
  if (!entry) {
    return "Awaiting workflow update.";
  }
  const handoffPacket = entry.contract_bundle && entry.contract_bundle.handoff_packet;
  const recommendation = entry.operational_recommendation || null;
  const handoff = entry.operational_handoff || null;
  const execution = entry.operational_execution || null;
  const market = entry.operational_market || null;
  const route = entry.operational_route || null;
  const intakePriority = entry.operational_intake_priority || null;
  const sellthrough = entry.operational_sellthrough || null;
  const capacity = entry.operational_capacity || null;
  const policy = entry.operational_policy || null;
  const quality = entry.operational_opportunity_quality || null;
  const nextAction = recommendation
    ? recommendation.next_action
    : (entry.latest_task && entry.latest_task.next_action) ||
      (handoffPacket && handoffPacket.next_action) ||
      "Awaiting workflow update.";

  return policy &&
    new Set(["policy_review_required", "policy_restricted", "policy_blocked"]).has(
      policy.policy_state
    ) &&
    policy.policy_next_step
    ? policy.policy_next_step
    : quality &&
      new Set(["quality_uncertain", "quality_weak"]).has(quality.opportunity_quality_state) &&
      quality.opportunity_quality_next_step
      ? quality.opportunity_quality_next_step
      : intakePriority &&
        new Set(["priority_now", "priority_defer"]).has(intakePriority.intake_priority_state) &&
        intakePriority.intake_priority_next_step
        ? intakePriority.intake_priority_next_step
        : sellthrough &&
          new Set(["sellthrough_slow", "sellthrough_stale", "sellthrough_hold"]).has(
            sellthrough.sellthrough_state
          ) &&
          sellthrough.sellthrough_next_step
          ? sellthrough.sellthrough_next_step
          : capacity &&
            new Set(["capacity_constrained", "capacity_overloaded", "capacity_hold"]).has(
              capacity.capacity_state
            ) &&
            capacity.capacity_next_step
            ? capacity.capacity_next_step
            : route && route.operator_route_next_step
              ? route.operator_route_next_step
              : market && market.market_next_step
                ? market.market_next_step
                : execution && execution.execution_next_step
                  ? execution.execution_next_step
                  : handoff && handoff.current_owner_action
                    ? handoff.current_owner_action
                    : nextAction;
}

function getPendingApprovalExposureTotal(snapshot) {
  if (!snapshot || !snapshot.approval_queue || !Array.isArray(snapshot.approval_queue.items)) {
    return 0;
  }
  return snapshot.approval_queue.items
    .filter((item) => item && normalizeToken(item.status) === "pending" && item.ticket)
    .reduce((sum, item) => sum + (Number(item.ticket.max_exposure_usd) || 0), 0);
}

function classifyCapitalModeForSnapshot(accountSnapshot, pendingExposure) {
  if (!accountSnapshot) {
    return null;
  }
  const available = Number(accountSnapshot.available_usd) || 0;
  const reserved = Number(accountSnapshot.reserved_usd) || 0;
  const committed = Number(accountSnapshot.committed_usd) || 0;

  if (available <= 300 || pendingExposure > available || committed > available) {
    return "recovery";
  }
  if (
    available <= 1000 ||
    pendingExposure >= available * 0.5 ||
    reserved + committed >= Math.max(200, available * 0.75)
  ) {
    return "constrained";
  }
  return "normal";
}

function capitalModeRank(mode) {
  const ranking = {
    recovery: 0,
    constrained: 1,
    normal: 2,
  };
  return ranking[normalizeToken(mode)] ?? -1;
}

function formatOperationalNextState(state) {
  const labels = {
    ready: "Ready",
    waiting: "Waiting",
    blocked: "Blocked",
    moving: "Moving",
  };
  return labels[normalizeToken(state)] || "Waiting";
}

function buildOperationalNextSummary(next) {
  if (!next) {
    return "";
  }
  const owner = next.owner || "Unassigned";
  const stateLabel = formatOperationalNextState(next.state).toLowerCase();
  const waitingOn = next.waiting_on ? ` on ${next.waiting_on}` : "";
  const movementText = next.movement_in_flight ? " Movement is already in flight." : "";
  if (normalizeToken(next.state) === "ready") {
    return `${owner} is ready. Next: ${next.next_action || "Continue the current owner action."}${movementText}`;
  }
  return `${owner} is ${stateLabel}${waitingOn}. Next: ${
    next.next_action || "Continue the current owner action."
  }${next.ready_once ? ` Ready once: ${next.ready_once}` : ""}${movementText}`;
}

function buildCapitalDecisionSummary(snapshot, queueItem) {
  if (!snapshot || !queueItem || !queueItem.ticket) {
    return "";
  }

  const capitalControls = snapshot.capital_controls || null;
  const capitalStrategy = snapshot.capital_strategy || null;
  const accountSnapshot = capitalControls && capitalControls.account_snapshot
    ? capitalControls.account_snapshot
    : null;
  const exposureUsd = Number(queueItem.ticket.max_exposure_usd) || 0;
  const currentPendingExposure = getPendingApprovalExposureTotal(snapshot);

  const exposureText =
    exposureUsd > 0
      ? `${formatCurrency(exposureUsd)} approval exposure left the pending queue.`
      : "Pending approval exposure is no longer sitting in the queue.";

  if (!accountSnapshot || !capitalStrategy) {
    return `${exposureText} No live ledger-backed posture snapshot is available in this workspace.`;
  }

  const previousMode = classifyCapitalModeForSnapshot(
    accountSnapshot,
    currentPendingExposure + exposureUsd
  );
  const currentMode = normalizeToken(capitalStrategy.capital_mode);
  let postureText = `Posture remains ${formatStrategyLabel(capitalStrategy.capital_mode)}.`;
  if (previousMode && previousMode !== currentMode) {
    const shiftedLooser = capitalModeRank(currentMode) > capitalModeRank(previousMode);
    postureText = `Posture ${shiftedLooser ? "loosened" : "tightened"} from ${formatStrategyLabel(
      previousMode
    )} to ${formatStrategyLabel(capitalStrategy.capital_mode)}.`;
  }

  const pursuitText =
    Array.isArray(capitalStrategy.recommended_actions) && capitalStrategy.recommended_actions[0]
      ? capitalStrategy.recommended_actions[0]
      : `Office favors ${formatStrategyLabel(
          (capitalStrategy.approved_strategy_priorities || [])[0] || "monitor"
        )}.`;

  return `${exposureText} UI approval decisions do not move ledger capital directly; capital now reads ${formatCurrency(
    accountSnapshot.available_usd
  )} available, ${formatCurrency(accountSnapshot.reserved_usd)} reserved, and ${formatCurrency(
    accountSnapshot.committed_usd
  )} committed. ${postureText} ${pursuitText}`;
}

function buildDecisionFollowThrough(snapshot, ticketId, fallbackDecision) {
  const queueItem = findApprovalQueueItem(snapshot, ticketId);
  const resolvedEvent = findDecisionResolvedEvent(snapshot, ticketId);
  const decision = normalizeToken(
    (queueItem && queueItem.status) || (resolvedEvent && resolvedEvent.decision) || fallbackDecision
  );
  const opportunityId =
    (queueItem && queueItem.opportunity_id) || (resolvedEvent && resolvedEvent.opportunity_id) || null;
  const opportunity = opportunityId ? findOpportunityByIdInSnapshot(snapshot, opportunityId) : null;
  const movementIntent =
    resolvedEvent && snapshot && snapshot.office && Array.isArray(snapshot.office.movement_intents)
      ? snapshot.office.movement_intents.find(
          (intent) => intent && intent.trigger_event_id === resolvedEvent.event_id
        ) || null
      : null;
  const nextOwner =
    (movementIntent && movementIntent.to_agent) ||
    (resolvedEvent && resolvedEvent.to_agent) ||
    (queueItem && queueItem.resume_owner) ||
    null;
  const nextStep = resolveOpportunityFollowThroughText(opportunity);
  const capitalSummary = buildCapitalDecisionSummary(snapshot, queueItem);

  if (decision === "approve") {
    return {
      message: `Approved ${ticketId}. ${
        opportunityId && nextOwner
          ? `${opportunityId} moved to ${nextOwner}.`
          : "The opportunity advanced to the next owner."
      }${nextStep ? ` Next: ${nextStep}` : ""}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`,
      intentId: movementIntent ? movementIntent.intent_id : null,
    };
  }
  if (decision === "reject") {
    return {
      message: `Rejected ${ticketId}. ${
        opportunityId && nextOwner
          ? `${opportunityId} moved back to ${nextOwner}.`
          : "The opportunity moved back for follow-up."
      }${nextStep ? ` Next: ${nextStep}` : ""}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`,
      intentId: movementIntent ? movementIntent.intent_id : null,
    };
  }
  if (decision === "request_more_info") {
    return {
      message: `Requested more info for ${ticketId}. ${
        opportunityId && nextOwner
          ? `${opportunityId} returned to ${nextOwner}.`
          : "The opportunity stayed open for follow-up."
      }${nextStep ? ` Next: ${nextStep}` : ""}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`,
      intentId: movementIntent ? movementIntent.intent_id : null,
    };
  }
  return {
    message: `Recorded ${formatDecisionLabel(fallbackDecision)} for ${ticketId}.`,
    intentId: movementIntent ? movementIntent.intent_id : null,
  };
}

function buildResolvedQueueOutcome(snapshot, item) {
  if (!item || normalizeToken(item.status) === "pending") {
    return "";
  }
  const resolvedEvent = findDecisionResolvedEvent(snapshot, item.ticket_id);
  const movementIntent =
    resolvedEvent && snapshot && snapshot.office && Array.isArray(snapshot.office.movement_intents)
      ? snapshot.office.movement_intents.find(
          (intent) => intent && intent.trigger_event_id === resolvedEvent.event_id
        ) || null
      : null;
  const nextOwner =
    (movementIntent && movementIntent.to_agent) ||
    (resolvedEvent && resolvedEvent.to_agent) ||
    item.resume_owner ||
    "next owner";
  const opportunity = item.opportunity_id
    ? findOpportunityByIdInSnapshot(snapshot, item.opportunity_id)
    : null;
  const nextStep = resolveOpportunityFollowThroughText(opportunity);
  const decision = normalizeToken(item.status);
  const capitalSummary = buildCapitalDecisionSummary(snapshot, item);

  if (decision === "approve") {
    return `Moved to ${nextOwner}. Next: ${nextStep}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`;
  }
  if (decision === "reject") {
    return `Moved back to ${nextOwner}. Next: ${nextStep}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`;
  }
  if (decision === "request_more_info") {
    return `Returned to ${nextOwner}. Next: ${nextStep}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`;
  }
  return `Decision recorded. Next: ${nextStep}${capitalSummary ? ` Capital: ${capitalSummary}` : ""}`;
}

function buildSignalKey(signal) {
  return [
    signal.opportunity_id,
    signal.from_agent,
    signal.to_agent,
    signal.next_action,
    signal.due_by,
  ]
    .map((item) => normalizeToken(item || ""))
    .join("|");
}

function buildMovementIntentKey(opportunityId, fromZoneId, toZoneId) {
  return [opportunityId || "", fromZoneId || "", toZoneId || ""]
    .map((item) => normalizeToken(item))
    .join("|");
}

function sortHandoffSignalsDeterministic(items) {
  return [...(items || [])].sort((a, b) => {
    const aDue = Date.parse((a && a.due_by) || 0);
    const bDue = Date.parse((b && b.due_by) || 0);
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    const aTime = Date.parse((a && a.trigger_timestamp) || 0);
    const bTime = Date.parse((b && b.trigger_timestamp) || 0);
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    const aKey = `${(a && a.opportunity_id) || ""}|${(a && a.from_agent) || ""}|${(a && a.to_agent) || ""}`;
    const bKey = `${(b && b.opportunity_id) || ""}|${(b && b.from_agent) || ""}|${(b && b.to_agent) || ""}`;
    return aKey.localeCompare(bKey);
  });
}

function computeTransitionState(previousSnapshot, nextSnapshot) {
  const transitions = createEmptyTransitionState();
  if (!previousSnapshot || !nextSnapshot) {
    return transitions;
  }

  const prevOppById = new Map(
    (previousSnapshot.workflow.opportunities || []).map((entry) => [entry.opportunity_id, entry])
  );
  const prevPresenceByAgent = new Map(
    (previousSnapshot.office.presence || []).map((entry) => [entry.agent, entry])
  );
  const prevSignalKeys = new Set(
    (previousSnapshot.office.handoff_signals || []).map((entry) => buildSignalKey(entry))
  );
  const prevFlowEventIds = new Set(
    ((previousSnapshot.office.events && previousSnapshot.office.events.length
      ? previousSnapshot.office.events
      : previousSnapshot.office.flow_events) || [])
      .map((entry) => entry && entry.event_id)
      .filter(Boolean)
  );
  const handoffByKey = new Map();

  for (const nextOpportunity of nextSnapshot.workflow.opportunities || []) {
    const prevOpportunity = prevOppById.get(nextOpportunity.opportunity_id);
    if (!prevOpportunity) {
      continue;
    }

    const prevOwner = opportunityTaskOwner(prevOpportunity);
    const nextOwner = opportunityTaskOwner(nextOpportunity);
    if (prevOwner && nextOwner && prevOwner !== nextOwner) {
      const signal = {
        opportunity_id: nextOpportunity.opportunity_id,
        from_agent: prevOwner,
        to_agent: nextOwner,
        next_action:
          (nextOpportunity.latest_task && nextOpportunity.latest_task.next_action) ||
          (nextOpportunity.contract_bundle &&
            nextOpportunity.contract_bundle.handoff_packet &&
            nextOpportunity.contract_bundle.handoff_packet.next_action) ||
          "Ownership transfer",
        due_by:
          (nextOpportunity.latest_task && nextOpportunity.latest_task.due_by) ||
          (nextOpportunity.contract_bundle &&
            nextOpportunity.contract_bundle.handoff_packet &&
            nextOpportunity.contract_bundle.handoff_packet.due_by) ||
          null,
        blocking_count:
          nextOpportunity.workflow_record &&
          nextOpportunity.workflow_record.purchase_recommendation_blocked
            ? 1
            : 0,
        source_stale: Boolean(
          nextOpportunity.latest_artifact && nextOpportunity.latest_artifact.is_stale
        ),
        is_transition: true,
      };
      handoffByKey.set(buildSignalKey(signal), signal);
    }

    if (prevOpportunity.current_status !== nextOpportunity.current_status) {
      transitions.laneShiftOpportunities.add(nextOpportunity.opportunity_id);
    }
  }

  for (const signal of nextSnapshot.office.handoff_signals || []) {
    const key = buildSignalKey(signal);
    if (prevSignalKeys.has(key)) {
      continue;
    }
    handoffByKey.set(key, {
      ...signal,
      is_transition: true,
    });
  }

  for (const presence of nextSnapshot.office.presence || []) {
    const prevPresence = prevPresenceByAgent.get(presence.agent);
    if (!prevPresence) {
      continue;
    }
    if (prevPresence.opportunity_id !== presence.opportunity_id) {
      transitions.focusShiftAgents.add(presence.agent);
    }
    if (prevPresence.lane_stage !== presence.lane_stage) {
      transitions.laneShiftAgents.add(presence.agent);
    }
  }

  transitions.handoffs = [...handoffByKey.values()]
    .sort((a, b) => Date.parse(a.due_by || 0) - Date.parse(b.due_by || 0))
    .slice(0, 4);
  const incomingEvents =
    (nextSnapshot.office.events && nextSnapshot.office.events.length
      ? nextSnapshot.office.events
      : nextSnapshot.office.flow_events) || [];
  for (const event of incomingEvents) {
    if (!event || !event.event_id) {
      continue;
    }
    if (!prevFlowEventIds.has(event.event_id)) {
      transitions.newFlowEventIds.add(event.event_id);
    }
  }
  transitions.generatedAt = Date.now();
  return transitions;
}

function setTransitionState(nextTransitionState) {
  state.transitions = nextTransitionState;
  if (state.transitionTimerId !== null) {
    window.clearTimeout(state.transitionTimerId);
    state.transitionTimerId = null;
  }

  const hasSignals =
    nextTransitionState.handoffs.length > 0 ||
    nextTransitionState.focusShiftAgents.size > 0 ||
    nextTransitionState.laneShiftAgents.size > 0 ||
    nextTransitionState.laneShiftOpportunities.size > 0 ||
    nextTransitionState.newFlowEventIds.size > 0;

  if (!hasSignals) {
    return;
  }

  state.transitionTimerId = window.setTimeout(() => {
    state.transitions = createEmptyTransitionState();
    if (state.snapshot) {
      renderOfficeCanvas();
    }
  }, TRANSITION_WINDOW_MS);
}

function getActiveTransitionState() {
  if (!state.transitions.generatedAt) {
    return createEmptyTransitionState();
  }
  if (Date.now() - state.transitions.generatedAt > TRANSITION_WINDOW_MS) {
    return createEmptyTransitionState();
  }
  return state.transitions;
}

function resolveSignalZoneIds(signal) {
  const fromZoneId =
    signal.from_zone_id ||
    (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.from_agent)
      ?.zone_id ||
    null;
  const toZoneId =
    signal.to_zone_id ||
    (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.to_agent)
      ?.zone_id ||
    null;
  return { fromZoneId, toZoneId };
}

function getMovementIntentLookup() {
  const lookup = new Map();
  for (const intent of state.snapshot.office.movement_intents || []) {
    if (!intent || !intent.opportunity_id || !intent.from_zone_id || !intent.to_zone_id) {
      continue;
    }
    lookup.set(
      buildMovementIntentKey(intent.opportunity_id, intent.from_zone_id, intent.to_zone_id),
      intent
    );
  }
  return lookup;
}

function withMovementIntent(signal, isTransitionDefault, movementIntentLookup) {
  const { fromZoneId, toZoneId } = resolveSignalZoneIds(signal);
  const intent = movementIntentLookup.get(
    buildMovementIntentKey(signal.opportunity_id, fromZoneId, toZoneId)
  );
  return {
    ...signal,
    intent_id: intent ? intent.intent_id : signal.intent_id || null,
    from_zone_id: fromZoneId,
    to_zone_id: toZoneId,
    is_transition: intent
      ? intent.transition_state === "in_flight"
      : Boolean(isTransitionDefault),
    waypoints:
      intent && Array.isArray(intent.waypoints) ? intent.waypoints : signal.waypoints || null,
    duration_ms: intent ? intent.duration_ms : null,
    trigger_timestamp: intent ? intent.trigger_timestamp : signal.trigger_timestamp || null,
    transition_state: intent
      ? intent.transition_state
      : isTransitionDefault
        ? "in_flight"
        : "arrived",
    trigger_type: intent ? intent.trigger_type : null,
  };
}

function getRenderableHandoffs(activeTransitions) {
  const movementIntentLookup = getMovementIntentLookup();

  if (activeTransitions.handoffs.length) {
    return sortHandoffSignalsDeterministic(
      activeTransitions.handoffs.map((signal) =>
      withMovementIntent(signal, true, movementIntentLookup)
      )
    ).slice(0, V1_BOARD_CONTRACT.maxVisibleHandoffs);
  }

  if ((state.snapshot.office.movement_intents || []).length) {
    return sortHandoffSignalsDeterministic((state.snapshot.office.movement_intents || [])).slice(
      0,
      V1_BOARD_CONTRACT.maxVisibleHandoffs
    ).map((intent) => ({
      intent_id: intent.intent_id,
      opportunity_id: intent.opportunity_id,
      from_agent: intent.from_agent,
      to_agent: intent.to_agent,
      from_zone_id: intent.from_zone_id,
      to_zone_id: intent.to_zone_id,
      blocking_count: intent.blocking_count || 0,
      is_transition: intent.transition_state === "in_flight",
      waypoints: intent.waypoints,
      duration_ms: intent.duration_ms,
      trigger_timestamp: intent.trigger_timestamp,
      transition_state: intent.transition_state,
      trigger_type: intent.trigger_type,
    }));
  }

  return sortHandoffSignalsDeterministic(state.snapshot.office.handoff_signals || [])
    .slice(0, V1_BOARD_CONTRACT.maxVisibleHandoffs)
    .map((signal) => ({
      ...withMovementIntent(signal, false, movementIntentLookup),
    }));
}

function buildLaneCardV1Model(presence, card, topOpportunity) {
  const dominantMessage = getLaneDominantMessage(card, presence, topOpportunity);
  const activeCount = getLaneActiveCount(presence.agent);
  const laneCard = {
    avatar: {
      agent: presence.agent,
      monogram: presence.avatar_monogram,
      visual_state: presence.visual_state || "idle",
    },
    lane_label: presence.zone_label,
    active_count: activeCount,
    top_live_item: {
      id: topOpportunity ? topOpportunity.opportunity_id : "No active owned item",
      summary:
        topOpportunity &&
        topOpportunity.contract_bundle &&
        topOpportunity.contract_bundle.opportunity_record &&
        topOpportunity.contract_bundle.opportunity_record.device_summary
          ? topOpportunity.contract_bundle.opportunity_record.device_summary
          : topOpportunity
            ? topOpportunity.current_status
            : "This lane is clear right now.",
      status: topOpportunity ? topOpportunity.current_status : null,
    },
    blocker_or_next_action: {
      label: dominantMessage.label,
      text: dominantMessage.text,
      tone: dominantMessage.tone,
    },
  };
  const keys = Object.keys(laneCard);
  const allowedKeys = V1_BOARD_CONTRACT.laneCardKeys;
  if (
    keys.length !== allowedKeys.length ||
    !allowedKeys.every((key) => Object.prototype.hasOwnProperty.call(laneCard, key))
  ) {
    throw new Error("laneCardV1 shape drift detected");
  }
  return laneCard;
}

function buildOpportunityCardV1Model(entry) {
  const record = entry.contract_bundle && entry.contract_bundle.opportunity_record;
  const handoffPacket = entry.contract_bundle && entry.contract_bundle.handoff_packet;
  const workflow = entry.workflow_record || null;
  const recommendation = entry.operational_recommendation || null;
  const handoff = entry.operational_handoff || null;
  const execution = entry.operational_execution || null;
  const market = entry.operational_market || null;
  const route = entry.operational_route || null;
  const intakePriority = entry.operational_intake_priority || null;
  const sellthrough = entry.operational_sellthrough || null;
  const capacity = entry.operational_capacity || null;
  const policy = entry.operational_policy || null;
  const quality = entry.operational_opportunity_quality || null;
  const ownerAgent = opportunityTaskOwner(entry) || (handoffPacket && handoffPacket.to_agent) || null;
  const ownerPresence = ownerAgent ? findPresenceByAgent(ownerAgent) : null;
  const isBlocked = Boolean(
    (workflow && workflow.purchase_recommendation_blocked) || normalizeToken(entry.current_status) === "blocked"
  );
  const nextAction = recommendation
    ? recommendation.next_action
    : (entry.latest_task && entry.latest_task.next_action) ||
      (handoffPacket && handoffPacket.next_action) ||
      "Awaiting workflow update.";
  const nextActionLine = `Next: ${nextAction}`;
  const resolvedNextAction = resolveOpportunityFollowThroughText(entry);

  return {
    primary_id: entry.opportunity_id,
    summary_line: (record && record.device_summary) || entry.source || "No summary available.",
    action_line: isBlocked
      ? `Blocked by: ${
          recommendation && recommendation.recommendation_reason
            ? recommendation.recommendation_reason
            : "purchase recommendation remains blocked."
        }`
      : resolvedNextAction === nextAction
        ? nextActionLine
        : `Next: ${resolvedNextAction}`,
    owner_lane_label: ownerPresence
      ? ownerPresence.zone_label
      : formatLaneLabel(mapStatusToLaneStage(entry.current_status)),
    is_selected: Boolean(
      state.selected &&
        state.selected.type === "opportunity" &&
        state.selected.id === entry.opportunity_id
    ),
  };
}

function isFreshMovementSignal(signal) {
  if (!signal || !signal.trigger_timestamp || !state.snapshot || !state.snapshot.generated_at) {
    return false;
  }
  const triggerAt = Date.parse(signal.trigger_timestamp);
  const generatedAt = Date.parse(state.snapshot.generated_at);
  if (Number.isNaN(triggerAt) || Number.isNaN(generatedAt)) {
    return false;
  }
  const ageMs = Math.max(0, generatedAt - triggerAt);
  const maxAgeMs = Math.max(
    TRANSITION_WINDOW_MS,
    Number.isFinite(signal.duration_ms) ? signal.duration_ms * 3 : 0
  );
  return ageMs <= maxAgeMs;
}

function resolveSelectionForSnapshot(nextSnapshot, currentSelected, previousSnapshot = null) {
  if (!nextSnapshot) {
    return null;
  }

  const nextOpportunities = nextSnapshot.workflow && nextSnapshot.workflow.opportunities
    ? nextSnapshot.workflow.opportunities
    : [];
  const nextAgentCards = nextSnapshot.office && nextSnapshot.office.agent_status_cards
    ? nextSnapshot.office.agent_status_cards
    : [];
  const nextPresence = nextSnapshot.office && nextSnapshot.office.presence
    ? nextSnapshot.office.presence
    : [];
  const nextOfficeViewZones =
    nextSnapshot.office &&
    nextSnapshot.office.office_view &&
    Array.isArray(nextSnapshot.office.office_view.zones)
      ? nextSnapshot.office.office_view.zones
      : [];
  const hasOpportunity = (opportunityId) =>
    nextOpportunities.some(
      (entry) => entry && entry.opportunity_id === opportunityId
    );
  const hasAgent = (agentName) =>
    nextAgentCards.some((card) => card && card.agent === agentName);

  if (
    currentSelected &&
    currentSelected.type === "opportunity" &&
    currentSelected.id &&
    hasOpportunity(currentSelected.id)
  ) {
    return currentSelected;
  }
  if (
    currentSelected &&
    currentSelected.type === "agent" &&
    currentSelected.id &&
    hasAgent(currentSelected.id)
  ) {
    return currentSelected;
  }

  if (
    currentSelected &&
    currentSelected.type === "opportunity" &&
    currentSelected.id &&
    previousSnapshot &&
    previousSnapshot.workflow &&
    Array.isArray(previousSnapshot.workflow.opportunities)
  ) {
    const previousOpportunity =
      previousSnapshot.workflow.opportunities.find(
        (entry) => entry && entry.opportunity_id === currentSelected.id
      ) || null;
    const previousOwner = opportunityTaskOwner(previousOpportunity);
    if (previousOwner) {
      const continuityByOwner = nextOpportunities.find(
        (entry) => opportunityTaskOwner(entry) === previousOwner
      );
      if (continuityByOwner && continuityByOwner.opportunity_id) {
        return { type: "opportunity", id: continuityByOwner.opportunity_id };
      }
    }
    const previousLaneStage = previousOpportunity
      ? mapStatusToLaneStage(previousOpportunity.current_status)
      : null;
    if (previousLaneStage) {
      const continuityByLane = nextOpportunities.find(
        (entry) => mapStatusToLaneStage(entry.current_status) === previousLaneStage
      );
      if (continuityByLane && continuityByLane.opportunity_id) {
        return { type: "opportunity", id: continuityByLane.opportunity_id };
      }
    }
  }

  if (
    currentSelected &&
    currentSelected.type === "agent" &&
    currentSelected.id &&
    previousSnapshot &&
    previousSnapshot.office &&
    Array.isArray(previousSnapshot.office.presence)
  ) {
    const previousPresence =
      previousSnapshot.office.presence.find(
        (entry) => entry && entry.agent === currentSelected.id
      ) || null;
    if (previousPresence && previousPresence.zone_id) {
      const continuityPresence = nextPresence.find(
        (entry) => entry && entry.zone_id === previousPresence.zone_id
      );
      if (continuityPresence && continuityPresence.agent && hasAgent(continuityPresence.agent)) {
        return { type: "agent", id: continuityPresence.agent };
      }

      const continuityZone = nextOfficeViewZones.find(
        (zone) => zone && zone.id === previousPresence.zone_id
      );
      if (
        continuityZone &&
        continuityZone.dominant_item_id &&
        hasOpportunity(continuityZone.dominant_item_id)
      ) {
        return { type: "opportunity", id: continuityZone.dominant_item_id };
      }
    }
  }

  const topOpportunityId =
    nextSnapshot.attention &&
    nextSnapshot.attention.top_task &&
    nextSnapshot.attention.top_task.opportunity_id &&
    hasOpportunity(nextSnapshot.attention.top_task.opportunity_id)
      ? nextSnapshot.attention.top_task.opportunity_id
      : null;
  if (topOpportunityId) {
    return { type: "opportunity", id: topOpportunityId };
  }

  if (nextOpportunities[0] && nextOpportunities[0].opportunity_id) {
    return { type: "opportunity", id: nextOpportunities[0].opportunity_id };
  }

  if (nextAgentCards[0] && nextAgentCards[0].agent) {
    return { type: "agent", id: nextAgentCards[0].agent };
  }

  return null;
}

function ensureSelection() {
  state.selected = resolveSelectionForSnapshot(state.snapshot, state.selected, null);
}

function setSelection(type, id) {
  state.selected = { type, id };
  state.detailFocusSection = null;
  state.sendBackComposerOpportunityId = null;
  render();
}

function clearShellMessage() {
  state.shellMessage = null;
  state.shellMessageLevel = "info";
}

function setShellMessage(message, level = "info", options = {}) {
  state.shellMessage = message;
  state.shellMessageLevel = level;
  if (state.shellMessageTimerId !== null) {
    window.clearTimeout(state.shellMessageTimerId);
    state.shellMessageTimerId = null;
  }
  const ttlMs = Number.isInteger(options.ttlMs) ? options.ttlMs : 0;
  if (ttlMs > 0) {
    state.shellMessageTimerId = window.setTimeout(() => {
      clearShellMessage();
      if (state.snapshot) {
        renderAttention();
      }
    }, ttlMs);
  }
}

function clearDecisionMessage() {
  state.decisionMessage = null;
  state.decisionMessageLevel = "info";
  state.lastDecisionRetry = null;
}

function setDecisionMessage(message, level = "info", options = {}) {
  state.decisionMessage = message;
  state.decisionMessageLevel = level;
  state.lastDecisionRetry = options.retry || null;
  if (state.decisionMessageTimerId !== null) {
    window.clearTimeout(state.decisionMessageTimerId);
    state.decisionMessageTimerId = null;
  }
  const ttlMs = Number.isInteger(options.ttlMs) ? options.ttlMs : 0;
  if (ttlMs > 0) {
    state.decisionMessageTimerId = window.setTimeout(() => {
      clearDecisionMessage();
      if (state.snapshot) {
        renderAttention();
        renderApprovalQueue();
      }
    }, ttlMs);
  }
}

function formatDecisionLabel(decision) {
  const labels = {
    approve: "Approve",
    reject: "Reject",
    request_more_info: "More Info",
  };
  return labels[decision] || decision;
}

function formatCapitalRequestStatus(value) {
  const labels = {
    requested: "Requested",
    executed: "Executed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };
  return labels[normalizeToken(value)] || String(value || "Unknown");
}

function buildDecisionConfirmMessage(ticketId, decision) {
  const label = formatDecisionLabel(decision);
  return `Submit ${label} decision for ${ticketId}?`;
}

function clearCapitalMessage() {
  state.capitalMessage = null;
  state.capitalMessageLevel = "info";
}

function setCapitalMessage(message, level = "info", options = {}) {
  state.capitalMessage = message;
  state.capitalMessageLevel = level;
  if (state.capitalMessageTimerId !== null) {
    window.clearTimeout(state.capitalMessageTimerId);
    state.capitalMessageTimerId = null;
  }
  const ttlMs = Number.isInteger(options.ttlMs) ? options.ttlMs : 0;
  if (ttlMs > 0) {
    state.capitalMessageTimerId = window.setTimeout(() => {
      clearCapitalMessage();
      if (state.snapshot) {
        renderBoard();
      }
    }, ttlMs);
  }
}

function isRetryableDecisionError(payload, statusCode) {
  if (!payload || typeof payload !== "object") {
    return statusCode >= 500;
  }
  if (typeof payload.retryable === "boolean") {
    return payload.retryable;
  }
  return statusCode >= 500;
}

function buildTimeoutError(ticketId, decision) {
  const error = new Error(
    `Decision request timed out for ${ticketId}. Retry ${formatDecisionLabel(decision)} or refresh.`
  );
  error.retryable = true;
  return error;
}

function buildCapitalTimeoutError(actionName) {
  const error = new Error(`${actionName} request timed out. Retry or refresh.`);
  error.retryable = true;
  return error;
}

function buildSendBackTimeoutError(opportunityId) {
  const error = new Error(`Send-back request timed out for ${opportunityId}. Retry or refresh.`);
  error.retryable = true;
  return error;
}

async function submitCapitalWithdrawalAction(url, payload, pendingMessage, successMessage) {
  if (state.capitalActionInFlight) {
    return false;
  }
  state.capitalActionInFlight = true;
  setCapitalMessage(pendingMessage, "info");
  renderBoard();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, CAPITAL_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data && data.message ? data.message : `Capital action failed (${response.status}).`);
    }
    setCapitalMessage(successMessage, "success", { ttlMs: CAPITAL_SUCCESS_MESSAGE_MS });
    await loadSnapshot();
    return true;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const normalizedError = isAbort ? buildCapitalTimeoutError("Capital") : error;
    setCapitalMessage(
      normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
      "error"
    );
    renderBoard();
    return false;
  } finally {
    window.clearTimeout(timeoutId);
    state.capitalActionInFlight = false;
    renderBoard();
  }
}

async function submitApprovalDecision(ticketId, decision, noteOverride = null) {
  if (state.decisionInFlight) {
    return;
  }
  state.decisionInFlight = true;
  setDecisionMessage(`Submitting ${formatDecisionLabel(decision)} for ${ticketId}...`, "info");
  renderAttention();
  renderApprovalQueue();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, DECISION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/approval-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        ticket_id: ticketId,
        decision,
        actor: "owner_operator",
        note:
          typeof noteOverride === "string" && noteOverride.trim()
            ? noteOverride.trim()
            : `Submitted from UI shell (${decision}).`,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const error = new Error(
        payload && payload.message
          ? payload.message
          : `Decision submission failed (${response.status}).`
      );
      error.retryable = isRetryableDecisionError(payload, response.status);
      throw error;
    }
    const nextSnapshot = await loadSnapshot();
    const followThrough = buildDecisionFollowThrough(nextSnapshot || state.snapshot, ticketId, decision);
    setDecisionMessage(followThrough.message, "success", { ttlMs: DECISION_SUCCESS_MESSAGE_MS });
    renderAttention();
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const normalizedError = isAbort ? buildTimeoutError(ticketId, decision) : error;
    const message =
      normalizedError instanceof Error ? normalizedError.message : String(normalizedError);
    const retryable =
      normalizedError instanceof Error && typeof normalizedError.retryable === "boolean"
        ? normalizedError.retryable
        : false;
    setDecisionMessage(message, "error", {
      retry: retryable ? { ticketId, decision } : null,
    });
    renderAttention();
  } finally {
    window.clearTimeout(timeoutId);
    state.decisionInFlight = false;
    renderApprovalQueue();
  }
}

async function submitOpportunitySendBack(opportunityId, reason) {
  if (state.sendBackInFlight) {
    return false;
  }
  state.sendBackInFlight = true;
  setShellMessage(`Sending ${opportunityId} back for more information...`, "info", {
    ttlMs: 9000,
  });
  renderAttention();
  renderDetailPanel();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, DECISION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/opportunity-send-back", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        opportunity_id: opportunityId,
        reason,
        actor: "owner_operator",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload && payload.message
          ? payload.message
          : `Send-back failed (${response.status}).`
      );
    }
    const nextSnapshot = await loadSnapshot();
    if (nextSnapshot && findOpportunityByIdInSnapshot(nextSnapshot, opportunityId)) {
      setSelection("opportunity", opportunityId);
    }
    setShellMessage(`Sent ${opportunityId} back to verification with a persisted reason.`, "success", {
      ttlMs: DECISION_SUCCESS_MESSAGE_MS,
    });
    renderAttention();
    return true;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const normalizedError = isAbort ? buildSendBackTimeoutError(opportunityId) : error;
    setShellMessage(
      normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
      "error",
      { ttlMs: 9000 }
    );
    renderAttention();
    renderDetailPanel();
    return false;
  } finally {
    window.clearTimeout(timeoutId);
    state.sendBackInFlight = false;
    renderDetailPanel();
  }
}

function renderKpis() {
  const cards = [
    {
      label: "Active opportunities",
      value: state.snapshot.kpis.active_opportunities,
      meta: `${state.snapshot.workflow.opportunities.length} tracked`,
    },
    {
      label: "Blocked",
      value: state.snapshot.kpis.blocked_opportunities,
      meta: "verification or approval blockers",
    },
    {
      label: "Awaiting approval",
      value: state.snapshot.kpis.approvals_waiting,
      meta: `${state.snapshot.approval_queue.totals.total} queue items total`,
    },
    {
      label: "Due soon",
      value: state.snapshot.kpis.due_soon_tasks,
      meta: `${state.snapshot.kpis.overdue_tasks} overdue`,
    },
    {
      label: "Queue health",
      value: state.snapshot.kpis.queue_health,
      meta: "approval lane signal",
    },
    {
      label: "Workflow health",
      value: state.snapshot.kpis.workflow_health || "N/A",
      meta: "lifecycle signal",
    },
  ];
  if (state.snapshot.capital_strategy) {
    cards.push({
      label: "Capital mode",
      value: formatStrategyLabel(state.snapshot.capital_strategy.capital_mode),
      meta: formatStrategyLabel(
        state.snapshot.capital_strategy.approved_strategy_priorities[0] || "monitor"
      ),
    });
  }

  elements.kpiStrip.replaceChildren();
  for (const card of cards) {
    const node = elements.kpiCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".kpi-label").textContent = card.label;
    node.querySelector(".kpi-value").textContent = card.value;
    node.querySelector(".kpi-meta").textContent = card.meta;
    elements.kpiStrip.appendChild(node);
  }
}

function renderPresenceMeta(presence) {
  const pieces = [];
  if (presence.opportunity_id) {
    pieces.push(`Focus ${presence.opportunity_id}`);
  }
  if (presence.queue_signal && typeof presence.queue_signal.minutes_to_due === "number") {
    pieces.push(
      presence.queue_signal.overdue
        ? "Attention overdue"
        : `${presence.queue_signal.minutes_to_due} min to due`
    );
  }
  if (presence.lane_stage) {
    pieces.push(formatLaneLabel(presence.lane_stage));
  }
  if (!pieces.length) {
    pieces.push("No live blocker");
  }
  return pieces.join(" | ");
}

function getZoneAtmosphere(presence) {
  const byZone = {
    "executive-suite": {
      mood: "Decision desk",
      detail: "Approvals, exposure, and escalation signals stay in view.",
    },
    "verification-bay": {
      mood: "Verification bay",
      detail: "Proof review, risk checks, and blockers are worked here.",
    },
    "routing-desk": {
      mood: "Execution desk",
      detail: "Approved work is staged for controlled handoff and follow-through.",
    },
    "market-lab": {
      mood: "Market lab",
      detail: "Routing, listings, and downstream opportunity handling stay organized.",
    },
    "market-floor": {
      mood: "Sales and market",
      detail: "Listings, pricing follow-through, and monetization movement happen here.",
    },
  };
  return (
    byZone[presence.zone_id] || {
      mood: "Operations room",
      detail: "Live company state is visible here.",
    }
  );
}

function getZoneSignalLabel(presence) {
  const visualState = normalizeToken(presence.visual_state || presence.status || "idle");
  if (visualState === "blocked") {
    return "Attention required";
  }
  if (visualState === "needs_approval") {
    return "Decision waiting";
  }
  if (visualState === "active" || visualState === "reviewing") {
    return "In active flow";
  }
  if (visualState === "waiting") {
    return "Waiting on input";
  }
  return "Standing by";
}

function getZoneProps(presence) {
  const byZone = {
    "executive-suite": {
      label: "Executive suite",
      items: ["Approval ledger", "Risk screen", "Capital brief"],
    },
    "verification-bay": {
      label: "Verification bay",
      items: ["Device tray", "IMEI proof", "Carrier check"],
    },
    "routing-desk": {
      label: "Execution desk",
      items: ["Route board", "Handoff case", "Ops checklist"],
    },
    "market-lab": {
      label: "Market lab",
      items: ["Listing board", "Pricing notes", "Outbound rack"],
    },
  };
  return (
    byZone[presence.zone_id] || {
      label: "Operations room",
      items: ["Live board", "Task rail", "Status note"],
    }
  );
}

function buildZoneSignalClasses(agent, activeTransitions, renderableHandoffs) {
  const classes = [];
  if (activeTransitions.focusShiftAgents.has(agent)) {
    classes.push("has-focus-shift");
  }
  if (activeTransitions.laneShiftAgents.has(agent)) {
    classes.push("has-lane-shift");
  }

  for (const signal of renderableHandoffs) {
    if (signal.from_agent === agent) {
      classes.push(signal.is_transition ? "has-handoff-source" : "has-handoff-source-muted");
    }
    if (signal.to_agent === agent) {
      classes.push(signal.is_transition ? "has-handoff-target" : "has-handoff-target-muted");
    }
  }
  return classes.join(" ");
}

function truncateSingleLine(value, limit) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= limit) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function getPresenceRoleToken(presence) {
  const explicitRole = normalizeToken(presence && presence.role ? presence.role : "");
  if (explicitRole) {
    return explicitRole;
  }
  const agent = presence && presence.agent ? String(presence.agent) : "";
  const roleByAgent = {
    "CEO Agent": "ceo",
    "Risk and Compliance Agent": "risk",
    "Operations Coordinator Agent": "ops",
    "Department Operator Agent": "sales",
  };
  return roleByAgent[agent] || "operator";
}

function getAvatarVisualState(presence) {
  const role = getPresenceRoleToken(presence) || "operator";
  const visual = normalizeToken(presence && presence.visual_state ? presence.visual_state : "idle");
  const motion = normalizeToken(presence && presence.motion_state ? presence.motion_state : "still");
  return `${role}_${visual}_${motion}`;
}

function getThoughtBubbleModel(presence) {
  const label = truncateSingleLine(
    presence && presence.bubble_label ? presence.bubble_label : "Now",
    18
  );
  const text = truncateSingleLine(
    presence && presence.bubble_text ? presence.bubble_text : "Monitoring lane workload.",
    48
  );
  return {
    label: label || "Now",
    text: text || "Monitoring lane workload.",
  };
}

function getRoomStatusChip(room, presence) {
  const normalizedState = normalizeToken(
    (presence && presence.visual_state) || (room && room.state) || "idle"
  );
  if (normalizedState === "blocked") {
    return {
      label: "Blocked",
      tone: "blocked",
      className: "room-chip--blocked office-chip-blocked",
    };
  }
  if (normalizedState === "needs_approval") {
    return {
      label: "Needs Approval",
      tone: "approval",
      className: "room-chip--approval office-chip-approval",
    };
  }
  if (normalizedState === "active" || normalizedState === "reviewing" || normalizedState === "waiting") {
    return {
      label: "Active",
      tone: "active",
      className: "room-chip--active",
    };
  }
  return {
    label: "Normal",
    tone: "normal",
    className: "room-chip--normal",
  };
}

function getPrimaryHandoff(snapshot) {
  const signals = sortHandoffSignalsDeterministic(
    (snapshot && snapshot.office && snapshot.office.handoff_signals) || []
  );
  const intents = (snapshot && snapshot.office && snapshot.office.movement_intents) || [];
  if (!signals.length && !intents.length) {
    return null;
  }
  const intentBySignalKey = new Map(
    intents.map((intent) => [
      buildMovementIntentKey(intent.opportunity_id, intent.from_zone_id, intent.to_zone_id),
      intent,
    ])
  );
  const consumedIntentIds = new Set();
  const scored = signals.map((signal) => {
    const key = buildMovementIntentKey(
      signal.opportunity_id,
      signal.from_zone_id,
      signal.to_zone_id
    );
    const linkedIntent = intentBySignalKey.get(key) || null;
    if (linkedIntent && linkedIntent.intent_id) {
      consumedIntentIds.add(linkedIntent.intent_id);
    }
    const signalText = [
      signal.handoff_state,
      signal.handoff_label,
      signal.current_owner_action,
      signal.next_action,
      linkedIntent ? linkedIntent.movement_kind : "",
      linkedIntent ? linkedIntent.trigger_type : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const approvalRelated = signalText.includes("approval");
    const unblockRelated =
      signal.blocking_count > 0 ||
      signalText.includes("blocked") ||
      signalText.includes("unblock") ||
      signal.handoff_state === "handoff_blocked" ||
      signal.handoff_state === "handoff_return_required";
    const dueByMs = Date.parse(signal.due_by || 0);
    return {
      signal,
      linkedIntent,
      approvalRelated,
      unblockRelated,
      dueByMs: Number.isFinite(dueByMs) ? dueByMs : Number.MAX_SAFE_INTEGER,
    };
  });

  for (const intent of intents) {
    if (!intent || (intent.intent_id && consumedIntentIds.has(intent.intent_id))) {
      continue;
    }
    const relatedEvent = findOfficeEventById(snapshot, intent.trigger_event_id);
    const opportunity = findOpportunityByIdInSnapshot(snapshot, intent.opportunity_id);
    const followThroughText = resolveOpportunityFollowThroughText(opportunity);
    const syntheticSignal = {
      opportunity_id: intent.opportunity_id,
      from_agent: intent.from_agent,
      to_agent: intent.to_agent,
      from_zone_id: intent.from_zone_id,
      to_zone_id: intent.to_zone_id,
      due_by: intent.trigger_timestamp,
      handoff_state: intent.blocking_count > 0 ? "handoff_blocked" : "handoff_ready",
      handoff_label: relatedEvent ? formatOfficeEventType(relatedEvent.type) : "Operational route",
      current_owner_action: followThroughText,
      next_action: followThroughText,
      blocking_count: intent.blocking_count || 0,
    };
    const signalText = [
      syntheticSignal.handoff_state,
      syntheticSignal.handoff_label,
      syntheticSignal.current_owner_action,
      syntheticSignal.next_action,
      intent.movement_kind,
      intent.trigger_type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const approvalRelated = signalText.includes("approval");
    const unblockRelated =
      syntheticSignal.blocking_count > 0 ||
      signalText.includes("blocked") ||
      signalText.includes("unblock") ||
      syntheticSignal.handoff_state === "handoff_blocked";
    const dueByMs = Date.parse(intent.trigger_timestamp || 0);
    scored.push({
      signal: syntheticSignal,
      linkedIntent: intent,
      approvalRelated,
      unblockRelated,
      dueByMs: Number.isFinite(dueByMs) ? dueByMs : Number.MAX_SAFE_INTEGER,
    });
  }

  scored.sort((a, b) => {
    if (a.approvalRelated !== b.approvalRelated) {
      return a.approvalRelated ? -1 : 1;
    }
    if (a.unblockRelated !== b.unblockRelated) {
      return a.unblockRelated ? -1 : 1;
    }
    if (a.dueByMs !== b.dueByMs) {
      return a.dueByMs - b.dueByMs;
    }
    return buildSignalKey(a.signal).localeCompare(buildSignalKey(b.signal));
  });

  return scored[0] || null;
}

function getCourierRenderModel(handoff, snapshot) {
  if (!handoff || !handoff.signal) {
    return {
      active: false,
      from: null,
      to: null,
      progress: 0,
      tokenLabel: "",
      tokenTone: "packet",
    };
  }
  const signal = handoff.signal;
  const linkedIntent = handoff.linkedIntent || null;
  const generatedAtMs = Date.parse((snapshot && snapshot.generated_at) || 0);
  const triggerMs = Date.parse((linkedIntent && linkedIntent.trigger_timestamp) || 0);
  const durationMs =
    linkedIntent && typeof linkedIntent.duration_ms === "number" && linkedIntent.duration_ms > 0
      ? linkedIntent.duration_ms
      : 1200;
  let progress = 50;
  if (Number.isFinite(generatedAtMs) && Number.isFinite(triggerMs) && durationMs > 0) {
    const elapsed = Math.max(0, generatedAtMs - triggerMs);
    progress = Math.min(100, Math.round((elapsed / durationMs) * 100));
  }

  const approvalRelated =
    handoff.approvalRelated ||
    Boolean(linkedIntent && normalizeToken(linkedIntent.movement_kind) === "approval");
  const shortOpportunity = truncateSingleLine(signal.opportunity_id || "packet", 12);
  return {
    active: true,
    from: signal.from_zone_id || null,
    to: signal.to_zone_id || null,
    progress: Math.max(0, Math.min(100, progress)),
    tokenLabel: shortOpportunity || "packet",
    tokenTone: approvalRelated ? "approval" : "packet",
  };
}

function getRoomNowSummary(room, presence) {
  const summary = truncateSingleLine(
    (room && room.now_summary) ||
      (presence && presence.headline) ||
      (presence && presence.bubble_text) ||
      "Monitoring lane workload.",
    72
  );
  return summary || "Monitoring lane workload.";
}

function getRoomVisualModel(room, snapshot) {
  const presenceByZone = new Map(
    ((snapshot && snapshot.office && snapshot.office.presence) || []).map((entry) => [
      entry.zone_id,
      entry,
    ])
  );
  const presence = presenceByZone.get(room.id) || null;
  const primaryHandoff = getPrimaryHandoff(snapshot);
  const courierModel = getCourierRenderModel(primaryHandoff, snapshot);
  const avatarVisualState = getAvatarVisualState(presence || {});
  return {
    roomId: room.id,
    role: room.role_label || (presence ? presence.agent : "Operator"),
    avatar: {
      spriteKey: avatarVisualState,
      visualState: (presence && presence.visual_state) || room.state || "idle",
      motionState: (presence && presence.motion_state) || room.state || "still",
    },
    bubble: getThoughtBubbleModel(presence),
    chip: getRoomStatusChip(room, presence),
    summary: getRoomNowSummary(room, presence),
    courier: {
      ...courierModel,
      active: Boolean(courierModel.active && courierModel.from === room.id),
    },
  };
}

function deriveOfficeSelectionContext(officeViewZones) {
  const selected = state.selected;
  if (!selected || !Array.isArray(officeViewZones) || !officeViewZones.length) {
    return {
      hasMeaningfulSelectionContext: false,
      dominantZoneId: null,
    };
  }

  let dominantZoneId = null;
  if (selected.type === "opportunity" && selected.id) {
    const matchingZone = officeViewZones.find((zone) => zone.dominant_item_id === selected.id);
    dominantZoneId = matchingZone ? matchingZone.id : null;
  } else if (selected.type === "agent" && selected.id) {
    const matchingZone = officeViewZones.find((zone) => zone.role_label === selected.id);
    dominantZoneId = matchingZone ? matchingZone.id : null;
  }

  if (!dominantZoneId && selected.type === "opportunity" && selected.id) {
    const selectedOpportunity = findOpportunityById(selected.id);
    const ownerAgent = opportunityTaskOwner(selectedOpportunity);
    const ownerPresence = ownerAgent ? findPresenceByAgent(ownerAgent) : null;
    dominantZoneId = ownerPresence && ownerPresence.zone_id ? ownerPresence.zone_id : null;
  }

  const hasMeaningfulSelectionContext = Boolean(dominantZoneId);

  return {
    hasMeaningfulSelectionContext,
    dominantZoneId,
  };
}

function buildZoneAnchorLookup() {
  const lookup = new Map();
  const zones = state.snapshot.office.zone_anchors || [];
  for (const zone of zones) {
    if (!zone || !zone.zone_id) {
      continue;
    }
    lookup.set(zone.zone_id, zone);
  }
  return lookup;
}

function buildRouteHintLookup() {
  const lookup = new Map();
  for (const hint of state.snapshot.office.route_hints || []) {
    if (!hint || !hint.opportunity_id || !hint.from_zone_id || !hint.to_zone_id) {
      continue;
    }
    const key = `${hint.opportunity_id}|${hint.from_zone_id}|${hint.to_zone_id}`;
    lookup.set(key, hint);
  }
  return lookup;
}

function resolveZoneAnchorPoint(zoneLookup, zoneId, pointKind, layoutRect) {
  const zone = zoneLookup.get(zoneId);
  if (!zone || !zone[pointKind]) {
    return null;
  }
  const point = zone[pointKind];
  if (typeof point.x !== "number" || typeof point.y !== "number") {
    return null;
  }
  return {
    x: point.x * layoutRect.width,
    y: point.y * layoutRect.height,
  };
}

function resolveLayoutPoint(layoutRect, point) {
  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    return null;
  }
  return {
    x: point.x * layoutRect.width,
    y: point.y * layoutRect.height,
  };
}

function buildPathFromPoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (const point of points.slice(1)) {
    commands.push(`L ${point.x} ${point.y}`);
  }
  return commands.join(" ");
}

function midpointFromPoints(points) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }
  if (points.length === 1) {
    return points[0];
  }
  const midIndex = Math.floor((points.length - 1) / 2);
  const a = points[midIndex];
  const b = points[midIndex + 1] || a;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function describeOfficeActionKind(type) {
  if (type === "opportunity") {
    return "opportunity";
  }
  if (type === "agent") {
    return "connected zone";
  }
  return "context";
}

function renderPrimaryCourierOverlay(primaryHandoffSelection) {
  const overlay = elements.officeCanvas.querySelector(".floor-courier-overlay");
  const svg = elements.officeCanvas.querySelector(".floor-courier-svg");
  const layout = elements.officeCanvas.querySelector(".office-room-grid");
  if (!overlay || !svg || !layout || !primaryHandoffSelection || !primaryHandoffSelection.signal) {
    return;
  }

  const signal = primaryHandoffSelection.signal;
  const namespace = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const layoutRect = layout.getBoundingClientRect();
  const width = Math.max(1, layoutRect.width);
  const height = Math.max(1, layoutRect.height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);

  const zoneLookup = buildZoneAnchorLookup();
  const routeHintLookup = buildRouteHintLookup();
  const routeHintKey = `${signal.opportunity_id}|${signal.from_zone_id}|${signal.to_zone_id}`;
  const routeHint = routeHintLookup.get(routeHintKey) || null;
  const routeWaypoints = Array.isArray(routeHint && routeHint.waypoints) ? routeHint.waypoints : [];

  const resolvedPoints = routeWaypoints
    .map((point) => resolveLayoutPoint(layoutRect, point))
    .filter(Boolean);
  if (resolvedPoints.length < 2) {
    const fromPoint =
      resolveZoneAnchorPoint(zoneLookup, signal.from_zone_id, "handoff_dock", layoutRect) ||
      resolveZoneAnchorPoint(zoneLookup, signal.from_zone_id, "anchor", layoutRect);
    const toPoint =
      resolveZoneAnchorPoint(zoneLookup, signal.to_zone_id, "handoff_dock", layoutRect) ||
      resolveZoneAnchorPoint(zoneLookup, signal.to_zone_id, "anchor", layoutRect);
    if (fromPoint && toPoint) {
      resolvedPoints.push(fromPoint, toPoint);
    }
  }
  const pathD = buildPathFromPoints(resolvedPoints);
  if (!pathD) {
    return;
  }

  const routePath = document.createElementNS(namespace, "path");
  routePath.setAttribute("d", pathD);
  routePath.setAttribute("class", "floor-courier-path");
  svg.append(routePath);

  const tokenNode = document.createElementNS(namespace, "circle");
  tokenNode.setAttribute(
    "class",
    `floor-courier-dot ${primaryHandoffSelection.approvalRelated ? "is-approval" : "is-packet"}`
  );
  tokenNode.setAttribute("r", "4");
  const motionNode = document.createElementNS(namespace, "animateMotion");
  motionNode.setAttribute("dur", "1800ms");
  motionNode.setAttribute("repeatCount", "indefinite");
  motionNode.setAttribute("path", pathD);
  tokenNode.append(motionNode);
  svg.append(tokenNode);

  overlay.classList.remove("hidden");
}

function renderOfficeCanvas() {
  const officeView = state.snapshot.office.office_view || null;
  const officeViewZones = officeView && Array.isArray(officeView.zones) ? officeView.zones : [];
  const presenceByZone = new Map(
    (state.snapshot.office.presence || []).map((entry) => [entry.zone_id, entry])
  );
  const activeTransitions = getActiveTransitionState();
  const renderableHandoffs = getRenderableHandoffs(activeTransitions);
  const primaryHandoff = getPrimaryHandoff(state.snapshot);
  const selectionContext = deriveOfficeSelectionContext(officeViewZones);

  const floorBanner = `
    <div class="floor-banner floor-banner-compact">
      <div>
        <p class="eyebrow">Operations floor</p>
        <strong>Living office</strong>
      </div>
      <div class="floor-banner-metrics">
        <span class="priority-pill">${state.snapshot.kpis.active_opportunities} active</span>
        <span class="priority-pill">${state.snapshot.kpis.blocked_opportunities} blocked</span>
        <span class="priority-pill">${state.snapshot.kpis.approvals_waiting} approvals</span>
      </div>
    </div>
  `;

  const zonesHtml = officeViewZones
    .map((zone) => {
      const presence = presenceByZone.get(zone.id) || null;
      const agentName = zone.role_label || (presence ? presence.agent : "Unknown Agent");
      const visualState = zone.state || "idle";
      const topOpportunity =
        zone.dominant_item_id && zone.dominant_item_id !== "None"
          ? (state.snapshot.workflow.opportunities || []).find(
              (entry) => entry.opportunity_id === zone.dominant_item_id
            ) || null
          : null;
      const signalClasses = buildZoneSignalClasses(agentName, activeTransitions, renderableHandoffs);
      const isSelected =
        (state.selected &&
          state.selected.type === "agent" &&
          state.selected.id === agentName) ||
        (state.selected &&
          state.selected.type === "opportunity" &&
          topOpportunity &&
          state.selected.id === topOpportunity.opportunity_id);
      const isContextZone =
        selectionContext.hasMeaningfulSelectionContext &&
        selectionContext.dominantZoneId === zone.id;
      const isContextDim = selectionContext.hasMeaningfulSelectionContext && !isContextZone;
      const hasBlockerText =
        zone.blocker_text && typeof zone.blocker_text === "string" && zone.blocker_text.trim();
      const hasApprovalText =
        zone.approval_text && typeof zone.approval_text === "string" && zone.approval_text.trim();
      const isUrgentZone =
        visualState === "blocked" ||
        visualState === "needs_approval" ||
        Boolean(hasBlockerText || hasApprovalText);
      const accentToken = (presence && presence.accent_token) || "slate";
      const roomVisualModel = getRoomVisualModel(zone, state.snapshot);
      const roomBubbleTone =
        roomVisualModel.chip.tone === "blocked"
          ? "blocker"
          : roomVisualModel.chip.tone === "approval"
            ? "approval"
            : "task";
      const roomCourierHtml = roomVisualModel.courier.active
        ? `<div class="courier-token ${escapeHtml(
            roomVisualModel.courier.className
          )}" aria-hidden="true">${escapeHtml(roomVisualModel.courier.tokenLabel)}</div>`
        : "";
      return `
        <button
          type="button"
          class="zone-card zone-room zone-card-${escapeHtml(accentToken)} zone-room-${escapeHtml(
            normalizeToken(zone.id)
          )} ${formatVisualStateFamilyClass(visualState)} ${formatVisualStateClass(
            visualState
          )} ${isSelected ? "is-selected" : ""} ${isContextZone ? "is-context-zone" : ""} ${isContextDim ? "is-context-dim" : ""} ${isUrgentZone ? "is-urgent-zone" : ""} ${signalClasses}"
          data-type="agent"
          data-id="${escapeHtml(agentName)}"
          data-zone-id="${escapeHtml(zone.id)}"
          data-dominant-opportunity-id="${escapeHtml(topOpportunity ? topOpportunity.opportunity_id : "")}"
        >
          <div class="office-room">
            <div class="room-header">
              <div class="room-title-wrap">
                <p class="eyebrow room-zone-title">${escapeHtml(zone.title || "Office zone")}</p>
                <h3 class="room-role-label room-title">${escapeHtml(zone.avatar_label || agentName)}</h3>
              </div>
              <span class="room-chip ${escapeHtml(roomVisualModel.chip.className)}">${escapeHtml(
                roomVisualModel.chip.label
              )}</span>
            </div>

            <div class="room-stage">
              <div class="avatar avatar--${escapeHtml(roomVisualModel.avatar.spriteKey)} avatar-accent-${escapeHtml(
                accentToken
              )} ${formatMotionClass(roomVisualModel.avatar.motionState)}">
                <div class="avatar-ring"></div>
                <div class="avatar-body avatar-character">
                  <div class="avatar-head"></div>
                  <div class="avatar-torso"></div>
                  <div class="avatar-limb avatar-limb-left"></div>
                  <div class="avatar-limb avatar-limb-right"></div>
                </div>
              </div>
              <div class="thought-bubble thought-bubble--${escapeHtml(roomBubbleTone)}">
                <div class="thought-bubble__label">${escapeHtml(roomVisualModel.bubble.label)}</div>
                <div class="thought-bubble__text">${escapeHtml(roomVisualModel.bubble.text)}</div>
              </div>
              ${roomCourierHtml}
            </div>

            <div class="room-now">
              <p class="room-now-line">${escapeHtml(roomVisualModel.summary)}</p>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  elements.officeCanvas.innerHTML = `
    ${floorBanner}
    <div class="office-floor-surface">
      <div class="office-room-grid">
        ${zonesHtml}
      </div>
      <div class="floor-courier-overlay hidden" aria-hidden="true">
        <svg class="floor-courier-svg"></svg>
      </div>
    </div>
  `;

  elements.officeCanvas.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      if (
        node.dataset.type === "agent" &&
        typeof node.dataset.dominantOpportunityId === "string" &&
        node.dataset.dominantOpportunityId
      ) {
        setSelection("opportunity", node.dataset.dominantOpportunityId);
        return;
      }
      setSelection(node.dataset.type, node.dataset.id);
    });
  });

  renderPrimaryCourierOverlay(primaryHandoff);
}

function movementIntentsForOpportunity(opportunityId) {
  return (state.snapshot.office.movement_intents || [])
    .filter((intent) => intent && intent.opportunity_id === opportunityId)
    .slice(0, 4);
}

function buildBlockedMovementStatus(intents, clearCondition) {
  const activeIntent = (intents || []).find(
    (intent) => intent && intent.transition_state === "in_flight"
  ) || null;
  if (activeIntent) {
    return `Recovery movement is in flight from ${
      activeIntent.from_agent || "current owner"
    } to ${activeIntent.to_agent || "next owner"} via ${formatOfficeEventType(
      activeIntent.trigger_type
    )}. ${clearCondition}`;
  }

  const latestIntent = (intents || [])[0] || null;
  if (latestIntent) {
    return `Latest recorded movement reached ${
      latestIntent.to_agent || "the current lane"
    } at ${formatTimestamp(latestIntent.trigger_timestamp)}. ${clearCondition}`;
  }

  return `No unblock movement is in flight yet. ${clearCondition}`;
}

function buildBlockedFlowModel(entry, movementIntents) {
  if (!entry) {
    return null;
  }

  const workflow = entry.workflow_record || null;
  const queue = entry.queue_item || null;
  const packet = entry.contract_bundle && entry.contract_bundle.handoff_packet
    ? entry.contract_bundle.handoff_packet
    : null;
  const recommendation = entry.operational_recommendation || null;
  const handoffState = entry.operational_handoff || null;
  const executionState = entry.operational_execution || null;
  const marketState = entry.operational_market || null;
  const routeState = entry.operational_route || null;
  const policyState = entry.operational_policy || null;

  const currentOwner =
    opportunityTaskOwner(entry) ||
    (handoffState && handoffState.next_owner) ||
    (packet && packet.to_agent) ||
    null;
  const previousOwner = packet && packet.from_agent ? packet.from_agent : null;

  let blockedNow = null;
  let reason = null;
  let owner = null;
  let nextAction = null;
  let clearCondition = null;

  if (
    policyState &&
    new Set(["policy_review_required", "policy_restricted", "policy_blocked"]).has(
      policyState.policy_state
    )
  ) {
    blockedNow = policyState.policy_label || "Policy blocked";
    reason = policyState.policy_reason || "Policy requirements are blocking progress.";
    owner = currentOwner || previousOwner || "Risk and Compliance Agent";
    nextAction = policyState.policy_next_step || "Resolve policy blocker before routing onward.";
    clearCondition =
      policyState.policy_clear_condition || "Clears when policy blocker is explicitly resolved.";
  } else if (marketState && marketState.market_state === "market_blocked") {
    blockedNow = marketState.market_label || "Market blocked";
    reason = marketState.market_reason || "Market work is blocked.";
    owner = currentOwner || "Department Operator Agent";
    nextAction = marketState.market_next_step || "Resolve blocker, then resume market prep.";
    clearCondition =
      marketState.market_clear_condition || "Clears when market blocker is resolved.";
  } else if (executionState && executionState.execution_state === "execution_blocked") {
    blockedNow = executionState.execution_label || "Execution blocked";
    reason = executionState.execution_reason || "Execution work is blocked.";
    owner = currentOwner || "Operations Coordinator Agent";
    nextAction = executionState.execution_next_step || "Resolve blocker, then reopen intake.";
    clearCondition =
      executionState.execution_clear_condition || "Clears when execution blocker is resolved.";
  } else if (handoffState && handoffState.handoff_state === "handoff_return_required") {
    blockedNow = handoffState.handoff_label || "Return required";
    reason = handoffState.handoff_reason || "The current packet must return for correction.";
    owner = previousOwner || currentOwner || "Previous owner";
    nextAction =
      handoffState.current_owner_action || "Rework the packet and republish a viable handoff.";
    clearCondition =
      handoffState.handoff_clear_condition || "Clears when the previous owner republishes a viable packet.";
  } else if (handoffState && handoffState.handoff_state === "handoff_blocked") {
    blockedNow = handoffState.handoff_label || "Handoff blocked";
    reason = handoffState.handoff_reason || "Ownership transfer is blocked.";
    owner = currentOwner || previousOwner || "Current owner";
    nextAction =
      handoffState.current_owner_action || "Resolve blocker and re-confirm the handoff.";
    clearCondition =
      handoffState.handoff_clear_condition || "Clears when the handoff blocker is resolved.";
  } else if (workflow && workflow.purchase_recommendation_blocked) {
    blockedNow = "Purchase blocked";
    reason =
      (recommendation && recommendation.blocker_text) ||
      "Purchase recommendation remains blocked pending owner review.";
    owner =
      (queue && queue.status === "pending" && "CEO Agent") ||
      currentOwner ||
      previousOwner ||
      "Owner review";
    nextAction =
      (routeState && routeState.operator_route_next_step) ||
      (recommendation && recommendation.next_action) ||
      "Resolve blocker requirements before advancing.";
    clearCondition =
      (executionState && executionState.execution_clear_condition) ||
      (handoffState && handoffState.handoff_clear_condition) ||
      "Clears when the blocker is resolved and the route is reopened.";
  } else {
    return null;
  }

  return {
    blockedNow,
    reason,
    owner,
    nextAction,
    movementStatus: buildBlockedMovementStatus(movementIntents, clearCondition),
  };
}

function movementIntentsForAgent(agent) {
  return (state.snapshot.office.movement_intents || [])
    .filter(
      (intent) =>
        intent &&
        (intent.agent === agent || intent.from_agent === agent || intent.to_agent === agent)
    )
    .slice(0, 4);
}

function renderMovementIntentList(intents, emptyMessage) {
  if (!intents.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }
  const selectedIntent =
    intents.find((intent) => intent.intent_id === state.routePlayback.intentId) || null;

  return `
    <div class="movement-intent-list">
      ${intents
        .map(
          (intent) => `
            <article class="movement-intent-item">
              <div class="detail-title-row">
                <strong>${escapeHtml(intent.opportunity_id)}</strong>
                <span class="status-pill ${formatStatusClass(
                  intent.transition_state === "in_flight" ? "working" : "idle"
                )}">${escapeHtml(formatTransitionStateLabel(intent.transition_state))}</span>
              </div>
              <p class="muted">${escapeHtml(
                `${formatMovementKindLabel(intent.movement_kind)} via ${formatOfficeEventType(
                  intent.trigger_type
                )}`
              )}</p>
              <div class="card-tags">
                <span class="priority-pill">${escapeHtml(
                  `${shortAgentLabel(intent.from_agent)} -> ${shortAgentLabel(intent.to_agent)}`
                )}</span>
                <span class="priority-pill">${escapeHtml(
                  `${intent.from_zone_id} -> ${intent.to_zone_id}`
                )}</span>
                <span class="priority-pill">${escapeHtml(`${intent.duration_ms} ms`)}</span>
                <span class="priority-pill">${escapeHtml(formatTimestamp(intent.trigger_timestamp))}</span>
              </div>
              <div class="movement-preview-actions">
                <button
                  type="button"
                  class="task-chip movement-preview-button ${
                    state.routePlayback.intentId === intent.intent_id ? "is-active" : ""
                  }"
                  data-intent-action="preview"
                  data-intent-id="${escapeHtml(intent.intent_id)}"
                >
                  ${
                    state.routePlayback.intentId === intent.intent_id
                      ? "Previewing route"
                      : "Preview route"
                  }
                </button>
              </div>
            </article>
          `
        )
        .join("")}
      ${
        selectedIntent
          ? `
            <div class="movement-playback-control">
              <div class="detail-title-row">
                <strong>Route playback</strong>
                <span class="status-pill ${formatStatusClass("working")}">${escapeHtml(
                  `${state.routePlayback.progress}%`
                )}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value="${state.routePlayback.progress}"
                data-intent-action="scrub"
              />
              <div class="card-tags">
                <span class="priority-pill">${escapeHtml(selectedIntent.opportunity_id)}</span>
                <span class="priority-pill">${escapeHtml(
                  `${shortAgentLabel(selectedIntent.from_agent)} -> ${shortAgentLabel(
                    selectedIntent.to_agent
                  )}`
                )}</span>
                <button type="button" class="task-chip" data-intent-action="clear-preview">
                  Clear preview
                </button>
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function bindMovementIntentControls() {
  elements.detailPanel
    .querySelectorAll('[data-intent-action="preview"][data-intent-id]')
    .forEach((node) => {
      node.addEventListener("click", () => {
        const intentId = node.dataset.intentId;
        if (!intentId) {
          return;
        }
        state.routePlayback.intentId =
          state.routePlayback.intentId === intentId ? null : intentId;
        renderOfficeCanvas();
        renderDetailPanel();
      });
    });

  const scrubControl = elements.detailPanel.querySelector('[data-intent-action="scrub"]');
  if (scrubControl) {
    scrubControl.addEventListener("input", () => {
      const nextProgress = Number.parseInt(scrubControl.value, 10);
      state.routePlayback.progress = Number.isInteger(nextProgress)
        ? Math.max(0, Math.min(100, nextProgress))
        : 50;
      renderOfficeCanvas();
      renderDetailPanel();
    });
  }

  const clearControl = elements.detailPanel.querySelector('[data-intent-action="clear-preview"]');
  if (clearControl) {
    clearControl.addEventListener("click", () => {
      state.routePlayback.intentId = null;
      renderOfficeCanvas();
      renderDetailPanel();
    });
  }
}

function detailSectionFocusClass(sectionId) {
  return state.detailFocusSection === sectionId ? "is-detail-focused" : "";
}

function applyFocusedDetailSection() {
  if (!state.detailFocusSection) {
    return;
  }
  const node = elements.detailPanel.querySelector(
    `[data-detail-section="${state.detailFocusSection}"]`
  );
  if (!node) {
    return;
  }
  node.scrollIntoView({ behavior: "smooth", block: "start" });
}

function activateDetailSectionFocus(sectionId, message, level = "info") {
  state.detailFocusSection = sectionId || null;
  renderDetailPanel();
  applyFocusedDetailSection();
  if (message) {
    setShellMessage(message, level, { ttlMs: 9000 });
    renderAttention();
  }
}

function buildDetailPrimaryAction(entry, blockedFlow) {
  const pendingQueueItem = findPendingApprovalQueueItemByOpportunity(
    state.snapshot,
    entry.opportunity_id
  );
  const status = normalizeToken(entry.current_status);

  if (pendingQueueItem) {
    return {
      label: "Open approval queue",
      detail: "Approval decisions stay in the queue. Use this handoff when the selected opportunity is waiting on a decision.",
      action: "open-approval-queue",
      sectionId: "what-next",
      feedback: `Approval queue opened for ${entry.opportunity_id}.`,
      planned: false,
    };
  }

  if (status === "researching") {
    return {
      label: "Review intake",
      detail: "Focus the evidence and recommendation readout before moving this opportunity forward.",
      action: "open-section",
      sectionId: "evidence",
      feedback: `Intake review is now focused for ${entry.opportunity_id}.`,
      planned: false,
    };
  }

  if (status === "awaiting_seller_verification" || normalizeToken(entry.current_status) === "blocked") {
    return {
      label: "Resolve blocker",
      detail: "Focus the unblock path first. The detail panel should tell you what must clear next.",
      action: "open-section",
      sectionId: blockedFlow ? "blockage" : "evidence",
      feedback: `Blockage details are now focused for ${entry.opportunity_id}.`,
      planned: false,
    };
  }

  if (status === "approved") {
    return {
      label: "Start execution",
      detail: "Execution commit remains runtime-managed in this slice. This action focuses the live handoff and next-step context.",
      action: "open-section",
      sectionId: "what-next",
      feedback: `Execution follow-through is in focus for ${entry.opportunity_id}. UI execution commit remains deferred.`,
      planned: true,
    };
  }

  if (status === "acquired") {
    return {
      label: "Route to market",
      detail: "Market routing remains runtime-managed in this slice. Use this to focus the next operator handoff instead of guessing.",
      action: "open-section",
      sectionId: "what-next",
      feedback: `Market follow-through is in focus for ${entry.opportunity_id}. UI routing commit remains deferred.`,
      planned: true,
    };
  }

  if (new Set(["routed", "monetizing"]).has(status)) {
    return {
      label: "Advance next step",
      detail: "Closure controls are still deferred. This action focuses the live next-step context without inventing a fake write path.",
      action: "open-section",
      sectionId: "what-next",
      feedback: `Next-step follow-through is in focus for ${entry.opportunity_id}.`,
      planned: true,
    };
  }

  return {
    label: "Review selected opportunity",
    detail: "Keep the operator loop anchored in the selected item before deciding what to do next.",
    action: "open-section",
    sectionId: "what-next",
    feedback: `Selected opportunity context refreshed for ${entry.opportunity_id}.`,
    planned: false,
  };
}

function supportsPersistentDetailSendBack(entry) {
  const status = normalizeToken(entry && entry.current_status ? entry.current_status : "");
  return new Set([
    "discovered",
    "researching",
    "awaiting_seller_verification",
    "approved",
    "acquired",
  ]).has(status);
}

function renderDetailActionRail(entry, blockedFlow) {
  const primaryAction = buildDetailPrimaryAction(entry, blockedFlow);
  const pendingQueueItem = findPendingApprovalQueueItemByOpportunity(
    state.snapshot,
    entry.opportunity_id
  );
  const supportsPersistentSendBack =
    !pendingQueueItem && supportsPersistentDetailSendBack(entry);
  const composerOpen = state.sendBackComposerOpportunityId === entry.opportunity_id;
  const secondaryHelper = pendingQueueItem
    ? "Requires a reason and submits a real request-more-info decision through the approval queue."
    : supportsPersistentSendBack
      ? "Requires a reason and sends this item back into verification with a persisted blocker message."
      : "Deferred for this state. No truthful non-approval send-back write path exists here yet.";

  return `
    <section class="detail-section detail-action-rail ${detailSectionFocusClass("action-rail")}" data-detail-section="action-rail">
      <div class="detail-action-head">
        <div>
          <p class="eyebrow">Operator controls</p>
          <h3>Action rail</h3>
        </div>
        ${
          primaryAction.planned
            ? `<span class="priority-pill">read-only follow-through</span>`
            : `<span class="priority-pill">live control</span>`
        }
      </div>
      <p class="detail-action-summary">${escapeHtml(primaryAction.detail)}</p>
      <div class="detail-action-buttons">
        <button
          type="button"
          class="action-button detail-action-primary ${primaryAction.planned ? "action-button-secondary" : ""}"
          data-detail-primary="${escapeHtml(primaryAction.action)}"
          data-action-section="${escapeHtml(primaryAction.sectionId || "")}"
          data-feedback="${escapeHtml(primaryAction.feedback || "")}"
          data-opportunity-id="${escapeHtml(entry.opportunity_id)}"
        >
          ${escapeHtml(primaryAction.label)}
        </button>
        <button
          type="button"
          class="queue-action queue-action-info detail-action-secondary"
          data-operator-action="toggle-send-back"
          data-opportunity-id="${escapeHtml(entry.opportunity_id)}"
          ${!pendingQueueItem && !supportsPersistentSendBack ? "disabled" : ""}
        >
          Send back / Need more info
        </button>
      </div>
      <p class="muted">${escapeHtml(secondaryHelper)}</p>
      ${
        composerOpen
          ? `
            <form class="detail-inline-form" data-send-back-form="${escapeHtml(entry.opportunity_id)}">
              <label>
                Reason
                <textarea name="reason" rows="3" required placeholder="Explain what is missing, blocked, or needs to change first."></textarea>
              </label>
              <div class="queue-actions">
                <button type="submit" class="queue-action queue-action-info" ${state.sendBackInFlight ? "disabled" : ""}>${state.sendBackInFlight ? "Sending..." : "Send back"}</button>
                <button type="button" class="queue-action" data-operator-action="cancel-send-back" data-opportunity-id="${escapeHtml(
                  entry.opportunity_id
                )}" ${state.sendBackInFlight ? "disabled" : ""}>Cancel</button>
              </div>
            </form>
          `
          : ""
      }
    </section>
  `;
}

function bindDetailActionRailControls(entry) {
  const primaryButton = elements.detailPanel.querySelector("[data-detail-primary]");
  if (primaryButton) {
    primaryButton.addEventListener("click", () => {
      const action = primaryButton.dataset.detailPrimary;
      const sectionId = primaryButton.dataset.actionSection || null;
      const feedback = primaryButton.dataset.feedback || null;
      if (action === "open-approval-queue") {
        state.detailFocusSection = sectionId;
        renderDetailPanel();
        elements.approvalQueue.scrollIntoView({ behavior: "smooth", block: "start" });
        setShellMessage(feedback || `Approval queue opened for ${entry.opportunity_id}.`, "info", {
          ttlMs: 9000,
        });
        renderAttention();
        return;
      }
      activateDetailSectionFocus(sectionId, feedback, "info");
    });
  }

  const toggleSendBack = elements.detailPanel.querySelector(
    '[data-operator-action="toggle-send-back"]'
  );
  if (toggleSendBack) {
    toggleSendBack.addEventListener("click", () => {
      if (toggleSendBack.disabled) {
        return;
      }
      state.sendBackComposerOpportunityId =
        state.sendBackComposerOpportunityId === entry.opportunity_id ? null : entry.opportunity_id;
      renderDetailPanel();
    });
  }

  const cancelSendBack = elements.detailPanel.querySelector(
    '[data-operator-action="cancel-send-back"]'
  );
  if (cancelSendBack) {
    cancelSendBack.addEventListener("click", () => {
      state.sendBackComposerOpportunityId = null;
      renderDetailPanel();
    });
  }

  const sendBackForm = elements.detailPanel.querySelector(
    `[data-send-back-form="${entry.opportunity_id}"]`
  );
  if (sendBackForm) {
    sendBackForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(sendBackForm);
      const reason = String(formData.get("reason") || "").trim();
      if (!reason) {
        setShellMessage("A reason is required before sending work back.", "error", {
          ttlMs: 9000,
        });
        renderAttention();
        return;
      }
      const pendingQueueItem = findPendingApprovalQueueItemByOpportunity(
        state.snapshot,
        entry.opportunity_id
      );
      const supportsPersistentSendBack = supportsPersistentDetailSendBack(entry);
      state.sendBackComposerOpportunityId = null;
      if (pendingQueueItem) {
        const confirmed = window.confirm(
          `Request more info for ${pendingQueueItem.ticket_id}?\nReason: ${reason}`
        );
        if (!confirmed) {
          renderDetailPanel();
          return;
        }
        await submitApprovalDecision(
          pendingQueueItem.ticket_id,
          "request_more_info",
          `Detail rail send-back reason: ${reason}`
        );
        return;
      }
      if (!supportsPersistentSendBack) {
        setShellMessage(
          `Persistent send-back is deferred for ${entry.current_status}.`,
          "info",
          { ttlMs: 9000 }
        );
        renderAttention();
        renderDetailPanel();
        return;
      }
      const confirmed = window.confirm(
        `Send ${entry.opportunity_id} back for more information?\nReason: ${reason}`
      );
      if (!confirmed) {
        renderDetailPanel();
        return;
      }
      await submitOpportunitySendBack(entry.opportunity_id, reason);
    });
  }
}

function renderDetailForOpportunity(entry) {
  const record = entry.contract_bundle.opportunity_record;
  const handoff = entry.contract_bundle.handoff_packet;
  const ticket = entry.contract_bundle.approval_ticket;
  const workflow = entry.workflow_record;
  const queue = entry.queue_item;
  const risks = record && Array.isArray(record.risks) ? record.risks : [];
  const history = workflow && Array.isArray(workflow.status_history) ? workflow.status_history : [];
  const movementIntents = movementIntentsForOpportunity(entry.opportunity_id);
  const capitalStrategy = state.snapshot.capital_strategy;
  const capitalFit = entry.capital_fit;
  const recommendation = entry.operational_recommendation || null;
  const handoffState = entry.operational_handoff || null;
  const executionState = entry.operational_execution || null;
  const marketState = entry.operational_market || null;
  const routeState = entry.operational_route || null;
  const intakePriorityState = entry.operational_intake_priority || null;
  const sellthroughState = entry.operational_sellthrough || null;
  const capacityState = entry.operational_capacity || null;
  const policyState = entry.operational_policy || null;
  const qualityState = entry.operational_opportunity_quality || null;
  const operationalNext = entry.operational_next || null;
  const ownerAgent = opportunityTaskOwner(entry) || (handoff && handoff.to_agent) || null;
  const ownerPresence = ownerAgent ? findPresenceByAgent(ownerAgent) : null;
  const blockedFlow = buildBlockedFlowModel(entry, movementIntents);
  const nextAction =
    (operationalNext && operationalNext.next_action) ||
    (entry.latest_task && entry.latest_task.next_action) ||
    (handoff && handoff.next_action) ||
    "Reviewing owned queue.";
  const dueBy = entry.latest_task ? entry.latest_task.due_by : handoff ? handoff.due_by : null;
  const nextOwner =
    (operationalNext && operationalNext.owner) ||
    (handoffState && handoffState.next_owner) ||
    (entry.latest_task ? entry.latest_task.owner : handoff ? handoff.to_agent : ownerAgent);
  const whyThisMattersNow = buildWhyThisMattersNow({
    isBlocked: Boolean(workflow && workflow.purchase_recommendation_blocked),
    needsApproval: normalizeToken(entry.current_status) === "awaiting_approval",
    dueBy,
    handoffTarget: nextOwner,
    fallbackReason: "This is the lane-owned item, so clarity here keeps the company flow moving.",
  });
  const heroChips = [
    `<span class="priority-pill ${formatStatusClass(entry.priority)}">${escapeHtml(entry.priority)} priority</span>`,
    `<span class="priority-pill">${escapeHtml(formatLaneLabel(mapStatusToLaneStage(entry.current_status)))}</span>`,
    workflow && workflow.purchase_recommendation_blocked
      ? `<span class="alert-pill ${formatStatusClass("blocked")}">purchase blocked</span>`
      : "",
  ].filter(Boolean);
  const currentFocus = buildCurrentFocusModel({
    ownedBy: ownerPresence ? ownerPresence.zone_label : ownerAgent || "Unassigned",
    opportunityId: entry.opportunity_id,
    visualState: ownerPresence ? ownerPresence.visual_state : "idle",
    nextStep: nextAction,
  });

  elements.detailPanel.innerHTML = `
    ${renderCurrentFocusStrip(currentFocus)}
    ${renderDetailActionRail(entry, blockedFlow)}
    <section class="detail-section detail-section-now ${detailSectionFocusClass("now")}" data-detail-section="now">
      <h3>Now</h3>
      <div class="detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Selected entity</p>
            <strong>${escapeHtml(entry.opportunity_id)}</strong>
          </div>
          <span class="status-pill ${formatStatusClass(entry.current_status)}">${escapeHtml(entry.current_status)}</span>
        </div>
        <p>${escapeHtml(normalizeOneLineSummary(record ? record.device_summary : "", "No OpportunityRecord artifact found yet."))}</p>
        <div class="card-tags">
          ${heroChips.slice(0, V1_BOARD_CONTRACT.maxDetailHeroChips).join("")}
        </div>
      </div>
    </section>

    <section class="detail-section detail-section-now ${detailSectionFocusClass("why-now")}" data-detail-section="why-now">
      <h3>Why this matters now</h3>
      <p>${escapeHtml(whyThisMattersNow)}</p>
    </section>

    ${
      operationalNext
        ? `
          <section class="detail-section detail-section-now ${detailSectionFocusClass("operational-next")}" data-detail-section="operational-next">
            <h3>Operational next</h3>
            <ul class="detail-list">
              <li>Owner: ${escapeHtml(operationalNext.owner || "Unassigned")}</li>
              <li>State: ${escapeHtml(formatOperationalNextState(operationalNext.state))}</li>
              <li>Waiting on: ${escapeHtml(
                operationalNext.waiting_on || "Nothing external right now."
              )}</li>
              <li>Next action: ${escapeHtml(
                operationalNext.next_action || "Continue the current owner action."
              )}</li>
              <li>Ready once: ${escapeHtml(
                operationalNext.ready_once || "Current owner starts the next action."
              )}</li>
              <li>Movement: ${escapeHtml(
                operationalNext.movement_in_flight ? "Already in flight." : "Not in flight."
              )}</li>
            </ul>
          </section>
        `
        : ""
    }

    ${
      blockedFlow
        ? `
          <section class="detail-section ${detailSectionFocusClass("blockage")}" data-detail-section="blockage">
            <h3>Blockage and unblock</h3>
            <ul class="detail-list">
              <li>Blocked now: ${escapeHtml(blockedFlow.blockedNow)}</li>
              <li>Why: ${escapeHtml(blockedFlow.reason)}</li>
              <li>Unblock owner: ${escapeHtml(blockedFlow.owner)}</li>
              <li>Next unblock action: ${escapeHtml(blockedFlow.nextAction)}</li>
              <li>Movement status: ${escapeHtml(blockedFlow.movementStatus)}</li>
            </ul>
          </section>
        `
        : ""
    }

    <section class="detail-section ${detailSectionFocusClass("what-next")}" data-detail-section="what-next">
      <h3>What happens next</h3>
      <ul class="detail-list">
        <li>Owner or handoff target: ${escapeHtml(nextOwner || "Unassigned")}</li>
        <li>Next action: ${escapeHtml(nextAction)}</li>
        <li>Due context: ${escapeHtml(formatTimestamp(dueBy))}</li>
        <li>What would change this: ${escapeHtml(
          operationalNext && operationalNext.ready_once
            ? operationalNext.ready_once
            : "Change when new verification, pricing, or owner decision updates this item."
        )}</li>
      </ul>
    </section>

    <section class="detail-section ${detailSectionFocusClass("evidence")}" data-detail-section="evidence">
      <h3>Evidence</h3>
      <ul class="detail-list">
        <li>Recommendation: ${escapeHtml(
          recommendation ? recommendation.recommendation_label : entry.recommendation || "Manual review"
        )}</li>
        <li>Recommendation reasoning: ${escapeHtml(
          recommendation ? recommendation.recommendation_reason : "No recommendation reason available."
        )}</li>
        <li>Priority reasoning: ${escapeHtml(
          intakePriorityState
            ? intakePriorityState.intake_priority_reason
            : "Intake priority reasoning is not derived."
        )}</li>
        <li>Opportunity quality: ${escapeHtml(
          qualityState
            ? `${qualityState.opportunity_quality_label}: ${qualityState.opportunity_quality_reason}`
            : "Opportunity quality is not derived."
        )}</li>
        <li>Policy boundary: ${escapeHtml(
          policyState
            ? `${policyState.policy_label}: ${policyState.policy_reason}`
            : "Policy boundary state is not derived."
        )}</li>
        <li>Route: ${escapeHtml(
          routeState
            ? `${routeState.operator_route_label}: ${routeState.operator_route_reason}`
            : "Operator route summary is not derived."
        )}</li>
        <li>Execution: ${escapeHtml(
          executionState
            ? `${executionState.execution_label}: ${executionState.execution_reason}`
            : "Execution readiness is not derived."
        )}</li>
        <li>Market: ${escapeHtml(
          marketState
            ? `${marketState.market_label}: ${marketState.market_reason}`
            : "Market readiness is not derived."
        )}</li>
        <li>Capacity: ${escapeHtml(
          capacityState
            ? `${capacityState.capacity_label}: ${capacityState.capacity_reason}`
            : "Capacity pressure is not derived."
        )}</li>
        <li>Sell-through: ${escapeHtml(
          sellthroughState
            ? `${sellthroughState.sellthrough_label}: ${sellthroughState.sellthrough_reason}`
            : "Sell-through pressure is not derived."
        )}</li>
        <li>Pricing context: Ask ${formatCurrency(record ? record.ask_price_usd : null)} vs value range ${
          record ? `${formatCurrency(record.estimated_value_range_usd[0])} to ${formatCurrency(record.estimated_value_range_usd[1])}` : "N/A"
        }.</li>
        <li>Confidence: ${escapeHtml(record ? record.confidence : workflow && workflow.confidence ? workflow.confidence : "unknown")}</li>
        <li>Verification notes: ${escapeHtml(record && record.notes ? record.notes : "No verification notes available.")}</li>
        ${
          risks.length
            ? risks.map((risk) => `<li>Risk: ${escapeHtml(risk)}</li>`).join("")
            : "<li>No contract risk list available.</li>"
        }
      </ul>
      ${
        workflow && workflow.seller_verification
          ? `
            <div class="detail-meta">
              <div class="detail-meta-item"><span>IMEI proof</span><strong>${workflow.seller_verification.imei_proof_verified ? "Verified" : "Pending"}</strong></div>
              <div class="detail-meta-item"><span>Carrier status</span><strong>${workflow.seller_verification.carrier_status_verified ? "Verified" : "Pending"}</strong></div>
              <div class="detail-meta-item"><span>Seller response</span><strong>${escapeHtml(workflow.seller_verification.response_status || "none")}</strong></div>
            </div>
            ${
              workflow.seller_verification.request_message
                ? `<p class="muted">Verification request: ${escapeHtml(workflow.seller_verification.request_message)}</p>`
                : ""
            }
          `
          : ""
      }
    </section>

    <section class="detail-section ${detailSectionFocusClass("history")}" data-detail-section="history">
      <h3>History</h3>
      <p class="eyebrow">Status history</p>
      ${
        history.length
          ? `<ul class="history-list">${history
              .slice()
              .reverse()
              .map(
                (item) => `
                  <li class="status-history-item">
                    <div class="detail-title-row">
                      <strong>${escapeHtml(item.status)}</strong>
                      <time>${escapeHtml(formatTimestamp(item.timestamp))}</time>
                    </div>
                    <p class="muted">${escapeHtml(item.reason)}</p>
                  </li>
                `
              )
              .join("")}</ul>`
          : `<div class="empty-state">No lifecycle history recorded.</div>`
      }
      <p class="eyebrow" style="margin-top:14px;">Movement intents</p>
      ${renderMovementIntentList(
        movementIntents,
        "No movement intent is currently derived for this opportunity."
      )}
    </section>

    ${renderSupportContextSection(capitalStrategy, capitalFit)}
  `;

  bindMovementIntentControls();
  bindDetailActionRailControls(entry);
  applyFocusedDetailSection();
}

function renderDetailForLaneEmpty(card) {
  const presence = findPresenceByAgent(card.agent);
  const movementIntents = movementIntentsForAgent(card.agent);
  const role = describeRole(card.agent);
  const capitalStrategy = card.agent === "CEO Agent" ? state.snapshot.capital_strategy : null;
  const whyThisMattersNow = buildWhyThisMattersNow({
    isBlocked: Boolean(card.blocker),
    needsApproval: normalizeToken(presence ? presence.visual_state : "idle") === "needs_approval",
    dueBy: null,
    handoffTarget: null,
    fallbackReason:
      "This lane is clear, so the next qualifying handoff should be easy to spot.",
  });
  const currentFocus = buildCurrentFocusModel({
    ownedBy: presence ? presence.zone_label : card.agent,
    opportunityId: "None",
    visualState: presence ? presence.visual_state : "idle",
    nextStep: getLaneEmptyCopy(card.agent),
  });
  elements.detailPanel.innerHTML = `
    ${renderCurrentFocusStrip(currentFocus)}
    <section class="detail-section">
      <h3>Now</h3>
      <div class="detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Selected entity</p>
            <strong>${escapeHtml(presence ? presence.zone_label : card.agent)}</strong>
          </div>
          <span class="status-pill ${formatStatusClass(currentFocus.visualState)}">${escapeHtml(
    formatVisualStateLabel(currentFocus.visualState)
  )}</span>
        </div>
        <p>${escapeHtml(getLaneEmptyCopy(card.agent))}</p>
      </div>
    </section>

    <section class="detail-section">
      <h3>Why this matters now</h3>
      <p>${escapeHtml(whyThisMattersNow)}</p>
    </section>

    <section class="detail-section">
      <h3>What happens next</h3>
      <ul class="detail-list">
        <li>Next action: ${escapeHtml(getLaneEmptyCopy(card.agent))}</li>
        <li>Due context: ${escapeHtml(formatTimestamp(null))}</li>
        <li>Owner or handoff target: ${escapeHtml(presence ? presence.zone_label : card.agent)}</li>
      </ul>
    </section>

    <section class="detail-section">
      <h3>Evidence</h3>
      <ul class="detail-list">
        <li>Verification notes: ${escapeHtml(presence && presence.bubble_text ? presence.bubble_text : "No lane notes available.")}</li>
        <li>Risks: ${escapeHtml(card.blocker || "No active blocker in this lane.")}</li>
        <li>Recommendation reasoning: ${escapeHtml(card.active_task || "Waiting on new owned work.")}</li>
        <li>Role responsibility: ${escapeHtml(role.responsibility)}</li>
      </ul>
    </section>

    <section class="detail-section">
      <h3>History</h3>
      <ul class="detail-list">
        <li>Last update: ${escapeHtml(formatTimestamp(card.updated_at))}</li>
        <li>Focused opportunity: ${escapeHtml(card.opportunity_id || "None")}</li>
      </ul>
      <p class="eyebrow" style="margin-top:14px;">Movement intents</p>
      ${renderMovementIntentList(
        movementIntents,
        "No movement intents currently route through this lane."
      )}
    </section>

    ${renderSupportContextSection(capitalStrategy, null)}
  `;

  bindMovementIntentControls();
}

function renderDetailForAgent(card) {
  const opportunities = state.snapshot.workflow.opportunities.filter(
    (entry) => entry.latest_task && entry.latest_task.owner === card.agent
  );
  const activeOpportunity = card.opportunity_id ? findOpportunityById(card.opportunity_id) : null;
  const presence = findPresenceByAgent(card.agent);
  const zoneAnchor = presence ? findZoneAnchorById(presence.zone_id) : null;
  const movementIntents = movementIntentsForAgent(card.agent);
  const capitalStrategy =
    card.agent === "CEO Agent" ? state.snapshot.capital_strategy : null;
  const role = describeRole(card.agent);
  const topOpportunity = getTopLaneOpportunity(card.agent);
  const dominantMessage = getLaneDominantMessage(card, presence, topOpportunity);
  const currentFocus = buildCurrentFocusModel({
    ownedBy: presence ? presence.zone_label : card.agent,
    opportunityId: topOpportunity ? topOpportunity.opportunity_id : "None",
    visualState: presence ? presence.visual_state : "idle",
    nextStep: dominantMessage.text,
  });

  elements.detailPanel.innerHTML = `
    ${renderCurrentFocusStrip(currentFocus)}
    <section class="detail-section">
      <div class="detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Selected agent</p>
            <strong>${escapeHtml(card.agent)}</strong>
          </div>
          <span class="status-pill ${formatStatusClass(card.status)}">${escapeHtml(card.status)}</span>
        </div>
        <p>${escapeHtml(card.active_task)}</p>
        <div class="card-tags">
          <span class="priority-pill ${formatStatusClass(card.urgency)}">${escapeHtml(card.urgency)} urgency</span>
          <span class="priority-pill">${escapeHtml(card.opportunity_id || "company-wide")}</span>
        </div>
      </div>
    </section>

    <section class="detail-section">
      <h3>Role ownership</h3>
      <ul class="detail-list">
        <li>Responsibility: ${escapeHtml(role.responsibility)}</li>
        <li>Avatar behavior: ${escapeHtml(role.avatar)}</li>
        <li>Operational position: ${escapeHtml(role.flow)}</li>
      </ul>
    </section>

    <section class="detail-section">
      <h3>Office presence</h3>
      <ul class="detail-list">
        <li>Zone: ${escapeHtml(presence ? presence.zone_label : "Unknown")}</li>
        <li>Department: ${escapeHtml(presence ? presence.department_label : "Unknown")}</li>
        <li>Bubble state: ${escapeHtml(presence ? presence.bubble_label : "N/A")}</li>
        <li>Bubble text: ${escapeHtml(presence ? presence.bubble_text : "N/A")}</li>
        <li>Lane: ${escapeHtml(formatLaneLabel(presence ? presence.lane_stage : "monitor"))}</li>
        <li>Anchor: ${escapeHtml(
          zoneAnchor && zoneAnchor.anchor
            ? `${Math.round(zoneAnchor.anchor.x * 100)}%, ${Math.round(zoneAnchor.anchor.y * 100)}%`
            : "N/A"
        )}</li>
      </ul>
    </section>

    <section class="detail-section">
      <h3>Current lane</h3>
      <ul class="detail-list">
        <li>Blocker: ${escapeHtml(card.blocker || "No blocker.")}</li>
        <li>Updated: ${escapeHtml(formatTimestamp(card.updated_at))}</li>
        <li>Focused opportunity: ${escapeHtml(card.opportunity_id || "None")}</li>
      </ul>
    </section>

    ${
      capitalStrategy
        ? `
          <section class="detail-section">
            <h3>Support posture</h3>
            <ul class="detail-list">
              <li>Capital mode: ${escapeHtml(capitalStrategy.capital_mode)}</li>
              <li>Why support is tightening or loosening: ${escapeHtml(capitalStrategy.capital_mode_reason)}</li>
              <li>Top priorities: ${escapeHtml(
                capitalStrategy.approved_strategy_priorities
                  .slice(0, 3)
                  .map((item) => formatStrategyLabel(item))
                  .join(", ")
              )}</li>
            </ul>
            <h3 style="margin-top:16px;">Recent support shifts</h3>
            ${
              capitalStrategy.board_history.length
                ? `<ul class="history-list">${capitalStrategy.board_history
                    .map(
                      (entry) => `
                        <li class="status-history-item">
                          <div class="detail-meta">
                            <strong>${escapeHtml(formatStrategyLabel(entry.capital_mode))}</strong>
                            <time>${escapeHtml(formatTimestamp(entry.timestamp))}</time>
                          </div>
                          <p>${escapeHtml(entry.rationale_snapshot)}</p>
                        </li>
                      `
                    )
                    .join("")}</ul>`
                : `<div class="empty-state">No recent capital posture snapshots recorded.</div>`
            }
          </section>
        `
        : ""
    }

    <section class="detail-section">
      <h3>Related opportunities</h3>
      ${
        opportunities.length
          ? `<ul class="detail-list">${opportunities
              .map(
                (entry) => `
                  <li>
                    <button type="button" class="task-chip" data-type="opportunity" data-id="${escapeHtml(entry.opportunity_id)}">
                      ${escapeHtml(entry.opportunity_id)} | ${escapeHtml(entry.current_status)}
                    </button>
                  </li>
                `
              )
              .join("")}</ul>`
          : `<div class="empty-state">No workflow tasks currently routed to this agent.</div>`
      }
    </section>

    <section class="detail-section">
      <h3>Movement intents</h3>
      ${renderMovementIntentList(
        movementIntents,
        "No movement intents currently route through this agent."
      )}
    </section>

    ${
      activeOpportunity
        ? `
          <section class="detail-section">
            <h3>Focused opportunity note</h3>
            <p>${escapeHtml(
              activeOpportunity.contract_bundle.opportunity_record
                ? activeOpportunity.contract_bundle.opportunity_record.notes
                : "No contract note available."
            )}</p>
          </section>
        `
        : ""
    }
  `;

  elements.detailPanel.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
    });
  });
  bindMovementIntentControls();
}

function renderDetailPanel() {
  if (!state.selected) {
    elements.detailPanel.innerHTML = `<div class="empty-state">Select an agent or opportunity.</div>`;
    return;
  }

  if (state.selected.type === "agent") {
    const card = findAgentByName(state.selected.id);
    if (card) {
      const dominantOpportunity = getTopLaneOpportunity(card.agent);
      if (dominantOpportunity) {
        renderDetailForOpportunity(dominantOpportunity);
        return;
      }
      renderDetailForLaneEmpty(card);
      return;
    }
  }

  const opportunity = findOpportunityById(state.selected.id);
  if (opportunity) {
    renderDetailForOpportunity(opportunity);
    return;
  }

  elements.detailPanel.innerHTML = `<div class="empty-state">The selected item is no longer available in the latest snapshot.</div>`;
}

function renderBoard() {
  const board = state.snapshot.office.company_board_snapshot;
  const attention = state.snapshot.attention.top_task;
  const recentEvents = getRecentOperatingEvents();
  const handoffSignals = sortHandoffSignalsDeterministic(
    state.snapshot.office.handoff_signals || []
  ).slice(0, V1_BOARD_CONTRACT.maxVisibleHandoffs);
  const capitalControls = state.snapshot.capital_controls;
  const capitalStrategy = state.snapshot.capital_strategy;
  const capitalSnapshot = capitalControls && capitalControls.account_snapshot ? capitalControls.account_snapshot : null;
  const capitalIntegrity = capitalControls && capitalControls.ledger_integrity ? capitalControls.ledger_integrity : null;
  const pendingWithdrawalRequests =
    capitalControls && Array.isArray(capitalControls.pending_withdrawal_requests)
      ? capitalControls.pending_withdrawal_requests
      : [];
  const recentLedgerEntries =
    capitalControls && Array.isArray(capitalControls.recent_ledger_entries)
      ? capitalControls.recent_ledger_entries
      : [];
  const priorities = board.priorities.length
    ? board.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No active priorities.</li>";
  const alerts = board.alerts.length
    ? board.alerts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No alerts.</li>";
  const activeOpportunities = board.active_opportunities.length
    ? board.active_opportunities
        .map(
          (opportunityId) => `
            <button type="button" class="task-chip" data-type="opportunity" data-id="${escapeHtml(opportunityId)}">${escapeHtml(opportunityId)}</button>
          `
        )
        .join("")
    : "<span class=\"muted\">No active opportunities.</span>";
  const recentEventsHtml = recentEvents.length
    ? `<ul class="history-list">${recentEvents
        .map(
          (event) => `
            <li class="status-history-item">
              <div class="detail-meta">
                <strong>${escapeHtml(formatOfficeEventType(event.type))}</strong>
                <time>${escapeHtml(formatTimestamp(event.timestamp))}</time>
              </div>
              <p>${escapeHtml(event.summary || "Company activity updated.")}</p>
            </li>
          `
        )
        .join("")}</ul>`
    : `<div class="empty-state">No recent operating events recorded.</div>`;
  const capitalSummary = capitalSnapshot
    ? `
      <ul class="detail-list compact-list">
        <li>Available: ${formatCurrency(capitalSnapshot.available_usd)}</li>
        <li>Capital left: ${formatCurrency(
          typeof capitalControls.capital_left_usd === "number"
            ? capitalControls.capital_left_usd
            : capitalSnapshot.available_usd
        )}</li>
        <li>Reserved: ${formatCurrency(capitalSnapshot.reserved_usd)}</li>
        <li>Committed: ${formatCurrency(capitalSnapshot.committed_usd)}</li>
        <li>Pending withdrawal: ${formatCurrency(capitalSnapshot.pending_withdrawal_usd)}</li>
        <li>Ledger entries: ${capitalIntegrity ? capitalIntegrity.entry_count : "n/a"}</li>
      </ul>
    `
    : `<p class="muted">Capital runtime ledger not initialized in this workspace path.</p>`;
  const capitalLatestRequestHtml =
    capitalControls && capitalControls.latest_request
      ? `
      <article class="status-history-item capital-history-item">
        <div class="detail-meta">
          <strong>Latest request: ${escapeHtml(capitalControls.latest_request.request_id)}</strong>
          <time>${escapeHtml(formatTimestamp(capitalControls.latest_request.requested_at))}</time>
        </div>
        <p>${escapeHtml(
          `${formatCapitalRequestStatus(capitalControls.latest_request.status)} ${capitalControls.latest_request.action} for ${formatCurrency(
            capitalControls.latest_request.amount_usd
          )}.`
        )}</p>
      </article>
    `
      : `<p class="muted">No capital requests recorded yet.</p>`;
  const capitalHistoryHtml = recentLedgerEntries.length
    ? `<ul class="history-list">${recentLedgerEntries
        .map(
          (entry) => `
          <li class="status-history-item">
            <div class="detail-meta">
              <strong>${escapeHtml(entry.entry_id)}</strong>
              <time>${escapeHtml(formatTimestamp(entry.timestamp))}</time>
            </div>
            <p>${escapeHtml(
              `${entry.action} ${formatCurrency(entry.amount_usd)} by ${entry.performed_by || "unknown actor"}`
            )}</p>
          </li>
        `
        )
        .join("")}</ul>`
    : `<p class="muted">No ledger history yet.</p>`;
  const pendingWithdrawalItemsHtml = pendingWithdrawalRequests.length
    ? pendingWithdrawalRequests
        .map(
          (request) => `
          <article class="queue-item">
            <div class="queue-title-row">
              <div>
                <strong>${escapeHtml(request.request_id)}</strong>
                <p class="queue-meta">${escapeHtml(formatTimestamp(request.requested_at))}</p>
              </div>
              <span class="status-pill ${formatStatusClass(request.status)}">${escapeHtml(
                formatCapitalRequestStatus(request.status)
              )}</span>
            </div>
            <p class="queue-meta">${escapeHtml(request.reason || "No reason provided.")}</p>
            <p class="queue-meta">${escapeHtml(
              `Amount ${formatCurrency(request.amount_usd)} | Available now ${formatCurrency(
                request.current_available_usd
              )} | Pending now ${formatCurrency(request.current_pending_withdrawal_usd)} | Available after execution ${formatCurrency(
                request.resulting_available_usd_after_execution
              )}`
            )}</p>
            <div class="queue-actions">
              <button type="button" class="queue-action queue-action-approve" data-capital-action="approve_withdrawal" data-request-id="${escapeHtml(request.request_id)}" data-request-amount="${escapeHtml(String(request.amount_usd))}" ${state.capitalActionInFlight ? "disabled" : ""}>Approve withdrawal</button>
              <button type="button" class="queue-action queue-action-info" data-capital-action="cancel_withdrawal" data-request-id="${escapeHtml(request.request_id)}" data-request-amount="${escapeHtml(String(request.amount_usd))}" ${state.capitalActionInFlight ? "disabled" : ""}>Cancel request</button>
              <button type="button" class="queue-action queue-action-reject" data-capital-action="reject_withdrawal" data-request-id="${escapeHtml(request.request_id)}" data-request-amount="${escapeHtml(String(request.amount_usd))}" ${state.capitalActionInFlight ? "disabled" : ""}>Reject request</button>
            </div>
          </article>
        `
        )
        .join("")
    : `<p class="muted">No pending withdrawal requests.</p>`;
  const withdrawalFormHtml = capitalSnapshot
    ? `
      <form class="capital-withdrawal-form" data-capital-form="request-withdrawal">
        <label>
          Amount (USD)
          <input type="number" step="0.01" min="0.01" name="amount_usd" required placeholder="0.00" />
        </label>
        <label>
          Reason
          <textarea name="reason" rows="2" required placeholder="Why this withdrawal is needed"></textarea>
        </label>
        <p class="muted" data-withdraw-preview>Preview available after request: ${formatCurrency(
          capitalSnapshot.available_usd
        )} (current available ${formatCurrency(capitalSnapshot.available_usd)}).</p>
        <button type="submit" class="queue-action queue-action-approve" ${state.capitalActionInFlight ? "disabled" : ""}>Request withdrawal</button>
      </form>
    `
    : "";
  const capitalMessageHtml = state.capitalMessage
    ? `<p class="panel-note decision-note-${escapeHtml(state.capitalMessageLevel)}">${escapeHtml(state.capitalMessage)}</p>`
    : "";
  const capitalStrategySummary = capitalStrategy
    ? `
      <article class="board-block capital-strategy-block">
        <div class="capital-strategy-head">
          <div>
            <p class="eyebrow">Support system</p>
            <strong class="capital-mode-label">${escapeHtml(capitalStrategy.capital_mode)}</strong>
          </div>
          <span class="priority-pill">${escapeHtml(
            formatStrategyLabel(capitalStrategy.approved_strategy_priorities[0] || "monitor")
          )}</span>
        </div>
        <p>${escapeHtml(capitalStrategy.capital_mode_reason)}</p>
        <div class="card-tags" style="margin-top:12px;">
          <span class="task-chip">${escapeHtml(
            formatStrategyLabel(capitalStrategy.approved_strategy_priorities[0] || "monitor")
          )}</span>
        </div>
        ${
          capitalStrategy.capital_risk_flags.length
            ? `<p class="muted">${escapeHtml(capitalStrategy.capital_risk_flags[0])}</p>`
            : ""
        }
        <p class="muted">Finance stays advisory here unless you enter a dedicated finance workflow.</p>
      </article>
    `
    : "";

  elements.companyBoard.innerHTML = `
    <article class="board-block">
      <p class="eyebrow">Company pulse</p>
      <p class="board-lead">${
        attention
          ? escapeHtml(`${attention.owner} is driving ${attention.opportunity_id || "company-wide work"} toward ${attention.next_action}.`)
          : "No single attention item is dominating the floor right now."
      }</p>
      <p class="muted">Each opportunity has one current owner lane at a time, and the floor should read as active company work rather than passive monitoring.</p>
    </article>
    <div class="board-columns">
      <article class="board-block">
        <h3>Live handoffs</h3>
        <ul class="board-list">
          ${
            handoffSignals.length
              ? handoffSignals
                  .slice(0, 4)
                  .map(
                    (signal) => `
                      <li>${escapeHtml(shortAgentLabel(signal.from_agent))} -> ${escapeHtml(shortAgentLabel(signal.to_agent))} on ${escapeHtml(signal.opportunity_id)}</li>
                    `
                  )
                  .join("")
              : "<li>No active handoffs are waiting right now.</li>"
          }
        </ul>
      </article>
      <article class="board-block">
        <h3>Board counts</h3>
        <div class="board-metric-row">
          <span class="priority-pill">approvals ${escapeHtml(String(board.approvals_waiting))}</span>
          <span class="priority-pill">blocked ${escapeHtml(String(board.blocked_count))}</span>
          <span class="priority-pill">active ${escapeHtml(String(board.active_opportunities.length))}</span>
        </div>
        <p class="muted">The lane cards on the floor hold the dominant item, next action, and blocker context. This board panel stays lightweight for orientation.</p>
      </article>
    </div>
    <article class="board-block">
      <h3>Recent company activity</h3>
      ${recentEventsHtml}
    </article>
    ${capitalStrategySummary}
    <article class="board-block board-support-block">
      <h3>Support systems</h3>
      <p>${escapeHtml(board.capital_note)}</p>
      <p class="muted">Finance may shape approval and pacing, but it is not a primary board lane in v1.</p>
      ${capitalSummary}
      ${capitalMessageHtml}
      ${capitalLatestRequestHtml}
      <h4>Withdrawal request control (user-authorized)</h4>
      <p class="muted">Only withdrawal request, approval, and cancel/reject are writable in UI. Deposit/reserve/release/approve_use stay runtime-only.</p>
      ${withdrawalFormHtml}
      <h4>Pending withdrawal requests</h4>
      ${pendingWithdrawalItemsHtml}
      <h4>Recent capital ledger actions</h4>
      ${capitalHistoryHtml}
    </article>
  `;

  elements.companyBoard.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
    });
  });
  const withdrawalForm = elements.companyBoard.querySelector("[data-capital-form='request-withdrawal']");
  if (withdrawalForm && capitalSnapshot) {
    const amountInput = withdrawalForm.querySelector("input[name='amount_usd']");
    const previewNode = withdrawalForm.querySelector("[data-withdraw-preview]");
    const updatePreview = () => {
      if (!amountInput || !previewNode) {
        return;
      }
      const amount = Number(amountInput.value);
      const validAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      const previewAfterRequest = Math.max(0, capitalSnapshot.available_usd - validAmount);
      previewNode.textContent = `Preview available after request: ${formatCurrency(
        previewAfterRequest
      )} (current available ${formatCurrency(capitalSnapshot.available_usd)}).`;
    };
    if (amountInput) {
      amountInput.addEventListener("input", updatePreview);
    }
    withdrawalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.capitalActionInFlight) {
        return;
      }
      const formData = new FormData(withdrawalForm);
      const amount = Number(formData.get("amount_usd"));
      const reason = String(formData.get("reason") || "").trim();
      if (!Number.isFinite(amount) || amount <= 0 || !reason) {
        setCapitalMessage("Amount and reason are required for withdrawal request.", "error");
        renderBoard();
        return;
      }
      const availableAfterRequest = capitalSnapshot.available_usd - amount;
      const confirmed = window.confirm(
        `Create withdrawal request for ${formatCurrency(amount)}?\nCurrent available: ${formatCurrency(
          capitalSnapshot.available_usd
        )}\nCurrent pending withdrawal: ${formatCurrency(
          capitalSnapshot.pending_withdrawal_usd
        )}\nAvailable after request: ${formatCurrency(availableAfterRequest)}`
      );
      if (!confirmed) {
        return;
      }
      await submitCapitalWithdrawalAction(
        "/api/capital-withdrawal/request",
        {
          amount_usd: amount,
          reason,
          actor: "owner_operator",
          note: "UI withdrawal request.",
        },
        "Submitting withdrawal request...",
        "Withdrawal request recorded."
      );
    });
  }
  elements.companyBoard.querySelectorAll("[data-capital-action][data-request-id]").forEach((node) => {
    node.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.capitalActionInFlight) {
        return;
      }
      const action = node.dataset.capitalAction;
      const requestId = node.dataset.requestId;
      const requestAmount = Number(node.dataset.requestAmount || "0");
      if (!action || !requestId) {
        return;
      }
      if (!capitalSnapshot) {
        setCapitalMessage("Capital state is unavailable for withdrawal actions.", "error");
        renderBoard();
        return;
      }
      if (action === "approve_withdrawal") {
        const confirmed = window.confirm(
          `Approve and execute withdrawal ${requestId}?\nRequested amount: ${formatCurrency(
            requestAmount
          )}\nCurrent available: ${formatCurrency(capitalSnapshot.available_usd)}\nCurrent pending withdrawal: ${formatCurrency(
            capitalSnapshot.pending_withdrawal_usd
          )}\nResulting available after execution: ${formatCurrency(
            capitalSnapshot.available_usd
          )}\nThis action is irreversible once confirmed.`
        );
        if (!confirmed) {
          return;
        }
        await submitCapitalWithdrawalAction(
          "/api/capital-withdrawal/approve",
          {
            request_id: requestId,
            actor: "owner_operator",
            confirm_irreversible: true,
            note: "UI withdrawal approval.",
          },
          `Approving withdrawal ${requestId}...`,
          `Withdrawal ${requestId} approved and executed.`
        );
        return;
      }
      if (action === "cancel_withdrawal" || action === "reject_withdrawal") {
        const endpoint =
          action === "reject_withdrawal"
            ? "/api/capital-withdrawal/reject"
            : "/api/capital-withdrawal/cancel";
        const actionLabel = action === "reject_withdrawal" ? "Reject" : "Cancel";
        const confirmed = window.confirm(
          `${actionLabel} pending withdrawal ${requestId}?\nAmount: ${formatCurrency(
            requestAmount
          )}\nFunds will return to available capital.`
        );
        if (!confirmed) {
          return;
        }
        await submitCapitalWithdrawalAction(
          endpoint,
          {
            request_id: requestId,
            actor: "owner_operator",
            reason: `${actionLabel}ed in UI by owner operator.`,
            note: `UI ${actionLabel.toLowerCase()} withdrawal request.`,
          },
          `${actionLabel}ing withdrawal ${requestId}...`,
          `Withdrawal ${requestId} ${actionLabel.toLowerCase()}ed.`
        );
      }
    });
  });
}

function renderApprovalQueue() {
  const totals = state.snapshot.approval_queue.totals;
  const items = state.snapshot.approval_queue.items;
  const totalsHtml = `
    <div class="queue-totals">
      <span class="priority-pill">pending ${totals.pending}</span>
      <span class="priority-pill">approved ${totals.approve}</span>
      <span class="priority-pill">rejected ${totals.reject}</span>
      <span class="priority-pill">info ${totals.request_more_info}</span>
    </div>
  `;

  const itemsHtml = items.length
    ? items
        .map((item) => {
          const isSelected =
            state.selected &&
            state.selected.type === "opportunity" &&
            state.selected.id === item.opportunity_id;
          const operationalNext = item.operational_next || null;
          const resolvedOutcome = buildResolvedQueueOutcome(state.snapshot, item);
          const decisionControls =
            item.status === "pending"
              ? `
                <div class="queue-actions">
                  <button type="button" class="queue-action queue-action-approve" data-ticket-id="${escapeHtml(item.ticket_id)}" data-decision="approve" ${state.decisionInFlight ? "disabled" : ""}>Approve</button>
                  <button type="button" class="queue-action queue-action-info" data-ticket-id="${escapeHtml(item.ticket_id)}" data-decision="request_more_info" ${state.decisionInFlight ? "disabled" : ""}>More info</button>
                  <button type="button" class="queue-action queue-action-reject" data-ticket-id="${escapeHtml(item.ticket_id)}" data-decision="reject" ${state.decisionInFlight ? "disabled" : ""}>Reject</button>
                  ${
                    state.lastDecisionRetry &&
                    state.lastDecisionRetry.ticketId === item.ticket_id
                      ? `<button type="button" class="queue-action queue-action-retry" data-ticket-id="${escapeHtml(item.ticket_id)}" data-decision="${escapeHtml(state.lastDecisionRetry.decision)}" data-retry="true" ${state.decisionInFlight ? "disabled" : ""}>Retry ${escapeHtml(formatDecisionLabel(state.lastDecisionRetry.decision))}</button>`
                      : ""
                  }
                </div>
              `
              : "";
          return `
            <article class="queue-item queue-item-selectable ${isSelected ? "is-selected" : ""}" data-type="opportunity" data-id="${escapeHtml(item.opportunity_id)}">
              <div class="queue-title-row">
                <div>
                  <strong>${escapeHtml(item.ticket_id)}</strong>
                  <p class="queue-meta">${escapeHtml(item.opportunity_id)}</p>
                </div>
                <span class="status-pill ${formatStatusClass(item.status)}">${escapeHtml(item.status)}</span>
              </div>
              ${
                operationalNext
                  ? `<p class="queue-meta">${escapeHtml(
                      normalizeOneLineSummary(
                        buildOperationalNextSummary(operationalNext),
                        "Operational next pending."
                      )
                    )}</p>`
                  : ""
              }
              <p class="queue-meta">${escapeHtml(normalizeOneLineSummary(item.ticket.reasoning_summary, "Approval packet summary pending."))}</p>
              <p class="queue-meta">${escapeHtml(normalizeOneLineSummary(
                `Approve: ${item.approve_consequence || "No consequence summary."} Reject: ${item.reject_consequence || "No consequence summary."} More info: ${item.more_info_consequence || "No consequence summary."}`,
                "Approval consequence summary pending."
              ))}</p>
              ${
                resolvedOutcome
                  ? `<p class="queue-meta">${escapeHtml(
                      normalizeOneLineSummary(resolvedOutcome, "Resolved outcome pending.")
                    )}</p>`
                  : ""
              }
              <div class="detail-meta">
                <div class="detail-meta-item"><span>Exposure</span><strong>${formatCurrency(item.ticket.max_exposure_usd)}</strong></div>
                <div class="detail-meta-item"><span>Required by</span><strong>${escapeHtml(formatTimestamp(item.ticket.required_by))}</strong></div>
                <div class="detail-meta-item"><span>Decision</span><strong>${escapeHtml(item.decided_by || "Pending")}</strong></div>
              </div>
              ${decisionControls}
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No approval tickets are recorded yet.</div>`;

  elements.approvalQueue.innerHTML = `${totalsHtml}${itemsHtml}`;
  elements.approvalQueue.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
    });
  });
  elements.approvalQueue.querySelectorAll("[data-ticket-id][data-decision]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.decisionInFlight) {
        return;
      }
      const ticketId = node.dataset.ticketId;
      const decision = node.dataset.decision;
      if (!ticketId || !decision) {
        return;
      }
      const confirmed = window.confirm(buildDecisionConfirmMessage(ticketId, decision));
      if (!confirmed) {
        return;
      }
      submitApprovalDecision(ticketId, decision);
    });
  });
}

function renderAttention() {
  const task = state.snapshot.attention.top_task;
  elements.generatedAt.textContent = formatTimestamp(state.snapshot.generated_at);
  const attentionOpportunity =
    task && task.opportunity_id
      ? findOpportunityByIdInSnapshot(state.snapshot, task.opportunity_id)
      : null;
  const baseMessage =
    task && attentionOpportunity && attentionOpportunity.operational_next
      ? normalizeOneLineSummary(
          `${attentionOpportunity.opportunity_id}: ${buildOperationalNextSummary(
            attentionOpportunity.operational_next
          )}`,
          `${task.owner} next: ${task.next_action}`
        )
      : task
        ? `${task.owner} next: ${task.next_action}`
        : "No active attention item.";
  const activeMessage = state.decisionMessage || state.shellMessage;
  const activeLevel = state.decisionMessage ? state.decisionMessageLevel : state.shellMessageLevel;
  elements.attentionNote.className = `panel-note decision-note-${normalizeToken(
    activeLevel || "info"
  )}`;
  elements.attentionNote.textContent = activeMessage ? `${baseMessage} | ${activeMessage}` : baseMessage;
}

function syncRoutePlaybackState() {
  if (!state.snapshot) {
    state.routePlayback.intentId = null;
    state.routePlayback.progress = 50;
    return;
  }
  if (
    state.routePlayback.intentId &&
    !getMovementIntentById(state.routePlayback.intentId)
  ) {
    state.routePlayback.intentId = null;
  }
  state.routePlayback.progress = Math.max(
    0,
    Math.min(100, state.routePlayback.progress)
  );
}

function render() {
  if (!state.snapshot) {
    return;
  }
  syncRoutePlaybackState();
  ensureSelection();
  renderKpis();
  renderAttention();
  renderOfficeCanvas();
  renderDetailPanel();
  renderBoard();
  renderApprovalQueue();
}

function closeIntakeDialog(force = false) {
  if (!force && state.intakeSubmitInFlight) {
    return;
  }
  if (!elements.intakeDialog) {
    return;
  }
  if (typeof elements.intakeDialog.close === "function") {
    elements.intakeDialog.close();
    return;
  }
  elements.intakeDialog.removeAttribute("open");
}

function openIntakeDialog() {
  if (!elements.intakeDialog || !elements.intakeForm) {
    return;
  }
  elements.intakeForm.reset();
  if (state.latestIntakeDraft) {
    elements.intakeForm.elements.summary.value = state.latestIntakeDraft.summary || "";
    elements.intakeForm.elements.source.value = state.latestIntakeDraft.source || "";
    elements.intakeForm.elements.ask_price_usd.value =
      typeof state.latestIntakeDraft.askPriceUsd === "number"
        ? String(state.latestIntakeDraft.askPriceUsd)
        : "";
    elements.intakeForm.elements.note.value = state.latestIntakeDraft.note || "";
  }
  if (typeof elements.intakeDialog.showModal === "function") {
    elements.intakeDialog.showModal();
  } else {
    elements.intakeDialog.setAttribute("open", "open");
  }
  const firstField = elements.intakeForm.elements.summary;
  if (firstField && typeof firstField.focus === "function") {
    window.setTimeout(() => firstField.focus(), 0);
  }
}

function setIntakeFormDisabled(disabled) {
  if (!elements.intakeForm) {
    return;
  }
  elements.intakeForm.querySelectorAll("input, textarea, button").forEach((node) => {
    node.disabled = disabled;
  });
  const submitButton = elements.intakeForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.textContent = disabled ? "Creating..." : "Create opportunity";
  }
}

function focusTopTask() {
  if (!state.snapshot) {
    return;
  }
  const task = state.snapshot.attention && state.snapshot.attention.top_task;
  const opportunityId =
    task && task.opportunity_id && findOpportunityById(task.opportunity_id)
      ? task.opportunity_id
      : null;
  if (!opportunityId) {
    setShellMessage("No top attention opportunity is available to focus right now.", "info", {
      ttlMs: 8000,
    });
    renderAttention();
    return;
  }
  setSelection("opportunity", opportunityId);
  elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setShellMessage(`Focused ${opportunityId} from the current top task.`, "success", {
    ttlMs: 8000,
  });
  renderAttention();
}

async function loadSnapshot() {
  elements.refreshButton.disabled = true;
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot request failed (${response.status})`);
    }
    const nextSnapshot = await response.json();
    const transitions = computeTransitionState(state.snapshot, nextSnapshot);
    state.selected = resolveSelectionForSnapshot(nextSnapshot, state.selected, state.snapshot);
    state.snapshot = nextSnapshot;
    setTransitionState(transitions);
    render();
    return nextSnapshot;
  } catch (error) {
    elements.detailPanel.innerHTML = `<div class="empty-state">${escapeHtml(
      error instanceof Error ? error.message : String(error)
    )}</div>`;
    return null;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.focusTaskButton.addEventListener("click", () => {
  focusTopTask();
});

elements.ingestButton.addEventListener("click", () => {
  openIntakeDialog();
});

elements.intakeCloseButton.addEventListener("click", () => {
  closeIntakeDialog();
});

elements.intakeCancelButton.addEventListener("click", () => {
  closeIntakeDialog();
});

elements.intakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.intakeSubmitInFlight) {
    return;
  }
  const formData = new FormData(elements.intakeForm);
  const summary = String(formData.get("summary") || "").trim();
  const source = String(formData.get("source") || "").trim();
  const askPriceText = String(formData.get("ask_price_usd") || "").trim();
  const askPriceRaw = Number(askPriceText);
  const note = String(formData.get("note") || "").trim();
  if (!summary || !source || !askPriceText || !Number.isFinite(askPriceRaw) || askPriceRaw < 0) {
    setShellMessage("Listing summary, source, and ask price are required to create an opportunity.", "error", {
      ttlMs: 9000,
    });
    renderAttention();
    return;
  }
  state.latestIntakeDraft = {
    summary,
    source,
    askPriceUsd: Number.isFinite(askPriceRaw) && askPriceRaw >= 0 ? askPriceRaw : null,
    note,
    createdAt: new Date().toISOString(),
  };
  state.intakeSubmitInFlight = true;
  setIntakeFormDisabled(true);
  setShellMessage(`Creating a real intake opportunity from ${source}...`, "info", {
    ttlMs: 9000,
  });
  renderAttention();

  try {
    const response = await fetch("/api/opportunity-intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        source,
        ask_price_usd: askPriceRaw,
        note,
        actor: "owner_operator",
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload && typeof payload.message === "string"
          ? payload.message
          : `Opportunity intake failed (${response.status}).`
      );
    }
    const opportunityId =
      payload && payload.result && typeof payload.result.opportunity_id === "string"
        ? payload.result.opportunity_id
        : "";
    if (!opportunityId) {
      throw new Error("Opportunity intake response did not include an opportunity_id.");
    }
    state.latestIntakeDraft = null;
    state.selected = { type: "opportunity", id: opportunityId };
    closeIntakeDialog(true);
    const nextSnapshot = await loadSnapshot();
    if (nextSnapshot && findOpportunityByIdInSnapshot(nextSnapshot, opportunityId)) {
      setSelection("opportunity", opportunityId);
      elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setShellMessage(`Created ${opportunityId} and added it to the live workflow.`, "success", {
      ttlMs: 9000,
    });
    renderAttention();
  } catch (error) {
    setShellMessage(
      error instanceof Error ? error.message : String(error),
      "error",
      { ttlMs: 9000 }
    );
    renderAttention();
  } finally {
    state.intakeSubmitInFlight = false;
    setIntakeFormDisabled(false);
  }
});

elements.refreshButton.addEventListener("click", () => {
  loadSnapshot();
});

loadSnapshot();
window.setInterval(loadSnapshot, 30000);



