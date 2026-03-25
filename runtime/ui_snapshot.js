"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadQueue } = require("./approval_queue");
const { loadWorkflowState } = require("./workflow_state");
const { runStatusAction } = require("./ops_status_cli");
const {
  assertValidOpportunityRecord,
  assertValidApprovalTicket,
  assertValidHandoffPacket,
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
} = require("./contracts");

const TERMINAL_OPPORTUNITY_STATES = new Set(["closed", "rejected"]);

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

    entries.push({
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
    });
  }

  return sortOpportunities(entries);
}

function findOpportunityByStatuses(opportunities, statuses) {
  return opportunities.find((entry) => statuses.has(entry.current_status)) || null;
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
    blocker: queueTotals.pending > 0 ? "Approval queue is waiting on owner action." : null,
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
        ? "Purchase recommendation remains blocked."
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
        ? "Current opportunity is blocked before purchase."
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
    return `${pendingExposure} USD is awaiting explicit approval. Capital remains user-controlled until deposit, reserve, approval, and withdrawal flows are implemented with auditability.`;
  }
  return "No capital approval is currently pending. Capital remains manually controlled until explicit deposit, reserve, approval, and withdrawal controls are implemented.";
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
      zone_label: "Executive Suite",
      department_label: "Priority and approvals",
      avatar_monogram: "CEO",
      accent_token: "copper",
    },
    "Risk and Compliance Agent": {
      zone_id: "verification-bay",
      zone_label: "Verification Bay",
      department_label: "Risk and seller checks",
      avatar_monogram: "R&C",
      accent_token: "olive",
    },
    "Operations Coordinator Agent": {
      zone_id: "routing-desk",
      zone_label: "Routing Desk",
      department_label: "Execution readiness",
      avatar_monogram: "OPS",
      accent_token: "umber",
    },
    "Department Operator Agent": {
      zone_id: "market-floor",
      zone_label: "Market Floor",
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
      connections: [],
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
  return anchors;
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

function buildPresenceBubble(card, attentionTask) {
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
  return {
    bubble_kind: "task",
    bubble_text: card.active_task,
    bubble_label: "Active task",
  };
}

function buildOfficePresence(agentStatusCards, opportunities, attention, nowIso) {
  return agentStatusCards.map((card) => {
    const blueprint = getPresenceBlueprint(card.agent);
    const attentionTask =
      attention && attention.top_task && attention.top_task.owner === card.agent
        ? attention.top_task
        : null;
    const bubble = buildPresenceBubble(card, attentionTask);
    const focusedOpportunity = card.opportunity_id
      ? opportunities.find((entry) => entry.opportunity_id === card.opportunity_id) || null
      : null;

    return {
      agent: card.agent,
      zone_id: blueprint.zone_id,
      zone_label: blueprint.zone_label,
      department_label: blueprint.department_label,
      avatar_monogram: blueprint.avatar_monogram,
      accent_token: blueprint.accent_token,
      status: card.status,
      urgency: card.urgency,
      motion_state: card.status,
      lane_stage: mapStatusToLaneStage(
        focusedOpportunity && focusedOpportunity.current_status
          ? focusedOpportunity.current_status
          : "idle"
      ),
      opportunity_id: card.opportunity_id,
      headline: card.active_task,
      bubble_kind: bubble.bubble_kind,
      bubble_label: bubble.bubble_label,
      bubble_text: bubble.bubble_text,
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
    signals.push({
      opportunity_id: entry.opportunity_id,
      from_agent: packet.from_agent,
      to_agent: packet.to_agent,
      from_zone_id: getPresenceBlueprint(packet.from_agent).zone_id,
      to_zone_id: getPresenceBlueprint(packet.to_agent).zone_id,
      next_action: packet.next_action,
      due_by: packet.due_by,
      blocking_count: Array.isArray(packet.blocking_items) ? packet.blocking_items.length : 0,
      source_stale: Boolean(entry.latest_artifact && entry.latest_artifact.is_stale),
    });
  }
  signals.sort((a, b) => Date.parse(a.due_by || 0) - Date.parse(b.due_by || 0));
  return signals;
}

function buildUiSnapshot(options = {}) {
  const queuePath = path.resolve(options.queuePath || path.join(__dirname, "state", "approval_queue.json"));
  const workflowStatePath = path.resolve(
    options.workflowStatePath || path.join(__dirname, "state", "workflow_state.json")
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
  const agentStatusCards = buildAgentStatusCards(opportunities, statusSnapshot.attention, queueTotals, nowIso);
  const officePresence = buildOfficePresence(
    agentStatusCards,
    opportunities,
    statusSnapshot.attention,
    nowIso
  );
  const officeHandoffSignals = buildOfficeHandoffSignals(opportunities);
  const officeFlowEvents = buildOfficeFlowEvents(workflowState, opportunities);
  const officeZoneAnchors = buildOfficeZoneAnchors(officePresence);
  const officeEvents = buildOfficeEvents(
    opportunities,
    queue,
    officeHandoffSignals,
    nowIso
  );
  const companyBoardSnapshot = buildCompanyBoardSnapshot(
    opportunities,
    statusSnapshot.awaiting_tasks.tasks,
    queueTotals,
    kpis,
    nowIso
  );

  return {
    schema_version: "v1",
    generated_at: nowIso,
    source_paths: {
      queue_path: queuePath,
      workflow_state_path: workflowStatePath,
      output_base_dir: baseDir,
    },
    kpis,
    attention: statusSnapshot.attention,
    approval_queue: {
      updated_at: queue.updated_at,
      totals: queueTotals,
      items: [...queue.items].sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") {
          return -1;
        }
        if (a.status !== "pending" && b.status === "pending") {
          return 1;
        }
        return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
      }),
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
      opportunities,
    },
    office: {
      agent_status_cards: agentStatusCards,
      presence: officePresence,
      handoff_signals: officeHandoffSignals,
      zone_anchors: officeZoneAnchors,
      events: officeEvents,
      flow_events: officeFlowEvents,
      company_board_snapshot: companyBoardSnapshot,
    },
    awaiting_tasks: statusSnapshot.awaiting_tasks,
    capital_controls: {
      status: "manual_only",
      note: "Capital deposit, reserve, approval, and withdrawal flows are not yet implemented. Any capital movement remains explicitly user-controlled and must stay auditable.",
    },
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
  buildOfficeEvents,
  buildOfficeFlowEvents,
  buildCompanyBoardSnapshot,
  buildKpis,
};
