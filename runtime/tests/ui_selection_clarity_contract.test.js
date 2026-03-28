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

test("detail opportunity sections render in fixed newcomer-readable order", () => {
  const source = readUiAppSource();
  assert.match(
    source,
    /<h3>Now<\/h3>[\s\S]*<h3>Why this matters now<\/h3>[\s\S]*<h3>What happens next<\/h3>[\s\S]*<h3>Evidence<\/h3>[\s\S]*<h3>History<\/h3>/
  );
});

test("detail lane-empty sections keep same hierarchy and include why-this-matters", () => {
  const source = readUiAppSource();
  assert.match(source, /function renderDetailForLaneEmpty/);
  assert.match(source, /<h3>Why this matters now<\/h3>/);
  assert.match(source, /<h3>What happens next<\/h3>/);
  assert.match(source, /<h3>Support context<\/h3>/);
});

test("detail hero chip density is capped at two", () => {
  const source = readUiAppSource();
  assert.match(source, /maxDetailHeroChips: 2/);
  assert.match(source, /heroChips\.slice\(0, V1_BOARD_CONTRACT\.maxDetailHeroChips\)/);
});

test("support context renders below operational sections", () => {
  const source = readUiAppSource();
  assert.match(
    source,
    /<h3>History<\/h3>[\s\S]*\$\{renderSupportContextSection\(capitalStrategy, capitalFit\)\}/
  );
});

test("office canvas rendering consumes office_view projection", () => {
  const source = readUiAppSource();
  assert.match(source, /state\.snapshot\.office\.office_view/);
  assert.match(source, /officeViewZones/);
  assert.match(source, /officeViewHandoffs/);
  assert.match(source, /officeViewBoardSummary/);
});

test("office canvas emits stable zone and role labels", () => {
  const source = readUiAppSource();
  assert.match(source, /zone\.title \|\| "Office zone"/);
  assert.match(source, /zone\.role_label/);
  assert.match(source, /zone\.avatar_label/);
  assert.match(source, /Role: \$\{agentName\}/);
});

test("office canvas conditionally renders blocker and approval chips", () => {
  const source = readUiAppSource();
  assert.match(source, /zone\.blocker_text/);
  assert.match(source, /zone\.approval_text/);
  assert.match(source, /office-chip-blocked/);
  assert.match(source, /office-chip-approval/);
});

test("office canvas renders company board summary panel", () => {
  const source = readUiAppSource();
  assert.match(source, /Company board summary/);
  assert.match(source, /office-board-summary/);
  assert.match(source, /officeViewBoardSummary\.key_counts/);
});

test("office canvas derives emphasis context from existing selection state", () => {
  const source = readUiAppSource();
  assert.match(source, /function deriveOfficeSelectionContext/);
  assert.match(source, /const selected = state\.selected/);
  assert.match(source, /zone\.dominant_item_id === selected\.id/);
  assert.match(source, /zone\.role_label === selected\.id/);
});

test("office canvas applies contextual emphasis hooks to zones and handoff rows", () => {
  const source = readUiAppSource();
  assert.match(source, /is-context-zone/);
  assert.match(source, /is-context-dim/);
  assert.match(source, /is-context-related/);
  assert.match(source, /is-context-primary/);
});

test("office canvas applies urgency hooks using existing zone and handoff semantics", () => {
  const source = readUiAppSource();
  assert.match(source, /is-urgent-zone/);
  assert.match(source, /visualState === "blocked"/);
  assert.match(source, /visualState === "needs_approval"/);
  assert.match(source, /is-urgent-handoff/);
  assert.match(source, /handoff\.status === "blocked"/);
});

test("office canvas allows urgency and selection context hooks to coexist", () => {
  const source = readUiAppSource();
  assert.match(source, /is-context-zone/);
  assert.match(source, /is-urgent-zone/);
  assert.match(source, /is-context-primary/);
  assert.match(source, /is-urgent-handoff/);
  assert.match(source, /has-global-alert/);
});
