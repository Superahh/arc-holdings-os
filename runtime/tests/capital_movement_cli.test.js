"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runBootstrapAction } = require("../capital_bootstrap_cli");
const { parseArgs, runMovementAction } = require("../capital_movement_cli");

test("parseArgs validates required capital movement fields", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(
    () => parseArgs(["--action", "deposit", "--amount-usd", "10"]),
    /--requested-by is required/
  );
  assert.throws(
    () =>
      parseArgs([
        "--action",
        "reserve",
        "--amount-usd",
        "10",
        "--requested-by",
        "x",
        "--performed-by",
        "x",
        "--authorized-by",
        "x",
        "--reason",
        "reserve",
      ]),
    /--opportunity-id is required/
  );
});

test("runMovementAction executes deposit and reserve with ledger integrity", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-cap-move-"));
  const statePath = path.join(tempDir, "capital_state.json");

  runBootstrapAction({
    statePath,
    accountId: "arc-main-usd",
    now: "2026-03-26T10:00:00.000Z",
    force: false,
  });

  const depositResult = runMovementAction({
    statePath,
    action: "deposit",
    amountUsd: 500,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Seed cash",
    notes: "",
    opportunityId: null,
    approvalTicketId: null,
    requestId: null,
    now: "2026-03-26T10:01:00.000Z",
  });
  assert.equal(depositResult.account.available_usd, 500);
  assert.equal(depositResult.ledger_integrity.ok, true);

  const reserveResult = runMovementAction({
    statePath,
    action: "reserve",
    amountUsd: 120,
    requestedBy: "owner_operator",
    performedBy: "owner_operator",
    authorizedBy: "owner_operator",
    reason: "Reserve for opportunity",
    notes: "",
    opportunityId: "opp-2026-03-26-200",
    approvalTicketId: "apr-2026-03-26-200",
    requestId: null,
    now: "2026-03-26T10:02:00.000Z",
  });
  assert.equal(reserveResult.account.available_usd, 380);
  assert.equal(reserveResult.account.reserved_usd, 120);
  assert.equal(reserveResult.ledger_integrity.ok, true);

  const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(persisted.ledger.length, 2);
  assert.equal(persisted.requests.length, 2);
});
