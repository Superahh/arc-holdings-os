"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEmptyCapitalState,
  submitAndExecuteMovement,
  verifyLedgerIntegrity,
} = require("../capital_state");

test("deposit, reserve, approve_use, and withdraw update account and ledger", () => {
  const state = createEmptyCapitalState({ accountId: "arc-main-usd" }, "2026-03-26T10:00:00.000Z");

  submitAndExecuteMovement(
    state,
    {
      action: "deposit",
      amount_usd: 1000,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Initial capital deposit.",
    },
    { now: "2026-03-26T10:01:00.000Z" }
  );
  assert.equal(state.account.available_usd, 1000);
  assert.equal(state.ledger.length, 1);

  const reserveResult = submitAndExecuteMovement(
    state,
    {
      action: "reserve",
      amount_usd: 250,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Reserve for opportunity execution.",
      opportunity_id: "opp-2026-03-26-100",
      approval_ticket_id: "apr-2026-03-26-100",
    },
    { now: "2026-03-26T10:02:00.000Z" }
  );
  assert.equal(state.account.available_usd, 750);
  assert.equal(state.account.reserved_usd, 250);
  assert.equal(reserveResult.reservation.status, "active");

  submitAndExecuteMovement(
    state,
    {
      action: "approve_use",
      amount_usd: 200,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Convert reserve into committed spend.",
      opportunity_id: "opp-2026-03-26-100",
      approval_ticket_id: "apr-2026-03-26-100",
    },
    { now: "2026-03-26T10:03:00.000Z" }
  );
  assert.equal(state.account.available_usd, 750);
  assert.equal(state.account.reserved_usd, 50);
  assert.equal(state.account.committed_usd, 200);

  submitAndExecuteMovement(
    state,
    {
      action: "withdraw",
      amount_usd: 100,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Withdraw idle capital.",
    },
    { now: "2026-03-26T10:04:00.000Z" }
  );
  assert.equal(state.account.available_usd, 650);
  assert.equal(state.ledger.length, 4);

  const integrity = verifyLedgerIntegrity(state);
  assert.equal(integrity.ok, true);
});

test("ledger integrity detects chain tampering", () => {
  const state = createEmptyCapitalState({}, "2026-03-26T10:00:00.000Z");
  submitAndExecuteMovement(
    state,
    {
      action: "deposit",
      amount_usd: 200,
      requested_by: "owner_operator",
      performed_by: "owner_operator",
      authorized_by: "owner_operator",
      reason: "Seed capital.",
    },
    { now: "2026-03-26T10:01:00.000Z" }
  );

  state.ledger[0].amount_usd = 999;
  const integrity = verifyLedgerIntegrity(state);
  assert.equal(integrity.ok, false);
  assert.match(integrity.errors[0], /hash mismatch/i);
});
