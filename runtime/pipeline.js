"use strict";

const {
  assertValidOpportunityRecord,
  assertValidApprovalTicket,
  assertValidHandoffPacket,
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
} = require("./contracts");

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

function toIso(value, fallbackIso) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallbackIso;
}

function buildOpportunityRecord(input, nowIso = new Date().toISOString()) {
  const ask = Number(input.ask_price_usd || 0);
  const comps = Array.isArray(input.market_comps_usd) ? input.market_comps_usd : [];
  const medComp = median(comps);

  const fees = Number(input.estimated_costs?.fees_usd || 0);
  const shipping = Number(input.estimated_costs?.shipping_usd || 0);
  const labor = Number(input.estimated_costs?.labor_usd || 0);
  const repair = Number(input.estimated_costs?.repair_usd || 0);

  const baselineCosts = ask + fees + shipping + labor;
  const asIsValue = Math.max(0, medComp - 40);
  const repairValue = Math.max(0, medComp + 10);
  const netAsIs = asIsValue - baselineCosts;
  const netRepair = repairValue - (baselineCosts + repair);

  let recommendedPath = "resale_as_is";
  let bestNet = netAsIs;
  if (netRepair > bestNet) {
    recommendedPath = "repair_and_resale";
    bestNet = netRepair;
  }

  if (bestNet < 0) {
    recommendedPath = "skip";
  }

  const carrierStatus = input.device?.carrier_status || "unknown";
  const imeiProofVerified = input.device?.imei_proof_verified === true;
  const carrierVerified = carrierStatus === "verified";
  let recommendation = "acquire";
  if (recommendedPath === "skip") {
    recommendation = "skip";
  } else if (!carrierVerified || !imeiProofVerified) {
    recommendation = "request_more_info";
    recommendedPath = "request_more_info";
  }

  let confidence = "low";
  if (comps.length >= 3 && ask <= medComp) {
    confidence = "medium";
  }
  if (comps.length >= 5 && ask <= medComp * 0.8) {
    confidence = "high";
  }

  const rangeFloor = Math.max(0, Math.round(Math.min(asIsValue, repairValue) - 30));
  const rangeCeil = Math.max(rangeFloor, Math.round(Math.max(asIsValue, repairValue)));
  const baseRisks = Array.isArray(input.known_risks) ? [...input.known_risks] : [];
  if (!carrierVerified) {
    baseRisks.push("carrier status unverified");
  }
  if (!imeiProofVerified) {
    baseRisks.push("imei proof unverified");
  }

  const deviceSummary = [
    input.device?.name || "Unknown device",
    input.device?.condition || "condition unknown",
    input.device?.accessories ? `accessories: ${input.device.accessories}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const record = {
    opportunity_id: String(input.opportunity_id || "unknown-opportunity"),
    source: String(input.source || "unknown_source"),
    captured_at: toIso(input.captured_at, nowIso),
    device_summary: deviceSummary,
    ask_price_usd: ask,
    estimated_value_range_usd: [rangeFloor, rangeCeil],
    recommended_path: recommendedPath,
    recommendation,
    confidence,
    risks: baseRisks,
    notes: `best_net_usd=${Math.round(bestNet)} using ${recommendedPath}`,
  };

  assertValidOpportunityRecord(record);
  return record;
}

function buildApprovalTicket(input, opportunityRecord, nowIso = new Date().toISOString()) {
  if (opportunityRecord.recommendation !== "acquire") {
    return null;
  }

  const requiredByDate = new Date(nowIso);
  requiredByDate.setHours(requiredByDate.getHours() + 2);

  const ticket = {
    ticket_id: `apr-${opportunityRecord.opportunity_id}`,
    opportunity_id: opportunityRecord.opportunity_id,
    action_type: "acquisition",
    requested_by: "CEO Agent",
    recommended_option: "approve",
    decision_options: ["approve", "reject", "request_more_info"],
    max_exposure_usd: opportunityRecord.ask_price_usd,
    reasoning_summary: `Positive expected net with selected path ${opportunityRecord.recommended_path}.`,
    risk_summary: opportunityRecord.risks.slice(0, 3).join("; ") || "No major risks recorded.",
    required_by: requiredByDate.toISOString(),
  };

  assertValidApprovalTicket(ticket);
  return ticket;
}

function buildHandoffPacket(opportunityRecord, approvalTicket, nowIso = new Date().toISOString()) {
  const dueByDate = new Date(nowIso);
  dueByDate.setHours(dueByDate.getHours() + 1);

  let fromAgent = "Valuation Agent";
  let toAgent = "Risk and Compliance Agent";
  let reason = "Need additional verification before acquisition decision.";
  let payloadType = "OpportunityRecord";
  let payloadRef = opportunityRecord.opportunity_id;
  let blockingItems = opportunityRecord.risks.includes("carrier status unverified")
    ? ["carrier status unverified"]
    : [];
  let nextAction = "Request remote IMEI proof and verify carrier status.";

  if (opportunityRecord.recommendation === "acquire" && approvalTicket) {
    fromAgent = "CEO Agent";
    toAgent = "Operations Coordinator Agent";
    reason = "Proceed with acquisition checklist under approval gate.";
    payloadType = "ApprovalTicket";
    payloadRef = approvalTicket.ticket_id;
    const verificationRisks = opportunityRecord.risks.filter(
      (risk) => risk.includes("carrier") || risk.includes("IMEI")
    );
    blockingItems = verificationRisks;
    nextAction = "Complete remote verification checks, then execute approved acquisition action.";
  } else if (opportunityRecord.recommendation === "skip") {
    fromAgent = "Valuation Agent";
    toAgent = "Operations Coordinator Agent";
    reason = "Close low-value opportunity.";
    payloadType = "OpportunityRecord";
    payloadRef = opportunityRecord.opportunity_id;
    blockingItems = [];
    nextAction = "Mark opportunity closed with skip reason.";
  }

  const handoff = {
    handoff_id: `hof-${opportunityRecord.opportunity_id}`,
    opportunity_id: opportunityRecord.opportunity_id,
    from_agent: fromAgent,
    to_agent: toAgent,
    reason,
    payload_type: payloadType,
    payload_ref: payloadRef,
    blocking_items: blockingItems,
    next_action: nextAction,
    due_by: dueByDate.toISOString(),
  };

  assertValidHandoffPacket(handoff);
  return handoff;
}

function buildOfficeStatus(opportunityRecord, approvalTicket, handoffPacket, nowIso = new Date().toISOString()) {
  const approvalWaiting = approvalTicket ? 1 : 0;
  const blockedCount = handoffPacket.blocking_items.length > 0 ? 1 : 0;
  const commonOpportunityId = opportunityRecord.opportunity_id;

  const ceoStatus =
    approvalWaiting > 0
      ? "awaiting_approval"
      : opportunityRecord.recommendation === "skip"
      ? "working"
      : "working";

  const operationsStatus = blockedCount > 0 ? "blocked" : "working";
  const riskStatus = opportunityRecord.recommendation === "request_more_info" ? "working" : "idle";

  const agent_status_cards = [
    {
      agent: "CEO Agent",
      status: ceoStatus,
      active_task:
        approvalWaiting > 0 ? `Review approval ticket ${approvalTicket.ticket_id}` : "Monitor pipeline priorities",
      opportunity_id: commonOpportunityId,
      blocker: null,
      urgency: approvalWaiting > 0 ? "high" : "medium",
      updated_at: nowIso,
    },
    {
      agent: "Risk and Compliance Agent",
      status: riskStatus,
      active_task:
        riskStatus === "working"
          ? "Request and validate remote IMEI/carrier evidence"
          : "No active verification task",
      opportunity_id: riskStatus === "working" ? commonOpportunityId : null,
      blocker: null,
      urgency: riskStatus === "working" ? "high" : "low",
      updated_at: nowIso,
    },
    {
      agent: "Operations Coordinator Agent",
      status: operationsStatus,
      active_task:
        operationsStatus === "blocked"
          ? "Awaiting blocker resolution before execution"
          : "Advance opportunity to next execution step",
      opportunity_id: commonOpportunityId,
      blocker: operationsStatus === "blocked" ? handoffPacket.blocking_items.join("; ") : null,
      urgency: operationsStatus === "blocked" ? "high" : "medium",
      updated_at: nowIso,
    },
  ];

  for (const card of agent_status_cards) {
    assertValidAgentStatusCard(card);
  }

  const company_board_snapshot = {
    snapshot_id: `brd-${commonOpportunityId}`,
    timestamp: nowIso,
    priorities: [
      approvalWaiting > 0 ? "Resolve approval queue item." : "Advance active opportunity workflow.",
      blockedCount > 0 ? "Clear blocking verification dependencies." : "Maintain pipeline flow.",
    ],
    approvals_waiting: approvalWaiting,
    blocked_count: blockedCount,
    active_opportunities: [commonOpportunityId],
    alerts: handoffPacket.blocking_items.length > 0 ? handoffPacket.blocking_items : [],
    capital_note:
      approvalWaiting > 0
        ? `${opportunityRecord.ask_price_usd} USD pending approval.`
        : "No capital approval pending for this opportunity.",
  };

  assertValidCompanyBoardSnapshot(company_board_snapshot);

  return {
    agent_status_cards,
    company_board_snapshot,
  };
}

function runOpportunityPipeline(input, nowIso = new Date().toISOString()) {
  const opportunity_record = buildOpportunityRecord(input, nowIso);
  const approval_ticket = buildApprovalTicket(input, opportunity_record, nowIso);
  const handoff_packet = buildHandoffPacket(opportunity_record, approval_ticket, nowIso);
  const { agent_status_cards, company_board_snapshot } = buildOfficeStatus(
    opportunity_record,
    approval_ticket,
    handoff_packet,
    nowIso
  );

  return {
    opportunity_record,
    approval_ticket,
    handoff_packet,
    agent_status_cards,
    company_board_snapshot,
  };
}

module.exports = {
  buildOpportunityRecord,
  buildApprovalTicket,
  buildHandoffPacket,
  buildOfficeStatus,
  runOpportunityPipeline,
};
