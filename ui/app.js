"use strict";

const TRANSITION_WINDOW_MS = 14000;
const DECISION_REQUEST_TIMEOUT_MS = 12000;
const DECISION_SUCCESS_MESSAGE_MS = 9000;

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
  decisionInFlight: false,
  decisionMessage: null,
  decisionMessageLevel: "info",
  decisionMessageTimerId: null,
  lastDecisionRetry: null,
  routePlayback: {
    intentId: null,
    progress: 50,
  },
};

const elements = {
  generatedAt: document.querySelector("#generated-at"),
  refreshButton: document.querySelector("#refresh-button"),
  kpiStrip: document.querySelector("#kpi-strip"),
  officeCanvas: document.querySelector("#office-canvas"),
  detailPanel: document.querySelector("#detail-panel"),
  companyBoard: document.querySelector("#company-board"),
  approvalQueue: document.querySelector("#approval-queue"),
  attentionNote: document.querySelector("#attention-note"),
  kpiCardTemplate: document.querySelector("#kpi-card-template"),
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
    "CEO Agent": "CEO",
    "Risk and Compliance Agent": "Risk",
    "Operations Coordinator Agent": "Ops",
    "Department Operator Agent": "Market",
  };
  return mapping[agent] || String(agent || "Agent");
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
    return activeTransitions.handoffs.map((signal) =>
      withMovementIntent(signal, true, movementIntentLookup)
    );
  }

  if ((state.snapshot.office.movement_intents || []).length) {
    return (state.snapshot.office.movement_intents || []).slice(0, 3).map((intent) => ({
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

  return (state.snapshot.office.handoff_signals || []).slice(0, 3).map((signal) => ({
    ...withMovementIntent(signal, false, movementIntentLookup),
  }));
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

function ensureSelection() {
  if (!state.snapshot) {
    state.selected = null;
    return;
  }

  if (state.selected && state.selected.type === "agent" && findAgentByName(state.selected.id)) {
    return;
  }
  if (state.selected && state.selected.type === "opportunity" && findOpportunityById(state.selected.id)) {
    return;
  }

  const topOpportunity =
    (state.snapshot.attention.top_task && state.snapshot.attention.top_task.opportunity_id) ||
    (state.snapshot.workflow.opportunities[0] && state.snapshot.workflow.opportunities[0].opportunity_id) ||
    null;

  state.selected = topOpportunity
    ? { type: "opportunity", id: topOpportunity }
    : state.snapshot.office.agent_status_cards[0]
      ? { type: "agent", id: state.snapshot.office.agent_status_cards[0].agent }
      : null;
}

function setSelection(type, id) {
  state.selected = { type, id };
  render();
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

function buildDecisionConfirmMessage(ticketId, decision) {
  const label = formatDecisionLabel(decision);
  return `Submit ${label} decision for ${ticketId}?`;
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

async function submitApprovalDecision(ticketId, decision) {
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
        note: `Submitted from UI shell (${decision}).`,
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
    setDecisionMessage(
      `Submitted ${formatDecisionLabel(decision)} for ${ticketId}.`,
      "success",
      { ttlMs: DECISION_SUCCESS_MESSAGE_MS }
    );
    await loadSnapshot();
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
  };
  return (
    byZone[presence.zone_id] || {
      mood: "Operations room",
      detail: "Live company state is visible here.",
    }
  );
}

function getZoneSignalLabel(presence) {
  if (presence.status === "blocked" || presence.status === "alert") {
    return "Attention required";
  }
  if (presence.status === "awaiting_approval") {
    return "Decision waiting";
  }
  if (presence.status === "working") {
    return "In active flow";
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

function getZoneFixtures(presence) {
  const byZone = {
    "executive-suite": [
      { kind: "table", label: "decision table" },
      { kind: "cabinet", label: "approval wall" },
      { kind: "plant", label: "corner plant" },
    ],
    "verification-bay": [
      { kind: "bench", label: "inspection bench" },
      { kind: "rack", label: "device rack" },
      { kind: "light", label: "task lamp" },
    ],
    "routing-desk": [
      { kind: "console", label: "routing console" },
      { kind: "slots", label: "handoff slots" },
      { kind: "phone", label: "dispatch phone" },
    ],
    "market-lab": [
      { kind: "display", label: "listing wall" },
      { kind: "table", label: "pricing table" },
      { kind: "shelf", label: "market shelf" },
    ],
  };
  return byZone[presence.zone_id] || [{ kind: "table", label: "shared station" }];
}

function renderFlowEvents(activeTransitions) {
  const events =
    ((state.snapshot.office.events && state.snapshot.office.events.length
      ? state.snapshot.office.events
      : state.snapshot.office.flow_events) || []).slice(0, 5);
  if (!events.length) {
    return `<div class="flow-feed empty">No recent workflow events.</div>`;
  }

  const items = events
    .map((event) => {
      const isNew = activeTransitions.newFlowEventIds.has(event.event_id);
      const approvalOutcome = formatApprovalOutcomeChip(event);
      const outcomeChipHtml = approvalOutcome
        ? `<span class="flow-outcome-chip flow-outcome-${escapeHtml(approvalOutcome.tone)}">${escapeHtml(approvalOutcome.label)}</span>`
        : "";
      return `
        <article class="flow-chip ${formatLaneClass(event.lane_stage)} ${formatFlowSeverityClass(event.severity)} ${isNew ? "is-new" : ""}">
          <p class="flow-chip-meta">
            <span>${escapeHtml(formatOfficeEventType(event.type || event.action || "event"))}</span>
            <span class="flow-chip-meta-right">
              ${outcomeChipHtml}
              <span>${escapeHtml(formatTimestamp(event.timestamp))}</span>
            </span>
          </p>
          <p class="flow-chip-text">${escapeHtml(event.summary || "Operational event recorded.")}</p>
          <p class="flow-chip-sub">${escapeHtml(event.opportunity_id || "company")}</p>
        </article>
      `;
    })
    .join("");

  return `<div class="flow-feed">${items}</div>`;
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

function pointAtProgress(points, progressRatio) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }
  if (points.length === 1) {
    return points[0];
  }

  const clamped = Math.max(0, Math.min(1, progressRatio));
  const segmentLengths = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) {
    return points[0];
  }

  let target = clamped * totalLength;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const start = points[index];
    const end = points[index + 1];
    if (target <= segmentLength || index === segmentLengths.length - 1) {
      const ratio = segmentLength === 0 ? 0 : target / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    target -= segmentLength;
  }
  return points[points.length - 1];
}

function resolveFallbackNodeCenter(node, layoutRect) {
  if (!node) {
    return null;
  }
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left - layoutRect.left + rect.width / 2,
    y: rect.top - layoutRect.top + rect.height / 2,
  };
}

function zoneEdgeKey(fromZoneId, toZoneId) {
  return [fromZoneId || "", toZoneId || ""].sort().join("|");
}

function buildActiveZoneEdges(renderableHandoffs, routeHintLookup) {
  const activeEdges = new Set();
  const activeZones = new Set();
  for (const signal of renderableHandoffs) {
    const fromZoneId =
      signal.from_zone_id ||
      (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.from_agent)?.zone_id ||
      null;
    const toZoneId =
      signal.to_zone_id ||
      (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.to_agent)?.zone_id ||
      null;
    if (!fromZoneId || !toZoneId) {
      continue;
    }

    const routeKey = `${signal.opportunity_id}|${fromZoneId}|${toZoneId}`;
    const routeHint = routeHintLookup.get(routeKey) || null;
    const routePath = Array.isArray(routeHint && routeHint.path_zone_ids)
      ? routeHint.path_zone_ids
      : [fromZoneId, toZoneId];
    if (routePath.length <= 1) {
      continue;
    }

    for (let index = 0; index < routePath.length - 1; index += 1) {
      const from = routePath[index];
      const to = routePath[index + 1];
      activeEdges.add(zoneEdgeKey(from, to));
      activeZones.add(from);
      activeZones.add(to);
    }
  }
  return { activeEdges, activeZones };
}

function renderZoneNetworkOverlay(renderableHandoffs) {
  const overlay = elements.officeCanvas.querySelector(".zone-network-overlay");
  const svg = elements.officeCanvas.querySelector(".zone-network-svg");
  const layout = elements.officeCanvas.querySelector(".office-layout");
  if (!overlay || !svg || !layout) {
    return;
  }

  svg.replaceChildren();
  const layoutRect = layout.getBoundingClientRect();
  const width = Math.max(1, layoutRect.width);
  const height = Math.max(1, layoutRect.height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);

  const zoneLookup = buildZoneAnchorLookup();
  const routeHintLookup = buildRouteHintLookup();
  const { activeEdges, activeZones } = buildActiveZoneEdges(renderableHandoffs, routeHintLookup);
  const namespace = "http://www.w3.org/2000/svg";
  const renderedEdges = new Set();

  for (const zone of zoneLookup.values()) {
    const connections = Array.isArray(zone.connections) ? zone.connections : [];
    for (const connection of connections) {
      if (!zoneLookup.has(connection)) {
        continue;
      }
      const key = zoneEdgeKey(zone.zone_id, connection);
      if (renderedEdges.has(key)) {
        continue;
      }
      renderedEdges.add(key);

      const start =
        resolveZoneAnchorPoint(zoneLookup, zone.zone_id, "handoff_dock", layoutRect) ||
        resolveZoneAnchorPoint(zoneLookup, zone.zone_id, "anchor", layoutRect);
      const end =
        resolveZoneAnchorPoint(zoneLookup, connection, "handoff_dock", layoutRect) ||
        resolveZoneAnchorPoint(zoneLookup, connection, "anchor", layoutRect);
      if (!start || !end) {
        continue;
      }

      const lineNode = document.createElementNS(namespace, "path");
      lineNode.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
      lineNode.setAttribute(
        "class",
        `zone-network-edge ${activeEdges.has(key) ? "is-active" : "is-idle"}`
      );
      svg.append(lineNode);
    }
  }

  for (const zone of zoneLookup.values()) {
    const point =
      resolveZoneAnchorPoint(zoneLookup, zone.zone_id, "handoff_dock", layoutRect) ||
      resolveZoneAnchorPoint(zoneLookup, zone.zone_id, "anchor", layoutRect);
    if (!point) {
      continue;
    }
    const node = document.createElementNS(namespace, "circle");
    node.setAttribute("cx", `${point.x}`);
    node.setAttribute("cy", `${point.y}`);
    node.setAttribute("r", activeZones.has(zone.zone_id) ? "4.5" : "3.2");
    node.setAttribute(
      "class",
      `zone-network-node ${activeZones.has(zone.zone_id) ? "is-active" : "is-idle"}`
    );
    svg.append(node);
  }
}

function renderHandoffOverlay(renderableHandoffs) {
  const overlay = elements.officeCanvas.querySelector(".handoff-overlay");
  const svg = elements.officeCanvas.querySelector(".handoff-svg");
  const chipLayer = elements.officeCanvas.querySelector(".handoff-chip-layer");
  const layout = elements.officeCanvas.querySelector(".office-layout");

  if (!overlay || !svg || !chipLayer || !layout) {
    return;
  }

  svg.replaceChildren();
  chipLayer.replaceChildren();

  if (!renderableHandoffs.length) {
    overlay.classList.add("hidden");
    return;
  }

  const layoutRect = layout.getBoundingClientRect();
  const width = Math.max(1, layoutRect.width);
  const height = Math.max(1, layoutRect.height);
  const zoneLookup = buildZoneAnchorLookup();
  const routeHintLookup = buildRouteHintLookup();
  const previewIntent = getMovementIntentById(state.routePlayback.intentId);
  const previewIntentKey = previewIntent
    ? buildMovementIntentKey(
        previewIntent.opportunity_id,
        previewIntent.from_zone_id,
        previewIntent.to_zone_id
      )
    : null;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);

  const namespace = "http://www.w3.org/2000/svg";

  for (const signal of renderableHandoffs) {
    const fromNode = layout.querySelector(
      `[data-type="agent"][data-id="${CSS.escape(signal.from_agent)}"]`
    );
    const toNode = layout.querySelector(
      `[data-type="agent"][data-id="${CSS.escape(signal.to_agent)}"]`
    );
    if (!fromNode || !toNode) {
      continue;
    }

    const fromZoneId =
      signal.from_zone_id ||
      (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.from_agent)?.zone_id ||
      null;
    const toZoneId =
      signal.to_zone_id ||
      (state.snapshot.office.presence || []).find((entry) => entry.agent === signal.to_agent)?.zone_id ||
      null;
    const fromAnchor = resolveZoneAnchorPoint(zoneLookup, fromZoneId, "egress", layoutRect);
    const toAnchor = resolveZoneAnchorPoint(zoneLookup, toZoneId, "ingress", layoutRect);
    const fromFallback = resolveFallbackNodeCenter(fromNode, layoutRect);
    const toFallback = resolveFallbackNodeCenter(toNode, layoutRect);
    const defaultStart = fromAnchor || fromFallback;
    const defaultEnd = toAnchor || toFallback;
    const routeKey = `${signal.opportunity_id}|${fromZoneId || ""}|${toZoneId || ""}`;
    const routeHint = routeHintLookup.get(routeKey) || null;
    const signalIntentKey = buildMovementIntentKey(signal.opportunity_id, fromZoneId, toZoneId);
    const intentPoints =
      Array.isArray(signal.waypoints) && signal.waypoints.length >= 2
        ? signal.waypoints
            .map((point) => resolveLayoutPoint(layoutRect, point))
            .filter(Boolean)
        : [];
    const routePoints =
      intentPoints.length >= 2
        ? intentPoints
        : routeHint && Array.isArray(routeHint.waypoints) && routeHint.waypoints.length >= 2
        ? routeHint.waypoints
            .map((point) => resolveLayoutPoint(layoutRect, point))
            .filter(Boolean)
        : [];

    const effectivePoints =
      routePoints.length >= 2
        ? routePoints
        : [defaultStart, defaultEnd].filter(Boolean);
    if (effectivePoints.length < 2) {
      continue;
    }

    const pathD =
      buildPathFromPoints(effectivePoints) ||
      `M ${defaultStart.x} ${defaultStart.y} L ${defaultEnd.x} ${defaultEnd.y}`;
    const midPoint = midpointFromPoints(effectivePoints) || {
      x: (defaultStart.x + defaultEnd.x) / 2,
      y: (defaultStart.y + defaultEnd.y) / 2,
    };

    const pathNode = document.createElementNS(namespace, "path");
    pathNode.setAttribute("d", pathD);
    pathNode.setAttribute(
      "class",
      `handoff-path ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim()
    );
    svg.append(pathNode);

    const pulseNode = document.createElementNS(namespace, "circle");
    pulseNode.setAttribute("cx", `${midPoint.x}`);
    pulseNode.setAttribute("cy", `${midPoint.y}`);
    pulseNode.setAttribute("r", signal.is_transition ? "6" : "4");
    pulseNode.setAttribute(
      "class",
      `handoff-pulse ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim()
    );
    svg.append(pulseNode);

    const isPreviewSignal = previewIntentKey && signalIntentKey === previewIntentKey;
    const shouldRenderTravelDot =
      signal.is_transition &&
      typeof signal.duration_ms === "number" &&
      signal.duration_ms >= 300 &&
      isFreshMovementSignal(signal);
    if (isPreviewSignal) {
      const previewPoint = pointAtProgress(
        effectivePoints,
        state.routePlayback.progress / 100
      );
      if (previewPoint) {
        const previewNode = document.createElementNS(namespace, "circle");
        previewNode.setAttribute("cx", `${previewPoint.x}`);
        previewNode.setAttribute("cy", `${previewPoint.y}`);
        previewNode.setAttribute(
          "class",
          `handoff-travel-dot is-preview ${signal.blocking_count > 0 ? "is-blocked" : ""}`
        );
        previewNode.setAttribute("r", "4");
        svg.append(previewNode);
      }
    } else if (shouldRenderTravelDot) {
      const travelNode = document.createElementNS(namespace, "circle");
      travelNode.setAttribute("r", "3.4");
      travelNode.setAttribute(
        "class",
        `handoff-travel-dot ${signal.blocking_count > 0 ? "is-blocked" : "is-active"}`
      );
      const motionNode = document.createElementNS(namespace, "animateMotion");
      motionNode.setAttribute("dur", `${Math.max(900, signal.duration_ms)}ms`);
      motionNode.setAttribute("repeatCount", "indefinite");
      motionNode.setAttribute("path", pathD);
      travelNode.append(motionNode);
      svg.append(travelNode);
    }

    const chipNode = document.createElement("div");
    chipNode.className = `handoff-chip ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim();
    chipNode.style.left = `${midPoint.x}px`;
    chipNode.style.top = `${midPoint.y - 12}px`;
    const motionLabel = signal.is_transition ? "in transit" : "arrived";
    const triggerLabel = signal.trigger_type
      ? formatOfficeEventType(signal.trigger_type)
      : "handoff signal";
    chipNode.innerHTML = `
      <strong>${escapeHtml(signal.opportunity_id)}</strong>
      <span>${escapeHtml(shortAgentLabel(signal.from_agent))} -> ${escapeHtml(shortAgentLabel(signal.to_agent))}</span>
      <span>${escapeHtml(`${triggerLabel} | ${motionLabel}`)}</span>
    `;
    chipLayer.append(chipNode);
  }

  overlay.classList.remove("hidden");
}

function renderOfficeCanvas() {
  const presenceEntries = state.snapshot.office.presence || [];
  const opportunities = state.snapshot.workflow.opportunities;
  const topTask = state.snapshot.attention.top_task;
  const activeTransitions = getActiveTransitionState();
  const renderableHandoffs = getRenderableHandoffs(activeTransitions);
  const flowEventsHtml = renderFlowEvents(activeTransitions);

  const floorBanner = `
    <div class="floor-banner">
      <div>
        <p class="eyebrow">Operations floor</p>
        <strong>${escapeHtml(
          topTask ? topTask.next_action : "No active attention item."
        )}</strong>
        <p class="muted">${escapeHtml(
          topTask
            ? `${topTask.owner} owns the next move.`
            : "The floor is clear enough to monitor without escalation."
        )}</p>
      </div>
      <div class="floor-banner-metrics">
        <span class="priority-pill">${state.snapshot.kpis.active_opportunities} active</span>
        <span class="priority-pill">${state.snapshot.kpis.blocked_opportunities} blocked</span>
        <span class="priority-pill">${state.snapshot.kpis.approvals_waiting} approvals</span>
        <span class="priority-pill">${renderableHandoffs.length} handoffs</span>
      </div>
    </div>
  `;

  const zonesHtml = presenceEntries
    .map((presence) => {
      const isSelected =
        state.selected && state.selected.type === "agent" && state.selected.id === presence.agent;
      const signalClasses = buildZoneSignalClasses(
        presence.agent,
        activeTransitions,
        renderableHandoffs
      );
      const zoneProps = getZoneProps(presence);
      const zoneFixtures = getZoneFixtures(presence);
      return `
        <button
          type="button"
          class="zone-card zone-room zone-card-${escapeHtml(presence.accent_token)} zone-room-${escapeHtml(normalizeToken(presence.zone_id))} ${formatLaneClass(presence.lane_stage)} ${isSelected ? "is-selected" : ""} ${signalClasses}"
          data-type="agent"
          data-id="${escapeHtml(presence.agent)}"
          data-zone-id="${escapeHtml(presence.zone_id)}"
        >
          <div class="room-plaque">
            <div>
              <p class="eyebrow">${escapeHtml(presence.zone_label)}</p>
              <h3>${escapeHtml(presence.department_label)}</h3>
            </div>
            <span class="status-pill ${formatStatusClass(presence.status)}">${escapeHtml(presence.status)}</span>
          </div>

          <div class="room-floor">
            <div class="room-boundary room-boundary-top"></div>
            <div class="room-boundary room-boundary-right"></div>
            <div class="room-boundary room-boundary-bottom"></div>
            <div class="room-boundary room-boundary-left"></div>
            <div class="room-door room-door-horizontal"></div>
            <div class="room-door room-door-vertical"></div>
            <div class="room-floor-label" aria-hidden="true">${escapeHtml(presence.zone_label)}</div>

            <div class="room-purpose">
              <p class="zone-atmosphere-label">${escapeHtml(getZoneAtmosphere(presence).mood)}</p>
              <p class="zone-atmosphere-detail">${escapeHtml(getZoneAtmosphere(presence).detail)}</p>
              <div class="zone-lane-ribbon ${formatLaneClass(presence.lane_stage)}">${escapeHtml(formatLaneLabel(presence.lane_stage))}</div>
            </div>

            <div class="room-props" aria-hidden="true">
              ${zoneProps.items
                .map(
                  (item) => `
                    <span class="room-prop">${escapeHtml(item)}</span>
                  `
                )
                .join("")}
            </div>

            <div class="room-fixtures" aria-hidden="true">
              ${zoneFixtures
                .map(
                  (fixture) => `
                    <div class="room-fixture room-fixture-${escapeHtml(fixture.kind)}" title="${escapeHtml(fixture.label)}"></div>
                  `
                )
                .join("")}
            </div>

            <div class="workstation ${formatMotionClass(presence.motion_state)} accent-${escapeHtml(presence.accent_token)}">
              <div class="desk-surface"></div>
              <div class="desk-screen"></div>
              <div class="desk-chair"></div>
              <div class="agent-marker">
                <div class="agent-marker-ring"></div>
                <div class="agent-marker-core">${escapeHtml(presence.avatar_monogram)}</div>
              </div>
              <div class="agent-callout">
                <strong>${escapeHtml(presence.agent)}</strong>
                <span>${escapeHtml(getZoneSignalLabel(presence))}</span>
              </div>
            </div>

            <div class="room-bubble ${formatBubbleClass(presence.bubble_kind)}">
              <p class="presence-bubble-label">${escapeHtml(presence.bubble_label)}</p>
              <p class="presence-bubble-text">${escapeHtml(presence.bubble_text)}</p>
            </div>

            <div class="room-footer">
              <div class="presence-caption">
                <strong>${escapeHtml(presence.headline)}</strong>
                <p class="muted">${escapeHtml(renderPresenceMeta(presence))}</p>
              </div>
              <div class="card-tags">
                <span class="priority-pill ${formatStatusClass(presence.urgency)}">${escapeHtml(presence.urgency)} urgency</span>
              </div>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  const opportunityRailHtml = opportunities.length
    ? opportunities
        .map((entry) => {
          const record = entry.contract_bundle.opportunity_record;
          const isSelected =
            state.selected &&
            state.selected.type === "opportunity" &&
            state.selected.id === entry.opportunity_id;
          const laneStage = mapStatusToLaneStage(entry.current_status);
          const laneShiftClass = activeTransitions.laneShiftOpportunities.has(entry.opportunity_id)
            ? "has-lane-shift"
            : "";
          return `
            <button type="button" class="opportunity-chip ${formatLaneClass(laneStage)} ${laneShiftClass} ${isSelected ? "is-selected" : ""}" data-type="opportunity" data-id="${escapeHtml(entry.opportunity_id)}">
              <strong>${escapeHtml(entry.opportunity_id)}</strong>
              <span class="status-pill ${formatStatusClass(entry.current_status)}">${escapeHtml(entry.current_status)}</span>
              <p class="muted">${escapeHtml(record ? record.device_summary : entry.source)}</p>
              ${
                entry.capital_fit
                  ? `<small class="opportunity-capital-fit capital-fit-${escapeHtml(entry.capital_fit.stance)}">${escapeHtml(
                      `Capital: ${formatCapitalFitLabel(entry.capital_fit.stance)}`
                    )}</small>`
                  : ""
              }
            </button>
          `;
        })
        .join("")
    : `<div class="empty-state">No active opportunities loaded.</div>`;

  elements.officeCanvas.innerHTML = `
    ${floorBanner}
    ${flowEventsHtml}
    <div class="office-layout-wrap">
      <div class="office-wayfinding" aria-hidden="true">
        <div class="office-wayfinding-plaque">ARC floor</div>
        <div class="office-wayfinding-node office-wayfinding-node-north"></div>
        <div class="office-wayfinding-node office-wayfinding-node-east"></div>
        <div class="office-wayfinding-node office-wayfinding-node-south"></div>
        <div class="office-wayfinding-node office-wayfinding-node-west"></div>
      </div>
      <div class="zone-network-overlay" aria-hidden="true">
        <svg class="zone-network-svg"></svg>
      </div>
      <div class="office-layout office-floorplan">${zonesHtml}</div>
      <div class="handoff-overlay hidden" aria-hidden="true">
        <svg class="handoff-svg"></svg>
        <div class="handoff-chip-layer"></div>
      </div>
    </div>
    <div class="workflow-rail">${opportunityRailHtml}</div>
  `;

  elements.officeCanvas.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
    });
  });

  renderZoneNetworkOverlay(renderableHandoffs);
  renderHandoffOverlay(renderableHandoffs);
}

