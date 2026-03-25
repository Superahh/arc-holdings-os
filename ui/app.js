"use strict";

const state = {
  snapshot: null,
  selected: null,
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
  return `status-${String(value || "unknown").replaceAll(/[^a-z0-9_]+/gi, "_").toLowerCase()}`;
}

function findAgentByName(name) {
  return state.snapshot.office.agent_status_cards.find((card) => card.agent === name) || null;
}

function findOpportunityById(opportunityId) {
  return (
    state.snapshot.workflow.opportunities.find((entry) => entry.opportunity_id === opportunityId) ||
    null
  );
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

function renderOfficeCanvas() {
  const cards = state.snapshot.office.agent_status_cards;
  const opportunities = state.snapshot.workflow.opportunities;
  const topTask = state.snapshot.attention.top_task;

  const zonesHtml = cards
    .map((card) => {
      const isSelected =
        state.selected && state.selected.type === "agent" && state.selected.id === card.agent;
      const taskStamp =
        topTask && topTask.owner === card.agent
          ? `<span class="task-chip ${formatStatusClass(topTask.urgency)}">${escapeHtml(topTask.urgency)} attention</span>`
          : "";
      return `
        <button type="button" class="zone-card ${isSelected ? "is-selected" : ""}" data-type="agent" data-id="${escapeHtml(card.agent)}">
          <div class="zone-title-row">
            <div>
              <p class="eyebrow">${escapeHtml(card.agent)}</p>
              <h3>${escapeHtml(card.active_task)}</h3>
            </div>
            <span class="status-pill ${formatStatusClass(card.status)}">${escapeHtml(card.status)}</span>
          </div>
          <p class="muted">${card.blocker ? escapeHtml(card.blocker) : "No current blocker."}</p>
          <div class="card-tags">
            <span class="priority-pill ${formatStatusClass(card.urgency)}">${escapeHtml(card.urgency)} urgency</span>
            ${taskStamp}
            <span class="priority-pill">${escapeHtml(card.opportunity_id || "company-wide")}</span>
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
          return `
            <button type="button" class="opportunity-chip ${isSelected ? "is-selected" : ""}" data-type="opportunity" data-id="${escapeHtml(entry.opportunity_id)}">
              <strong>${escapeHtml(entry.opportunity_id)}</strong>
              <span class="status-pill ${formatStatusClass(entry.current_status)}">${escapeHtml(entry.current_status)}</span>
              <p class="muted">${escapeHtml(record ? record.device_summary : entry.source)}</p>
            </button>
          `;
        })
        .join("")
    : `<div class="empty-state">No active opportunities loaded.</div>`;

  elements.officeCanvas.innerHTML = `
    <div class="office-layout">${zonesHtml}</div>
    <div class="workflow-rail">${opportunityRailHtml}</div>
  `;

  elements.officeCanvas.querySelectorAll("[data-type][data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      setSelection(node.dataset.type, node.dataset.id);
    });
  });
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
                      ${escapeHtml(entry.opportunity_id)} · ${escapeHtml(entry.current_status)}
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
    state.snapshot = await response.json();
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
