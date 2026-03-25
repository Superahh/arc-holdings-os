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
