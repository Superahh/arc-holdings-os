"use strict";

const TRANSITION_WINDOW_MS = 14000;

function createEmptyTransitionState() {
  return {
    generatedAt: 0,
    handoffs: [],
    focusShiftAgents: new Set(),
    laneShiftAgents: new Set(),
    laneShiftOpportunities: new Set(),
  };
}

const state = {
  snapshot: null,
  selected: null,
  transitions: createEmptyTransitionState(),
  transitionTimerId: null,
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

function findOpportunityById(opportunityId) {
  return (
    state.snapshot.workflow.opportunities.find((entry) => entry.opportunity_id === opportunityId) ||
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
    nextTransitionState.laneShiftOpportunities.size > 0;

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

function getRenderableHandoffs(activeTransitions) {
  if (activeTransitions.handoffs.length) {
    return activeTransitions.handoffs;
  }

  return (state.snapshot.office.handoff_signals || []).slice(0, 3).map((signal) => ({
    ...signal,
    is_transition: false,
  }));
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

    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();
    const startX = fromRect.left - layoutRect.left + fromRect.width / 2;
    const startY = fromRect.top - layoutRect.top + fromRect.height / 2;
    const endX = toRect.left - layoutRect.left + toRect.width / 2;
    const endY = toRect.top - layoutRect.top + toRect.height / 2;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const curveY = midY - 32;

    const pathNode = document.createElementNS(namespace, "path");
    pathNode.setAttribute("d", `M ${startX} ${startY} Q ${midX} ${curveY} ${endX} ${endY}`);
    pathNode.setAttribute(
      "class",
      `handoff-path ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim()
    );
    svg.append(pathNode);

    const pulseNode = document.createElementNS(namespace, "circle");
    pulseNode.setAttribute("cx", `${midX}`);
    pulseNode.setAttribute("cy", `${curveY}`);
    pulseNode.setAttribute("r", signal.is_transition ? "6" : "4");
    pulseNode.setAttribute(
      "class",
      `handoff-pulse ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim()
    );
    svg.append(pulseNode);

    const chipNode = document.createElement("div");
    chipNode.className = `handoff-chip ${signal.is_transition ? "is-transition" : "is-steady"} ${signal.blocking_count > 0 ? "is-blocked" : ""}`.trim();
    chipNode.style.left = `${midX}px`;
    chipNode.style.top = `${curveY - 12}px`;
    chipNode.innerHTML = `
      <strong>${escapeHtml(signal.opportunity_id)}</strong>
      <span>${escapeHtml(shortAgentLabel(signal.from_agent))} → ${escapeHtml(shortAgentLabel(signal.to_agent))}</span>
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
      return `
        <button
          type="button"
          class="zone-card zone-card-${escapeHtml(presence.accent_token)} ${formatLaneClass(presence.lane_stage)} ${isSelected ? "is-selected" : ""} ${signalClasses}"
          data-type="agent"
          data-id="${escapeHtml(presence.agent)}"
        >
          <div class="zone-title-row">
            <div>
              <p class="eyebrow">${escapeHtml(presence.zone_label)}</p>
              <h3>${escapeHtml(presence.agent)}</h3>
            </div>
            <span class="status-pill ${formatStatusClass(presence.status)}">${escapeHtml(presence.status)}</span>
          </div>

          <div class="zone-lane-ribbon ${formatLaneClass(presence.lane_stage)}">${escapeHtml(formatLaneLabel(presence.lane_stage))}</div>

          <div class="zone-stage">
            <div class="presence-strip">
              <div class="avatar-shell ${formatMotionClass(presence.motion_state)} accent-${escapeHtml(presence.accent_token)}">
                <div class="avatar-ring"></div>
                <div class="avatar-glow"></div>
                <div class="avatar-body">
                  <div class="avatar-head"></div>
                  <div class="avatar-torso"></div>
                </div>
                <div class="avatar-monogram">${escapeHtml(presence.avatar_monogram)}</div>
                <div class="activity-dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>

              <div class="presence-bubble ${formatBubbleClass(presence.bubble_kind)}">
                <p class="presence-bubble-label">${escapeHtml(presence.bubble_label)}</p>
                <p class="presence-bubble-text">${escapeHtml(presence.bubble_text)}</p>
              </div>
            </div>

            <div class="presence-caption">
              <strong>${escapeHtml(presence.department_label)}</strong>
              <p class="muted">${escapeHtml(presence.headline)}</p>
              <div class="card-tags">
                <span class="priority-pill ${formatStatusClass(presence.urgency)}">${escapeHtml(presence.urgency)} urgency</span>
                <span class="priority-pill">${escapeHtml(renderPresenceMeta(presence))}</span>
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
            </button>
          `;
        })
        .join("")
    : `<div class="empty-state">No active opportunities loaded.</div>`;

  elements.officeCanvas.innerHTML = `
    ${floorBanner}
    <div class="office-layout-wrap">
      <div class="office-layout">${zonesHtml}</div>
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

  renderHandoffOverlay(renderableHandoffs);
}

function renderDetailForOpportunity(entry) {
  const record = entry.contract_bundle.opportunity_record;
  const handoff = entry.contract_bundle.handoff_packet;
  const ticket = entry.contract_bundle.approval_ticket;
  const workflow = entry.workflow_record;
  const queue = entry.queue_item;
  const risks = record && Array.isArray(record.risks) ? record.risks : [];
  const history = workflow && Array.isArray(workflow.status_history) ? workflow.status_history : [];

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
}

function renderDetailForAgent(card) {
  const opportunities = state.snapshot.workflow.opportunities.filter(
    (entry) => entry.latest_task && entry.latest_task.owner === card.agent
  );
  const activeOpportunity = card.opportunity_id ? findOpportunityById(card.opportunity_id) : null;
  const presence = findPresenceByAgent(card.agent);

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

  elements.companyBoard.innerHTML = `
    <article class="board-block">
      <p class="board-lead">${escapeHtml(state.snapshot.capital_controls.note)}</p>
    </article>
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
          return `
            <button type="button" class="queue-item ${isSelected ? "is-selected" : ""}" data-type="opportunity" data-id="${escapeHtml(item.opportunity_id)}">
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
            </button>
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
}

function renderAttention() {
  const task = state.snapshot.attention.top_task;
  elements.generatedAt.textContent = formatTimestamp(state.snapshot.generated_at);
  elements.attentionNote.textContent = task
    ? `${task.owner} next: ${task.next_action}`
    : "No active attention item.";
}

function render() {
  if (!state.snapshot) {
    return;
  }
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
