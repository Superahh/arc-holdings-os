"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { runOpportunityPipeline } = require("../pipeline");
const {
  createEmptyWorkflowState,
  upsertFromPipeline,
  updateOpportunityStatus,
  createOperatorSendBack,
} = require("../workflow_state");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "..", "fixtures", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("createOperatorSendBack persists reasoned send-back for supported states", () => {
  const output = runOpportunityPipeline(
    loadFixture("rejection-scenario.json"),
    "2026-04-01T15:00:00.000Z"
  );
  const state = createEmptyWorkflowState("2026-04-01T15:00:00.000Z");
  const seeded = upsertFromPipeline(state, output, "pipeline_runner", "2026-04-01T15:00:00.000Z");
  assert.equal(seeded.current_status, "awaiting_approval");

  updateOpportunityStatus(
    state,
    seeded.opportunity_id,
    "approved",
    "owner_operator",
    "Approved before new blocker surfaced.",
    "2026-04-01T15:10:00.000Z"
  );
  assert.equal(seeded.current_status, "approved");

  const updated = createOperatorSendBack(
    state,
    seeded.opportunity_id,
    "Seller has not provided the IMEI photo we need to continue.",
    "owner_operator",
    "2026-04-01T15:20:00.000Z"
  );

  assert.equal(updated.current_status, "awaiting_seller_verification");
  assert.equal(updated.priority, "urgent");
  assert.equal(updated.recommendation, "request_more_info");
  assert.equal(updated.purchase_recommendation_blocked, true);
  assert.equal(
    updated.seller_verification.request_message,
    "Seller has not provided the IMEI photo we need to continue."
  );
  assert.equal(updated.seller_verification.response_status, "pending");
  assert.equal(updated.status_history.at(-1).status, "awaiting_seller_verification");
  assert.match(updated.status_history.at(-1).reason, /operator send-back/i);
  assert.equal(
    state.event_log.some(
      (event) =>
        event.action === "operator_send_back" &&
        event.opportunity_id === seeded.opportunity_id &&
        event.reason === "Seller has not provided the IMEI photo we need to continue."
    ),
    true
  );
});

test("createOperatorSendBack rejects unsupported downstream states", () => {
  const output = runOpportunityPipeline(
    loadFixture("rejection-scenario.json"),
    "2026-04-01T15:00:00.000Z"
  );
  const state = createEmptyWorkflowState("2026-04-01T15:00:00.000Z");
  const seeded = upsertFromPipeline(state, output, "pipeline_runner", "2026-04-01T15:00:00.000Z");

  updateOpportunityStatus(
    state,
    seeded.opportunity_id,
    "approved",
    "owner_operator",
    "Approved before routing.",
    "2026-04-01T15:10:00.000Z"
  );
  updateOpportunityStatus(
    state,
    seeded.opportunity_id,
    "acquired",
    "owner_operator",
    "Acquired before routing.",
    "2026-04-01T15:20:00.000Z"
  );
  updateOpportunityStatus(
    state,
    seeded.opportunity_id,
    "routed",
    "owner_operator",
    "Routed before send-back attempt.",
    "2026-04-01T15:30:00.000Z"
  );

  assert.throws(
    () =>
      createOperatorSendBack(
        state,
        seeded.opportunity_id,
        "Need fresh seller verification before continuing.",
        "owner_operator",
        "2026-04-01T15:40:00.000Z"
      ),
    /not supported/
  );
});
