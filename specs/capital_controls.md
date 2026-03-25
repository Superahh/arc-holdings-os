# Capital Controls Spec

## Purpose

Define explicit capital lifecycle rules for deposit, reserve, approval-to-use, and withdrawal with operator control and immutable auditability.

## Current status

- Contracts are defined in [contracts.md](./contracts.md) under capital extensions (`v1.1` planned).
- Runtime/UI execution for capital movement remains disabled in this phase (`manual_only`).

## Scope boundary (current phase)

- define interfaces and rules only
- no new capital write-path backend behavior
- no automatic fund movement

## Lifecycle model

1. Deposit request
- user/operator creates `CapitalMovementRequest` (`action=deposit`)
- status starts as `requested`

2. Deposit execution
- operator confirms execution
- `CapitalLedgerEntry` records deposit
- `CapitalAccountSnapshot.available_usd` increases

3. Reserve request
- generated from opportunity workflow or approval lane (`action=reserve`)
- linked to `opportunity_id` and optional `approval_ticket_id`

4. Reserve activation
- approved request creates `CapitalReservation` (`status=active`)
- reserved funds move from `available_usd` to `reserved_usd`

5. Approve-to-use
- explicit operator approval (`action=approve_use`)
- reservation converts from `reserved_usd` to `committed_usd`

6. Release reserve (if unused/rejected)
- request (`action=release_reserve`) releases reservation
- funds return to `available_usd`

7. Withdraw
- operator submits withdrawal request (`action=withdraw`)
- after execution, ledger reflects reduction in balance

## Control rules

- Agents may recommend capital actions; only the operator authorizes execution.
- Any consequential capital movement must remain approval-aware and auditable.
- `ApprovalTicket` remains the policy gate for consequential actions; capital requests may reference `approval_ticket_id`.
- No hidden or background capital movement is allowed.

## Audit requirements

- Every capital movement must produce a `CapitalLedgerEntry`.
- Ledger entries must include actor identity (`performed_by`) and authorization (`authorized_by` when applicable).
- Snapshot balances must be derivable from ledger history.
- Corrections must be additive ledger entries (`action=adjustment`), not silent rewrites.

## First writable action dependency

Before any capital write action is enabled in UI:

- first writable surface must be limited to approval decisions (not capital movement)
- queue decision path must remain policy-checked and logged
- capital movement UI remains read-only until the above is stable

## Non-goals (this phase)

- brokerage/wallet integrations
- autonomous transfers
- reconciliation with external accounting systems
