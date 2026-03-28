# Capital Controls Spec

## Purpose

Define explicit capital lifecycle rules for deposit, reserve, approval-to-use, and withdrawal with operator control and immutable auditability.

## Current status

- Contracts are defined in [contracts.md](./contracts.md) under capital extensions (`v1.1`).
- Runtime capital execution now exists via manual/operator CLI with immutable ledger support.
- UI write scope is now intentionally narrow: withdrawal request/approve/cancel/reject only.
- Deposit/reserve/release/approve_use remain runtime-only (CLI/operator) in this phase.

## Scope boundary (current phase)

- implement runtime ledger-backed capital movement with strict manual/operator control
- keep UI writable actions narrow and confirmation-gated
- allow withdrawal request-first workflow in UI only
- keep deposit/reserve/release/approve_use runtime-only
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

7. Request withdrawal (UI-safe)
- operator creates `CapitalMovementRequest` (`action=request_withdrawal`, `status=requested`)
- on successful request creation, funds move from `available_usd` to `pending_withdrawal_usd`

8. Approve withdrawal (second explicit confirmation)
- operator explicitly approves pending request (`action=approve_withdrawal`)
- funds move from `pending_withdrawal_usd` out of account
- request status transitions to `executed`

9. Cancel or reject withdrawal request
- operator cancels/rejects pending request (`action=cancel_withdrawal|reject_withdrawal`)
- funds move from `pending_withdrawal_usd` back to `available_usd`
- request status transitions to `cancelled|rejected`

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
- Withdrawal execution must never happen implicitly from request creation.

## First writable action dependency

UI capital write actions must remain constrained to:

- `request_withdrawal`
- `approve_withdrawal` (requires second explicit confirmation)
- `cancel_withdrawal|reject_withdrawal`

All other capital write actions remain runtime-only until a later phase.

## Non-goals (this phase)

- brokerage/wallet integrations
- autonomous transfers
- reconciliation with external accounting systems
