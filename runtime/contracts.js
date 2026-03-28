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
const CAPITAL_MODES = new Set(["normal", "constrained", "recovery"]);
const CAPITAL_FIT_STANCES = new Set(["favored", "neutral", "discouraged"]);
const APPROVED_STRATEGY_CLASSES = new Set([
  "repair_resell",
  "part_out",
  "resale_only",
  "arbitrage",
  "liquidation",
  "bundle_optimization",
]);
const LANE_STAGES = new Set(["verification", "approval", "execution", "market", "monitor"]);
const OFFICE_EVENT_TYPES = new Set([
  "handoff_started",
  "handoff_completed",
  "focus_changed",
  "lane_changed",
  "approval_waiting",
  "approval_resolved",
]);
const OFFICE_EVENT_SOURCES = new Set(["handoff_signal", "workflow_state", "approval_queue"]);
const OFFICE_EVENT_SEVERITIES = new Set(["info", "attention", "alert"]);
const APPROVAL_DECISIONS = new Set(["pending", "approve", "reject", "request_more_info"]);
const OFFICE_ROUTE_SOURCES = new Set(["handoff_signal"]);
const OFFICE_MOVEMENT_KINDS = new Set(["handoff", "approval", "workflow"]);
const OFFICE_MOVEMENT_STATES = new Set(["in_flight", "arrived"]);
const OFFICE_MOVEMENT_SOURCES = new Set(["handoff_signal", "workflow_state", "approval_queue"]);
const OFFICE_MOVEMENT_TRIGGER_TYPES = new Set([
  "handoff_started",
  "handoff_completed",
  "focus_changed",
  "lane_changed",
  "approval_waiting",
  "approval_resolved",
]);

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function validateNormalizedPoint(point, label) {
  const errors = [];
  if (!point || typeof point !== "object") {
    errors.push(`${label} must be an object with x/y.`);
    return errors;
  }
  if (typeof point.x !== "number" || point.x < 0 || point.x > 1) {
    errors.push(`${label}.x must be a number between 0 and 1.`);
  }
  if (typeof point.y !== "number" || point.y < 0 || point.y > 1) {
    errors.push(`${label}.y must be a number between 0 and 1.`);
  }
  return errors;
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

function validateCapitalStrategySnapshot(snapshot) {
  const errors = [];
  if (snapshot == null) {
    return errors;
  }
  if (!snapshot || typeof snapshot !== "object") {
    return ["CapitalStrategySnapshot must be an object or null."];
  }
  if (!isIsoDateTime(snapshot.as_of)) {
    errors.push("as_of must be ISO-8601 datetime.");
  }
  if (!CAPITAL_MODES.has(snapshot.capital_mode)) {
    errors.push("capital_mode contains invalid enum value.");
  }
  if (typeof snapshot.capital_mode_reason !== "string" || !snapshot.capital_mode_reason) {
    errors.push("capital_mode_reason must be a non-empty string.");
  }
  if (!Array.isArray(snapshot.board_history)) {
    errors.push("board_history must be an array.");
  } else {
    snapshot.board_history.forEach((entry, index) => {
      errors.push(
        ...validateCapitalStrategyHistoryEntry(entry).map(
          (error) => `board_history[${index}]: ${error}`
        )
      );
    });
  }
  if (
    !Array.isArray(snapshot.approved_strategy_priorities) ||
    !snapshot.approved_strategy_priorities.length
  ) {
    errors.push("approved_strategy_priorities must be a non-empty array.");
  } else if (
    !snapshot.approved_strategy_priorities.every((item) => APPROVED_STRATEGY_CLASSES.has(item))
  ) {
    errors.push("approved_strategy_priorities contains invalid enum value.");
  }
  if (!isStringArray(snapshot.capital_risk_flags)) {
    errors.push("capital_risk_flags must be an array of strings.");
  }
  if (!isStringArray(snapshot.recommended_avoidances)) {
    errors.push("recommended_avoidances must be an array of strings.");
  }
  if (!isStringArray(snapshot.recommended_actions)) {
    errors.push("recommended_actions must be an array of strings.");
  }
  if (!isNullableString(snapshot.source_capital_account_id)) {
    errors.push("source_capital_account_id must be string or null.");
  }
  return errors;
}

function validateCapitalStrategyHistoryEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object") {
    return ["CapitalStrategyHistoryEntry must be an object."];
  }
  if (!isIsoDateTime(entry.timestamp)) {
    errors.push("timestamp must be ISO-8601 datetime.");
  }
  if (!CAPITAL_MODES.has(entry.capital_mode)) {
    errors.push("capital_mode contains invalid enum value.");
  }
  if (typeof entry.rationale_snapshot !== "string" || !entry.rationale_snapshot) {
    errors.push("rationale_snapshot must be a non-empty string.");
  }
  return errors;
}

