"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertValidOpportunityRecord } = require("./contracts");

const OPPORTUNITY_STATES = new Set([
  "discovered",
  "researching",
  "awaiting_seller_verification",
  "awaiting_approval",
  "approved",
  "acquired",
  "routed",
  "monetizing",
  "closed",
  "rejected",
]);

const PRIORITY_LEVELS = new Set(["low", "normal", "urgent"]);
const VERIFICATION_RESPONSE_STATUSES = new Set(["pending", "satisfactory", "unsatisfactory"]);
const OPERATOR_SEND_BACK_SUPPORTED_STATES = new Set([
  "discovered",
  "researching",
  "awaiting_seller_verification",
  "approved",
  "acquired",
]);

const ALLOWED_STATUS_TRANSITIONS = {
  discovered: new Set(["researching", "awaiting_seller_verification", "closed", "rejected"]),
  researching: new Set(["awaiting_seller_verification", "awaiting_approval", "closed", "rejected"]),
  awaiting_seller_verification: new Set(["researching", "awaiting_approval", "closed", "rejected"]),
  awaiting_approval: new Set(["approved", "rejected", "researching", "awaiting_seller_verification"]),
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
  for (const [opportunityId, opportunity] of Object.entries(state.opportunities)) {
    const source =
      opportunity && typeof opportunity.source === "string" && opportunity.source.trim().length > 0
        ? opportunity.source
        : "unknown_source";
    ensureOpportunityRecord(state, opportunityId, source, state.updated_at);
  }
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
    return "awaiting_seller_verification";
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
  return "awaiting_seller_verification";
}

function canPersistOperatorSendBack(status) {
  return OPERATOR_SEND_BACK_SUPPORTED_STATES.has(status);
}

function sanitizeOpportunitySlug(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return normalized || "manual-intake";
}

