"use strict";

const RECOMMENDED_PATHS = new Set([
  "repair_and_resale",
  "resale_as_is",
  "part_out",
  "skip",
  "request_more_info",
]);

const RECOMMENDATIONS = new Set(["acquire", "skip", "request_more_info"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const ACTION_TYPES = new Set(["acquisition", "pricing", "listing", "policy_override", "other"]);
const APPROVAL_OPTIONS = new Set(["approve", "reject", "request_more_info"]);
const PAYLOAD_TYPES = new Set(["OpportunityRecord", "ApprovalTicket", "other"]);
const AGENT_STATUSES = new Set(["idle", "working", "blocked", "awaiting_approval", "alert"]);
const URGENCY_LEVELS = new Set(["low", "medium", "high"]);

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validateOpportunityRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return ["OpportunityRecord must be an object."];
  }

  if (typeof record.opportunity_id !== "string" || !record.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (typeof record.source !== "string" || !record.source) {
    errors.push("source must be a non-empty string.");
  }
  if (!isIsoDateTime(record.captured_at)) {
    errors.push("captured_at must be ISO-8601 datetime.");
  }
  if (typeof record.device_summary !== "string" || !record.device_summary) {
    errors.push("device_summary must be a non-empty string.");
  }
  if (typeof record.ask_price_usd !== "number" || record.ask_price_usd < 0) {
    errors.push("ask_price_usd must be a non-negative number.");
  }

  const range = record.estimated_value_range_usd;
  if (!Array.isArray(range) || range.length !== 2 || range.some((n) => typeof n !== "number")) {
    errors.push("estimated_value_range_usd must be [number, number].");
  } else if (range[0] > range[1]) {
    errors.push("estimated_value_range_usd lower bound cannot exceed upper bound.");
  }

  if (!RECOMMENDED_PATHS.has(record.recommended_path)) {
    errors.push("recommended_path contains invalid enum value.");
  }
  if (!RECOMMENDATIONS.has(record.recommendation)) {
    errors.push("recommendation contains invalid enum value.");
  }
  if (!CONFIDENCE_LEVELS.has(record.confidence)) {
    errors.push("confidence contains invalid enum value.");
  }
  if (!isStringArray(record.risks)) {
    errors.push("risks must be an array of strings.");
  }
  if (typeof record.notes !== "string") {
    errors.push("notes must be a string.");
  }
  return errors;
}

function validateApprovalTicket(ticket) {
  const errors = [];
  if (ticket == null) {
    return errors;
  }
  if (typeof ticket !== "object") {
    return ["ApprovalTicket must be an object or null."];
  }

  if (typeof ticket.ticket_id !== "string" || !ticket.ticket_id) {
    errors.push("ticket_id must be a non-empty string.");
  }
  if (typeof ticket.opportunity_id !== "string" || !ticket.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (!ACTION_TYPES.has(ticket.action_type)) {
    errors.push("action_type contains invalid enum value.");
  }
  if (typeof ticket.requested_by !== "string" || !ticket.requested_by) {
    errors.push("requested_by must be a non-empty string.");
  }
  if (!APPROVAL_OPTIONS.has(ticket.recommended_option)) {
    errors.push("recommended_option contains invalid enum value.");
  }
  if (!Array.isArray(ticket.decision_options) || ticket.decision_options.length === 0) {
    errors.push("decision_options must be a non-empty array.");
  } else if (!ticket.decision_options.every((opt) => APPROVAL_OPTIONS.has(opt))) {
    errors.push("decision_options contains invalid enum value.");
  }
  if (typeof ticket.max_exposure_usd !== "number" || ticket.max_exposure_usd < 0) {
    errors.push("max_exposure_usd must be a non-negative number.");
  }
  if (typeof ticket.reasoning_summary !== "string" || !ticket.reasoning_summary) {
    errors.push("reasoning_summary must be a non-empty string.");
  }
  if (typeof ticket.risk_summary !== "string" || !ticket.risk_summary) {
    errors.push("risk_summary must be a non-empty string.");
  }
  if (!isIsoDateTime(ticket.required_by)) {
    errors.push("required_by must be ISO-8601 datetime.");
  }
  return errors;
}

function validateHandoffPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object") {
    return ["HandoffPacket must be an object."];
  }

  if (typeof packet.handoff_id !== "string" || !packet.handoff_id) {
    errors.push("handoff_id must be a non-empty string.");
  }
  if (typeof packet.opportunity_id !== "string" || !packet.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (typeof packet.from_agent !== "string" || !packet.from_agent) {
    errors.push("from_agent must be a non-empty string.");
  }
  if (typeof packet.to_agent !== "string" || !packet.to_agent) {
    errors.push("to_agent must be a non-empty string.");
  }
  if (typeof packet.reason !== "string" || !packet.reason) {
    errors.push("reason must be a non-empty string.");
  }
  if (!PAYLOAD_TYPES.has(packet.payload_type)) {
    errors.push("payload_type contains invalid enum value.");
  }
  if (typeof packet.payload_ref !== "string" || !packet.payload_ref) {
    errors.push("payload_ref must be a non-empty string.");
  }
  if (!isStringArray(packet.blocking_items)) {
    errors.push("blocking_items must be an array of strings.");
  }
  if (typeof packet.next_action !== "string" || !packet.next_action) {
    errors.push("next_action must be a non-empty string.");
  }
  if (!isIsoDateTime(packet.due_by)) {
    errors.push("due_by must be ISO-8601 datetime.");
  }
  return errors;
}

function validateAgentStatusCard(card) {
  const errors = [];
  if (!card || typeof card !== "object") {
    return ["AgentStatusCard must be an object."];
  }

  if (typeof card.agent !== "string" || !card.agent) {
    errors.push("agent must be a non-empty string.");
  }
  if (!AGENT_STATUSES.has(card.status)) {
    errors.push("status contains invalid enum value.");
  }
  if (typeof card.active_task !== "string" || !card.active_task) {
    errors.push("active_task must be a non-empty string.");
  }
  const opportunityIdType = typeof card.opportunity_id;
  if (!(opportunityIdType === "string" || card.opportunity_id === null)) {
    errors.push("opportunity_id must be string or null.");
  }
  const blockerType = typeof card.blocker;
  if (!(blockerType === "string" || card.blocker === null)) {
    errors.push("blocker must be string or null.");
  }
  if (!URGENCY_LEVELS.has(card.urgency)) {
    errors.push("urgency contains invalid enum value.");
  }
  if (!isIsoDateTime(card.updated_at)) {
    errors.push("updated_at must be ISO-8601 datetime.");
  }
  return errors;
}

function validateCompanyBoardSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") {
    return ["CompanyBoardSnapshot must be an object."];
  }

  if (typeof snapshot.snapshot_id !== "string" || !snapshot.snapshot_id) {
    errors.push("snapshot_id must be a non-empty string.");
  }
  if (!isIsoDateTime(snapshot.timestamp)) {
    errors.push("timestamp must be ISO-8601 datetime.");
  }
  if (!isStringArray(snapshot.priorities)) {
    errors.push("priorities must be an array of strings.");
  }
  if (!Number.isInteger(snapshot.approvals_waiting) || snapshot.approvals_waiting < 0) {
    errors.push("approvals_waiting must be a non-negative integer.");
  }
  if (!Number.isInteger(snapshot.blocked_count) || snapshot.blocked_count < 0) {
    errors.push("blocked_count must be a non-negative integer.");
  }
  if (!isStringArray(snapshot.active_opportunities)) {
    errors.push("active_opportunities must be an array of strings.");
  }
  if (!isStringArray(snapshot.alerts)) {
    errors.push("alerts must be an array of strings.");
  }
  if (typeof snapshot.capital_note !== "string" || !snapshot.capital_note) {
    errors.push("capital_note must be a non-empty string.");
  }
  return errors;
}

