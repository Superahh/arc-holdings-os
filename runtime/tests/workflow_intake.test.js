"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEmptyWorkflowState,
  createOperatorIntakeOpportunity,
} = require("../workflow_state");

test("createOperatorIntakeOpportunity seeds a researching workflow record with a valid intake contract", () => {
  const state = createEmptyWorkflowState("2026-04-01T14:00:00.000Z");
  const created = createOperatorIntakeOpportunity(
    state,
    {
      summary: "iPhone 13 Pro 256GB, cracked back glass, powers on",
      source: "facebook_marketplace",
      ask_price_usd: 425,
      note: "Seller says battery health is unknown.",
    },
    "owner_operator",
    "2026-04-01T14:05:00.000Z"
  );

  assert.match(created.opportunity_id, /^opp-20260401T140500z-facebook-marketpla-/i);
  assert.equal(created.workflow_record.current_status, "researching");
  assert.equal(created.workflow_record.recommendation, "request_more_info");
  assert.equal(created.workflow_record.confidence, "low");
  assert.equal(created.workflow_record.status_history.length, 1);
  assert.equal(created.workflow_record.status_history[0].status, "researching");
  assert.equal(created.opportunity_record.source, "facebook_marketplace");
  assert.equal(
    created.opportunity_record.device_summary,
    "iPhone 13 Pro 256GB, cracked back glass, powers on"
  );
  assert.equal(created.opportunity_record.ask_price_usd, 425);
  assert.deepEqual(created.opportunity_record.estimated_value_range_usd, [425, 425]);
  assert.equal(created.opportunity_record.recommended_path, "request_more_info");
  assert.equal(created.opportunity_record.recommendation, "request_more_info");
  assert.equal(
    state.opportunities[created.opportunity_id].current_status,
    "researching"
  );
  assert.equal(
    state.event_log.some(
      (event) =>
        event.action === "opportunity_intake_created" &&
        event.opportunity_id === created.opportunity_id
    ),
    true
  );
});