function validateCapitalFitAnnotation(annotation) {
  const errors = [];
  if (annotation == null) {
    return errors;
  }
  if (!annotation || typeof annotation !== "object") {
    return ["CapitalFitAnnotation must be an object or null."];
  }
  if (!CAPITAL_FIT_STANCES.has(annotation.stance)) {
    errors.push("stance contains invalid enum value.");
  }
  if (typeof annotation.reason !== "string" || !annotation.reason) {
    errors.push("reason must be a non-empty string.");
  }
  return errors;
}

function validateOfficeZoneAnchor(anchor) {
  const errors = [];
  if (!anchor || typeof anchor !== "object") {
    return ["OfficeZoneAnchor must be an object."];
  }
  if (typeof anchor.zone_id !== "string" || !anchor.zone_id) {
    errors.push("zone_id must be a non-empty string.");
  }
  if (typeof anchor.zone_label !== "string" || !anchor.zone_label) {
    errors.push("zone_label must be a non-empty string.");
  }
  if (typeof anchor.department_label !== "string" || !anchor.department_label) {
    errors.push("department_label must be a non-empty string.");
  }
  errors.push(...validateNormalizedPoint(anchor.anchor, "anchor"));
  errors.push(...validateNormalizedPoint(anchor.ingress, "ingress"));
  errors.push(...validateNormalizedPoint(anchor.egress, "egress"));
  errors.push(...validateNormalizedPoint(anchor.handoff_dock, "handoff_dock"));
  if (!isStringArray(anchor.connections)) {
    errors.push("connections must be an array of zone_id strings.");
  }
  return errors;
}

function validateOfficeHandoffSignal(signal) {
  const errors = [];
  if (!signal || typeof signal !== "object") {
    return ["OfficeHandoffSignal must be an object."];
  }
  if (typeof signal.opportunity_id !== "string" || !signal.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (typeof signal.from_agent !== "string" || !signal.from_agent) {
    errors.push("from_agent must be a non-empty string.");
  }
  if (typeof signal.to_agent !== "string" || !signal.to_agent) {
    errors.push("to_agent must be a non-empty string.");
  }
  if (typeof signal.from_zone_id !== "string" || !signal.from_zone_id) {
    errors.push("from_zone_id must be a non-empty string.");
  }
  if (typeof signal.to_zone_id !== "string" || !signal.to_zone_id) {
    errors.push("to_zone_id must be a non-empty string.");
  }
  if (typeof signal.next_action !== "string" || !signal.next_action) {
    errors.push("next_action must be a non-empty string.");
  }
  if (!isIsoDateTime(signal.due_by)) {
    errors.push("due_by must be ISO-8601 datetime.");
  }
  if (!Number.isInteger(signal.blocking_count) || signal.blocking_count < 0) {
    errors.push("blocking_count must be a non-negative integer.");
  }
  if (typeof signal.source_stale !== "boolean") {
    errors.push("source_stale must be boolean.");
  }
  return errors;
}

function validateOfficeRouteHint(hint) {
  const errors = [];
  if (!hint || typeof hint !== "object") {
    return ["OfficeRouteHint must be an object."];
  }
  if (typeof hint.route_id !== "string" || !hint.route_id) {
    errors.push("route_id must be a non-empty string.");
  }
  if (typeof hint.opportunity_id !== "string" || !hint.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (typeof hint.from_zone_id !== "string" || !hint.from_zone_id) {
    errors.push("from_zone_id must be a non-empty string.");
  }
  if (typeof hint.to_zone_id !== "string" || !hint.to_zone_id) {
    errors.push("to_zone_id must be a non-empty string.");
  }
  if (!Array.isArray(hint.path_zone_ids) || hint.path_zone_ids.some((value) => typeof value !== "string")) {
    errors.push("path_zone_ids must be an array of strings.");
  } else {
    const minimumPathLength = hint.from_zone_id === hint.to_zone_id ? 1 : 2;
    if (hint.path_zone_ids.length < minimumPathLength) {
      errors.push(`path_zone_ids must contain at least ${minimumPathLength} zone(s).`);
    }
  }
  if (!Array.isArray(hint.waypoints) || !hint.waypoints.length) {
    errors.push("waypoints must be a non-empty array.");
  } else {
    const minimumWaypointLength = hint.from_zone_id === hint.to_zone_id ? 1 : 2;
    if (hint.waypoints.length < minimumWaypointLength) {
      errors.push(`waypoints must contain at least ${minimumWaypointLength} point(s).`);
    }
    hint.waypoints.forEach((point, index) => {
      errors.push(...validateNormalizedPoint(point, `waypoints[${index}]`));
    });
  }
  if (!OFFICE_ROUTE_SOURCES.has(hint.source)) {
    errors.push("source contains invalid enum value.");
  }
  return errors;
}

function validateOfficeEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object") {
    return ["OfficeEvent must be an object."];
  }
  if (typeof event.event_id !== "string" || !event.event_id) {
    errors.push("event_id must be a non-empty string.");
  }
  if (!OFFICE_EVENT_TYPES.has(event.type)) {
    errors.push("type contains invalid enum value.");
  }
  if (!OFFICE_EVENT_SOURCES.has(event.source)) {
    errors.push("source contains invalid enum value.");
  }
  if (!isIsoDateTime(event.timestamp)) {
    errors.push("timestamp must be ISO-8601 datetime.");
  }
  if (!isNullableString(event.opportunity_id)) {
    errors.push("opportunity_id must be string or null.");
  }
  if (!isNullableString(event.from_agent)) {
    errors.push("from_agent must be string or null.");
  }
  if (!isNullableString(event.to_agent)) {
    errors.push("to_agent must be string or null.");
  }
  if (!isNullableString(event.from_zone_id)) {
    errors.push("from_zone_id must be string or null.");
  }
  if (!isNullableString(event.to_zone_id)) {
    errors.push("to_zone_id must be string or null.");
  }
  if (!LANE_STAGES.has(event.lane_from)) {
    errors.push("lane_from contains invalid enum value.");
  }
  if (!LANE_STAGES.has(event.lane_to)) {
    errors.push("lane_to contains invalid enum value.");
  }
  if (!LANE_STAGES.has(event.lane_stage)) {
    errors.push("lane_stage contains invalid enum value.");
  }
  if (!Number.isInteger(event.blocking_count) || event.blocking_count < 0) {
    errors.push("blocking_count must be a non-negative integer.");
  }
  if (!isNullableString(event.ticket_id)) {
    errors.push("ticket_id must be string or null.");
  }
  if (!(event.decision === null || APPROVAL_DECISIONS.has(event.decision))) {
    errors.push("decision contains invalid enum value.");
  }
  if (!isNullableString(event.agent)) {
    errors.push("agent must be string or null.");
  }
  if (typeof event.summary !== "string" || !event.summary) {
    errors.push("summary must be a non-empty string.");
  }
  if (!OFFICE_EVENT_SEVERITIES.has(event.severity)) {
    errors.push("severity contains invalid enum value.");
  }
  return errors;
}

