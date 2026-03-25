"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OPPORTUNITY_STATES = new Set([
  "discovered",
  "researching",
  "awaiting_approval",
  "approved",
  "acquired",
  "routed",
  "monetizing",
  "closed",
  "rejected",
]);

const ALLOWED_STATUS_TRANSITIONS = {
  discovered: new Set(["researching", "closed", "rejected"]),
  researching: new Set(["awaiting_approval", "closed", "rejected"]),
  awaiting_approval: new Set(["approved", "rejected", "researching"]),
  approved: new Set(["acquired", "rejected", "closed"]),
  acquired: new Set(["routed", "closed"]),
  routed: new Set(["monetizing", "closed"]),
  monetizing: new Set(["closed"]),
  rejected: new Set(["researching", "closed"]),
  closed: new Set(["researching"]),
};

function toIso(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function createEmptyWorkflowState(timestamp = new Date().toISOString()) {
  return {
    schema_version: "v1",
    updated_at: toIso(timestamp),
    opportunities: {},
    event_log: [],
  };
}

function ensureWorkflowShape(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Workflow state must be an object.");
  }
  if (state.schema_version !== "v1") {
    throw new Error("Unsupported workflow schema_version.");
  }
  if (!state.opportunities || typeof state.opportunities !== "object" || Array.isArray(state.opportunities)) {
    throw new Error("Workflow state must include opportunities object.");
  }
  if (!Array.isArray(state.event_log)) {
    throw new Error("Workflow state must include event_log array.");
  }
}

function loadWorkflowState(statePath) {
  const absolutePath = path.resolve(statePath);
  if (!fs.existsSync(absolutePath)) {
    return createEmptyWorkflowState();
  }
  const state = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  ensureWorkflowShape(state);
  return state;
}

function saveWorkflowState(statePath, state, timestamp = new Date().toISOString()) {
  ensureWorkflowShape(state);
  state.updated_at = toIso(timestamp);
  const absolutePath = path.resolve(statePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return absolutePath;
}

function mapRecommendationToStatus(output) {
  const recommendation = output.opportunity_record.recommendation;
  if (recommendation === "acquire" && output.approval_ticket) {
    return "awaiting_approval";
  }
  if (recommendation === "request_more_info") {
    return "researching";
  }
  if (recommendation === "skip") {
    return "closed";
  }
  return "discovered";
}

function mapDecisionToStatus(decision) {
  if (decision === "approve") {
    return "approved";
  }
  if (decision === "reject") {
    return "rejected";
  }
  return "researching";
}

function ensureOpportunityRecord(state, opportunityId, source = "unknown_source", timestamp = new Date().toISOString()) {
  const record =
    state.opportunities[opportunityId] ||
    {
      opportunity_id: opportunityId,
      source,
      current_status: "discovered",
      recommendation: null,
      approval_ticket_id: null,
      last_updated_at: toIso(timestamp),
      status_history: [],
    };

  if (!OPPORTUNITY_STATES.has(record.current_status)) {
    throw new Error(`Invalid opportunity status in state: ${record.current_status}`);
  }
  if (!Array.isArray(record.status_history)) {
    throw new Error("Opportunity status_history must be an array.");
  }
  state.opportunities[opportunityId] = record;
  return record;
}

function appendEvent(state, event) {
  state.event_log.push({
    event_id: `wf-${String(state.event_log.length + 1).padStart(6, "0")}`,
    ...event,
  });
}

function setOpportunityStatus(state, record, status, actor, reason, timestamp) {
  if (!OPPORTUNITY_STATES.has(status)) {
    throw new Error(`Unknown opportunity status: ${status}`);
  }
  const at = toIso(timestamp);
  if (record.current_status !== status) {
    record.current_status = status;
    record.last_updated_at = at;
    record.status_history.push({
      status,
      actor,
      reason,
      timestamp: at,
    });
  }
  appendEvent(state, {
    action: "status_update",
    opportunity_id: record.opportunity_id,
    status,
    actor,
    reason,
    timestamp: at,
  });
}

function canTransitionStatus(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    return true;
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus];
  return Boolean(allowed && allowed.has(toStatus));
}

function upsertFromPipeline(state, output, actor = "pipeline_runner", timestamp = new Date().toISOString()) {
  ensureWorkflowShape(state);
  const record = ensureOpportunityRecord(
    state,
    output.opportunity_record.opportunity_id,
    output.opportunity_record.source,
    timestamp
  );
  record.recommendation = output.opportunity_record.recommendation;
  record.source = output.opportunity_record.source;
  record.approval_ticket_id = output.approval_ticket ? output.approval_ticket.ticket_id : null;

  const nextStatus = mapRecommendationToStatus(output);
  setOpportunityStatus(
    state,
    record,
    nextStatus,
    actor,
    `Pipeline recommendation: ${output.opportunity_record.recommendation}`,
    timestamp
  );
  state.updated_at = toIso(timestamp);
  return record;
}

function findByTicketId(state, ticketId) {
  const records = Object.values(state.opportunities);
  return records.find((entry) => entry.approval_ticket_id === ticketId) || null;
}

function applyDecisionToOpportunity(
  state,
  ticketId,
  decision,
  actor = "owner_operator",
  timestamp = new Date().toISOString(),
  opportunityId = null
) {
  ensureWorkflowShape(state);
  if (typeof ticketId !== "string" || !ticketId) {
    throw new Error("ticketId is required.");
  }
  if (!["approve", "reject", "request_more_info"].includes(decision)) {
    throw new Error("decision must be one of: approve, reject, request_more_info.");
  }

  let record = findByTicketId(state, ticketId);
  if (!record) {
    if (!opportunityId) {
      throw new Error(`No opportunity found for ticket ${ticketId}.`);
    }
    record = ensureOpportunityRecord(state, opportunityId, "unknown_source", timestamp);
    record.approval_ticket_id = ticketId;
  }

  const nextStatus = mapDecisionToStatus(decision);
  setOpportunityStatus(state, record, nextStatus, actor, `Decision applied: ${decision}`, timestamp);
  state.updated_at = toIso(timestamp);
  return record;
}

function updateOpportunityStatus(
  state,
  opportunityId,
  status,
  actor = "owner_operator",
  reason = "",
  timestamp = new Date().toISOString(),
  options = {}
) {
  ensureWorkflowShape(state);
  if (typeof opportunityId !== "string" || !opportunityId) {
    throw new Error("opportunityId is required.");
  }
  if (!OPPORTUNITY_STATES.has(status)) {
    throw new Error(`Unknown opportunity status: ${status}`);
  }

  const record = state.opportunities[opportunityId];
  if (!record) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }

  const forceTransition = Boolean(options.forceTransition);
  if (!forceTransition && !canTransitionStatus(record.current_status, status)) {
    throw new Error(`Invalid status transition: ${record.current_status} -> ${status}`);
  }

  const finalReason =
    typeof reason === "string" && reason.trim().length > 0
      ? reason
      : `Manual status update: ${record.current_status} -> ${status}`;
  setOpportunityStatus(state, record, status, actor, finalReason, timestamp);
  state.updated_at = toIso(timestamp);
  return record;
}

module.exports = {
  OPPORTUNITY_STATES,
  ALLOWED_STATUS_TRANSITIONS,
  createEmptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  upsertFromPipeline,
  applyDecisionToOpportunity,
  updateOpportunityStatus,
  canTransitionStatus,
  mapRecommendationToStatus,
  mapDecisionToStatus,
};
