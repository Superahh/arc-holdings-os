"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readUiAppSource() {
  const filePath = path.join(__dirname, "..", "..", "ui", "app.js");
  return fs.readFileSync(filePath, "utf8");
}

test("lane-card click routes agent selection to dominant opportunity when present", () => {
  const source = readUiAppSource();
  assert.match(source, /data-dominant-opportunity-id=/);
  assert.match(source, /node\.dataset\.type === "agent"/);
  assert.match(source, /node\.dataset\.dominantOpportunityId/);
  assert.match(source, /setSelection\("opportunity", node\.dataset\.dominantOpportunityId\)/);
});

test("lane cards include explicit ownership micro-label", () => {
  const source = readUiAppSource();
  assert.match(source, /presence-owner-label/);
  assert.match(source, /Owned by this lane/);
});

test("lane-specific deterministic empty-state copy is defined", () => {
  const source = readUiAppSource();
  assert.match(source, /function getLaneEmptyCopy/);
  assert.match(source, /"CEO Agent": "Waiting on qualified opportunities that need approval\."/);
  assert.match(source, /"Risk and Compliance Agent": "Waiting on new sourcing and verification tasks\."/);
  assert.match(source, /"Operations Coordinator Agent": "Waiting on approved opportunities from Decision Desk\."/);
  assert.match(source, /"Department Operator Agent": "Waiting on routed opportunities from Ops and Diagnostics\."/);
});

test("detail panel renders persistent current-focus strip", () => {
  const source = readUiAppSource();
  assert.match(source, /function renderCurrentFocusStrip/);
  assert.match(source, /Currently owned by/);
  assert.match(source, /Next step or blocker/);
});

test("opportunity cards branch action line between blocked and next", () => {
  const source = readUiAppSource();
  assert.match(source, /function buildOpportunityCardV1Model/);
  assert.match(source, /Blocked by: purchase recommendation remains blocked\./);
  assert.match(source, /`Next: \$\{nextAction\}`/);
});

test("opportunity cards include owner-lane chip copy", () => {
  const source = readUiAppSource();
  assert.match(source, /Owner lane: \$\{cardVm\.owner_lane_label\}/);
  assert.match(source, /opportunity-owner-chip/);
});

test("selected opportunity card includes explicit selected salience marker", () => {
  const source = readUiAppSource();
  assert.match(source, /opportunity-selected-chip/);
  assert.match(source, />Selected</);
});
