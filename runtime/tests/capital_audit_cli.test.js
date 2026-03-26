"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runBootstrapAction } = require("../capital_bootstrap_cli");
const { runMovementAction } = require("../capital_movement_cli");
const { parseArgs, runAuditAction } = require("../capital_audit_cli");

test("parseArgs validates unknown and missing values", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--state-path"]), /Missing value/);
});

test("runAuditAction summarizes ledger/account state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cap-audit-"));
  const statePath = path.join(tempDir, "capital_state.json");
  const outputPath = path.join(tempDir, "capital_audit.json");

  runBootstrapAction({
    statePath,
    accountId: "arc-main-usd",
    now: "2026-03-26T10:00:00.000Z",
    force: false,
  });
  runMovementAction({
    statePath,
    action: "deposit",
    amountUsd: 500,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-26T10:01:00.000Z",
  });
  runMovementAction({
    statePath,
    action: "reserve",
    amountUsd: 120,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Reserve",
    notes: "",
    opportunityId: "opp-2026-03-26-500",
    approvalTicketId: "apr-2026-03-26-500",
    requestId: null,
    now: "2026-03-26T10:02:00.000Z",
  });

  const audit = runAuditAction({ statePath, outputPath });
  assert.equal(audit.integrity.ok, true);
  assert.equal(audit.account.available_usd, 380);
  assert.equal(audit.account.reserved_usd, 120);
  assert.equal(audit.totals.ledger_entry_count, 2);
  assert.equal(audit.totals.active_reservation_count, 1);
  assert.equal(fs.existsSync(outputPath), true);
});