function validateOfficeMovementIntent(intent) {
  const errors = [];
  if (!intent || typeof intent !== "object") {
    return ["OfficeMovementIntent must be an object."];
  }
  if (typeof intent.intent_id !== "string" || !intent.intent_id) {
    errors.push("intent_id must be a non-empty string.");
  }
  if (typeof intent.opportunity_id !== "string" || !intent.opportunity_id) {
    errors.push("opportunity_id must be a non-empty string.");
  }
  if (!OFFICE_MOVEMENT_KINDS.has(intent.movement_kind)) {
    errors.push("movement_kind contains invalid enum value.");
  }
  if (!OFFICE_MOVEMENT_STATES.has(intent.transition_state)) {
    errors.push("transition_state contains invalid enum value.");
  }
  if (typeof intent.agent !== "string" || !intent.agent) {
    errors.push("agent must be a non-empty string.");
  }
  if (typeof intent.from_agent !== "string" || !intent.from_agent) {
    errors.push("from_agent must be a non-empty string.");
  }
  if (typeof intent.to_agent !== "string" || !intent.to_agent) {
    errors.push("to_agent must be a non-empty string.");
  }
  if (typeof intent.from_zone_id !== "string" || !intent.from_zone_id) {
    errors.push("from_zone_id must be a non-empty string.");
  }
  if (typeof intent.to_zone_id !== "string" || !intent.to_zone_id) {
    errors.push("to_zone_id must be a non-empty string.");
  }
  if (typeof intent.route_id !== "string" || !intent.route_id) {
    errors.push("route_id must be a non-empty string.");
  }
  if (
    !Array.isArray(intent.path_zone_ids) ||
    intent.path_zone_ids.some((value) => typeof value !== "string")
  ) {
    errors.push("path_zone_ids must be an array of strings.");
  } else {
    const minimumPathLength = intent.from_zone_id === intent.to_zone_id ? 1 : 2;
    if (intent.path_zone_ids.length < minimumPathLength) {
      errors.push(`path_zone_ids must contain at least ${minimumPathLength} zone(s).`);
    }
  }
  if (!Array.isArray(intent.waypoints) || !intent.waypoints.length) {
    errors.push("waypoints must be a non-empty array.");
  } else {
    const minimumWaypointLength = intent.from_zone_id === intent.to_zone_id ? 1 : 2;
    if (intent.waypoints.length < minimumWaypointLength) {
      errors.push(`waypoints must contain at least ${minimumWaypointLength} point(s).`);
    }
    intent.waypoints.forEach((point, index) => {
      errors.push(...validateNormalizedPoint(point, `waypoints[${index}]`));
    });
  }
  if (typeof intent.trigger_event_id !== "string" || !intent.trigger_event_id) {
    errors.push("trigger_event_id must be a non-empty string.");
  }
  if (!OFFICE_MOVEMENT_TRIGGER_TYPES.has(intent.trigger_type)) {
    errors.push("trigger_type contains invalid enum value.");
  }
  if (!isIsoDateTime(intent.trigger_timestamp)) {
    errors.push("trigger_timestamp must be ISO-8601 datetime.");
  }
  if (!OFFICE_MOVEMENT_SOURCES.has(intent.source)) {
    errors.push("source contains invalid enum value.");
  }
  if (!Number.isInteger(intent.duration_ms) || intent.duration_ms < 300) {
    errors.push("duration_ms must be an integer >= 300.");
  }
  if (!Number.isInteger(intent.blocking_count) || intent.blocking_count < 0) {
    errors.push("blocking_count must be a non-negative integer.");
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

function assertValidCapitalStrategySnapshot(snapshot) {
  const errors = validateCapitalStrategySnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Invalid CapitalStrategySnapshot: ${errors.join(" | ")}`);
  }
}

function assertValidCapitalStrategyHistoryEntry(entry) {
  const errors = validateCapitalStrategyHistoryEntry(entry);
  if (errors.length > 0) {
    throw new Error(`Invalid CapitalStrategyHistoryEntry: ${errors.join(" | ")}`);
  }
}

function assertValidCapitalFitAnnotation(annotation) {
  const errors = validateCapitalFitAnnotation(annotation);
  if (errors.length > 0) {
    throw new Error(`Invalid CapitalFitAnnotation: ${errors.join(" | ")}`);
  }
}

function assertValidOfficeZoneAnchor(anchor) {
  const errors = validateOfficeZoneAnchor(anchor);
  if (errors.length > 0) {
    throw new Error(`Invalid OfficeZoneAnchor: ${errors.join(" | ")}`);
  }
}

function assertValidOfficeHandoffSignal(signal) {
  const errors = validateOfficeHandoffSignal(signal);
  if (errors.length > 0) {
    throw new Error(`Invalid OfficeHandoffSignal: ${errors.join(" | ")}`);
  }
}

function assertValidOfficeRouteHint(hint) {
  const errors = validateOfficeRouteHint(hint);
  if (errors.length > 0) {
    throw new Error(`Invalid OfficeRouteHint: ${errors.join(" | ")}`);
  }
}

function assertValidOfficeEvent(event) {
  const errors = validateOfficeEvent(event);
  if (errors.length > 0) {
    throw new Error(`Invalid OfficeEvent: ${errors.join(" | ")}`);
  }
}

function assertValidOfficeMovementIntent(intent) {
  const errors = validateOfficeMovementIntent(intent);
  if (errors.length > 0) {
    throw new Error(`Invalid OfficeMovementIntent: ${errors.join(" | ")}`);
  }
}

module.exports = {
  validateOpportunityRecord,
  validateApprovalTicket,
  validateHandoffPacket,
  validateAgentStatusCard,
  validateCompanyBoardSnapshot,
  validateCapitalStrategySnapshot,
  validateCapitalStrategyHistoryEntry,
  validateCapitalFitAnnotation,
  validateOfficeZoneAnchor,
  validateOfficeHandoffSignal,
  validateOfficeRouteHint,
  validateOfficeEvent,
  validateOfficeMovementIntent,
  assertValidOpportunityRecord,
  assertValidApprovalTicket,
  assertValidHandoffPacket,
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
  assertValidCapitalStrategySnapshot,
  assertValidCapitalStrategyHistoryEntry,
  assertValidCapitalFitAnnotation,
  assertValidOfficeZoneAnchor,
  assertValidOfficeHandoffSignal,
  assertValidOfficeRouteHint,
  assertValidOfficeEvent,
  assertValidOfficeMovementIntent,
};