function movementIntentsForOpportunity(opportunityId) {
  return (state.snapshot.office.movement_intents || [])
    .filter((intent) => intent && intent.opportunity_id === opportunityId)
    .slice(0, 4);
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

  elements.detailPanel.innerHTML = `
    <section class="detail-section">
      <div class="detail-hero">
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">Selected opportunity</p>
            <strong>${escapeHtml(entry.opportunity_id)}</strong>
          </div>
          <span class="status-pill ${formatStatusClass(entry.current_status)}">${escapeHtml(entry.current_status)}</span>
        </div>
        <p>${escapeHtml(record ? record.device_summary : "No OpportunityRecord artifact found yet.")}</p>
        <div class="detail-metrics">
          <div class="metric"><span>Ask</span><strong>${formatCurrency(record ? record.ask_price_usd : null)}</strong></div>
          <div class="metric"><span>Value range</span><strong>${
            record ? `${formatCurrency(record.estimated_value_range_usd[0])} to ${formatCurrency(record.estimated_value_range_usd[1])}` : "N/A"
          }</strong></div>
          <div class="metric"><span>Recommendation</span><strong>${escapeHtml(entry.recommendation || "N/A")}</strong></div>
          <div class="metric"><span>Priority</span><strong>${escapeHtml(entry.priority)}</strong></div>
        </div>
        <div class="card-tags">
          <span class="priority-pill ${formatStatusClass(entry.priority)}">${escapeHtml(entry.priority)} priority</span>
          <span class="priority-pill">${escapeHtml(record ? record.confidence : workflow && workflow.confidence ? workflow.confidence : "unknown")} confidence</span>
          <span class="priority-pill">${escapeHtml(formatLaneLabel(mapStatusToLaneStage(entry.current_status)))}</span>
          ${
            workflow && workflow.purchase_recommendation_blocked
              ? `<span class="alert-pill ${formatStatusClass("blocked")}">purchase blocked</span>`
              : ""
          }
        </div>
      </div>
    </section>

    <section class="detail-section">
      <h3>Handoff and approval</h3>
      <ul class="detail-list">
        <li>Next action: ${escapeHtml(entry.latest_task ? entry.latest_task.next_action : handoff ? handoff.next_action : "N/A")}</li>
        <li>Next owner: ${escapeHtml(entry.latest_task ? entry.latest_task.owner : handoff ? handoff.to_agent : "N/A")}</li>
        <li>Due by: ${escapeHtml(formatTimestamp(entry.latest_task ? entry.latest_task.due_by : handoff ? handoff.due_by : null))}</li>
        <li>Approval status: ${escapeHtml(queue ? queue.status : ticket ? "draft" : "none")}</li>
        <li>Exposure: ${formatCurrency(ticket ? ticket.max_exposure_usd : null)}</li>
      </ul>
    </section>

    <section class="detail-section">
      <h3>Verification and risk</h3>
      <ul class="detail-list">
        ${
          risks.length
            ? risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")
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
          `
          : ""
      }
    </section>

    ${
      capitalStrategy
        ? `
          <section class="detail-section">
            <h3>Capital strategy context</h3>
            <ul class="detail-list">
              <li>Company mode: ${escapeHtml(capitalStrategy.capital_mode)}</li>
              <li>Opportunity fit: ${escapeHtml(
                capitalFit ? formatCapitalFitLabel(capitalFit.stance) : "N/A"
              )}</li>
              <li>Capital rationale: ${escapeHtml(capitalStrategy.capital_mode_reason)}</li>
              <li>Fit rationale: ${escapeHtml(capitalFit ? capitalFit.reason : "No fit note available.")}</li>
              <li>Priority fit: ${escapeHtml(
                capitalStrategy.approved_strategy_priorities
                  .slice(0, 3)
                  .map((item) => formatStrategyLabel(item))
                  .join(", ")
              )}</li>
            </ul>
            <div class="card-tags" style="margin-top:12px;">
              ${capitalStrategy.recommended_avoidances
                .slice(0, 2)
                .map((item) => `<span class="task-chip">${escapeHtml(item)}</span>`)
                .join("")}
            </div>
          </section>
        `
        : ""
    }

    <section class="detail-section">
      <h3>Movement intents</h3>
      ${renderMovementIntentList(
        movementIntents,
        "No movement intent is currently derived for this opportunity."
      )}
    </section>

    <section class="detail-section">
      <h3>Status history</h3>
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
    </section>
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

  elements.detailPanel.innerHTML = `
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
            <h3>Capital strategy</h3>
            <ul class="detail-list">
              <li>Mode: ${escapeHtml(capitalStrategy.capital_mode)}</li>
              <li>Reason: ${escapeHtml(capitalStrategy.capital_mode_reason)}</li>
              <li>Top priorities: ${escapeHtml(
                capitalStrategy.approved_strategy_priorities
                  .slice(0, 3)
                  .map((item) => formatStrategyLabel(item))
                  .join(", ")
              )}</li>
            </ul>
            <h3 style="margin-top:16px;">Recent posture</h3>
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
      renderDetailForAgent(card);
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
  const capitalControls = state.snapshot.capital_controls;
  const capitalStrategy = state.snapshot.capital_strategy;
  const capitalSnapshot = capitalControls && capitalControls.account_snapshot ? capitalControls.account_snapshot : null;
  const capitalIntegrity = capitalControls && capitalControls.ledger_integrity ? capitalControls.ledger_integrity : null;
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
  const capitalSummary = capitalSnapshot
    ? `
      <ul class="detail-list">
        <li>Available: ${formatCurrency(capitalSnapshot.available_usd)}</li>
        <li>Reserved: ${formatCurrency(capitalSnapshot.reserved_usd)}</li>
        <li>Committed: ${formatCurrency(capitalSnapshot.committed_usd)}</li>
        <li>Ledger entries: ${capitalIntegrity ? capitalIntegrity.entry_count : "n/a"}</li>
      </ul>
    `
    : `<p class="muted">Capital runtime ledger not initialized in this workspace path.</p>`;
  const capitalStrategySummary = capitalStrategy
    ? `
      <article class="board-block capital-strategy-block">
        <div class="capital-strategy-head">
          <div>
            <p class="eyebrow">Capital strategy</p>
            <strong class="capital-mode-label">${escapeHtml(capitalStrategy.capital_mode)}</strong>
          </div>
          <span class="priority-pill">${escapeHtml(
            formatStrategyLabel(capitalStrategy.approved_strategy_priorities[0] || "monitor")
          )}</span>
        </div>
        <p>${escapeHtml(capitalStrategy.capital_mode_reason)}</p>
        <div class="card-tags" style="margin-top:12px;">
          ${capitalStrategy.approved_strategy_priorities
            .map(
              (item) =>
                `<span class="task-chip">${escapeHtml(formatStrategyLabel(item))}</span>`
            )
            .join("")}
        </div>
        ${
          capitalStrategy.capital_risk_flags.length
            ? `<ul class="detail-list">${capitalStrategy.capital_risk_flags
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul>`
            : ""
        }
        <div class="board-columns capital-strategy-columns">
          <div>
            <h3>Favor</h3>
            <div class="card-tags">
              ${capitalStrategy.recommended_actions
                .map((item) => `<span class="task-chip">${escapeHtml(item)}</span>`)
                .join("")}
            </div>
          </div>
          <div>
            <h3>Avoid</h3>
            <ul class="detail-list compact-list">
              ${capitalStrategy.recommended_avoidances
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}
            </ul>
          </div>
        </div>
        <div>
          <h3>Recent posture</h3>
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
        </div>
      </article>
    `
    : "";

  elements.companyBoard.innerHTML = `
    <article class="board-block">
      <p class="board-lead">${escapeHtml(state.snapshot.capital_controls.note)}</p>
    </article>
    ${capitalStrategySummary}
    <div class="board-columns">
      <article class="board-block">
        <h3>Priorities</h3>
        <ul class="board-list">${priorities}</ul>
      </article>
      <article class="board-block">
        <h3>Alerts</h3>
        <ul class="board-list">${alerts}</ul>
      </article>
    </div>
    <div class="board-columns">
      <article class="board-block">
        <h3>Board counts</h3>
        <ul class="detail-list">
          <li>Approvals waiting: ${board.approvals_waiting}</li>
          <li>Blocked count: ${board.blocked_count}</li>
          <li>Active opportunities: ${board.active_opportunities.length}</li>
        </ul>
      </article>
      <article class="board-block">
        <h3>Active opportunities</h3>
        <div class="card-tags">${activeOpportunities}</div>
      </article>
    </div>
    <article class="board-block">
      <h3>Capital note</h3>
      <p>${escapeHtml(board.capital_note)}</p>
      ${capitalSummary}
      ${
        attention
          ? `<p class="muted" style="margin-top:12px;">Attention: ${escapeHtml(attention.owner)} on ${escapeHtml(attention.opportunity_id || "company")} before ${escapeHtml(formatTimestamp(attention.due_by))}.</p>`
          : ""
      }
    </article>
  `;

  elements.companyBoard.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
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
              <p class="queue-meta">${escapeHtml(item.ticket.reasoning_summary)}</p>
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
  const baseMessage = task
    ? `${task.owner} next: ${task.next_action}`
    : "No active attention item.";
  elements.attentionNote.className = `panel-note decision-note-${normalizeToken(
    state.decisionMessageLevel || "info"
  )}`;
  elements.attentionNote.textContent = state.decisionMessage
    ? `${baseMessage} | ${state.decisionMessage}`
    : baseMessage;
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

async function loadSnapshot() {
  elements.refreshButton.disabled = true;
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot request failed (${response.status})`);
    }
    const nextSnapshot = await response.json();
    const transitions = computeTransitionState(state.snapshot, nextSnapshot);
    state.snapshot = nextSnapshot;
    setTransitionState(transitions);
    render();
  } catch (error) {
    elements.detailPanel.innerHTML = `<div class="empty-state">${escapeHtml(
      error instanceof Error ? error.message : String(error)
    )}</div>`;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.refreshButton.addEventListener("click", () => {
  loadSnapshot();
});

loadSnapshot();
window.setInterval(loadSnapshot, 30000);

