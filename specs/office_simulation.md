# Office Simulation

## Purpose

Define how office visuals represent live company operations without decorative drift.

## Core rule

Every visible element must map to a real workflow state, task, risk, or KPI.

## Required v1 visual elements

- top-down office layout
- department zones
- per-agent status cards
- shared company board
- approval and alert indicators

## Contract-backed UI data

Office simulation should be driven by:

- `AgentStatusCard` for agent tiles/bubbles
- `CompanyBoardSnapshot` for board area
- `ApprovalTicket` count/status for approval queue indicators

## Agent status states

- idle
- working
- blocked
- awaiting_approval
- alert

## Bubble content rules

Bubbles may include only:

- active task
- blocker
- approval request
- risk warning
- concise progress note

No personality filler.

## Visual intensity rules

- minimal motion in v1
- no animation-first design
- prioritize readability and queue clarity
- highlight blockers and approvals first

## Anti-patterns

- decorative rooms without operational meaning
- fake chatter that hides decisions
- visual complexity that obscures risk or priority