function assertValidOpportunityRecord(record) {
  const errors = validateOpportunityRecord(record);
  if (errors.length > 0) {
    throw new Error(`Invalid OpportunityRecord: ${errors.join(" | ")}`);
  }
}

function assertValidApprovalTicket(ticket) {
  const errors = validateApprovalTicket(ticket);
  if (errors.length > 0) {
    throw new Error(`Invalid ApprovalTicket: ${errors.join(" | ")}`);
  }
}

function assertValidHandoffPacket(packet) {
  const errors = validateHandoffPacket(packet);
  if (errors.length > 0) {
    throw new Error(`Invalid HandoffPacket: ${errors.join(" | ")}`);
  }
}

function assertValidAgentStatusCard(card) {
  const errors = validateAgentStatusCard(card);
  if (errors.length > 0) {
    throw new Error(`Invalid AgentStatusCard: ${errors.join(" | ")}`);
  }
}

function assertValidCompanyBoardSnapshot(snapshot) {
  const errors = validateCompanyBoardSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Invalid CompanyBoardSnapshot: ${errors.join(" | ")}`);
  }
}

module.exports = {
  validateOpportunityRecord,
  validateApprovalTicket,
  validateHandoffPacket,
  validateAgentStatusCard,
  validateCompanyBoardSnapshot,
  assertValidOpportunityRecord,
  assertValidApprovalTicket,
  assertValidHandoffPacket,
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
};