function buildOperatorIntakeOpportunityId(state, source, summary, timestamp) {
  const timeToken = toIso(timestamp).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z");
  const sourceSlug = sanitizeOpportunitySlug(source);
  const summarySlug = sanitizeOpportunitySlug(summary);
  const baseId = `opp-${timeToken}-${sourceSlug}-${summarySlug}`;
  let candidate = baseId;
  let suffix = 2;
  while (state.opportunities[candidate]) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function buildOperatorIntakeOpportunityRecord(opportunityId, intake, timestamp) {
  const capturedAt = toIso(timestamp);
  const note = typeof intake.note === "string" ? intake.note.trim() : "";
  const askPriceUsd = Number(intake.ask_price_usd);
  const record = {
    opportunity_id: opportunityId,
    source: intake.source,
    captured_at: capturedAt,
    device_summary: intake.summary,
    ask_price_usd: askPriceUsd,
    estimated_value_range_usd: [askPriceUsd, askPriceUsd],
    recommended_path: "request_more_info",
    recommendation: "request_more_info",
    confidence: "low",
    risks: [],
    notes: note || "Operator intake created from UI.",
  };
  assertValidOpportunityRecord(record);
  return record;
}

function ensureOpportunityRecord(state, opportunityId, source = "unknown_source", timestamp = new Date().toISOString()) {
  const record =
    state.opportunities[opportunityId] ||
    {
      opportunity_id: opportunityId,
      source,
      current_status: "discovered",
      recommendation: null,
      confidence: null,
      priority: "normal",
      approval_ticket_id: null,
      purchase_recommendation_blocked: false,
      alternative_opportunities_required: false,
      seller_verification: {
        imei_proof_verified: false,
        carrier_status_verified: false,
        request_sent_at: null,
        request_message: null,
        response_status: null,
        response_received_at: null,
        response_notes: null,
      },
      last_updated_at: toIso(timestamp),
      status_history: [],
    };

  if (!OPPORTUNITY_STATES.has(record.current_status)) {
    throw new Error(`Invalid opportunity status in state: ${record.current_status}`);
  }
  if (!Array.isArray(record.status_history)) {
    throw new Error("Opportunity status_history must be an array.");
  }
  if (!PRIORITY_LEVELS.has(record.priority)) {
    record.priority = "normal";
  }
  if (typeof record.purchase_recommendation_blocked !== "boolean") {
    record.purchase_recommendation_blocked = false;
  }
  if (typeof record.alternative_opportunities_required !== "boolean") {
    record.alternative_opportunities_required = false;
  }
  if (typeof record.confidence !== "string" && record.confidence !== null) {
    record.confidence = null;
  }
  if (!record.seller_verification || typeof record.seller_verification !== "object") {
    record.seller_verification = {
      imei_proof_verified: false,
      carrier_status_verified: false,
      request_sent_at: null,
      request_message: null,
      response_status: null,
      response_received_at: null,
      response_notes: null,
    };
  }
  if (typeof record.seller_verification.imei_proof_verified !== "boolean") {
    record.seller_verification.imei_proof_verified = false;
  }
  if (typeof record.seller_verification.carrier_status_verified !== "boolean") {
    record.seller_verification.carrier_status_verified = false;
  }
  if (
    record.seller_verification.response_status !== null &&
    !VERIFICATION_RESPONSE_STATUSES.has(record.seller_verification.response_status)
  ) {
    record.seller_verification.response_status = null;
  }
  for (const field of ["request_sent_at", "request_message", "response_received_at", "response_notes"]) {
    const value = record.seller_verification[field];
    if (!(typeof value === "string" || value === null)) {
      record.seller_verification[field] = null;
    }
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
  record.confidence = output.opportunity_record.confidence;
  record.source = output.opportunity_record.source;
  record.approval_ticket_id = output.approval_ticket ? output.approval_ticket.ticket_id : null;
  const risks = Array.isArray(output.opportunity_record.risks) ? output.opportunity_record.risks : [];
  record.seller_verification.carrier_status_verified = !risks.includes("carrier status unverified");
  record.seller_verification.imei_proof_verified = !risks.includes("imei proof unverified");
  record.purchase_recommendation_blocked = !(
    record.recommendation === "acquire" &&
    record.seller_verification.carrier_status_verified &&
    record.seller_verification.imei_proof_verified
  );
  if (record.recommendation === "request_more_info") {
    record.priority = "urgent";
  }

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

  const existing = state.opportunities[opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }
  const record = ensureOpportunityRecord(state, opportunityId, existing.source || "unknown_source", timestamp);

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

function updateOpportunityPriority(
  state,
  opportunityId,
  priority,
  actor = "owner_operator",
  reason = "",
  timestamp = new Date().toISOString()
) {
  ensureWorkflowShape(state);
  if (typeof opportunityId !== "string" || !opportunityId) {
    throw new Error("opportunityId is required.");
  }
  if (!PRIORITY_LEVELS.has(priority)) {
    throw new Error(`Unknown priority level: ${priority}`);
  }
  const existing = state.opportunities[opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }
  const record = ensureOpportunityRecord(state, opportunityId, existing.source || "unknown_source", timestamp);
  const at = toIso(timestamp);
  const previousPriority = record.priority;
  record.priority = priority;
  appendEvent(state, {
    action: "priority_update",
    opportunity_id: opportunityId,
    previous_priority: previousPriority,
    priority,
    actor,
    reason: reason || `Priority updated: ${previousPriority} -> ${priority}`,
    timestamp: at,
  });
  record.last_updated_at = at;
  state.updated_at = at;
  return record;
}

function createOperatorIntakeOpportunity(
  state,
  intake,
  actor = "owner_operator",
  timestamp = new Date().toISOString()
) {
  ensureWorkflowShape(state);
  const summary = typeof intake.summary === "string" ? intake.summary.trim() : "";
  const source = typeof intake.source === "string" ? intake.source.trim() : "";
  const note = typeof intake.note === "string" ? intake.note.trim() : "";
  const askPriceUsd = Number(intake.ask_price_usd);
  if (!summary) {
    throw new Error("summary is required.");
  }
  if (!source) {
    throw new Error("source is required.");
  }
  if (!Number.isFinite(askPriceUsd) || askPriceUsd < 0) {
    throw new Error("ask_price_usd must be a non-negative number.");
  }

  const at = toIso(timestamp);
  const opportunityId = buildOperatorIntakeOpportunityId(state, source, summary, at);
  const opportunityRecord = buildOperatorIntakeOpportunityRecord(
    opportunityId,
    {
      summary,
      source,
      ask_price_usd: askPriceUsd,
      note,
    },
    at
  );
  const workflowRecord = ensureOpportunityRecord(state, opportunityId, source, at);
  workflowRecord.source = source;
  workflowRecord.recommendation = opportunityRecord.recommendation;
  workflowRecord.confidence = opportunityRecord.confidence;
  workflowRecord.priority = "normal";
  workflowRecord.approval_ticket_id = null;
  workflowRecord.purchase_recommendation_blocked = false;
  workflowRecord.alternative_opportunities_required = false;

  setOpportunityStatus(
    state,
    workflowRecord,
    "researching",
    actor,
    "Operator intake created from UI.",
    at
  );
  appendEvent(state, {
    action: "opportunity_intake_created",
    opportunity_id: opportunityId,
    actor,
    source,
    ask_price_usd: askPriceUsd,
    note: note || null,
    timestamp: at,
  });
  state.updated_at = at;
  return {
    opportunity_id: opportunityId,
    workflow_record: workflowRecord,
    opportunity_record: opportunityRecord,
  };
}

function createOperatorSendBack(
  state,
  opportunityId,
  reason,
  actor = "owner_operator",
  timestamp = new Date().toISOString()
) {
  ensureWorkflowShape(state);
  if (typeof opportunityId !== "string" || !opportunityId.trim()) {
    throw new Error("opportunityId is required.");
  }
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (!normalizedReason) {
    throw new Error("reason is required.");
  }

  const existing = state.opportunities[opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }
  if (existing.current_status === "awaiting_approval") {
    throw new Error("awaiting_approval must use the approval queue request-more-info path.");
  }
  if (!canPersistOperatorSendBack(existing.current_status)) {
    throw new Error(`Persistent send-back is not supported for state ${existing.current_status}.`);
  }

  const at = toIso(timestamp);
  const previousStatus = existing.current_status;
  const record = requestSellerVerification(state, opportunityId, actor, at, {
    message: normalizedReason,
    reason: `Operator send-back: ${normalizedReason}`,
    priority: "urgent",
  });
  record.recommendation = "request_more_info";
  if (!record.confidence) {
    record.confidence = "low";
  }

  appendEvent(state, {
    action: "operator_send_back",
    opportunity_id: opportunityId,
    actor,
    reason: normalizedReason,
    from_status: previousStatus,
    to_status: record.current_status,
    timestamp: at,
  });
  state.updated_at = at;
  return record;
}

function requestSellerVerification(
  state,
  opportunityId,
  actor = "risk_and_compliance_agent",
  timestamp = new Date().toISOString(),
  options = {}
) {
  ensureWorkflowShape(state);
  const existing = state.opportunities[opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }
  const record = ensureOpportunityRecord(state, opportunityId, existing.source || "unknown_source", timestamp);
  const at = toIso(timestamp);
  const requestMessage =
    typeof options.message === "string" && options.message.trim().length > 0
      ? options.message
      : "Please send IMEI photo/video proof and confirm carrier status verification before we proceed.";
  const priority = options.priority || "urgent";
  if (!PRIORITY_LEVELS.has(priority)) {
    throw new Error(`Unknown priority level: ${priority}`);
  }

  record.seller_verification.request_sent_at = at;
  record.seller_verification.request_message = requestMessage;
  record.seller_verification.response_status = "pending";
  record.seller_verification.response_received_at = null;
  record.seller_verification.response_notes = null;
  record.purchase_recommendation_blocked = true;
  record.priority = priority;

  setOpportunityStatus(
    state,
    record,
    "awaiting_seller_verification",
    actor,
    options.reason || "Seller verification requested.",
    at
  );
  appendEvent(state, {
    action: "seller_verification_request",
    opportunity_id: opportunityId,
    actor,
    message: requestMessage,
    timestamp: at,
  });
  state.updated_at = at;
  return record;
}

function applySellerVerificationResponse(
  state,
  opportunityId,
  responseStatus,
  actor = "risk_and_compliance_agent",
  timestamp = new Date().toISOString(),
  options = {}
) {
  ensureWorkflowShape(state);
  if (!["satisfactory", "unsatisfactory"].includes(responseStatus)) {
    throw new Error("responseStatus must be one of: satisfactory, unsatisfactory.");
  }
  const existing = state.opportunities[opportunityId];
  if (!existing) {
    throw new Error(`Opportunity not found in workflow state: ${opportunityId}`);
  }
  const record = ensureOpportunityRecord(state, opportunityId, existing.source || "unknown_source", timestamp);
  const at = toIso(timestamp);
  const notes = typeof options.notes === "string" ? options.notes : "";

  if (typeof options.imeiVerified === "boolean") {
    record.seller_verification.imei_proof_verified = options.imeiVerified;
  }
  if (typeof options.carrierVerified === "boolean") {
    record.seller_verification.carrier_status_verified = options.carrierVerified;
  }
  record.seller_verification.response_status = responseStatus;
  record.seller_verification.response_received_at = at;
  record.seller_verification.response_notes = notes || null;

  const verificationSatisfied =
    record.seller_verification.imei_proof_verified && record.seller_verification.carrier_status_verified;
  if (responseStatus === "unsatisfactory") {
    record.confidence = "low";
    record.alternative_opportunities_required = true;
    record.purchase_recommendation_blocked = true;
    record.priority = "urgent";
    setOpportunityStatus(
      state,
      record,
      "awaiting_seller_verification",
      actor,
      "Seller response unsatisfactory; downgrade confidence and pursue alternatives.",
      at
    );
  } else if (verificationSatisfied) {
    record.purchase_recommendation_blocked = false;
    record.alternative_opportunities_required = false;
    setOpportunityStatus(
      state,
      record,
      "researching",
      actor,
      "Seller verification satisfied; resume opportunity evaluation.",
      at
    );
  } else {
    record.purchase_recommendation_blocked = true;
    setOpportunityStatus(
      state,
      record,
      "awaiting_seller_verification",
      actor,
      "Seller response received but verification remains incomplete.",
      at
    );
  }

  appendEvent(state, {
    action: "seller_verification_response",
    opportunity_id: opportunityId,
    actor,
    response_status: responseStatus,
    verification_satisfied: verificationSatisfied,
    notes: notes || null,
    timestamp: at,
  });
  state.updated_at = at;
  return record;
}

module.exports = {
  OPPORTUNITY_STATES,
  PRIORITY_LEVELS,
  VERIFICATION_RESPONSE_STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  createEmptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  upsertFromPipeline,
  applyDecisionToOpportunity,
  updateOpportunityStatus,
  updateOpportunityPriority,
  requestSellerVerification,
  applySellerVerificationResponse,
  createOperatorIntakeOpportunity,
  createOperatorSendBack,
  canPersistOperatorSendBack,
  OPERATOR_SEND_BACK_SUPPORTED_STATES,
  canTransitionStatus,
  mapRecommendationToStatus,
  mapDecisionToStatus,
};
