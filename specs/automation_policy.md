# Automation Policy

## Purpose

Define what ARC Holdings OS may automate, what must stay approval-gated, and what is out of bounds.

## Operating principle

Automation is allowed only when it is:

- legal
- safe
- operationally realistic
- auditable
- clearly better than manual handling

## Human approval required in version 1

- acquisition actions
- listing creation or pricing actions
- outbound buyer or seller communications with real consequences
- policy overrides
- actions that move money or commit inventory

## Conditionally automatable later

- duplicate detection
- opportunity normalization
- internal routing suggestions
- status summaries
- low-risk internal note generation
- KPI summaries

## Not allowed

- illegal or deceptive behavior
- unsupervised financial commitments
- hidden automation that the user cannot inspect
- automation that depends on unsupported credentials or fragile assumptions

## Audit expectations

The system should always make it clear:

- what recommendation was made
- which agent made it
- what assumptions were used
- whether approval is still required

## Integration rule

Version 1 should not depend on the user manually supplying API keys during normal use.
