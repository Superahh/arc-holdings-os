"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateOfficeZoneAnchor,
  validateOfficeRouteHint,
  validateOfficeEvent,
  validateOfficeMovementIntent,
} = require("../contracts");

test("validateOfficeZoneAnchor accepts normalized anchor payload", () => {
  const errors = validateOfficeZoneAnchor({
    zone_id: "verification-bay",
    zone_label: "Verification Bay",
    department_label: "Risk and seller checks",
    anchor: { x: 0.74, y: 0.24 },
    ingress: { x: 0.65, y: 0.24 },
    egress: { x: 0.83, y: 0.24 },
    handoff_dock: { x: 0.69, y: 0.30 },
    connections: ["executive-suite", "routing-desk"],
  });

  assert.equal(errors.length, 0, `Unexpected OfficeZoneAnchor errors: ${errors.join(", ")}`);
});

test("validateOfficeRouteHint rejects invalid waypoint shape", () => {
  const errors = validateOfficeRouteHint({
    route_id: "route-opp-1-company-floor-verification-bay",
    opportunity_id: "opp-1",
    from_zone_id: "company-floor",
    to_zone_id: "verification-bay",
    path_zone_ids: ["company-floor", "verification-bay"],
    waypoints: [{ x: 1.4, y: 0.5 }],
    source: "handoff_signal",
  });

  assert.equal(errors.length > 0, true);
  assert.match(errors.join(" | "), /waypoints\[0\]\.x/);
});

test("validateOfficeEvent enforces enum and timestamp constraints", () => {
  const errors = validateOfficeEvent({
    event_id: "evt-bad",
    type: "handoff_started",
    source: "handoff_signal",
    timestamp: "not-a-date",
    opportunity_id: "opp-1",
    from_agent: "Valuation Agent",
    to_agent: "Risk and Compliance Agent",
    from_zone_id: "company-floor",
    to_zone_id: "verification-bay",
    lane_from: "monitor",
    lane_to: "verification",
    lane_stage: "verification",
    blocking_count: 0,
    ticket_id: null,
    decision: "pending",
    agent: null,
    summary: "Ownership moved.",
    severity: "notice",
  });

  assert.equal(errors.length > 0, true);
  assert.match(errors.join(" | "), /timestamp/);
  assert.match(errors.join(" | "), /severity/);
});

test("validateOfficeMovementIntent enforces route and trigger constraints", () => {
  const errors = validateOfficeMovementIntent({
    intent_id: "intent-1",
    opportunity_id: "opp-1",
    movement_kind: "handoff",
    transition_state: "in_flight",
    agent: "Risk and Compliance Agent",
    from_agent: "Valuation Agent",
    to_agent: "Risk and Compliance Agent",
    from_zone_id: "company-floor",
    to_zone_id: "verification-bay",
    route_id: "route-opp-1-company-floor-verification-bay",
    path_zone_ids: ["company-floor", "verification-bay"],
    waypoints: [{ x: 0.4, y: 0.5 }, { x: 0.72, y: 0.24 }],
    trigger_event_id: "office-handoff-opp-1-handoff_started-2026-03-25T19:00:00.000Z",
    trigger_type: "handoff_started",
    trigger_timestamp: "2026-03-25T19:00:00.000Z",
    source: "handoff_signal",
    duration_ms: 1420,
    blocking_count: 0,
  });

  assert.equal(
    errors.length,
    0,
    `Unexpected OfficeMovementIntent errors: ${errors.join(", ")}`
  );
});
