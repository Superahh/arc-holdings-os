"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadQueue } = require("./approval_queue");
const { loadCapitalState, verifyLedgerIntegrity } = require("./capital_state");
const { loadWorkflowState } = require("./workflow_state");
const { runStatusAction } = require("./ops_status_cli");
const {
  assertValidOpportunityRecord,
  assertValidApprovalTicket,
  assertValidHandoffPacket,
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
  assertValidCapitalStrategySnapshot,
  assertValidCapitalFitAnnotation,
  assertValidOfficeZoneAnchor,
  assertValidOfficeHandoffSignal,
  assertValidOfficeRouteHint,
  assertValidOfficeEvent,
  assertValidOfficeMovementIntent,
} = require("./contracts");

const TERMINAL_OPPORTUNITY_STATES = new Set(["closed", "rejected"]);
const CAPITAL_STRATEGY_BOARD_HISTORY_LIMIT = 4;

function toIso(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listLatestRunArtifactsByOpportunity(baseDir) {
  const runsDir = path.join(baseDir, "runs");
  if (!fs.existsSync(runsDir)) {
    return new Map();
  }

  const files = fs
    .readdirSync(runsDir)
    .filter((entry) => entry.endsWith(".artifact.json"))
    .map((entry) => path.join(runsDir, entry))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const artifacts = new Map();
  for (const filePath of files) {
    const artifact = readJsonIfPresent(filePath);
    if (!artifact || typeof artifact.opportunity_id !== "string" || !artifact.opportunity_id) {
      continue;
    }
    if (!artifacts.has(artifact.opportunity_id)) {
      artifacts.set(artifact.opportunity_id, {
        path: filePath,
        artifact,
      });
    }
  }
  return artifacts;
}

function summarizeQueueTotals(queue) {
  const totals = {
    total: 0,
    pending: 0,
    approve: 0,
    reject: 0,
    request_more_info: 0,
  };

  for (const item of queue.items) {
    totals.total += 1;
    if (totals[item.status] !== undefined) {
      totals[item.status] += 1;
    }
  }
  return totals;
}

function mapTaskUrgency(task) {
  if (!task) {
    return "medium";
  }
  if (task.urgency === "overdue" || task.urgency === "due_soon") {
    return "high";
  }
  return "medium";
}

function sortOpportunities(entries) {
  return [...entries].sort((a, b) => {
    const aTaskRank =
      a.latest_task && a.latest_task.urgency === "overdue"
        ? 0
        : a.latest_task && a.latest_task.urgency === "due_soon"
          ? 1
          : 2;
    const bTaskRank =
      b.latest_task && b.latest_task.urgency === "overdue"
        ? 0
        : b.latest_task && b.latest_task.urgency === "due_soon"
          ? 1
          : 2;
    if (aTaskRank !== bTaskRank) {
      return aTaskRank - bTaskRank;
    }

    const aUpdated = Date.parse(
      (a.workflow_record && a.workflow_record.last_updated_at) ||
        (a.latest_artifact && a.latest_artifact.generated_at) ||
        0
    );
    const bUpdated = Date.parse(
      (b.workflow_record && b.workflow_record.last_updated_at) ||
        (b.latest_artifact && b.latest_artifact.generated_at) ||
        0
    );
    return bUpdated - aUpdated;
  });
}

function normalizeRecommendationCopy(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOneLineSummary(value) {
  return normalizeRecommendationCopy(value);
}

function recommendationCopyKey(value) {
  return normalizeRecommendationCopy(value).toLowerCase();
}

function compactToken(value) {
  return normalizeRecommendationCopy(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalizeBlockerText(blockerClass) {
  const canonical = {
    approval_queue_waiting: "Approval blocker: owner decision is required in the approval queue.",
    purchase_recommendation_blocked:
      "Approval blocker: purchase recommendation is blocked pending owner decision.",
    verification_pending:
      "Verification blocker: IMEI proof and carrier status must both be verified.",
    verification_failed: "Critical blocker: seller verification failed.",
    non_viable_fit: "Critical blocker: current fit is non-viable for this opportunity.",
    decision_input_missing: "Decision blocker: required non-verification inputs are missing.",
  };
  return canonical[blockerClass] || "Decision blocker: unresolved blocker requires owner review.";
}

function reasonParrotsLabel(reason, label) {
  const reasonToken = compactToken(reason);
  const labelToken = compactToken(label);
  if (!reasonToken || !labelToken) {
    return false;
  }
  if (reasonToken === labelToken) {
    return true;
  }
  return reasonToken === `recommendation${labelToken}` || reasonToken === `${labelToken}recommendation`;
}

function buildRecommendationReasonCopy(context) {
  if (context.recommendationState === "reject_now") {
    if (context.blockerClass === "verification_failed") {
      return "Seller verification failed on a critical check, so this path is not viable.";
    }
    return "Current fit is non-viable, so this opportunity should be rejected now.";
  }
  if (context.recommendationState === "approve_now") {
    return "Verification evidence is sufficient and no blocking gate remains.";
  }
  if (context.recommendationState === "buy_after_verification") {
    if (context.hasApprovalGate) {
      return "Upside is acceptable, but verification is incomplete and approval remains blocked.";
    }
    return "Upside is acceptable, but required verification evidence is still incomplete.";
  }
  if (context.hasApprovalGate) {
    return "Potential upside exists, but explicit approval input is still missing.";
  }
  if (context.missingRepairQuote) {
    return "Potential upside exists, but repair-cost decision input is still missing.";
  }
  if (context.missingOpportunityPacket) {
    return "Potential upside exists, but core opportunity inputs are missing from the packet.";
  }
  return "Potential upside exists, but required non-verification decision inputs are missing.";
}

function buildRecommendationFallbackNextAction(context) {
  if (context.recommendationState === "reject_now") {
    return "Reject the ticket and close active pursuit for this opportunity.";
  }
  if (context.recommendationState === "approve_now") {
    return "Approve now and hand off to execution under the current plan.";
  }
  if (context.recommendationState === "buy_after_verification") {
    if (context.hasApprovalGate) {
      return "Collect missing verification proof, then clear approval to proceed.";
    }
    return "Collect missing IMEI proof and carrier status evidence before approval.";
  }
  if (context.hasApprovalGate) {
    return "Resolve the approval gate with an explicit owner decision.";
  }
  if (context.missingRepairQuote) {
    return "Capture a repair quote and update the decision packet.";
  }
  if (context.missingOpportunityPacket) {
    return "Rebuild a complete opportunity packet before deciding.";
  }
  return "Collect the missing decision inputs and rerun recommendation review.";
}

function buildRecommendationChangeCondition(context) {
  if (context.recommendationState === "reject_now") {
    return "Change only if new contradictory evidence clears the critical blocker.";
  }
  if (context.recommendationState === "approve_now") {
    return "Change only if a new critical blocker appears before execution.";
  }
  if (context.recommendationState === "buy_after_verification") {
    if (context.hasApprovalGate) {
      return "Change when verification completes and owner approval is explicitly granted.";
    }
    return "Change when IMEI proof and carrier status are both verified.";
  }
  if (context.hasApprovalGate) {
    return "Change when owner approval resolves to approve or reject.";
  }
  if (context.missingRepairQuote) {
    return "Change when repair quote evidence is added and reviewed.";
  }
  return "Change when missing non-verification decision inputs are provided.";
}

function hardenRecommendationVisibleCopy(input) {
  const reasonAlternates = {
    approve_now: "All required evidence gates are clear for immediate approval.",
    buy_after_verification: "Recommendation remains positive once verification is complete.",
    hold_for_info: "Potentially viable, but required decision inputs are still missing.",
    reject_now: "Current evidence is strong enough to reject now.",
  };
  const changeAlternates = {
    approve_now: "Change if a new critical blocker appears.",
    buy_after_verification: "Change when required verification fully clears.",
    hold_for_info: "Change when required non-verification inputs are supplied.",
    reject_now: "Change if contradictory evidence clears the reject blocker.",
  };

  let reason = normalizeRecommendationCopy(input.reason);
  let nextAction = normalizeRecommendationCopy(input.nextAction);
  let changeCondition = normalizeRecommendationCopy(input.changeCondition);
  if (!reason) {
    reason = reasonAlternates[input.recommendationState];
  }
  if (!nextAction) {
    nextAction = buildRecommendationFallbackNextAction(input.context);
  }
  if (!changeCondition) {
    changeCondition = changeAlternates[input.recommendationState];
  }

  if (reasonParrotsLabel(reason, input.label)) {
    reason = reasonAlternates[input.recommendationState];
  }

  if (recommendationCopyKey(reason) === recommendationCopyKey(nextAction)) {
    if (input.hasExplicitAction) {
      reason = reasonAlternates[input.recommendationState];
    } else {
      nextAction = buildRecommendationFallbackNextAction(input.context);
      if (recommendationCopyKey(reason) === recommendationCopyKey(nextAction)) {
        reason = reasonAlternates[input.recommendationState];
      }
    }
  }
  if (recommendationCopyKey(reason) === recommendationCopyKey(changeCondition)) {
    changeCondition = changeAlternates[input.recommendationState];
  }
  if (recommendationCopyKey(nextAction) === recommendationCopyKey(changeCondition)) {
    changeCondition = changeAlternates[input.recommendationState];
  }

  return { reason, nextAction, changeCondition };
}

function deriveOperationalRecommendation(entry) {
  const opportunityRecord =
    entry && entry.contract_bundle ? entry.contract_bundle.opportunity_record : null;
  const workflowRecord = entry ? entry.workflow_record : null;
  const handoffPacket =
    entry && entry.contract_bundle ? entry.contract_bundle.handoff_packet : null;
  const latestTask = entry ? entry.latest_task : null;
  const queueItem = entry ? entry.queue_item : null;

  const rawRecommendation =
    (opportunityRecord && opportunityRecord.recommendation) ||
    (workflowRecord && workflowRecord.recommendation) ||
    null;
  const recommendedPath = opportunityRecord ? opportunityRecord.recommended_path : null;
  const currentStatus = entry ? entry.current_status : null;
  const askPrice = opportunityRecord ? opportunityRecord.ask_price_usd : null;
  const valueRange = opportunityRecord ? opportunityRecord.estimated_value_range_usd : null;
  const valueCeiling =
    Array.isArray(valueRange) && typeof valueRange[1] === "number" ? valueRange[1] : null;
  const missingOpportunityPacket = !opportunityRecord;
  const missingRepairQuote = recommendedPath === "repair_and_resale";
  const workflowBlocked = Boolean(
    workflowRecord && workflowRecord.purchase_recommendation_blocked
  );
  const hasApprovalGate =
    workflowBlocked || Boolean(queueItem && queueItem.status === "pending");
  const verification = workflowRecord ? workflowRecord.seller_verification : null;
  const verificationComplete = Boolean(
    verification &&
      verification.imei_proof_verified === true &&
      verification.carrier_status_verified === true
  );
  const verificationResponseStatus =
    verification && typeof verification.response_status === "string"
      ? verification.response_status.toLowerCase()
      : "";
  const verificationFailed = new Set([
    "failed",
    "rejected",
    "invalid",
    "blacklisted",
    "fraud_suspected",
  ]).has(verificationResponseStatus);
  const verificationPending = Boolean(
    !verificationComplete &&
      (verification ||
        currentStatus === "awaiting_seller_verification" ||
        rawRecommendation === "request_more_info")
  );
  const overpriced =
    typeof askPrice === "number" &&
    typeof valueCeiling === "number" &&
    askPrice > valueCeiling;
  const nonViableFit =
    rawRecommendation === "skip" || recommendedPath === "part_out" || overpriced;
  const criticalBlocker = verificationFailed || nonViableFit;
  const missingDecisionInputs =
    missingOpportunityPacket ||
    missingRepairQuote ||
    rawRecommendation == null ||
    (hasApprovalGate && !verificationPending);
  const blockerCount = [
    criticalBlocker,
    verificationPending,
    hasApprovalGate,
    missingDecisionInputs,
  ].filter(Boolean).length;

  let recommendationState = "hold_for_info";
  if (criticalBlocker) {
    recommendationState = "reject_now";
  } else if (
    rawRecommendation === "acquire" &&
    !verificationPending &&
    !hasApprovalGate &&
    blockerCount === 0
  ) {
    recommendationState = "approve_now";
  } else if (verificationPending) {
    recommendationState = "buy_after_verification";
  }

  const recommendationLabels = {
    reject_now: "Reject now",
    approve_now: "Approve now",
    buy_after_verification: "Buy after verification",
    hold_for_info: "Hold for info",
  };

  let primaryDriver = "missing_decision_input";
  let blockingType = "decision_input_missing";
  let actionability = "hold";
  let blockerClass = "decision_input_missing";
  if (recommendationState === "approve_now") {
    primaryDriver = "ready_to_execute";
    blockingType = "none";
    actionability = "ready";
    blockerClass = "none";
  } else if (recommendationState === "buy_after_verification") {
    primaryDriver = "verification_pending";
    blockingType = "verification";
    actionability = "gated";
    blockerClass = "verification_pending";
  } else if (recommendationState === "reject_now") {
    primaryDriver = "critical_blocker";
    blockingType = verificationFailed ? "verification_failed" : "non_viable_fit";
    actionability = "stop";
    blockerClass = verificationFailed ? "verification_failed" : "non_viable_fit";
  } else if (hasApprovalGate) {
    primaryDriver = "approval_pending";
    blockingType = "approval";
    actionability = "hold";
    blockerClass = workflowBlocked
      ? "purchase_recommendation_blocked"
      : "approval_queue_waiting";
  }

  const recommendationContext = {
    recommendationState,
    primaryDriver,
    blockingType,
    actionability,
    hasApprovalGate,
    verificationPending,
    missingOpportunityPacket,
    missingRepairQuote,
    blockerClass,
    askPrice,
    valueCeiling,
  };
  const normalizedCopy = hardenRecommendationVisibleCopy({
    recommendationState,
    label: recommendationLabels[recommendationState],
    reason: buildRecommendationReasonCopy(recommendationContext),
    nextAction: buildRecommendationFallbackNextAction(recommendationContext),
    changeCondition: buildRecommendationChangeCondition(recommendationContext),
    hasExplicitAction: false,
    context: recommendationContext,
  });

  return {
    recommendation_state: recommendationState,
    recommendation_type: recommendationState,
    recommendation_label: recommendationLabels[recommendationState],
    recommendation_reason: normalizedCopy.reason,
    next_action: normalizedCopy.nextAction,
    change_condition: normalizedCopy.changeCondition,
    primary_driver: primaryDriver,
    blocking_type: blockingType,
    actionability,
    blocker_class: blockerClass,
    blocker_text: blockerClass === "none" ? null : canonicalizeBlockerText(blockerClass),
  };
}

function deriveOperationalHandoff(entry) {
  const packet =
    entry &&
    entry.contract_bundle &&
    entry.contract_bundle.handoff_packet &&
    typeof entry.contract_bundle.handoff_packet === "object"
      ? entry.contract_bundle.handoff_packet
      : null;
  const latestTask = entry && entry.latest_task ? entry.latest_task : null;
  const workflowRecord = entry && entry.workflow_record ? entry.workflow_record : null;
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const currentStatus = entry ? entry.current_status : "";
  const queueItem = entry && entry.queue_item ? entry.queue_item : null;

  const verification = workflowRecord ? workflowRecord.seller_verification : null;
  const verificationPending = Boolean(
    verification &&
      (!verification.imei_proof_verified || !verification.carrier_status_verified)
  );
  const verificationResponseStatus =
    verification && typeof verification.response_status === "string"
      ? verification.response_status.toLowerCase()
      : "";
  const verificationFailed = new Set([
    "failed",
    "rejected",
    "invalid",
    "blacklisted",
    "fraud_suspected",
  ]).has(verificationResponseStatus);
  const workflowBlocked = Boolean(
    workflowRecord && workflowRecord.purchase_recommendation_blocked
  );
  const queuePending = Boolean(queueItem && queueItem.status === "pending");
  const terminalStatus = TERMINAL_OPPORTUNITY_STATES.has(normalizeRecommendationCopy(currentStatus).toLowerCase());
  const hasBlockingItems = Boolean(
    packet && Array.isArray(packet.blocking_items) && packet.blocking_items.length > 0
  );
  const blockerText =
    (recommendation && recommendation.blocker_text) ||
    (workflowBlocked ? canonicalizeBlockerText("purchase_recommendation_blocked") : null) ||
    (verificationPending ? canonicalizeBlockerText("verification_pending") : null) ||
    null;
  const blockerClass =
    recommendation && typeof recommendation.blocker_class === "string"
      ? recommendation.blocker_class
      : null;
  const softWaitingBlocker = new Set([
    "verification_pending",
    "approval_queue_waiting",
    "decision_input_missing",
  ]).has(blockerClass);
  const criticalReturn = Boolean(
    terminalStatus ||
      verificationFailed ||
      (recommendation && recommendation.recommendation_state === "reject_now")
  );
  const explicitCurrentAction =
    (latestTask && latestTask.next_action) ||
    (recommendation && recommendation.next_action) ||
    (packet && packet.next_action) ||
    "";
  const currentOwner =
    (latestTask && latestTask.owner) ||
    (packet && packet.from_agent) ||
    (packet && packet.to_agent) ||
    "Owner review";

  let handoffState = "handoff_ready";
  if (criticalReturn) {
    handoffState = "handoff_return_required";
  } else if ((blockerText && !softWaitingBlocker) || workflowBlocked || hasBlockingItems) {
    handoffState = "handoff_blocked";
  } else if (
    verificationPending ||
    queuePending ||
    softWaitingBlocker ||
    !normalizeRecommendationCopy(explicitCurrentAction)
  ) {
    handoffState = "handoff_waiting";
  }

  const handoffLabels = {
    handoff_ready: "Handoff ready",
    handoff_blocked: "Handoff blocked",
    handoff_waiting: "Handoff waiting",
    handoff_return_required: "Return required",
  };
  const defaultNextOwner =
    handoffState === "handoff_return_required"
      ? (packet && packet.from_agent) || currentOwner
      : (packet && packet.to_agent) || (latestTask && latestTask.owner) || currentOwner;

  let handoffReason = "Packet is actionable for ownership transfer.";
  let clearCondition = "Clears when next owner accepts handoff and starts execution.";
  if (handoffState === "handoff_blocked") {
    handoffReason = blockerText || "Transfer is blocked by unresolved blockers.";
    clearCondition = blockerText
      ? `Clears when blocker resolves: ${blockerText}`
      : "Clears when blocker is resolved and packet is re-confirmed.";
  } else if (handoffState === "handoff_waiting") {
    handoffReason = verificationPending
      ? "Waiting on verification evidence before transfer."
      : queuePending
        ? "Waiting on owner approval decision before transfer."
        : "Waiting on explicit owner action before transfer.";
    clearCondition = verificationPending
      ? "Clears when IMEI proof and carrier status are both verified."
      : queuePending
        ? "Clears when owner approval resolves to approve or reject."
        : "Clears when current owner publishes explicit next action.";
  } else if (handoffState === "handoff_return_required") {
    handoffReason = blockerText || canonicalizeBlockerText("non_viable_fit");
    clearCondition = "Clears when previous owner reclaims and republishes a viable packet.";
  }

  return {
    handoff_state: handoffState,
    handoff_label: handoffLabels[handoffState],
    handoff_reason: handoffReason,
    current_owner_action:
      normalizeRecommendationCopy(explicitCurrentAction) ||
      "Publish explicit owner action for this handoff.",
    next_owner: defaultNextOwner,
    handoff_clear_condition: clearCondition,
  };
}

function deriveOperationalExecution(entry) {
  const opportunityRecord =
    entry &&
    entry.contract_bundle &&
    entry.contract_bundle.opportunity_record &&
    typeof entry.contract_bundle.opportunity_record === "object"
      ? entry.contract_bundle.opportunity_record
      : null;
  const workflowRecord = entry && entry.workflow_record ? entry.workflow_record : null;
  const queueItem = entry && entry.queue_item ? entry.queue_item : null;
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const handoff = entry && entry.operational_handoff ? entry.operational_handoff : null;
  const currentStatus = entry && typeof entry.current_status === "string" ? entry.current_status : "";

  const recommendedPath = opportunityRecord ? opportunityRecord.recommended_path : null;
  const verification = workflowRecord ? workflowRecord.seller_verification : null;
  const verificationComplete = Boolean(
    verification &&
      verification.imei_proof_verified === true &&
      verification.carrier_status_verified === true
  );
  const workflowBlocked = Boolean(
    workflowRecord && workflowRecord.purchase_recommendation_blocked
  );
  const queuePending = Boolean(queueItem && queueItem.status === "pending");
  const terminalStatus = TERMINAL_OPPORTUNITY_STATES.has(
    normalizeRecommendationCopy(currentStatus).toLowerCase()
  );

  let executionState = "execution_waiting_intake";
  if (terminalStatus || (recommendation && recommendation.recommendation_state === "reject_now")) {
    executionState = "execution_not_applicable";
  } else if (recommendedPath === "repair_and_resale") {
    executionState = "execution_waiting_parts";
  } else if (
    workflowBlocked ||
    (handoff &&
      (handoff.handoff_state === "handoff_blocked" ||
        handoff.handoff_state === "handoff_return_required"))
  ) {
    executionState = "execution_blocked";
  } else if (
    recommendation &&
    recommendation.recommendation_state === "approve_now" &&
    (!handoff || handoff.handoff_state === "handoff_ready") &&
    !queuePending &&
    (verificationComplete || new Set(["approved", "acquired"]).has(currentStatus))
  ) {
    executionState = "execution_ready";
  }

  const executionLabels = {
    execution_ready: "Execution ready",
    execution_waiting_intake: "Waiting intake",
    execution_waiting_parts: "Waiting parts",
    execution_blocked: "Execution blocked",
    execution_not_applicable: "Not applicable",
  };

  let executionReason = "Execution intake prerequisites are not complete yet.";
  let executionNextStep = "Prepare intake task and route execution ownership.";
  let executionClearCondition = "Clears when intake owner accepts and starts execution work.";

  if (executionState === "execution_ready") {
    executionReason = "Approval, recommendation, and handoff prerequisites are clear.";
    executionNextStep = `Start execution intake with ${(handoff && handoff.next_owner) || "Operations Coordinator Agent"}.`;
    executionClearCondition = "Clears when execution intake task is started.";
  } else if (executionState === "execution_waiting_parts") {
    executionReason = "Repair path needs parts and quote confirmation before execution.";
    executionNextStep = "Open parts intake and confirm repair quote coverage.";
    executionClearCondition = "Clears when required parts and quote are confirmed.";
  } else if (executionState === "execution_blocked") {
    const blockerText =
      (recommendation && recommendation.blocker_text) ||
      canonicalizeBlockerText("purchase_recommendation_blocked");
    executionReason = blockerText;
    executionNextStep = "Resolve blocker, then reopen execution intake.";
    executionClearCondition = `Clears when blocker resolves: ${blockerText}`;
  } else if (executionState === "execution_not_applicable") {
    executionReason = "Current decision path does not proceed to execution.";
    executionNextStep = "Close execution prep and maintain audit notes.";
    executionClearCondition = "Clears only if decision path changes back to executable.";
  } else if (queuePending) {
    executionReason = "Waiting on owner approval decision before intake.";
    executionNextStep = "Resolve approval ticket and keep intake owner on standby.";
    executionClearCondition = "Clears when approval resolves to approve.";
  } else if (!verificationComplete) {
    executionReason = "Waiting on verification completion before intake.";
    executionNextStep = "Collect remaining verification evidence and re-check readiness.";
    executionClearCondition = "Clears when IMEI proof and carrier status are both verified.";
  } else if (handoff && handoff.handoff_state === "handoff_waiting") {
    executionReason = "Waiting on handoff intake ownership confirmation.";
    executionNextStep = `Confirm intake acceptance with ${handoff.next_owner}.`;
    executionClearCondition = "Clears when next owner confirms intake ownership.";
  }

  return {
    execution_state: executionState,
    execution_label: executionLabels[executionState],
    execution_reason: executionReason,
    execution_next_step: executionNextStep,
    execution_clear_condition: executionClearCondition,
  };
}

function deriveOperationalMarket(entry) {
  const opportunityRecord =
    entry &&
    entry.contract_bundle &&
    entry.contract_bundle.opportunity_record &&
    typeof entry.contract_bundle.opportunity_record === "object"
      ? entry.contract_bundle.opportunity_record
      : null;
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const handoff = entry && entry.operational_handoff ? entry.operational_handoff : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const workflowRecord = entry && entry.workflow_record ? entry.workflow_record : null;
  const currentStatus = entry && typeof entry.current_status === "string" ? entry.current_status : "";

  const terminalStatus = TERMINAL_OPPORTUNITY_STATES.has(
    normalizeRecommendationCopy(currentStatus).toLowerCase()
  );
  const hardBlocked = Boolean(
    (execution &&
      execution.execution_state === "execution_blocked") ||
      (handoff &&
        (handoff.handoff_state === "handoff_blocked" ||
          handoff.handoff_state === "handoff_return_required")) ||
      (workflowRecord && workflowRecord.purchase_recommendation_blocked)
  );
  const pricingMissing = Boolean(
    !opportunityRecord ||
      (recommendation && recommendation.blocker_class === "decision_input_missing")
  );

  let marketState = "market_waiting_listing";
  if (terminalStatus || (recommendation && recommendation.recommendation_state === "reject_now")) {
    marketState = "market_not_applicable";
  } else if (hardBlocked) {
    marketState = "market_blocked";
  } else if (pricingMissing) {
    marketState = "market_waiting_pricing";
  } else if (execution && execution.execution_state === "execution_ready") {
    marketState = "market_ready";
  }

  const marketLabels = {
    market_ready: "Market ready",
    market_waiting_pricing: "Waiting pricing",
    market_waiting_listing: "Waiting listing",
    market_blocked: "Market blocked",
    market_not_applicable: "Not applicable",
  };

  let marketReason = "Listing intake is not ready yet.";
  let marketNextStep = "Prepare listing packet for the next market action.";
  let marketClearCondition = "Clears when listing packet is complete and ready to publish.";

  if (marketState === "market_ready") {
    marketReason = "Execution and pricing prerequisites are clear for market action.";
    marketNextStep = "Publish listing on approved marketplace now.";
    marketClearCondition = "Clears when listing is posted and market monitoring starts.";
  } else if (marketState === "market_waiting_pricing") {
    marketReason = "Pricing inputs are incomplete for market action.";
    marketNextStep = "Set list price and floor from value range and comps.";
    marketClearCondition = "Clears when explicit list price and floor are recorded.";
  } else if (marketState === "market_waiting_listing") {
    if (execution && execution.execution_state === "execution_waiting_parts") {
      marketReason = "Listing waits on parts and repair intake readiness.";
      marketNextStep = "Finish parts intake, then draft listing package.";
      marketClearCondition = "Clears when parts intake completes and listing draft is prepared.";
    } else if (execution && execution.execution_state === "execution_waiting_intake") {
      marketReason = "Listing waits on execution intake completion.";
      marketNextStep = "Complete execution intake and capture sellable condition notes.";
      marketClearCondition = "Clears when execution intake is complete for listing prep.";
    } else {
      marketReason = "Listing packet is not prepared for market action yet.";
      marketNextStep = "Draft listing copy and media for publication.";
      marketClearCondition = "Clears when listing packet is approved for publication.";
    }
  } else if (marketState === "market_blocked") {
    const blockerText =
      (recommendation && recommendation.blocker_text) ||
      canonicalizeBlockerText("purchase_recommendation_blocked");
    marketReason = blockerText;
    marketNextStep = "Resolve blocker, then resume market prep.";
    marketClearCondition = `Clears when blocker resolves: ${blockerText}`;
  } else if (marketState === "market_not_applicable") {
    marketReason = "Current decision path does not proceed to market action.";
    marketNextStep = "Do not prepare listing for this path.";
    marketClearCondition = "Clears only if decision path changes to executable.";
  }

  return {
    market_state: marketState,
    market_label: marketLabels[marketState],
    market_reason: marketReason,
    market_next_step: marketNextStep,
    market_clear_condition: marketClearCondition,
  };
}

function deriveOperatorRouteSummary(entry) {
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const handoff = entry && entry.operational_handoff ? entry.operational_handoff : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const market = entry && entry.operational_market ? entry.operational_market : null;
  const currentStatus = entry && typeof entry.current_status === "string" ? entry.current_status : "";

  const isStop = Boolean(
    (recommendation && recommendation.recommendation_state === "reject_now") ||
      (handoff && handoff.handoff_state === "handoff_return_required") ||
      (execution && execution.execution_state === "execution_not_applicable") ||
      (market && market.market_state === "market_not_applicable")
  );
  const isHold = Boolean(
    (handoff && handoff.handoff_state === "handoff_blocked") ||
      (execution && execution.execution_state === "execution_blocked") ||
      (market && market.market_state === "market_blocked")
  );
  const isPursueAfterVerification = Boolean(
    recommendation && recommendation.recommendation_state === "buy_after_verification"
  );
  const isPursueNow = Boolean(
    currentStatus === "researching" ||
      (
        recommendation &&
        recommendation.recommendation_state === "approve_now" &&
        execution &&
        execution.execution_state === "execution_waiting_intake" &&
        !new Set(["approved", "acquired"]).has(currentStatus)
      )
  );
  const isPrepareExecution = Boolean(
    execution &&
      (execution.execution_state === "execution_waiting_intake" ||
        execution.execution_state === "execution_waiting_parts")
  );
  const isPrepareMarket = Boolean(
    market &&
      (market.market_state === "market_ready" ||
        market.market_state === "market_waiting_listing" ||
        market.market_state === "market_waiting_pricing")
  );

  let operatorRouteState = "hold";
  if (isStop) {
    operatorRouteState = "stop";
  } else if (isHold) {
    operatorRouteState = "hold";
  } else if (isPursueNow) {
    operatorRouteState = "pursue_now";
  } else if (isPursueAfterVerification) {
    operatorRouteState = "pursue_after_verification";
  } else if (isPrepareExecution) {
    operatorRouteState = "prepare_execution";
  } else if (isPrepareMarket) {
    operatorRouteState = "prepare_market";
  }

  const routeLabels = {
    pursue_now: "Pursue now",
    pursue_after_verification: "Pursue after verification",
    prepare_execution: "Prepare execution",
    prepare_market: "Prepare market",
    hold: "Hold",
    stop: "Stop",
  };

  let reason = "Hold current route until the next prerequisite is clear.";
  let nextStep = "Review blockers and publish one explicit owner action.";
  if (operatorRouteState === "stop") {
    reason =
      (market && market.market_reason) ||
      (execution && execution.execution_reason) ||
      (recommendation && recommendation.recommendation_reason) ||
      "Current path should not continue.";
    nextStep =
      (market && market.market_next_step) ||
      (execution && execution.execution_next_step) ||
      "Stop pursuit and close this route.";
  } else if (operatorRouteState === "hold") {
    reason =
      (market && market.market_reason) ||
      (execution && execution.execution_reason) ||
      (handoff && handoff.handoff_reason) ||
      (recommendation && recommendation.recommendation_reason) ||
      "Route is blocked or waiting on missing input.";
    nextStep =
      (market && market.market_next_step) ||
      (execution && execution.execution_next_step) ||
      (handoff && handoff.current_owner_action) ||
      (recommendation && recommendation.next_action) ||
      "Resolve the current blocker before advancing.";
  } else if (operatorRouteState === "pursue_after_verification") {
    reason =
      (recommendation && recommendation.recommendation_reason) ||
      "Verification must clear before pursuit continues.";
    nextStep =
      (recommendation && recommendation.next_action) ||
      "Collect required verification evidence.";
  } else if (operatorRouteState === "prepare_market") {
    reason =
      (market && market.market_reason) ||
      "Market path is active and should be prepared now.";
    nextStep =
      (market && market.market_next_step) ||
      "Prepare listing and pricing package.";
  } else if (operatorRouteState === "prepare_execution") {
    reason =
      (execution && execution.execution_reason) ||
      "Execution path is active and should be prepared now.";
    nextStep =
      (execution && execution.execution_next_step) ||
      "Prepare execution intake.";
  } else if (operatorRouteState === "pursue_now") {
    reason =
      (recommendation && recommendation.recommendation_reason) ||
      "Core prerequisites are clear for immediate pursuit.";
    nextStep =
      (handoff && handoff.current_owner_action) ||
      (recommendation && recommendation.next_action) ||
      "Advance the current pursuit step now.";
  }

  return {
    operator_route_state: operatorRouteState,
    operator_route_label: routeLabels[operatorRouteState],
    operator_route_reason: reason,
    operator_route_next_step: nextStep,
  };
}

function buildCapacityPressureProfile(opportunities) {
  const entries = Array.isArray(opportunities) ? opportunities : [];
  const pendingApprovals = entries.filter(
    (entry) => entry && entry.queue_item && entry.queue_item.status === "pending"
  ).length;
  const activeExecution = entries.filter((entry) => {
    const execution = entry && entry.operational_execution ? entry.operational_execution : null;
    return (
      execution &&
      new Set([
        "execution_ready",
        "execution_waiting_intake",
        "execution_waiting_parts",
      ]).has(execution.execution_state)
    );
  }).length;
  const activeMarket = entries.filter((entry) => {
    const market = entry && entry.operational_market ? entry.operational_market : null;
    return (
      market &&
      new Set([
        "market_ready",
        "market_waiting_pricing",
        "market_waiting_listing",
      ]).has(market.market_state)
    );
  }).length;
  const activeOps = entries.filter((entry) => {
    const execution = entry && entry.operational_execution ? entry.operational_execution : null;
    const market = entry && entry.operational_market ? entry.operational_market : null;
    const executionActive = Boolean(
      execution &&
      new Set([
        "execution_ready",
        "execution_waiting_intake",
        "execution_waiting_parts",
      ]).has(execution.execution_state)
    );
    const marketActive = Boolean(
      market &&
      new Set([
        "market_ready",
        "market_waiting_pricing",
        "market_waiting_listing",
      ]).has(market.market_state)
    );
    return executionActive || marketActive;
  }).length;
  const blockedOps = entries.filter((entry) => {
    const execution = entry && entry.operational_execution ? entry.operational_execution : null;
    const market = entry && entry.operational_market ? entry.operational_market : null;
    return (
      (execution && execution.execution_state === "execution_blocked") ||
      (market && market.market_state === "market_blocked")
    );
  }).length;
  const routedInventory = entries.filter((entry) =>
    new Set(["routed", "monetizing"]).has(entry.current_status)
  ).length;
  const inFlightLoad = activeOps + pendingApprovals;

  let pressureLevel = "clear";
  if (inFlightLoad >= 8 || routedInventory >= 5 || blockedOps >= 3) {
    pressureLevel = "overloaded";
  } else if (inFlightLoad >= 4 || routedInventory >= 3 || blockedOps >= 1) {
    pressureLevel = "constrained";
  }

  let dominantPressure = "execution_load";
  if (pendingApprovals >= Math.max(2, routedInventory, blockedOps)) {
    dominantPressure = "approval_queue";
  } else if (routedInventory >= Math.max(2, blockedOps)) {
    dominantPressure = "routed_inventory";
  } else if (blockedOps >= 1) {
    dominantPressure = "blocked_ops";
  }

  return {
    pressure_level: pressureLevel,
    pending_approvals: pendingApprovals,
    active_execution: activeExecution,
    active_market: activeMarket,
    active_ops: activeOps,
    blocked_ops: blockedOps,
    routed_inventory: routedInventory,
    in_flight_load: inFlightLoad,
    dominant_pressure: dominantPressure,
  };
}

function capacityPressureReason(profile) {
  if (!profile || typeof profile !== "object") {
    return "Execution and inventory load signals are unavailable.";
  }
  if (profile.dominant_pressure === "approval_queue") {
    return `${profile.pending_approvals} approval item(s) are waiting in queue.`;
  }
  if (profile.dominant_pressure === "routed_inventory") {
    return `${profile.routed_inventory} inventory item(s) are already in routed/market stages.`;
  }
  if (profile.dominant_pressure === "blocked_ops") {
    return `${profile.blocked_ops} active item(s) are currently blocked.`;
  }
  return `${profile.in_flight_load} active execution/market workload item(s) are in flight.`;
}

function capacityReliefStep(profile) {
  if (!profile || typeof profile !== "object") {
    return "Review active workload and clear one blocked item before new intake.";
  }
  if (profile.dominant_pressure === "approval_queue") {
    return "Resolve one pending approval before adding new intake.";
  }
  if (profile.dominant_pressure === "routed_inventory") {
    return "Close or relist one routed/market item before adding intake.";
  }
  if (profile.dominant_pressure === "blocked_ops") {
    return "Clear one blocked execution/market item before adding intake.";
  }
  return "Complete one in-flight execution/market item before adding intake.";
}

function deriveOperationalCapacity(entry, profile) {
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const market = entry && entry.operational_market ? entry.operational_market : null;
  const route = entry && entry.operational_route ? entry.operational_route : null;

  const isNotApplicable = Boolean(
    (recommendation && recommendation.recommendation_state === "reject_now") ||
      (route && route.operator_route_state === "stop") ||
      (execution && execution.execution_state === "execution_not_applicable") ||
      (market && market.market_state === "market_not_applicable")
  );
  const isOverloaded = profile && profile.pressure_level === "overloaded";
  const isConstrained = profile && profile.pressure_level === "constrained";
  const holdSignal = Boolean(
    (route && route.operator_route_state === "hold") ||
      (recommendation && recommendation.recommendation_state === "buy_after_verification")
  );

  let capacityState = "capacity_clear";
  if (isNotApplicable) {
    capacityState = "capacity_not_applicable";
  } else if (isOverloaded) {
    capacityState = "capacity_overloaded";
  } else if (isConstrained && holdSignal) {
    capacityState = "capacity_hold";
  } else if (isConstrained) {
    capacityState = "capacity_constrained";
  }

  const labels = {
    capacity_clear: "Capacity clear",
    capacity_constrained: "Capacity constrained",
    capacity_overloaded: "Capacity overloaded",
    capacity_hold: "Capacity hold",
    capacity_not_applicable: "Not applicable",
  };

  let reason = "Execution and inventory load are within working range.";
  let nextStep = "Proceed with the current route owner action.";
  let clearCondition = "Clears now; no immediate capacity relief is required.";

  if (capacityState === "capacity_constrained") {
    const pressureReason = capacityPressureReason(profile);
    reason = `Capacity pressure is elevated: ${pressureReason}`;
    nextStep = capacityReliefStep(profile);
    clearCondition =
      "Clears when workload returns to working range (in-flight <= 3, routed inventory <= 2, blocked ops = 0).";
  } else if (capacityState === "capacity_overloaded") {
    const pressureReason = capacityPressureReason(profile);
    reason = `Capacity load is above safe working range: ${pressureReason}`;
    nextStep = `Relieve load first. ${capacityReliefStep(profile)}`;
    clearCondition =
      "Clears when workload returns to working range (in-flight <= 3, routed inventory <= 2, blocked ops = 0).";
  } else if (capacityState === "capacity_hold") {
    const pressureReason = capacityPressureReason(profile);
    reason = `Opportunity is viable, but capacity timing is tight: ${pressureReason}`;
    nextStep = `Hold this intake until one relief step is complete. ${capacityReliefStep(profile)}`;
    clearCondition =
      "Clears when one relief step is complete and workload returns to working range.";
  } else if (capacityState === "capacity_not_applicable") {
    reason = "Current route is stop/terminal, so capacity gating does not apply.";
    nextStep = "No capacity action is required for this route.";
    clearCondition = "Clears only if the route reopens from stop/terminal path.";
  }

  return {
    capacity_state: capacityState,
    capacity_label: labels[capacityState],
    capacity_reason: reason,
    capacity_next_step: nextStep,
    capacity_clear_condition: clearCondition,
  };
}

function buildSellthroughPressureProfile(opportunities) {
  const entries = Array.isArray(opportunities) ? opportunities : [];
  const routedInventory = entries.filter((entry) =>
    new Set(["routed", "monetizing"]).has(entry.current_status)
  );
  const routedCount = routedInventory.length;
  const stalledCount = routedInventory.filter((entry) => {
    const market = entry && entry.operational_market ? entry.operational_market : null;
    return Boolean(
      market &&
      new Set(["market_waiting_pricing", "market_waiting_listing"]).has(market.market_state)
    );
  }).length;
  const blockedCount = routedInventory.filter((entry) => {
    const market = entry && entry.operational_market ? entry.operational_market : null;
    return Boolean(market && market.market_state === "market_blocked");
  }).length;
  const activeMarketCount = routedInventory.filter((entry) => {
    const market = entry && entry.operational_market ? entry.operational_market : null;
    return Boolean(
      market &&
      new Set(["market_ready", "market_waiting_pricing", "market_waiting_listing"]).has(
        market.market_state
      )
    );
  }).length;

  let pressureLevel = "clear";
  if (routedCount >= 5 || stalledCount >= 3 || blockedCount >= 2) {
    pressureLevel = "stale";
  } else if (routedCount >= 3 || stalledCount >= 1 || blockedCount >= 1) {
    pressureLevel = "slow";
  }

  let dominantPressure = "routed_load";
  if (blockedCount >= Math.max(1, stalledCount)) {
    dominantPressure = "market_blocked";
  } else if (stalledCount >= 1) {
    dominantPressure = "market_stalled";
  }

  return {
    pressure_level: pressureLevel,
    routed_count: routedCount,
    stalled_count: stalledCount,
    blocked_count: blockedCount,
    active_market_count: activeMarketCount,
    dominant_pressure: dominantPressure,
  };
}

function sellthroughPressureReason(profile) {
  if (!profile || typeof profile !== "object") {
    return "Sell-through signals are unavailable.";
  }
  if (profile.dominant_pressure === "market_blocked") {
    return `${profile.blocked_count} routed/market item(s) are market-blocked.`;
  }
  if (profile.dominant_pressure === "market_stalled") {
    return `${profile.stalled_count} routed/market item(s) are waiting pricing/listing.`;
  }
  return `${profile.routed_count} item(s) are active in routed/market stages.`;
}

function sellthroughReliefStep(profile) {
  if (!profile || typeof profile !== "object") {
    return "Review routed inventory and clear one blocked listing.";
  }
  if (profile.dominant_pressure === "market_blocked") {
    return "Resolve one market blocker and relist that item.";
  }
  if (profile.dominant_pressure === "market_stalled") {
    return "Refresh pricing/listing package on one stalled item.";
  }
  return "Close one routed/market item before adding new intake.";
}

function deriveOperationalSellthrough(entry, profile) {
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const market = entry && entry.operational_market ? entry.operational_market : null;
  const route = entry && entry.operational_route ? entry.operational_route : null;

  const isNotApplicable = Boolean(
    (recommendation && recommendation.recommendation_state === "reject_now") ||
      (route && route.operator_route_state === "stop") ||
      (execution && execution.execution_state === "execution_not_applicable") ||
      (market && market.market_state === "market_not_applicable")
  );
  const isStale = profile && profile.pressure_level === "stale";
  const isSlow = profile && profile.pressure_level === "slow";
  const holdSignal = Boolean(
    (route && route.operator_route_state === "hold") ||
      (recommendation && recommendation.recommendation_state === "buy_after_verification")
  );

  let sellthroughState = "sellthrough_clear";
  if (isNotApplicable) {
    sellthroughState = "sellthrough_not_applicable";
  } else if (isStale) {
    sellthroughState = "sellthrough_stale";
  } else if (isSlow && holdSignal) {
    sellthroughState = "sellthrough_hold";
  } else if (isSlow) {
    sellthroughState = "sellthrough_slow";
  }

  const labels = {
    sellthrough_clear: "Sell-through clear",
    sellthrough_slow: "Sell-through slow",
    sellthrough_stale: "Sell-through stale",
    sellthrough_hold: "Sell-through hold",
    sellthrough_not_applicable: "Not applicable",
  };

  let reason = "Routed/market turnover is within working range.";
  let nextStep = "Proceed with the current route owner action.";
  let clearCondition = "Clears now; no sell-through relief is required.";

  if (sellthroughState === "sellthrough_slow") {
    const pressureReason = sellthroughPressureReason(profile);
    reason = `Sell-through pressure is elevated: ${pressureReason}`;
    nextStep = sellthroughReliefStep(profile);
    clearCondition =
      "Clears when routed/market pressure returns to working range (routed <= 2, stalled = 0, blocked = 0).";
  } else if (sellthroughState === "sellthrough_stale") {
    const pressureReason = sellthroughPressureReason(profile);
    reason = `Sell-through is clogged by stale inventory: ${pressureReason}`;
    nextStep = `Clear stale inventory first. ${sellthroughReliefStep(profile)}`;
    clearCondition =
      "Clears when routed/market pressure returns to working range (routed <= 2, stalled = 0, blocked = 0).";
  } else if (sellthroughState === "sellthrough_hold") {
    const pressureReason = sellthroughPressureReason(profile);
    reason = `Opportunity is viable, but turnover pressure is slow: ${pressureReason}`;
    nextStep = `Hold intake until one turnover-relief step is complete. ${sellthroughReliefStep(profile)}`;
    clearCondition = "Clears when one turnover-relief step is complete and routed pressure returns to working range.";
  } else if (sellthroughState === "sellthrough_not_applicable") {
    reason = "Current route is stop/terminal, so sell-through gating does not apply.";
    nextStep = "No inventory-turnover action is required for this route.";
    clearCondition = "Clears only if the route reopens from stop/terminal path.";
  }

  return {
    sellthrough_state: sellthroughState,
    sellthrough_label: labels[sellthroughState],
    sellthrough_reason: reason,
    sellthrough_next_step: nextStep,
    sellthrough_clear_condition: clearCondition,
  };
}

function parseConfidenceLevel(value) {
  const normalized = normalizeRecommendationCopy(value || "").toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (new Set(["high", "very_high", "strong"]).has(normalized)) {
    return "high";
  }
  if (new Set(["medium", "moderate", "mixed"]).has(normalized)) {
    return "medium";
  }
  if (new Set(["low", "very_low", "weak"]).has(normalized)) {
    return "low";
  }
  return "unknown";
}

function summarizeRisk(riskText) {
  const normalized = normalizeRecommendationCopy(riskText || "");
  if (!normalized) {
    return "unresolved risk item";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93).trim()}...` : normalized;
}

function deriveOpportunityQuality(entry) {
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const route = entry && entry.operational_route ? entry.operational_route : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const market = entry && entry.operational_market ? entry.operational_market : null;
  const workflow = entry && entry.workflow_record ? entry.workflow_record : null;
  const queueItem = entry && entry.queue_item ? entry.queue_item : null;
  const opportunityRecord =
    entry && entry.contract_bundle ? entry.contract_bundle.opportunity_record : null;
  const risks = opportunityRecord && Array.isArray(opportunityRecord.risks) ? opportunityRecord.risks : [];
  const confidenceRaw =
    (opportunityRecord && opportunityRecord.confidence) ||
    (workflow && workflow.confidence) ||
    "unknown";
  const confidenceLevel = parseConfidenceLevel(confidenceRaw);
  const verification = workflow && workflow.seller_verification ? workflow.seller_verification : null;
  const verificationComplete = Boolean(
    verification &&
      verification.imei_proof_verified === true &&
      verification.carrier_status_verified === true
  );
  const verificationResponse = normalizeRecommendationCopy(
    verification && verification.response_status ? verification.response_status : ""
  ).toLowerCase();
  const verificationFailed = new Set([
    "failed",
    "rejected",
    "invalid",
    "blacklisted",
    "fraud_suspected",
    "unsatisfactory",
  ]).has(verificationResponse);
  const verificationMissing = Boolean(
    !verification || verification.imei_proof_verified !== true || verification.carrier_status_verified !== true
  );
  const blocked = Boolean(workflow && workflow.purchase_recommendation_blocked);
  const pendingApproval = Boolean(queueItem && queueItem.status === "pending");
  const recommendationState = recommendation ? recommendation.recommendation_state : "";
  const criticalRiskPattern =
    /(fraud|blacklist|blacklisted|stolen|counterfeit|imei mismatch|verification failed|confirmed lock)/i;
  const criticalRisk = risks.find((risk) => criticalRiskPattern.test(String(risk || ""))) || null;

  const notApplicable = Boolean(
    recommendationState === "reject_now" ||
      (route && route.operator_route_state === "stop") ||
      (execution && execution.execution_state === "execution_not_applicable") ||
      (market && market.market_state === "market_not_applicable")
  );

  let qualityState = "quality_uncertain";
  if (notApplicable) {
    qualityState = "quality_not_applicable";
  } else if (
    verificationFailed ||
    criticalRisk ||
    (confidenceLevel === "low" && (blocked || verificationMissing))
  ) {
    qualityState = "quality_weak";
  } else if (
    verificationComplete &&
    confidenceLevel === "high" &&
    !blocked &&
    !criticalRisk
  ) {
    qualityState = "quality_strong";
  } else if (
    (confidenceLevel === "medium" || confidenceLevel === "high") &&
    !verificationFailed &&
    !criticalRisk &&
    (verificationComplete || recommendationState === "buy_after_verification")
  ) {
    qualityState = "quality_promising";
  } else {
    qualityState = "quality_uncertain";
  }

  const labels = {
    quality_strong: "Quality strong",
    quality_promising: "Quality promising",
    quality_uncertain: "Quality uncertain",
    quality_weak: "Quality weak",
    quality_not_applicable: "Not applicable",
  };

  let reason = "Evidence quality is mixed and still needs verification clarity.";
  let nextStep = "Verify missing quality inputs before investing more workflow effort.";
  let upgradeCondition = "Upgrade when verification inputs are complete and confidence is raised.";
  if (qualityState === "quality_strong") {
    reason = "Evidence quality is strong: verification is complete, confidence is high, and no active blocker is open.";
    nextStep = "Proceed with the current route owner action.";
    upgradeCondition = "Already strong; keep verification clear and blockers closed.";
  } else if (qualityState === "quality_promising") {
    reason = verificationComplete
      ? "Opportunity quality is good, but one focused input would strengthen confidence before scaling effort."
      : "Opportunity quality is promising, with targeted verification still open.";
    nextStep = blocked
      ? "Resolve purchase recommendation blocker and preserve current verification evidence."
      : verificationMissing
      ? "Collect IMEI proof and carrier-status evidence to close quality gaps."
      : pendingApproval
      ? "Resolve owner approval to lock this evidence into an explicit decision."
      : "Add one stronger proof item (condition evidence or pricing comp) before deeper execution effort.";
    upgradeCondition = blocked
      ? "Upgrades when the blocker is resolved and verification remains clear."
      : verificationMissing
      ? "Upgrades when IMEI proof and carrier status are both verified."
      : "Upgrades when one stronger proof input is added and confidence remains at least medium.";
  } else if (qualityState === "quality_uncertain") {
    reason = blocked
      ? "Evidence quality is uncertain because recommendation blockers are still unresolved."
      : confidenceLevel === "unknown" || confidenceLevel === "low"
      ? "Evidence quality is uncertain because confidence is not yet strong enough."
      : "Evidence quality is uncertain because verification coverage is incomplete.";
    nextStep = blocked
      ? "Clear blocker requirements first, then re-check verification completeness."
      : verificationMissing
      ? "Complete IMEI proof + carrier verification before advancing."
      : "Capture one concrete quality proof item and re-score confidence.";
    upgradeCondition = verificationMissing
      ? "Upgrades when verification completeness is achieved and confidence reaches at least medium."
      : "Upgrades when unresolved blockers close and confidence evidence improves.";
  } else if (qualityState === "quality_weak") {
    reason = verificationFailed
      ? "Evidence quality is weak because seller/device verification failed."
      : criticalRisk
      ? `Evidence quality is weak due to critical risk: ${summarizeRisk(criticalRisk)}`
      : "Evidence quality is weak due to low confidence with unresolved blockers.";
    nextStep = verificationFailed || criticalRisk
      ? "Deprioritize this opportunity and shift effort to higher-quality items."
      : "Stop advancing this opportunity until quality blockers are resolved.";
    upgradeCondition =
      "Upgrades only if critical blocker evidence is reversed and verification is re-validated.";
  } else if (qualityState === "quality_not_applicable") {
    reason = "Current route is stop/terminal, so opportunity-quality scoring is not required.";
    nextStep = "No additional quality action is required on this path.";
    upgradeCondition = "Clears only if the route reopens from stop/terminal path.";
  }

  return {
    opportunity_quality_state: qualityState,
    opportunity_quality_label: labels[qualityState],
    opportunity_quality_reason: reason,
    opportunity_quality_next_step: nextStep,
    opportunity_quality_upgrade_condition: upgradeCondition,
  };
}

function toTimestamp(value) {
  const parsed = Date.parse(value || 0);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function deriveIntakePriority(entry, context = {}) {
  const recommendation = entry && entry.operational_recommendation ? entry.operational_recommendation : null;
  const route = entry && entry.operational_route ? entry.operational_route : null;
  const execution = entry && entry.operational_execution ? entry.operational_execution : null;
  const market = entry && entry.operational_market ? entry.operational_market : null;
  const capacity = entry && entry.operational_capacity ? entry.operational_capacity : null;
  const sellthrough = entry && entry.operational_sellthrough ? entry.operational_sellthrough : null;
  const quality = entry && entry.operational_opportunity_quality ? entry.operational_opportunity_quality : null;
  const workflow = entry && entry.workflow_record ? entry.workflow_record : null;
  const queueItem = entry && entry.queue_item ? entry.queue_item : null;
  const capitalFit = entry && entry.capital_fit ? entry.capital_fit : null;
  const capitalStrategy = context.capitalStrategy || null;
  const nowTs = toTimestamp(context.nowIso || new Date().toISOString());

  const pendingApproval = Boolean(queueItem && queueItem.status === "pending");
  const requiredByTs = toTimestamp(
    queueItem && queueItem.ticket ? queueItem.ticket.required_by : null
  );
  const hasRequiredBy = Number.isFinite(requiredByTs);
  const minutesToRequiredBy = hasRequiredBy ? Math.round((requiredByTs - nowTs) / 60000) : null;
  const overdueApproval = pendingApproval && minutesToRequiredBy != null && minutesToRequiredBy < 0;
  const dueSoonApproval = pendingApproval && minutesToRequiredBy != null && minutesToRequiredBy <= 120;

  const notApplicable = Boolean(
    (recommendation && recommendation.recommendation_state === "reject_now") ||
      (route && route.operator_route_state === "stop") ||
      (execution && execution.execution_state === "execution_not_applicable") ||
      (market && market.market_state === "market_not_applicable")
  );
  const blocked = Boolean(workflow && workflow.purchase_recommendation_blocked);
  const weakQuality = Boolean(quality && quality.opportunity_quality_state === "quality_weak");
  const uncertainQuality = Boolean(
    quality && quality.opportunity_quality_state === "quality_uncertain"
  );
  const pressureDefer = Boolean(
    (capacity && capacity.capacity_state === "capacity_overloaded") ||
      (sellthrough && sellthrough.sellthrough_state === "sellthrough_stale")
  );
  const holdPressure = Boolean(
    (capacity && capacity.capacity_state === "capacity_hold") ||
      (sellthrough && sellthrough.sellthrough_state === "sellthrough_hold")
  );
  const moderatePressure = Boolean(
    (capacity && capacity.capacity_state === "capacity_constrained") ||
      (sellthrough && sellthrough.sellthrough_state === "sellthrough_slow")
  );
  const capitalRecoveryDefer = Boolean(
    capitalStrategy &&
      capitalStrategy.capital_mode === "recovery" &&
      capitalFit &&
      capitalFit.stance === "discouraged"
  );
  const immediateReady = Boolean(
    recommendation &&
      recommendation.recommendation_state === "approve_now" &&
      route &&
      new Set(["pursue_now", "prepare_execution", "prepare_market"]).has(
        route.operator_route_state
      ) &&
      !pendingApproval &&
      !pressureDefer &&
      !holdPressure &&
      !moderatePressure &&
      !blocked
  );

  let intakePriorityState = "priority_later";
  let intakePriorityReason = "Opportunity is active, but immediate intake urgency is limited.";
  let intakePriorityNextStep = "Keep this in active review and re-check after higher-priority items move.";
  if (notApplicable) {
    intakePriorityState = "priority_not_applicable";
    intakePriorityReason = "Current route is stop/terminal, so intake prioritization does not apply.";
    intakePriorityNextStep = "No intake-priority action is required for this route.";
  } else if (pressureDefer) {
    intakePriorityState = "priority_defer";
    intakePriorityReason =
      "Active capacity or sell-through pressure is above safe working range for new intake.";
    intakePriorityNextStep = "Relieve overloaded/stale pressure before advancing this intake.";
  } else if (blocked || holdPressure || capitalRecoveryDefer) {
    intakePriorityState = "priority_defer";
    intakePriorityReason = blocked
      ? "Purchase recommendation is blocked by unresolved requirements."
      : holdPressure
      ? "Operational pressure indicates hold timing for this intake."
      : "Capital mode is recovery and this opportunity is currently discouraged.";
    intakePriorityNextStep = blocked
      ? "Clear blocker requirements, then re-rank this intake."
      : holdPressure
      ? "Complete one pressure-relief step, then re-rank this intake."
      : "Improve capital posture or switch to a favored opportunity shape before intake.";
  } else if (overdueApproval || dueSoonApproval || immediateReady) {
    intakePriorityState = "priority_now";
    intakePriorityReason = overdueApproval
      ? "Pending approval is overdue and needs immediate operator decision."
      : dueSoonApproval
      ? "Pending approval is due soon and should be handled now."
      : "Recommendation and route are ready for immediate intake action.";
    intakePriorityNextStep = overdueApproval || dueSoonApproval
      ? "Resolve approval decision now, then continue the route."
      : "Advance the current route owner action now.";
  } else if (
    pendingApproval ||
    (recommendation && recommendation.recommendation_state === "buy_after_verification")
  ) {
    intakePriorityState = "priority_soon";
    intakePriorityReason = uncertainQuality
      ? "Quality signals are still uncertain, so keep this in near-term verification queue."
      : pendingApproval
      ? "Approval is pending but not urgent enough for immediate handling."
      : recommendation && recommendation.recommendation_state === "buy_after_verification"
      ? "Verification remains open before immediate intake is justified."
      : "Support-layer pressure suggests near-term but selective intake.";
    intakePriorityNextStep = uncertainQuality
      ? "Complete the quality next step, then re-rank for immediate intake."
      : pendingApproval
      ? "Queue this for the next approval pass."
      : "Keep this queued for the next focused intake window.";
  } else if (
    moderatePressure ||
    (capitalStrategy && capitalStrategy.capital_mode === "constrained")
  ) {
    intakePriorityState = "priority_later";
    intakePriorityReason = "Support-layer pressure is manageable but suggests lower intake order.";
    intakePriorityNextStep = "Leave this in later intake order until pressure returns to clear.";
  }

  const labels = {
    priority_now: "Priority now",
    priority_soon: "Priority soon",
    priority_later: "Priority later",
    priority_defer: "Priority defer",
    priority_not_applicable: "Not applicable",
  };
  const stateScore = {
    priority_now: 80,
    priority_soon: 60,
    priority_later: 40,
    priority_defer: 20,
    priority_not_applicable: 0,
  };

  let score = stateScore[intakePriorityState] || 0;
  if (pendingApproval) {
    score += 4;
  }
  if (overdueApproval) {
    score += 6;
  }
  if (execution && execution.execution_state === "execution_ready") {
    score += 4;
  }
  if (market && market.market_state === "market_ready") {
    score += 2;
  }
  if (capacity && capacity.capacity_state === "capacity_constrained") {
    score -= 3;
  }
  if (sellthrough && sellthrough.sellthrough_state === "sellthrough_slow") {
    score -= 3;
  }
  if (weakQuality) {
    score -= 6;
  } else if (uncertainQuality) {
    score -= 2;
  }

  return {
    intake_priority_state: intakePriorityState,
    intake_priority_label: labels[intakePriorityState],
    intake_priority_reason: intakePriorityReason,
    intake_priority_rank: null,
    intake_priority_next_step: intakePriorityNextStep,
    _priority_score: score,
    _priority_due_ts: hasRequiredBy ? requiredByTs : Number.POSITIVE_INFINITY,
  };
}

function annotateIntakePriorities(opportunities, capitalStrategy, nowIso) {
  const annotated = opportunities.map((entry) => {
    const priority = deriveIntakePriority(entry, {
      capitalStrategy,
      nowIso,
    });
    return {
      ...entry,
      intake_priority_state: priority.intake_priority_state,
      intake_priority_label: priority.intake_priority_label,
      intake_priority_reason: priority.intake_priority_reason,
      intake_priority_rank: null,
      intake_priority_next_step: priority.intake_priority_next_step,
      operational_intake_priority: {
        intake_priority_state: priority.intake_priority_state,
        intake_priority_label: priority.intake_priority_label,
        intake_priority_reason: priority.intake_priority_reason,
        intake_priority_rank: null,
        intake_priority_next_step: priority.intake_priority_next_step,
      },
      _priority_score: priority._priority_score,
      _priority_due_ts: priority._priority_due_ts,
    };
  });

  const stateOrder = new Map([
    ["priority_now", 0],
    ["priority_soon", 1],
    ["priority_later", 2],
    ["priority_defer", 3],
    ["priority_not_applicable", 4],
  ]);
  const rankable = annotated
    .filter((entry) => entry.intake_priority_state !== "priority_not_applicable")
    .sort((a, b) => {
      const stateDelta =
        (stateOrder.get(a.intake_priority_state) || 99) -
        (stateOrder.get(b.intake_priority_state) || 99);
      if (stateDelta !== 0) {
        return stateDelta;
      }
      if (a._priority_score !== b._priority_score) {
        return b._priority_score - a._priority_score;
      }
      if (a._priority_due_ts !== b._priority_due_ts) {
        return a._priority_due_ts - b._priority_due_ts;
      }
      return String(a.opportunity_id).localeCompare(String(b.opportunity_id));
    });

  const rankById = new Map();
  rankable.forEach((entry, index) => {
    rankById.set(entry.opportunity_id, index + 1);
  });

  return annotated.map((entry) => {
    const rank = rankById.has(entry.opportunity_id) ? rankById.get(entry.opportunity_id) : null;
    return {
      ...entry,
      intake_priority_rank: rank,
      operational_intake_priority: {
        ...entry.operational_intake_priority,
        intake_priority_rank: rank,
      },
    };
  });
}

function buildOpportunityEntries(queue, workflowState, latestArtifacts, awaitingTasks) {
  const ids = new Set([
    ...Object.keys(workflowState.opportunities || {}),
    ...queue.items.map((item) => item.opportunity_id).filter(Boolean),
    ...latestArtifacts.keys(),
  ]);

  const queueByOpportunity = new Map();
  for (const item of queue.items) {
    if (!item.opportunity_id) {
      continue;
    }
    const existing = queueByOpportunity.get(item.opportunity_id);
    if (!existing) {
      queueByOpportunity.set(item.opportunity_id, item);
      continue;
    }
    const existingTime = Date.parse(existing.created_at || 0);
    const currentTime = Date.parse(item.created_at || 0);
    if (currentTime > existingTime) {
      queueByOpportunity.set(item.opportunity_id, item);
    }
  }

  const taskByOpportunity = new Map();
  for (const task of awaitingTasks) {
    if (task.opportunity_id && !taskByOpportunity.has(task.opportunity_id)) {
      taskByOpportunity.set(task.opportunity_id, task);
    }
  }

  const entries = [];
  for (const opportunityId of ids) {
    const workflowRecord = workflowState.opportunities[opportunityId] || null;
    const queueItem = queueByOpportunity.get(opportunityId) || null;
    const artifactEntry = latestArtifacts.get(opportunityId) || null;
    const artifact = artifactEntry ? artifactEntry.artifact : null;
    const artifactOutput = artifact && artifact.output ? artifact.output : null;
    const opportunityRecord = artifactOutput ? artifactOutput.opportunity_record || null : null;
    const handoffPacket = artifactOutput ? artifactOutput.handoff_packet || null : null;
    const approvalTicket = queueItem ? queueItem.ticket : artifactOutput ? artifactOutput.approval_ticket || null : null;

    if (opportunityRecord) {
      assertValidOpportunityRecord(opportunityRecord);
    }
    if (handoffPacket) {
      assertValidHandoffPacket(handoffPacket);
    }
    if (approvalTicket) {
      assertValidApprovalTicket(approvalTicket);
    }

    const artifactGeneratedAt = artifact ? Date.parse(artifact.generated_at) : Number.NaN;
    const workflowUpdatedAt = workflowRecord ? Date.parse(workflowRecord.last_updated_at) : Number.NaN;
    const artifactIsStale =
      !Number.isNaN(artifactGeneratedAt) &&
      !Number.isNaN(workflowUpdatedAt) &&
      artifactGeneratedAt < workflowUpdatedAt;

    const entry = {
      opportunity_id: opportunityId,
      source:
        (opportunityRecord && opportunityRecord.source) ||
        (workflowRecord && workflowRecord.source) ||
        (queueItem && queueItem.ticket && queueItem.ticket.opportunity_id ? "queue" : "unknown"),
      current_status: workflowRecord ? workflowRecord.current_status : "unknown",
      priority: workflowRecord ? workflowRecord.priority || "normal" : "normal",
      recommendation:
        (opportunityRecord && opportunityRecord.recommendation) ||
        (workflowRecord && workflowRecord.recommendation) ||
        null,
      latest_task: taskByOpportunity.get(opportunityId) || null,
      workflow_record: workflowRecord,
      queue_item: queueItem,
      contract_bundle: {
        opportunity_record: opportunityRecord,
        handoff_packet: handoffPacket,
        approval_ticket: approvalTicket,
      },
      latest_artifact: artifact
        ? {
            path: artifactEntry.path,
            generated_at: artifact.generated_at,
            is_stale: artifactIsStale,
          }
        : null,
    };
    entry.operational_recommendation = deriveOperationalRecommendation(entry);
    const handoff = deriveOperationalHandoff(entry);
    entry.handoff_state = handoff.handoff_state;
    entry.handoff_label = handoff.handoff_label;
    entry.handoff_reason = handoff.handoff_reason;
    entry.current_owner_action = handoff.current_owner_action;
    entry.next_owner = handoff.next_owner;
    entry.handoff_clear_condition = handoff.handoff_clear_condition;
    entry.operational_handoff = handoff;
    const execution = deriveOperationalExecution(entry);
    entry.execution_state = execution.execution_state;
    entry.execution_label = execution.execution_label;
    entry.execution_reason = execution.execution_reason;
    entry.execution_next_step = execution.execution_next_step;
    entry.execution_clear_condition = execution.execution_clear_condition;
    entry.operational_execution = execution;
    const market = deriveOperationalMarket(entry);
    entry.market_state = market.market_state;
    entry.market_label = market.market_label;
    entry.market_reason = market.market_reason;
    entry.market_next_step = market.market_next_step;
    entry.market_clear_condition = market.market_clear_condition;
    entry.operational_market = market;
    const route = deriveOperatorRouteSummary(entry);
    entry.operator_route_state = route.operator_route_state;
    entry.operator_route_label = route.operator_route_label;
    entry.operator_route_reason = route.operator_route_reason;
    entry.operator_route_next_step = route.operator_route_next_step;
    entry.operational_route = route;
    if (entry.contract_bundle && entry.contract_bundle.approval_ticket) {
      entry.contract_bundle.approval_ticket = {
        ...entry.contract_bundle.approval_ticket,
        reasoning_summary: normalizeRecommendationCopy(
          buildApprovalReasoningSummary(entry.operational_recommendation)
        ),
        risk_summary: normalizeRecommendationCopy(
          buildApprovalRiskSummary(entry.operational_recommendation)
        ),
      };
    }
    entries.push(entry);
  }

  const capacityProfile = buildCapacityPressureProfile(entries);
  const sellthroughProfile = buildSellthroughPressureProfile(entries);
  for (const entry of entries) {
    const capacity = deriveOperationalCapacity(entry, capacityProfile);
    entry.capacity_state = capacity.capacity_state;
    entry.capacity_label = capacity.capacity_label;
    entry.capacity_reason = capacity.capacity_reason;
    entry.capacity_next_step = capacity.capacity_next_step;
    entry.capacity_clear_condition = capacity.capacity_clear_condition;
    entry.operational_capacity = capacity;
    const sellthrough = deriveOperationalSellthrough(entry, sellthroughProfile);
    entry.sellthrough_state = sellthrough.sellthrough_state;
    entry.sellthrough_label = sellthrough.sellthrough_label;
    entry.sellthrough_reason = sellthrough.sellthrough_reason;
    entry.sellthrough_next_step = sellthrough.sellthrough_next_step;
    entry.sellthrough_clear_condition = sellthrough.sellthrough_clear_condition;
    entry.operational_sellthrough = sellthrough;
    const quality = deriveOpportunityQuality(entry);
    entry.opportunity_quality_state = quality.opportunity_quality_state;
    entry.opportunity_quality_label = quality.opportunity_quality_label;
    entry.opportunity_quality_reason = quality.opportunity_quality_reason;
    entry.opportunity_quality_next_step = quality.opportunity_quality_next_step;
    entry.opportunity_quality_upgrade_condition = quality.opportunity_quality_upgrade_condition;
    entry.operational_opportunity_quality = quality;
  }

  return sortOpportunities(entries);
}

function findOpportunityByStatuses(opportunities, statuses) {
  return opportunities.find((entry) => statuses.has(entry.current_status)) || null;
}

function buildApprovalReasoningSummary(recommendation) {
  if (!recommendation) {
    return "Hold for info: recommendation packet is incomplete. Next: compile missing decision inputs.";
  }
  return `${recommendation.recommendation_label}: ${recommendation.recommendation_reason} Next: ${recommendation.next_action}`;
}

function buildApprovalRiskSummary(recommendation) {
  if (!recommendation) {
    return "Change when required decision inputs are added and reviewed.";
  }
  return recommendation.change_condition;
}

function deriveApprovalConsequences(opportunityEntry = null) {
  const recommendation =
    opportunityEntry && opportunityEntry.operational_recommendation
      ? opportunityEntry.operational_recommendation
      : null;
  const handoff =
    opportunityEntry && opportunityEntry.operational_handoff
      ? opportunityEntry.operational_handoff
      : null;
  const execution =
    opportunityEntry && opportunityEntry.operational_execution
      ? opportunityEntry.operational_execution
      : null;
  const market =
    opportunityEntry && opportunityEntry.operational_market
      ? opportunityEntry.operational_market
      : null;
  const route =
    opportunityEntry && opportunityEntry.operational_route
      ? opportunityEntry.operational_route
      : null;

  const fallbackResumeOwner =
    (handoff && handoff.next_owner) ||
    (execution &&
    (execution.execution_state === "execution_ready" ||
      execution.execution_state === "execution_waiting_intake" ||
      execution.execution_state === "execution_waiting_parts")
      ? "Operations Coordinator Agent"
      : null) ||
    (market &&
    (market.market_state === "market_ready" ||
      market.market_state === "market_waiting_pricing" ||
      market.market_state === "market_waiting_listing")
      ? "Department Operator Agent"
      : null) ||
    "Risk and Compliance Agent";

  const fallbackResumeCondition =
    (market && market.market_clear_condition) ||
    (execution && execution.execution_clear_condition) ||
    (handoff && handoff.handoff_clear_condition) ||
    (recommendation && recommendation.change_condition) ||
    "Flow resumes when owner decision is recorded and the next step starts.";

  let approveConsequence = "Approve: continue current route with the next owner action.";
  let rejectConsequence = "Reject: stop this route and close active pursuit.";
  let moreInfoConsequence = "More info: keep ticket open and collect missing evidence.";

  if (route && route.operator_route_state === "prepare_market") {
    approveConsequence = "Approve: resume market preparation and listing tasks.";
  } else if (route && route.operator_route_state === "prepare_execution") {
    approveConsequence = "Approve: resume execution intake and handoff.";
  } else if (route && route.operator_route_state === "pursue_after_verification") {
    approveConsequence = "Approve: keep pursuit active while verification completes.";
  } else if (route && route.operator_route_state === "stop") {
    approveConsequence = "Approve: override stop path and reopen owner review.";
  } else if (route && route.operator_route_state === "hold") {
    approveConsequence = "Approve: resume hold path and resolve blocker.";
  }

  if (route && route.operator_route_state === "prepare_market") {
    moreInfoConsequence = "More info: pause listing and request missing market inputs.";
  } else if (route && route.operator_route_state === "prepare_execution") {
    moreInfoConsequence = "More info: pause intake and request missing execution inputs.";
  } else if (route && route.operator_route_state === "pursue_after_verification") {
    moreInfoConsequence = "More info: keep verification open and request missing proof.";
  }

  return {
    approve_consequence: approveConsequence,
    reject_consequence: rejectConsequence,
    more_info_consequence: moreInfoConsequence,
    resume_owner: fallbackResumeOwner,
    resume_condition: fallbackResumeCondition,
  };
}

function alignApprovalQueueItemsWithRecommendations(queueItems, opportunitiesById) {
  return (queueItems || []).map((item) => {
    if (!item || !item.ticket) {
      return item;
    }
    const opportunityEntry =
      item.opportunity_id && opportunitiesById.has(item.opportunity_id)
        ? opportunitiesById.get(item.opportunity_id)
        : null;
    const recommendation = opportunityEntry ? opportunityEntry.operational_recommendation || null : null;
    const consequences = deriveApprovalConsequences(opportunityEntry);
    const ticket = {
      ...item.ticket,
      reasoning_summary: normalizeRecommendationCopy(
        buildApprovalReasoningSummary(recommendation)
      ),
      risk_summary: normalizeRecommendationCopy(buildApprovalRiskSummary(recommendation)),
    };
    return {
      ...item,
      ticket,
      approve_consequence: normalizeRecommendationCopy(consequences.approve_consequence),
      reject_consequence: normalizeRecommendationCopy(consequences.reject_consequence),
      more_info_consequence: normalizeRecommendationCopy(consequences.more_info_consequence),
      resume_owner: normalizeRecommendationCopy(consequences.resume_owner),
      resume_condition: normalizeRecommendationCopy(consequences.resume_condition),
    };
  });
}

function buildAgentStatusCards(opportunities, attention, queueTotals, nowIso) {
  const pendingQueueOpportunity = opportunities.find(
    (entry) => entry.queue_item && entry.queue_item.status === "pending"
  );
  const riskOpportunity = findOpportunityByStatuses(
    opportunities,
    new Set(["awaiting_seller_verification", "researching"])
  );
  const operationsExecutionOpportunity = findOpportunityByStatuses(
    opportunities,
    new Set(["awaiting_approval", "approved", "acquired"])
  );
  const blockedOperationsOpportunity = opportunities.find(
    (entry) => entry.workflow_record && entry.workflow_record.purchase_recommendation_blocked
  );
  const operatorOpportunity = findOpportunityByStatuses(
    opportunities,
    new Set(["routed", "monetizing"])
  );

  const topTask = attention.top_task || null;
  const ceoCard = {
    agent: "CEO Agent",
    status:
      queueTotals.pending > 0
        ? "awaiting_approval"
        : topTask && topTask.source === "approval_queue" && topTask.overdue
          ? "alert"
          : "working",
    active_task:
      queueTotals.pending > 0
        ? `Review ${queueTotals.pending} approval ticket${queueTotals.pending === 1 ? "" : "s"}.`
        : "Monitor capital exposure and routing priorities.",
    opportunity_id:
      (pendingQueueOpportunity && pendingQueueOpportunity.opportunity_id) ||
      (topTask && topTask.opportunity_id) ||
      null,
    blocker: queueTotals.pending > 0 ? canonicalizeBlockerText("approval_queue_waiting") : null,
    urgency: queueTotals.pending > 0 ? "high" : mapTaskUrgency(topTask),
    updated_at: nowIso,
  };

  const riskTask = riskOpportunity ? riskOpportunity.latest_task : null;
  const riskCard = {
    agent: "Risk and Compliance Agent",
    status:
      riskTask && riskTask.overdue
        ? "alert"
        : riskOpportunity
          ? "working"
          : "idle",
    active_task:
      (riskTask && riskTask.next_action) ||
      (riskOpportunity
        ? "Collect missing verification inputs and unblock evaluation."
        : "No active verification queue."),
    opportunity_id: riskOpportunity ? riskOpportunity.opportunity_id : null,
    blocker:
      riskOpportunity && riskOpportunity.workflow_record && riskOpportunity.workflow_record.purchase_recommendation_blocked
        ? canonicalizeBlockerText("purchase_recommendation_blocked")
        : null,
    urgency: mapTaskUrgency(riskTask),
    updated_at: nowIso,
  };

  const operationsTarget = operationsExecutionOpportunity || blockedOperationsOpportunity || null;
  const operationsTask = operationsTarget ? operationsTarget.latest_task : null;
  const operationsCard = {
    agent: "Operations Coordinator Agent",
    status:
      operationsExecutionOpportunity
        ? "working"
        : blockedOperationsOpportunity
          ? "blocked"
          : "idle",
    active_task:
      operationsExecutionOpportunity
        ? "Execute cleared acquisition and route handoff."
        : blockedOperationsOpportunity
          ? "Hold execution until verification or approval clears."
          : "No cleared execution item in flight.",
    opportunity_id: operationsTarget ? operationsTarget.opportunity_id : null,
    blocker:
      !operationsExecutionOpportunity &&
      blockedOperationsOpportunity &&
      blockedOperationsOpportunity.workflow_record &&
      blockedOperationsOpportunity.workflow_record.purchase_recommendation_blocked
        ? canonicalizeBlockerText("purchase_recommendation_blocked")
        : null,
    urgency:
      operationsExecutionOpportunity
        ? mapTaskUrgency(operationsTask)
        : blockedOperationsOpportunity
          ? "high"
          : "low",
    updated_at: nowIso,
  };

  const operatorTask = operatorOpportunity ? operatorOpportunity.latest_task : null;
  const operatorCard = {
    agent: "Department Operator Agent",
    status: operatorOpportunity ? "working" : "idle",
    active_task:
      (operatorTask && operatorTask.next_action) ||
      (operatorOpportunity
        ? "Advance active routed inventory."
        : "No routed or monetizing inventory in queue."),
    opportunity_id: operatorOpportunity ? operatorOpportunity.opportunity_id : null,
    blocker: null,
    urgency: operatorOpportunity ? mapTaskUrgency(operatorTask) : "low",
    updated_at: nowIso,
  };

  const cards = [ceoCard, riskCard, operationsCard, operatorCard];
  for (const card of cards) {
    assertValidAgentStatusCard(card);
  }
  return cards;
}

function buildCapitalNote(queueTotals, opportunities) {
  const pendingExposure = opportunities
    .map((entry) => (entry.queue_item && entry.queue_item.status === "pending" ? entry.queue_item.ticket : null))
    .filter(Boolean)
    .reduce((sum, ticket) => sum + (ticket.max_exposure_usd || 0), 0);

  if (queueTotals.pending > 0) {
    return `${pendingExposure} USD is awaiting explicit approval. Capital remains user-controlled: UI supports withdrawal request/approve/cancel only; deposit/reserve/release/approve_use stay runtime-manual.`;
  }
  return "No capital approval is currently pending. Capital remains user-controlled with auditable ledger-backed withdrawals and runtime-manual deposit/reserve/release/approve_use actions.";
}

function buildCapitalControls(capitalStatePath) {
  const absolutePath = path.resolve(capitalStatePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: "manual_only",
      note: "Capital runtime ledger is not initialized yet. Use capital bootstrap/movement CLIs for manual, auditable capital control.",
      state_path: absolutePath,
      account_snapshot: null,
      ledger_integrity: null,
      latest_request: null,
      pending_withdrawal_requests: [],
      recent_ledger_entries: [],
      capital_left_usd: null,
    };
  }

  const state = loadCapitalState(absolutePath);
  const integrity = verifyLedgerIntegrity(state);
  const latestRequest = state.requests.length ? state.requests[state.requests.length - 1] : null;
  const pendingRequests = state.requests
    .filter((request) => request.action === "request_withdrawal" && request.status === "requested")
    .map((request) => ({
      request_id: request.request_id,
      action: request.action,
      amount_usd: request.amount_usd,
      status: request.status,
      requested_at: request.requested_at,
      requested_by: request.requested_by || null,
      reason: request.reason || "",
      current_available_usd: state.account.available_usd,
      current_pending_withdrawal_usd: state.account.pending_withdrawal_usd,
      resulting_available_usd_after_execution: state.account.available_usd,
    }));
  const recentLedgerEntries = state.ledger.slice(-5).reverse().map((entry) => ({
    entry_id: entry.entry_id,
    timestamp: entry.timestamp,
    action: entry.action,
    amount_usd: entry.amount_usd,
    performed_by: entry.performed_by,
    request_id: entry.request_id || null,
  }));
  return {
    status: "manual_only",
    note: "Capital remains user-controlled. UI write scope is withdrawal request/approve/cancel only; all other capital movement actions remain runtime-manual.",
    state_path: absolutePath,
    account_snapshot: {
      account_id: state.account.account_id,
      as_of: state.account.as_of,
      currency: state.account.currency,
      available_usd: state.account.available_usd,
      reserved_usd: state.account.reserved_usd,
      committed_usd: state.account.committed_usd,
      pending_withdrawal_usd: state.account.pending_withdrawal_usd,
      manual_only: state.account.manual_only,
    },
    capital_left_usd: state.account.available_usd,
    ledger_integrity: integrity,
    latest_request: latestRequest
      ? {
        request_id: latestRequest.request_id,
        action: latestRequest.action,
        amount_usd: latestRequest.amount_usd,
        status: latestRequest.status,
        requested_at: latestRequest.requested_at,
        requested_by: latestRequest.requested_by || null,
        reason: latestRequest.reason || "",
        opportunity_id: latestRequest.opportunity_id,
      }
      : null,
    pending_withdrawal_requests: pendingRequests,
    recent_ledger_entries: recentLedgerEntries,
  };
}

function buildCapitalStrategySnapshot(capitalControls, queueTotals, opportunities, nowIso) {
  const account = capitalControls && capitalControls.account_snapshot;
  if (!account) {
    return null;
  }

  const available = account.available_usd || 0;
  const reserved = account.reserved_usd || 0;
  const committed = account.committed_usd || 0;
  const pendingExposure = opportunities
    .map((entry) => (entry.queue_item && entry.queue_item.status === "pending" ? entry.queue_item.ticket : null))
    .filter(Boolean)
    .reduce((sum, ticket) => sum + (ticket.max_exposure_usd || 0), 0);
  const repairHeavyCount = opportunities.filter((entry) => {
    const record = entry.contract_bundle && entry.contract_bundle.opportunity_record;
    return record && record.recommended_path === "repair_and_resale";
  }).length;
  const staleLikeCount = opportunities.filter((entry) =>
    ["routed", "monetizing"].includes(entry.current_status)
  ).length;

  let capitalMode = "normal";
  if (available <= 300 || pendingExposure > available || committed > available) {
    capitalMode = "recovery";
  } else if (
    available <= 1000 ||
    pendingExposure >= available * 0.5 ||
    reserved + committed >= Math.max(200, available * 0.75)
  ) {
    capitalMode = "constrained";
  }

  const riskFlags = [];
  if (pendingExposure > 0) {
    riskFlags.push(`${pendingExposure} USD pending approval exposure.`);
  }
  if (reserved > available) {
    riskFlags.push("Reserved capital is crowding available operating cash.");
  }
  if (repairHeavyCount > 0) {
    riskFlags.push(`${repairHeavyCount} repair-heavy opportunity path(s) are active.`);
  }
  if (staleLikeCount > 0) {
    riskFlags.push(`${staleLikeCount} inventory item(s) are already in routed/market stages.`);
  }

  let priorities = ["repair_resell", "part_out", "resale_only"];
  let avoidances = ["Unapproved monetization categories."];
  let actions = [
    "Keep regular sourcing/routing behavior within existing approval rules.",
    "Use capital strategy as advisory context only.",
  ];
  let reason = "Available capital supports normal operating posture under current approval exposure.";

  if (capitalMode === "constrained") {
    priorities = ["resale_only", "arbitrage", "part_out", "bundle_optimization"];
    avoidances = [
      "Repair-heavy or long-cycle buys unless margin is unusually strong.",
      "Capital lock-up from low-confidence opportunities.",
      "Arbitrage outside approved marketplaces, approved product classes, or policy boundaries.",
    ];
    actions = [
      "Favor lower-cost, faster-turn opportunities.",
      "Use arbitrage only within approved marketplaces and approved product classes.",
      "Reduce exposure to repair load until capital posture improves.",
    ];
    reason = `Available capital (${available} USD) is tighter relative to exposure/reserve posture (${pendingExposure} USD pending, ${reserved} USD reserved).`;
  } else if (capitalMode === "recovery") {
    priorities = ["liquidation", "resale_only", "arbitrage", "bundle_optimization"];
    avoidances = [
      "New repair-heavy inventory unless economics are exceptional and approved.",
      "Any autonomous capital commitment or off-policy sourcing.",
      "Arbitrage outside approved marketplaces, approved product classes, or policy boundaries.",
    ];
    actions = [
      "Prioritize capital-light recovery paths and stale-stock relief.",
      "Use arbitrage only within approved marketplaces and approved product classes.",
      "Keep all capital movement user-controlled and approval-bound.",
    ];
    reason = `Available operating capital (${available} USD) is below safe working posture relative to active commitments/exposure.`;
  }

  const boardHistory = buildCapitalStrategyBoardHistory(capitalControls, {
    as_of: account.as_of || nowIso,
    capital_mode: capitalMode,
    capital_mode_reason: reason,
  });

  const snapshot = {
    as_of: account.as_of || nowIso,
    capital_mode: capitalMode,
    capital_mode_reason: reason,
    board_history: boardHistory,
    approved_strategy_priorities: priorities,
    capital_risk_flags: riskFlags,
    recommended_avoidances: avoidances,
    recommended_actions: actions,
    source_capital_account_id: account.account_id || null,
  };
  assertValidCapitalStrategySnapshot(snapshot);
  return snapshot;
}

function classifyHistoricalCapitalMode(accountSnapshot) {
  const available = accountSnapshot.available_usd || 0;
  const reserved = accountSnapshot.reserved_usd || 0;
  const committed = accountSnapshot.committed_usd || 0;

  if (available <= 300 || committed > available) {
    return "recovery";
  }
  if (available <= 1000 || reserved + committed >= Math.max(200, available * 0.75)) {
    return "constrained";
  }
  return "normal";
}

function buildHistoricalCapitalRationale(accountSnapshot, capitalMode) {
  const available = accountSnapshot.available_usd || 0;
  const reserved = accountSnapshot.reserved_usd || 0;
  const committed = accountSnapshot.committed_usd || 0;

  // v1 history rationale is derived from historical posture shape at snapshot time.
  // It is not preserved narrative text captured alongside the original ledger entry.
  if (capitalMode === "recovery") {
    return `Recorded posture showed ${available} USD available with ${reserved} USD reserved and ${committed} USD committed, indicating a recovery posture.`;
  }
  if (capitalMode === "constrained") {
    return `Recorded posture showed ${available} USD available with ${reserved} USD reserved and ${committed} USD committed, indicating tighter operating headroom.`;
  }
  return `Recorded posture showed ${available} USD available with ${reserved} USD reserved and ${committed} USD committed, supporting normal operating posture.`;
}

function buildCapitalStrategyBoardHistory(capitalControls, currentSnapshot) {
  if (
    !capitalControls ||
    !capitalControls.account_snapshot ||
    !capitalControls.state_path ||
    !fs.existsSync(capitalControls.state_path)
  ) {
    return [];
  }

  const state = loadCapitalState(capitalControls.state_path);
  if (!Array.isArray(state.ledger) || !state.ledger.length) {
    return [];
  }

  // v1 board history is a bounded, chronological view over eligible ledger-backed
  // posture snapshots. It intentionally does not deduplicate repeated modes or
  // reinterpret snapshots as transition events.
  const recentEntries = state.ledger
    .slice(-CAPITAL_STRATEGY_BOARD_HISTORY_LIMIT)
    .sort((a, b) => Date.parse(a.timestamp || 0) - Date.parse(b.timestamp || 0));
  return recentEntries.map((entry, index) => {
    const isLatest = index === recentEntries.length - 1;
    if (isLatest) {
      return {
        timestamp: currentSnapshot.as_of,
        capital_mode: currentSnapshot.capital_mode,
        rationale_snapshot: currentSnapshot.capital_mode_reason,
      };
    }

    const accountSnapshot = {
      available_usd: entry.balance_after_usd - entry.reserved_after_usd - entry.committed_after_usd,
      reserved_usd: entry.reserved_after_usd,
      committed_usd: entry.committed_after_usd,
    };
    const capitalMode = classifyHistoricalCapitalMode(accountSnapshot);
    return {
      timestamp: entry.timestamp,
      capital_mode: capitalMode,
      rationale_snapshot: buildHistoricalCapitalRationale(accountSnapshot, capitalMode),
    };
  });
}

function buildOpportunityCapitalFit(entry, capitalStrategy) {
  if (!capitalStrategy || !entry) {
    return null;
  }

  const record = entry.contract_bundle && entry.contract_bundle.opportunity_record;
  const workflow = entry.workflow_record || null;
  const askPrice = record && typeof record.ask_price_usd === "number" ? record.ask_price_usd : null;
  const recommendedPath = record ? record.recommended_path : null;
  const verification = workflow && workflow.seller_verification ? workflow.seller_verification : null;

  if (capitalStrategy.capital_mode === "normal") {
    const annotation = {
      stance: "neutral",
      reason: "Capital posture is healthy enough that mode does not currently narrow this opportunity.",
    };
    assertValidCapitalFitAnnotation(annotation);
    return annotation;
  }

  const lowLockupShape =
    recommendedPath === "resale_as_is" ||
    recommendedPath === "part_out" ||
    (askPrice != null && askPrice <= 300);
  const repairHeavyShape =
    recommendedPath === "repair_and_resale" || (askPrice != null && askPrice >= 600);
  const fastTurnConfidence = Boolean(
    verification &&
      verification.imei_proof_verified &&
      verification.carrier_status_verified
  );
  const priorities = new Set(capitalStrategy.approved_strategy_priorities || []);

  if (
    lowLockupShape &&
    (priorities.has("resale_only") ||
      priorities.has("part_out") ||
      priorities.has("arbitrage") ||
      priorities.has("liquidation") ||
      priorities.has("bundle_optimization"))
  ) {
    const annotation = {
      stance: "favored",
      reason: fastTurnConfidence
        ? "Current capital mode favors lower-lockup, faster-turn opportunities and this shape fits that posture."
        : "Current capital mode favors lower-lockup opportunity shapes, and this opportunity fits that posture.",
    };
    assertValidCapitalFitAnnotation(annotation);
    return annotation;
  }

  if (
    repairHeavyShape &&
    (capitalStrategy.capital_mode === "constrained" || capitalStrategy.capital_mode === "recovery")
  ) {
    const annotation = {
      stance: "discouraged",
      reason: "Current capital mode favors capital-light turnover, so repair-heavy or higher-lockup exposure is discouraged.",
    };
    assertValidCapitalFitAnnotation(annotation);
    return annotation;
  }

  const annotation = {
    stance: "neutral",
    reason: "This opportunity remains viable, but current capital mode does not create a strong fit signal either way.",
  };
  assertValidCapitalFitAnnotation(annotation);
  return annotation;
}

function buildBoardPriorities(awaitingTasks) {
  if (!awaitingTasks.length) {
    return ["Monitor company state and wait for the next qualified opportunity."];
  }

  return awaitingTasks.slice(0, 3).map((task) => `${task.owner}: ${task.next_action}`);
}

function buildBoardAlerts(queueTotals, kpis, opportunities) {
  const alerts = [];
  if (kpis.overdue_tasks > 0) {
    alerts.push(`${kpis.overdue_tasks} overdue task${kpis.overdue_tasks === 1 ? "" : "s"} require intervention.`);
  }
  if (queueTotals.pending > 0) {
    alerts.push(`${queueTotals.pending} approval ticket${queueTotals.pending === 1 ? "" : "s"} are waiting on review.`);
  }
  for (const entry of opportunities) {
    if (
      entry.workflow_record &&
      entry.workflow_record.purchase_recommendation_blocked &&
      alerts.length < 4
    ) {
      alerts.push(`${entry.opportunity_id} is blocked until verification or approval clears.`);
    }
  }
  if (!alerts.length) {
    alerts.push("No critical alerts right now.");
  }
  return alerts.slice(0, 4);
}

function buildCompanyBoardSnapshot(opportunities, awaitingTasks, queueTotals, kpis, nowIso) {
  const activeOpportunities = opportunities
    .filter((entry) => !TERMINAL_OPPORTUNITY_STATES.has(entry.current_status))
    .map((entry) => entry.opportunity_id);
  const blockedCount = opportunities.filter((entry) => {
    const record = entry.workflow_record;
    return Boolean(
      record &&
        (record.purchase_recommendation_blocked ||
          record.alternative_opportunities_required ||
          record.current_status === "awaiting_seller_verification")
    );
  }).length;

  const board = {
    snapshot_id: `brd-ui-${nowIso}`,
    timestamp: nowIso,
    priorities: buildBoardPriorities(awaitingTasks),
    approvals_waiting: queueTotals.pending,
    blocked_count: blockedCount,
    active_opportunities: activeOpportunities,
    alerts: buildBoardAlerts(queueTotals, kpis, opportunities),
    capital_note: buildCapitalNote(queueTotals, opportunities),
  };
  assertValidCompanyBoardSnapshot(board);
  return board;
}

function buildKpis(statusSnapshot, opportunities) {
  const activeOpportunities = opportunities.filter(
    (entry) => !TERMINAL_OPPORTUNITY_STATES.has(entry.current_status)
  ).length;
  const blockedOpportunities = opportunities.filter((entry) => {
    const record = entry.workflow_record;
    return Boolean(
      record &&
        (record.purchase_recommendation_blocked ||
          record.alternative_opportunities_required ||
          record.current_status === "awaiting_seller_verification")
    );
  }).length;

  return {
    active_opportunities: activeOpportunities,
    blocked_opportunities: blockedOpportunities,
    approvals_waiting: statusSnapshot.queue.health.queue_totals.pending,
    overdue_tasks: statusSnapshot.awaiting_tasks.overdue_count,
    due_soon_tasks: statusSnapshot.awaiting_tasks.due_soon_count,
    queue_health: statusSnapshot.queue.health.observations.queue_health,
    workflow_health:
      statusSnapshot.workflow && statusSnapshot.workflow.health
        ? statusSnapshot.workflow.health.observations.workflow_health
        : null,
  };
}

function getPresenceBlueprint(agentName) {
  const defaults = {
    zone_id: "company-floor",
    zone_label: "Company Floor",
    department_label: "Shared Operations",
    avatar_monogram: "AR",
    accent_token: "slate",
  };

  const mapping = {
    "CEO Agent": {
      zone_id: "executive-suite",
      zone_label: "Decision Desk",
      department_label: "Approvals and direction",
      avatar_monogram: "DD",
      accent_token: "copper",
    },
    "Risk and Compliance Agent": {
      zone_id: "verification-bay",
      zone_label: "Sourcing & Verification",
      department_label: "Intake and seller checks",
      avatar_monogram: "R&C",
      accent_token: "olive",
    },
    "Operations Coordinator Agent": {
      zone_id: "routing-desk",
      zone_label: "Ops & Diagnostics",
      department_label: "Execution and diagnostics",
      avatar_monogram: "OPS",
      accent_token: "umber",
    },
    "Department Operator Agent": {
      zone_id: "market-floor",
      zone_label: "Sales & Market",
      department_label: "Listings and monetization",
      avatar_monogram: "DPT",
      accent_token: "forest",
    },
  };

  return mapping[agentName] || defaults;
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

function mapAgentToLaneStage(agentName) {
  if (agentName === "Risk and Compliance Agent" || agentName === "Valuation Agent") {
    return "verification";
  }
  if (agentName === "CEO Agent") {
    return "approval";
  }
  if (agentName === "Operations Coordinator Agent") {
    return "execution";
  }
  if (agentName === "Department Operator Agent") {
    return "market";
  }
  return "monitor";
}

function buildOfficeZoneAnchors(presenceEntries) {
  const defaults = {
    "executive-suite": {
      anchor: { x: 0.26, y: 0.24 },
      ingress: { x: 0.17, y: 0.24 },
      egress: { x: 0.35, y: 0.24 },
      handoff_dock: { x: 0.30, y: 0.30 },
      connections: ["verification-bay", "routing-desk"],
    },
    "verification-bay": {
      anchor: { x: 0.74, y: 0.24 },
      ingress: { x: 0.65, y: 0.24 },
      egress: { x: 0.83, y: 0.24 },
      handoff_dock: { x: 0.69, y: 0.30 },
      connections: ["executive-suite", "routing-desk"],
    },
    "routing-desk": {
      anchor: { x: 0.26, y: 0.76 },
      ingress: { x: 0.17, y: 0.76 },
      egress: { x: 0.35, y: 0.76 },
      handoff_dock: { x: 0.30, y: 0.70 },
      connections: ["executive-suite", "verification-bay", "market-floor"],
    },
    "market-floor": {
      anchor: { x: 0.74, y: 0.76 },
      ingress: { x: 0.65, y: 0.76 },
      egress: { x: 0.83, y: 0.76 },
      handoff_dock: { x: 0.69, y: 0.70 },
      connections: ["routing-desk"],
    },
    "company-floor": {
      anchor: { x: 0.5, y: 0.5 },
      ingress: { x: 0.42, y: 0.5 },
      egress: { x: 0.58, y: 0.5 },
      handoff_dock: { x: 0.5, y: 0.56 },
      connections: ["executive-suite", "verification-bay", "routing-desk", "market-floor"],
    },
  };

  const seen = new Set();
  const anchors = [];
  for (const presence of presenceEntries) {
    if (!presence || !presence.zone_id || seen.has(presence.zone_id)) {
      continue;
    }
    seen.add(presence.zone_id);
    const base = defaults[presence.zone_id] || defaults["company-floor"];
    anchors.push({
      zone_id: presence.zone_id,
      zone_label: presence.zone_label,
      department_label: presence.department_label,
      anchor: base.anchor,
      ingress: base.ingress,
      egress: base.egress,
      handoff_dock: base.handoff_dock,
      connections: base.connections,
    });
  }

  if (!seen.has("company-floor")) {
    const base = defaults["company-floor"];
    anchors.push({
      zone_id: "company-floor",
      zone_label: "Company Floor",
      department_label: "Shared Operations",
      anchor: base.anchor,
      ingress: base.ingress,
      egress: base.egress,
      handoff_dock: base.handoff_dock,
      connections: base.connections,
    });
  }
  for (const anchor of anchors) {
    assertValidOfficeZoneAnchor(anchor);
  }
  return anchors;
}

function buildZoneAnchorLookup(anchors) {
  const lookup = new Map();
  for (const anchor of anchors || []) {
    if (!anchor || !anchor.zone_id) {
      continue;
    }
    lookup.set(anchor.zone_id, anchor);
  }
  return lookup;
}

function findZonePath(zoneLookup, fromZoneId, toZoneId) {
  if (!fromZoneId || !toZoneId || !zoneLookup.has(fromZoneId) || !zoneLookup.has(toZoneId)) {
    return null;
  }
  if (fromZoneId === toZoneId) {
    return [fromZoneId];
  }

  const queue = [[fromZoneId]];
  const visited = new Set([fromZoneId]);

  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const node = zoneLookup.get(current);
    const neighbors = Array.isArray(node.connections) ? node.connections : [];
    for (const neighbor of neighbors) {
      if (!zoneLookup.has(neighbor) || visited.has(neighbor)) {
        continue;
      }
      const nextPath = [...path, neighbor];
      if (neighbor === toZoneId) {
        return nextPath;
      }
      visited.add(neighbor);
      queue.push(nextPath);
    }
  }

  return null;
}

function pointOrNull(value) {
  if (!value || typeof value.x !== "number" || typeof value.y !== "number") {
    return null;
  }
  return { x: value.x, y: value.y };
}

function buildRouteWaypoints(zoneLookup, zonePath) {
  if (!Array.isArray(zonePath) || !zonePath.length) {
    return [];
  }
  const first = zoneLookup.get(zonePath[0]);
  const last = zoneLookup.get(zonePath[zonePath.length - 1]);
  const points = [];

  const startPoint = pointOrNull(first && first.egress) || pointOrNull(first && first.anchor);
  const endPoint = pointOrNull(last && last.ingress) || pointOrNull(last && last.anchor);
  if (startPoint) {
    points.push(startPoint);
  }

  if (zonePath.length > 2) {
    for (const zoneId of zonePath.slice(1, -1)) {
      const zone = zoneLookup.get(zoneId);
      const midPoint =
        pointOrNull(zone && zone.handoff_dock) ||
        pointOrNull(zone && zone.anchor) ||
        null;
      if (midPoint) {
        points.push(midPoint);
      }
    }
  }

  if (endPoint) {
    points.push(endPoint);
  }
  return points;
}

function buildOfficeRouteHints(zoneAnchors, handoffSignals) {
  const zoneLookup = buildZoneAnchorLookup(zoneAnchors);
  const hints = [];
  for (const signal of handoffSignals || []) {
    if (!signal || !signal.opportunity_id) {
      continue;
    }
    const fromZoneId = signal.from_zone_id || null;
    const toZoneId = signal.to_zone_id || null;
    if (!fromZoneId || !toZoneId) {
      continue;
    }

    const resolvedPath =
      findZonePath(zoneLookup, fromZoneId, toZoneId) || [fromZoneId, toZoneId];
    const waypoints = buildRouteWaypoints(zoneLookup, resolvedPath);
    hints.push({
      route_id: `route-${signal.opportunity_id}-${fromZoneId}-${toZoneId}`,
      opportunity_id: signal.opportunity_id,
      from_zone_id: fromZoneId,
      to_zone_id: toZoneId,
      path_zone_ids: resolvedPath,
      waypoints,
      source: "handoff_signal",
    });
  }
  for (const hint of hints) {
    assertValidOfficeRouteHint(hint);
  }
  return hints;
}

function summarizeFlowEvent(event) {
  if (!event || typeof event !== "object") {
    return "Workflow update recorded.";
  }
  const opportunityId = event.opportunity_id || "opportunity";
  const actor = event.actor || "system";
  if (event.action === "status_update") {
    return `${opportunityId} moved to ${event.status || "updated"} by ${actor}.`;
  }
  if (event.action === "seller_verification_request") {
    return `${actor} requested seller verification on ${opportunityId}.`;
  }
  if (event.action === "seller_verification_response") {
    if (event.response_status === "unsatisfactory") {
      return `Unsatisfactory seller response on ${opportunityId}; confidence downgraded.`;
    }
    return `Seller verification response on ${opportunityId}: ${event.response_status || "received"}.`;
  }
  if (event.action === "priority_update") {
    return `${opportunityId} priority updated to ${event.priority || "normal"} by ${actor}.`;
  }
  return `${event.action || "workflow_update"} recorded for ${opportunityId}.`;
}

function mapEventSeverity(event) {
  if (!event || typeof event !== "object") {
    return "info";
  }
  if (event.action === "seller_verification_response" && event.response_status === "unsatisfactory") {
    return "alert";
  }
  if (event.action === "priority_update" && event.priority === "urgent") {
    return "attention";
  }
  if (event.action === "status_update" && event.status === "awaiting_approval") {
    return "attention";
  }
  return "info";
}

function buildOfficeFlowEvents(workflowState, opportunities, limit = 8) {
  const records = Array.isArray(workflowState.event_log) ? workflowState.event_log : [];
  const trackedActions = new Set([
    "status_update",
    "seller_verification_request",
    "seller_verification_response",
    "priority_update",
  ]);
  const opportunityById = new Map(
    opportunities.map((entry) => [entry.opportunity_id, entry])
  );

  const events = [];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const event = records[index];
    if (!event || !trackedActions.has(event.action)) {
      continue;
    }
    const opportunity = event.opportunity_id ? opportunityById.get(event.opportunity_id) : null;
    const laneStage = mapStatusToLaneStage(
      event.status ||
        (opportunity && opportunity.current_status ? opportunity.current_status : "monitor")
    );
    events.push({
      event_id:
        (typeof event.event_id === "string" && event.event_id) ||
        `evt-${index + 1}`,
      opportunity_id: event.opportunity_id || null,
      action: event.action,
      actor: event.actor || "system",
      timestamp: event.timestamp || null,
      lane_stage: laneStage,
      severity: mapEventSeverity(event),
      summary: summarizeFlowEvent(event),
    });
    if (events.length >= limit) {
      break;
    }
  }
  return events;
}

function getOpportunityOwner(opportunity) {
  if (!opportunity || typeof opportunity !== "object") {
    return null;
  }
  if (
    opportunity.latest_task &&
    typeof opportunity.latest_task.owner === "string" &&
    opportunity.latest_task.owner
  ) {
    return opportunity.latest_task.owner;
  }
  if (
    opportunity.contract_bundle &&
    opportunity.contract_bundle.handoff_packet &&
    typeof opportunity.contract_bundle.handoff_packet.to_agent === "string" &&
    opportunity.contract_bundle.handoff_packet.to_agent
  ) {
    return opportunity.contract_bundle.handoff_packet.to_agent;
  }
  return null;
}

function summarizeOfficeEvent(event) {
  if (event.type === "handoff_started") {
    return `${event.from_agent} started handoff to ${event.to_agent} on ${event.opportunity_id}.`;
  }
  if (event.type === "handoff_completed") {
    return `${event.to_agent} accepted handoff ownership for ${event.opportunity_id}.`;
  }
  if (event.type === "focus_changed") {
    return `${event.agent} focus changed to ${event.opportunity_id}.`;
  }
  if (event.type === "lane_changed") {
    return `${event.opportunity_id} moved from ${event.lane_from} to ${event.lane_to} lane.`;
  }
  if (event.type === "approval_waiting") {
    return `Approval ticket ${event.ticket_id} is waiting for owner decision.`;
  }
  if (event.type === "approval_resolved") {
    return `Approval ticket ${event.ticket_id} resolved: ${event.decision}.`;
  }
  return "Operational event recorded.";
}

function eventSeverityFromType(type, details = {}) {
  if (type === "approval_resolved" && details.decision === "reject") {
    return "alert";
  }
  if (type === "approval_waiting") {
    return "attention";
  }
  if (type === "lane_changed" && details.lane_to === "approval") {
    return "attention";
  }
  if (type === "handoff_started" && details.blocking_count > 0) {
    return "attention";
  }
  return "info";
}

function pushOfficeEvent(events, baseEvent) {
  const event = {
    ...baseEvent,
    lane_stage: baseEvent.lane_to || "monitor",
    summary: summarizeOfficeEvent(baseEvent),
    severity: eventSeverityFromType(baseEvent.type, baseEvent),
  };
  assertValidOfficeEvent(event);
  events.push(event);
}

function buildOfficeEvents(opportunities, queue, handoffSignals, nowIso, limit = 12) {
  const events = [];
  const opportunityById = new Map(opportunities.map((entry) => [entry.opportunity_id, entry]));

  for (const signal of handoffSignals) {
    const opportunity = opportunityById.get(signal.opportunity_id) || null;
    const owner = getOpportunityOwner(opportunity);
    const handoffType = owner && owner === signal.to_agent ? "handoff_completed" : "handoff_started";
    const timestamp =
      (opportunity &&
        opportunity.workflow_record &&
        opportunity.workflow_record.last_updated_at) ||
      signal.due_by ||
      nowIso;
    pushOfficeEvent(events, {
      event_id: `office-handoff-${signal.opportunity_id}-${handoffType}-${timestamp}`,
      type: handoffType,
      source: "handoff_signal",
      timestamp,
      opportunity_id: signal.opportunity_id,
      from_agent: signal.from_agent,
      to_agent: signal.to_agent,
      from_zone_id: signal.from_zone_id || null,
      to_zone_id: signal.to_zone_id || null,
      lane_from: mapAgentToLaneStage(signal.from_agent),
      lane_to: mapAgentToLaneStage(signal.to_agent),
      blocking_count: signal.blocking_count || 0,
      ticket_id: null,
      decision: null,
      agent: null,
    });
    if (owner && owner === signal.to_agent) {
      pushOfficeEvent(events, {
        event_id: `office-focus-${signal.opportunity_id}-${signal.to_agent}-${timestamp}`,
        type: "focus_changed",
        source: "handoff_signal",
        timestamp,
        opportunity_id: signal.opportunity_id,
        from_agent: signal.from_agent,
        to_agent: signal.to_agent,
        from_zone_id: signal.from_zone_id || null,
        to_zone_id: signal.to_zone_id || null,
        lane_from: mapAgentToLaneStage(signal.from_agent),
        lane_to: mapAgentToLaneStage(signal.to_agent),
        blocking_count: signal.blocking_count || 0,
        ticket_id: null,
        decision: null,
        agent: signal.to_agent,
      });
    }
  }

  for (const opportunity of opportunities) {
    const history =
      opportunity &&
      opportunity.workflow_record &&
      Array.isArray(opportunity.workflow_record.status_history)
        ? opportunity.workflow_record.status_history
        : [];
    if (!history.length) {
      continue;
    }

    const latest = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const laneFrom = mapStatusToLaneStage(previous ? previous.status : "monitor");
    const laneTo = mapStatusToLaneStage(latest.status);
    if (laneFrom === laneTo) {
      continue;
    }

    pushOfficeEvent(events, {
      event_id: `office-lane-${opportunity.opportunity_id}-${laneFrom}-${laneTo}-${latest.timestamp}`,
      type: "lane_changed",
      source: "workflow_state",
      timestamp: latest.timestamp || opportunity.workflow_record.last_updated_at || nowIso,
      opportunity_id: opportunity.opportunity_id,
      from_agent: null,
      to_agent: null,
      from_zone_id: null,
      to_zone_id: null,
      lane_from: laneFrom,
      lane_to: laneTo,
      blocking_count: 0,
      ticket_id: null,
      decision: null,
      agent: null,
    });
  }

  for (const item of queue.items) {
    if (!item || !item.ticket_id) {
      continue;
    }
    if (item.status === "pending") {
      pushOfficeEvent(events, {
        event_id: `office-approval-waiting-${item.ticket_id}-${item.created_at}`,
        type: "approval_waiting",
        source: "approval_queue",
        timestamp: item.created_at || nowIso,
        opportunity_id: item.opportunity_id || null,
        from_agent: item.ticket && item.ticket.requested_by ? item.ticket.requested_by : null,
        to_agent: "CEO Agent",
        from_zone_id: item.ticket && item.ticket.requested_by
          ? getPresenceBlueprint(item.ticket.requested_by).zone_id
          : null,
        to_zone_id: getPresenceBlueprint("CEO Agent").zone_id,
        lane_from: "approval",
        lane_to: "approval",
        blocking_count: 0,
        ticket_id: item.ticket_id,
        decision: "pending",
        agent: "CEO Agent",
      });
      continue;
    }
    pushOfficeEvent(events, {
      event_id: `office-approval-resolved-${item.ticket_id}-${item.decided_at || item.created_at}`,
      type: "approval_resolved",
      source: "approval_queue",
      timestamp: item.decided_at || item.created_at || nowIso,
      opportunity_id: item.opportunity_id || null,
      from_agent: "CEO Agent",
      to_agent:
        item.status === "approve" ? "Operations Coordinator Agent" : "Risk and Compliance Agent",
      from_zone_id: getPresenceBlueprint("CEO Agent").zone_id,
      to_zone_id:
        item.status === "approve"
          ? getPresenceBlueprint("Operations Coordinator Agent").zone_id
          : getPresenceBlueprint("Risk and Compliance Agent").zone_id,
      lane_from: "approval",
      lane_to: item.status === "approve" ? "execution" : "verification",
      blocking_count: 0,
      ticket_id: item.ticket_id,
      decision: item.status,
      agent: item.decided_by || "CEO Agent",
    });
  }

  const deduped = new Map();
  for (const event of events) {
    if (!event || !event.event_id) {
      continue;
    }
    deduped.set(event.event_id, event);
  }

  return [...deduped.values()]
    .sort((a, b) => Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0))
    .slice(0, limit);
}

function mapMovementKind(eventType) {
  if (eventType === "approval_waiting" || eventType === "approval_resolved") {
    return "approval";
  }
  if (eventType === "lane_changed") {
    return "workflow";
  }
  return "handoff";
}

function mapMovementState(eventType) {
  if (eventType === "handoff_started" || eventType === "approval_waiting") {
    return "in_flight";
  }
  return "arrived";
}

function estimateMovementDurationMs(waypoints, movementState, blockingCount) {
  const hops = Math.max(1, Array.isArray(waypoints) ? waypoints.length - 1 : 1);
  const baseDuration = 650 + hops * 380;
  const blockingPenalty = Math.max(0, Number(blockingCount) || 0) * 120;
  const statePenalty = movementState === "in_flight" ? 320 : 0;
  return baseDuration + blockingPenalty + statePenalty;
}

function buildRouteHintLookup(routeHints) {
  const lookup = new Map();
  for (const hint of routeHints || []) {
    if (!hint || !hint.opportunity_id || !hint.from_zone_id || !hint.to_zone_id) {
      continue;
    }
    lookup.set(
      `${hint.opportunity_id}|${hint.from_zone_id}|${hint.to_zone_id}`,
      hint
    );
  }
  return lookup;
}

function buildOfficeMovementIntents(officeEvents, officeZoneAnchors, officeRouteHints, limit = 8) {
  const zoneLookup = buildZoneAnchorLookup(officeZoneAnchors);
  const routeHintLookup = buildRouteHintLookup(officeRouteHints);
  const intents = [];

  for (const event of officeEvents || []) {
    if (!event || !event.event_id || !event.opportunity_id) {
      continue;
    }
    if (!event.from_zone_id || !event.to_zone_id) {
      continue;
    }
    if (!event.from_agent || !event.to_agent) {
      continue;
    }

    const routeKey = `${event.opportunity_id}|${event.from_zone_id}|${event.to_zone_id}`;
    const routeHint =
      routeHintLookup.get(routeKey) ||
      (function buildFallbackRouteHint() {
        const fallbackPath =
          findZonePath(zoneLookup, event.from_zone_id, event.to_zone_id) ||
          [event.from_zone_id, event.to_zone_id];
        return {
          route_id: `route-${event.opportunity_id}-${event.from_zone_id}-${event.to_zone_id}`,
          path_zone_ids: fallbackPath,
          waypoints: buildRouteWaypoints(zoneLookup, fallbackPath),
        };
      })();

    const movementState = mapMovementState(event.type);
    const movementIntent = {
      intent_id: `intent-${event.event_id}`,
      opportunity_id: event.opportunity_id,
      movement_kind: mapMovementKind(event.type),
      transition_state: movementState,
      agent: event.agent || event.to_agent,
      from_agent: event.from_agent,
      to_agent: event.to_agent,
      from_zone_id: event.from_zone_id,
      to_zone_id: event.to_zone_id,
      route_id: routeHint.route_id,
      path_zone_ids: routeHint.path_zone_ids,
      waypoints: routeHint.waypoints,
      trigger_event_id: event.event_id,
      trigger_type: event.type,
      trigger_timestamp: event.timestamp,
      source: event.source,
      duration_ms: estimateMovementDurationMs(
        routeHint.waypoints,
        movementState,
        event.blocking_count
      ),
      blocking_count: event.blocking_count || 0,
    };
    assertValidOfficeMovementIntent(movementIntent);
    intents.push(movementIntent);
  }

  const deduped = new Map();
  for (const intent of intents) {
    if (!intent || !intent.intent_id) {
      continue;
    }
    deduped.set(intent.intent_id, intent);
  }

  return [...deduped.values()]
    .sort(
      (a, b) =>
        Date.parse(b.trigger_timestamp || 0) - Date.parse(a.trigger_timestamp || 0)
    )
    .slice(0, limit);
}

function buildPresenceBubble(card, attentionTask, capitalStrategy) {
  if (card.blocker) {
    return {
      bubble_kind: "blocker",
      bubble_text: card.blocker,
      bubble_label: "Blocker",
    };
  }
  if (attentionTask && attentionTask.owner === card.agent) {
    return {
      bubble_kind: attentionTask.overdue ? "alert" : "attention",
      bubble_text: attentionTask.next_action,
      bubble_label: attentionTask.overdue ? "Needs attention" : "Next action",
    };
  }
  if (card.status === "awaiting_approval") {
    return {
      bubble_kind: "approval",
      bubble_text: card.active_task,
      bubble_label: "Approval queue",
    };
  }
  if (card.agent === "CEO Agent" && capitalStrategy) {
    return {
      bubble_kind: capitalStrategy.capital_mode === "normal" ? "task" : "attention",
      bubble_text: capitalStrategy.capital_mode_reason,
      bubble_label: `Capital mode: ${capitalStrategy.capital_mode}`,
    };
  }
  return {
    bubble_kind: "task",
    bubble_text: card.active_task,
    bubble_label: "Active task",
  };
}

function isWaitingLikeTask(card, bubble) {
  const text = `${(card && card.active_task) || ""} ${(bubble && bubble.bubble_text) || ""}`.toLowerCase();
  return (
    text.includes("waiting") ||
    text.includes("awaiting") ||
    text.includes("hold") ||
    text.includes("pending")
  );
}

function normalizePresenceVisualState(card, bubble) {
  if (!card) {
    return "idle";
  }
  if (card.status === "awaiting_approval" || bubble.bubble_kind === "approval") {
    return "needs_approval";
  }
  if (card.blocker || bubble.bubble_kind === "blocker" || bubble.bubble_kind === "alert") {
    return "blocked";
  }
  if (card.status === "idle") {
    return "idle";
  }
  if (isWaitingLikeTask(card, bubble)) {
    return "waiting";
  }
  if (card.agent === "CEO Agent" || card.agent === "Risk and Compliance Agent") {
    return "reviewing";
  }
  return "active";
}

function buildOfficePresence(agentStatusCards, opportunities, attention, nowIso, capitalStrategy = null) {
  return agentStatusCards.map((card) => {
    const blueprint = getPresenceBlueprint(card.agent);
    const attentionTask =
      attention && attention.top_task && attention.top_task.owner === card.agent
        ? attention.top_task
        : null;
    const bubble = buildPresenceBubble(card, attentionTask, capitalStrategy);
    const focusedOpportunity = card.opportunity_id
      ? opportunities.find((entry) => entry.opportunity_id === card.opportunity_id) || null
      : null;
    const strategyNote =
      card.agent === "CEO Agent" && capitalStrategy
        ? `${capitalStrategy.capital_mode} mode | ${capitalStrategy.approved_strategy_priorities
            .slice(0, 2)
            .join(" -> ")}`
        : null;
    const visualState = normalizePresenceVisualState(card, bubble);

    return {
      agent: card.agent,
      zone_id: blueprint.zone_id,
      zone_label: blueprint.zone_label,
      department_label: blueprint.department_label,
      avatar_monogram: blueprint.avatar_monogram,
      accent_token: blueprint.accent_token,
      status: card.status,
      visual_state: visualState,
      urgency: card.urgency,
      motion_state: visualState,
      lane_stage: mapStatusToLaneStage(
        focusedOpportunity && focusedOpportunity.current_status
          ? focusedOpportunity.current_status
          : "idle"
      ),
      opportunity_id: card.opportunity_id,
      headline: strategyNote ? `${card.active_task} | ${strategyNote}` : card.active_task,
      bubble_kind: bubble.bubble_kind,
      bubble_label: bubble.bubble_label,
      bubble_text: bubble.bubble_text,
      capital_mode: card.agent === "CEO Agent" && capitalStrategy ? capitalStrategy.capital_mode : null,
      capital_mode_reason:
        card.agent === "CEO Agent" && capitalStrategy ? capitalStrategy.capital_mode_reason : null,
      focus_note:
        (focusedOpportunity &&
          focusedOpportunity.contract_bundle &&
          focusedOpportunity.contract_bundle.opportunity_record &&
          focusedOpportunity.contract_bundle.opportunity_record.notes) ||
        null,
      queue_signal:
        attentionTask && typeof attentionTask.minutes_to_due === "number"
          ? {
              due_by: attentionTask.due_by,
              minutes_to_due: attentionTask.minutes_to_due,
              overdue: attentionTask.overdue,
            }
          : null,
      updated_at: nowIso,
    };
  });
}

function buildOfficeHandoffSignals(opportunities) {
  const signals = [];
  for (const entry of opportunities) {
    const packet =
      entry &&
      entry.contract_bundle &&
      entry.contract_bundle.handoff_packet &&
      typeof entry.contract_bundle.handoff_packet === "object"
        ? entry.contract_bundle.handoff_packet
        : null;
    if (!packet) {
      continue;
    }
    if (typeof packet.from_agent !== "string" || typeof packet.to_agent !== "string") {
      continue;
    }
    const operationalHandoff = entry.operational_handoff || null;
    const baseBlockingCount = Array.isArray(packet.blocking_items) ? packet.blocking_items.length : 0;
    const blockingCount =
      operationalHandoff &&
      (operationalHandoff.handoff_state === "handoff_blocked" ||
        operationalHandoff.handoff_state === "handoff_return_required")
        ? Math.max(1, baseBlockingCount)
        : baseBlockingCount;
    signals.push({
      opportunity_id: entry.opportunity_id,
      from_agent: packet.from_agent,
      to_agent:
        (operationalHandoff && operationalHandoff.next_owner) || packet.to_agent,
      from_zone_id: getPresenceBlueprint(packet.from_agent).zone_id,
      to_zone_id: getPresenceBlueprint(
        (operationalHandoff && operationalHandoff.next_owner) || packet.to_agent
      ).zone_id,
      next_action:
        (operationalHandoff && operationalHandoff.current_owner_action) || packet.next_action,
      due_by: packet.due_by,
      blocking_count: blockingCount,
      handoff_state: operationalHandoff ? operationalHandoff.handoff_state : "handoff_ready",
      handoff_label: operationalHandoff ? operationalHandoff.handoff_label : "Handoff ready",
      handoff_reason:
        operationalHandoff
          ? operationalHandoff.handoff_reason
          : "Ownership transfer packet is in progress.",
      current_owner_action:
        operationalHandoff
          ? operationalHandoff.current_owner_action
          : packet.next_action,
      next_owner:
        operationalHandoff && operationalHandoff.next_owner
          ? operationalHandoff.next_owner
          : packet.to_agent,
      handoff_clear_condition:
        operationalHandoff
          ? operationalHandoff.handoff_clear_condition
          : "Clears when next owner accepts and executes.",
      source_stale: Boolean(entry.latest_artifact && entry.latest_artifact.is_stale),
    });
  }
  signals.sort((a, b) => Date.parse(a.due_by || 0) - Date.parse(b.due_by || 0));
  for (const signal of signals) {
    assertValidOfficeHandoffSignal(signal);
  }
  return signals;
}

function normalizeOfficeViewState(value) {
  const allowed = new Set([
    "idle",
    "active",
    "reviewing",
    "waiting",
    "blocked",
    "needs_approval",
  ]);
  return allowed.has(value) ? value : "idle";
}

function buildOfficeViewModel(
  officePresence,
  officeHandoffSignals,
  companyBoardSnapshot,
  kpis,
  attention
) {
  const zoneOrder = [
    { id: "executive-suite", title: "Decision Desk", role_label: "CEO Agent" },
    {
      id: "verification-bay",
      title: "Sourcing & Verification",
      role_label: "Risk and Compliance Agent",
    },
    {
      id: "routing-desk",
      title: "Ops & Diagnostics",
      role_label: "Operations Coordinator Agent",
    },
    {
      id: "market-floor",
      title: "Sales & Market",
      role_label: "Department Operator Agent",
    },
  ];
  const presenceByZone = new Map((officePresence || []).map((entry) => [entry.zone_id, entry]));

  const zones = zoneOrder.map((zone) => {
    const presence = presenceByZone.get(zone.id) || null;
    const nowSummary = presence
      ? presence.bubble_text || presence.headline || "Monitoring lane workload."
      : "No active lane signal.";
    const isBlocked = presence && normalizeOfficeViewState(presence.visual_state) === "blocked";
    const needsApproval =
      presence && normalizeOfficeViewState(presence.visual_state) === "needs_approval";
    const blockerText = isBlocked ? nowSummary : null;
    const approvalText = needsApproval ? nowSummary : null;

    return {
      id: zone.id,
      title: zone.title,
      role_label: zone.role_label,
      avatar_label: presence ? presence.agent : zone.role_label,
      state: normalizeOfficeViewState(presence ? presence.visual_state : "idle"),
      current_focus: presence
        ? presence.opportunity_id
          ? `Focus ${presence.opportunity_id}`
          : "Monitoring owned lane."
        : "Monitoring owned lane.",
      now_summary: nowSummary,
      blocker_text: blockerText,
      approval_text: approvalText,
      dominant_item_id: presence ? presence.opportunity_id || null : null,
    };
  });

  const handoffs = (officeHandoffSignals || []).map((signal) => ({
    opportunity_id: signal.opportunity_id || null,
    from_agent: signal.from_agent || null,
    to_agent: signal.next_owner || signal.to_agent || null,
    from_zone: signal.from_zone_id,
    to_zone: signal.to_zone_id,
    status:
      signal.handoff_state === "handoff_blocked" ||
      signal.handoff_state === "handoff_return_required" ||
      signal.blocking_count > 0
        ? "blocked"
        : "active",
    label:
      signal.current_owner_action && typeof signal.current_owner_action === "string"
        ? `${signal.handoff_label || "Handoff"}: ${signal.current_owner_action}`
        : "Ownership transfer in progress.",
  }));

  const companyBoardSummary = {
    headline:
      (attention && attention.top_task && attention.top_task.next_action) ||
      "Company board is clear for normal monitoring.",
    key_counts: [
      { label: "Active", value: kpis.active_opportunities },
      { label: "Blocked", value: kpis.blocked_opportunities },
      { label: "Approvals", value: kpis.approvals_waiting },
    ],
    alert_text:
      companyBoardSnapshot && Array.isArray(companyBoardSnapshot.alerts)
        ? companyBoardSnapshot.alerts[0] || null
        : null,
  };

  return {
    zones,
    handoffs,
    company_board_summary: companyBoardSummary,
  };
}

function buildUiSnapshot(options = {}) {
  const queuePath = path.resolve(options.queuePath || path.join(__dirname, "state", "approval_queue.json"));
  const workflowStatePath = path.resolve(
    options.workflowStatePath || path.join(__dirname, "state", "workflow_state.json")
  );
  const capitalStatePath = path.resolve(
    options.capitalStatePath || path.join(__dirname, "state", "capital_state.json")
  );
  const baseDir = path.resolve(options.baseDir || path.join(__dirname, "output"));
  const nowIso = toIso(options.now);

  const queue = loadQueue(queuePath);
  const workflowState = loadWorkflowState(workflowStatePath);
  const statusSnapshot = runStatusAction({
    queuePath,
    workflowStatePath,
    baseDir,
    now: nowIso,
    slaMinutes: options.slaMinutes || 120,
    workflowStaleMinutes: options.workflowStaleMinutes || 240,
    dueSoonMinutes: options.dueSoonMinutes || 30,
    pendingLimit: options.pendingLimit || 10,
    staleLimit: options.staleLimit || 10,
    taskLimit: options.taskLimit || 20,
  });

  const latestArtifacts = listLatestRunArtifactsByOpportunity(baseDir);
  const opportunities = buildOpportunityEntries(
    queue,
    workflowState,
    latestArtifacts,
    statusSnapshot.awaiting_tasks.tasks
  );
  const queueTotals = summarizeQueueTotals(queue);
  const kpis = buildKpis(statusSnapshot, opportunities);
  const capitalControls = buildCapitalControls(capitalStatePath);
  const capitalStrategy = buildCapitalStrategySnapshot(
    capitalControls,
    queueTotals,
    opportunities,
    nowIso
  );
  const opportunitiesWithCapitalFit = opportunities.map((entry) => ({
    ...entry,
    capital_fit: buildOpportunityCapitalFit(entry, capitalStrategy),
  }));
  const annotatedOpportunities = annotateIntakePriorities(
    opportunitiesWithCapitalFit,
    capitalStrategy,
    nowIso
  );
  const agentStatusCards = buildAgentStatusCards(
    annotatedOpportunities,
    statusSnapshot.attention,
    queueTotals,
    nowIso
  );
  const officePresence = buildOfficePresence(
    agentStatusCards,
    annotatedOpportunities,
    statusSnapshot.attention,
    nowIso,
    capitalStrategy
  );
  const officeHandoffSignals = buildOfficeHandoffSignals(annotatedOpportunities);
  const officeFlowEvents = buildOfficeFlowEvents(workflowState, annotatedOpportunities);
  const officeZoneAnchors = buildOfficeZoneAnchors(officePresence);
  const officeRouteHints = buildOfficeRouteHints(officeZoneAnchors, officeHandoffSignals);
  const officeEvents = buildOfficeEvents(
    annotatedOpportunities,
    queue,
    officeHandoffSignals,
    nowIso
  );
  const officeMovementIntents = buildOfficeMovementIntents(
    officeEvents,
    officeZoneAnchors,
    officeRouteHints
  );
  const companyBoardSnapshot = buildCompanyBoardSnapshot(
    annotatedOpportunities,
    statusSnapshot.awaiting_tasks.tasks,
    queueTotals,
    kpis,
    nowIso
  );
  const officeView = buildOfficeViewModel(
    officePresence,
    officeHandoffSignals,
    companyBoardSnapshot,
    kpis,
    statusSnapshot.attention
  );
  const opportunitiesById = new Map(
    annotatedOpportunities.map((entry) => [entry.opportunity_id, entry])
  );
  const sortedQueueItems = [...queue.items].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") {
      return -1;
    }
    if (a.status !== "pending" && b.status === "pending") {
      return 1;
    }
    return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
  });
  const queueItems = alignApprovalQueueItemsWithRecommendations(
    sortedQueueItems,
    opportunitiesById
  );

  return {
    schema_version: "v1",
    generated_at: nowIso,
    source_paths: {
      queue_path: queuePath,
      workflow_state_path: workflowStatePath,
      capital_state_path: capitalStatePath,
      output_base_dir: baseDir,
    },
    kpis,
    attention: statusSnapshot.attention,
    approval_queue: {
      updated_at: queue.updated_at,
      totals: queueTotals,
      items: queueItems,
    },
    workflow: {
      updated_at: workflowState.updated_at,
      status_counts:
        statusSnapshot.workflow && statusSnapshot.workflow.health
          ? statusSnapshot.workflow.health.workflow_totals.status_counts
          : {},
      stale_opportunities:
        statusSnapshot.workflow && statusSnapshot.workflow.stale_opportunities
          ? statusSnapshot.workflow.stale_opportunities
          : [],
      opportunities: annotatedOpportunities,
    },
    office: {
      agent_status_cards: agentStatusCards,
      presence: officePresence,
      handoff_signals: officeHandoffSignals,
      zone_anchors: officeZoneAnchors,
      route_hints: officeRouteHints,
      movement_intents: officeMovementIntents,
      events: officeEvents,
      flow_events: officeFlowEvents,
      company_board_snapshot: companyBoardSnapshot,
      office_view: officeView,
    },
    awaiting_tasks: statusSnapshot.awaiting_tasks,
    capital_controls: capitalControls,
    capital_strategy: capitalStrategy,
  };
}

module.exports = {
  buildUiSnapshot,
  listLatestRunArtifactsByOpportunity,
  buildOpportunityEntries,
  buildAgentStatusCards,
  buildOfficePresence,
  buildOfficeHandoffSignals,
  buildOfficeZoneAnchors,
  buildOfficeRouteHints,
  buildOfficeEvents,
  buildOfficeMovementIntents,
  buildOfficeFlowEvents,
  buildOfficeViewModel,
  buildCompanyBoardSnapshot,
  buildKpis,
  buildCapitalStrategySnapshot,
};
