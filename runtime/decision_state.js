"use strict";

const {
  assertValidAgentStatusCard,
  assertValidCompanyBoardSnapshot,
} = require("./contracts");

function summarizeQueue(queue) {
  const summary = {
    pending: 0,
    approve: 0,
    reject: 0,
    request_more_info: 0,
  };
  for (const item of queue.items) {
    if (summary[item.status] !== undefined) {
      summary[item.status] += 1;
    }
  }
  return summary;
}

function buildDecisionOfficeState(queue, decidedItem, decidedAt) {
  const counts = summarizeQueue(queue);
  const decisionStatus = decidedItem.status;
  const opportunityId = decidedItem.opportunity_id || null;

  let operationsTask = "Await next approved execution item.";
  let operationsStatus = "idle";
  let ceoTask = "Monitor approval queue health.";
  let ceoStatus = counts.pending > 0 ? "awaiting_approval" : "working";
  const alerts = [];

  if (decisionStatus === "approve") {
    operationsTask = `Execute approved action for ${decidedItem.ticket_id}.`;
    operationsStatus = "working";
    ceoTask = "Track approved action execution.";
  } else if (decisionStatus === "reject") {
    operationsTask = `Close rejected action for ${decidedItem.ticket_id}.`;
    operationsStatus = "working";
    ceoTask = "Review rejected decision impacts.";
    alerts.push("Decision rejected; validate pipeline assumptions.");
  } else if (decisionStatus === "request_more_info") {
    operationsTask = `Pause execution for ${decidedItem.ticket_id}.`;
    operationsStatus = "blocked";
    ceoTask = "Collect requested information before re-review.";
    alerts.push("More information required before decision can proceed.");
  }

  const agent_status_cards = [
    {
      agent: "CEO Agent",
      status: ceoStatus,
      active_task: ceoTask,
      opportunity_id: opportunityId,
      blocker: counts.pending > 0 ? "Pending approvals remain in queue." : null,
      urgency: counts.pending > 0 ? "high" : "medium",
      updated_at: decidedAt,
    },
    {
      agent: "Operations Coordinator Agent",
      status: operationsStatus,
      active_task: operationsTask,
      opportunity_id: opportunityId,
      blocker: decisionStatus === "request_more_info" ? "Approval decision deferred." : null,
      urgency: decisionStatus === "request_more_info" ? "high" : "medium",
      updated_at: decidedAt,
    },
  ];

  for (const card of agent_status_cards) {
    assertValidAgentStatusCard(card);
  }

  const board = {
    snapshot_id: `brd-decision-${decidedItem.ticket_id}`,
    timestamp: decidedAt,
    priorities: [
      counts.pending > 0 ? "Process remaining pending approvals." : "Queue clear for now.",
      decisionStatus === "request_more_info"
        ? "Collect missing information for deferred decision."
        : "Maintain decision audit quality.",
    ],
    approvals_waiting: counts.pending,
    blocked_count: decisionStatus === "request_more_info" ? 1 : 0,
    active_opportunities: opportunityId ? [opportunityId] : [],
    alerts,
    capital_note:
      decisionStatus === "approve"
        ? "Approved action can proceed under controlled execution."
        : "No newly approved spend from this decision.",
  };
  assertValidCompanyBoardSnapshot(board);

  return {
    agent_status_cards,
    company_board_snapshot: board,
    queue_counts: counts,
  };
}

module.exports = {
  summarizeQueue,
  buildDecisionOfficeState,
};
