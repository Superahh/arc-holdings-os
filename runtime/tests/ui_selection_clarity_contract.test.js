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

test("office room render is compressed around avatar, bubble, and summary", () => {
  const source = readUiAppSource();
  assert.match(source, /class="office-room"/);
  assert.match(source, /class="room-stage"/);
  assert.match(source, /class="thought-bubble/);
  assert.match(source, /class="room-now"/);
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
  assert.match(source, /owner_lane_label:/);
  assert.match(source, /formatLaneLabel\(mapStatusToLaneStage\(entry\.current_status\)\)/);
});

test("selected opportunity card includes explicit selected salience marker", () => {
  const source = readUiAppSource();
  assert.match(source, /is_selected:/);
  assert.match(source, /state\.selected\.type === "opportunity"/);
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
  assert.match(source, /presenceByZone/);
  assert.match(source, /getPrimaryHandoff\(state\.snapshot\)/);
});

test("office canvas emits stable zone and role labels for the simplified floor", () => {
  const source = readUiAppSource();
  assert.match(source, /zone\.title \|\| "Office zone"/);
  assert.match(source, /zone\.role_label/);
  assert.match(source, /zone\.avatar_label/);
  assert.match(source, /room-role-label room-title/);
});

test("office canvas conditionally renders blocker and approval chips", () => {
  const source = readUiAppSource();
  assert.match(source, /zone\.blocker_text/);
  assert.match(source, /zone\.approval_text/);
  assert.match(source, /office-chip-blocked/);
  assert.match(source, /office-chip-approval/);
});

test("office canvas keeps the top floor banner minimal", () => {
  const source = readUiAppSource();
  assert.match(source, /Operations floor/);
  assert.match(source, /Living office/);
  assert.match(source, /floor-banner-compact/);
});

test("office canvas derives emphasis context from existing selection state", () => {
  const source = readUiAppSource();
  assert.match(source, /function deriveOfficeSelectionContext/);
  assert.match(source, /const selected = state\.selected/);
  assert.match(source, /zone\.dominant_item_id === selected\.id/);
  assert.match(source, /zone\.role_label === selected\.id/);
});

test("office canvas applies contextual emphasis hooks to zones only", () => {
  const source = readUiAppSource();
  assert.match(source, /is-context-zone/);
  assert.match(source, /is-context-dim/);
});

test("office canvas applies urgency hooks using existing zone semantics", () => {
  const source = readUiAppSource();
  assert.match(source, /is-urgent-zone/);
  assert.match(source, /visualState === "blocked"/);
  assert.match(source, /visualState === "needs_approval"/);
  assert.match(source, /zone\.blocker_text/);
  assert.match(source, /zone\.approval_text/);
});

test("office canvas allows urgency and selection context hooks to coexist on room tiles", () => {
  const source = readUiAppSource();
  assert.match(source, /is-context-zone/);
  assert.match(source, /is-urgent-zone/);
  assert.match(source, /zone-card zone-room/);
  assert.match(source, /room-chip/);
});

test("office floor renders a single courier token and overlay from runtime handoff state", () => {
  const source = readUiAppSource();
  assert.match(source, /getCourierRenderModel/);
  assert.match(source, /roomVisualModel\.courier\.active/);
  assert.match(source, /class=\"courier-token/);
  assert.match(source, /floor-courier-overlay hidden/);
});

test("office floor wrapper uses the simplified room-grid shell", () => {
  const source = readUiAppSource();
  assert.match(source, /class=\"office-floor-surface\"/);
  assert.match(source, /class=\"office-room-grid\"/);
  assert.doesNotMatch(source, /office-layout-wrap/);
  assert.doesNotMatch(source, /office-board-summary/);
});

test("selection reconciliation preserves valid target and falls back deterministically", () => {
  const source = readUiAppSource();
  assert.match(source, /function resolveSelectionForSnapshot/);
  assert.match(source, /currentSelected\.type === "opportunity"[\s\S]*hasOpportunity\(currentSelected\.id\)/);
  assert.match(source, /currentSelected\.type === "agent"[\s\S]*hasAgent\(currentSelected\.id\)/);
  assert.match(source, /continuityByOwner/);
  assert.match(source, /continuityByLane/);
  assert.match(source, /topOpportunityId/);
  assert.match(source, /nextOpportunities\[0\]/);
  assert.match(source, /nextAgentCards\[0\]/);
});

test("loadSnapshot reconciles selection before swapping snapshot to avoid focus churn", () => {
  const source = readUiAppSource();
  assert.match(
    source,
    /state\.selected = resolveSelectionForSnapshot\(nextSnapshot, state\.selected, state\.snapshot\);\s*state\.snapshot = nextSnapshot;/
  );
});
