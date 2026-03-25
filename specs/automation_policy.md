# Automation Policy

## Purpose

Define what can be automated, what must stay approval-gated, and what is out of bounds in v1.

## Operating principle

Automation is allowed only when it is legal, safe, auditable, and operationally realistic.

## Approval-gated actions (v1)

These actions must emit an `ApprovalTicket`:

- acquisition actions
- pricing and listing actions
- outbound actions with real consequences
- policy overrides
- actions that move money or commit inventory

Capital-control interpretation:

- capital movement intents must be explicit (`deposit`, `reserve`, `approve_use`, `release_reserve`, `withdraw`)
- no capital movement executes without operator authorization and audit trail

## Conditionally automatable

- duplicate detection
- normalization helpers
- low-risk routing suggestions
- KPI and status summaries

## Not allowed

- illegal or deceptive behavior
- hidden automation that user cannot inspect
- unsupervised financial commitments
- reliance on unsupported credentials

## Audit expectations

Every recommendation should expose:

- what was recommended
- which agent produced it
- key assumptions
- whether approval is required
- which contract output was emitted

## Integration rule

Version 1 should not depend on user-supplied API keys during normal operation.

## Writable UI sequencing rule

When writable UI is introduced:

1. first writable UI surface must be approval decisioning only (`approve|reject|request_more_info`)
2. capital movement writes remain disabled until capital contracts and audit rails are implemented end-to-end
