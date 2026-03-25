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

Intermediate presence layer for the first visible shell:

- visible agent avatars anchored to real department zones
- state-driven motion cues tied to agent status
- task or blocker bubbles tied to live workflow state
- no free-roaming movement until handoff/location state exists

Deterministic movement foundation:

- `office.events` provides read-only operational transition signals
- `office.zone_anchors` provides explicit spatial anchors and connection graph
- `office.route_hints` provides deterministic handoff waypoints
- client rendering should expose zone connection rails and highlight only state-backed active routes
- future room-to-room walking must route through these contracts (no random movement)

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
- use avatar/bubble motion only to reinforce state

## Anti-patterns

- decorative rooms without operational meaning
- fake chatter that hides decisions
- visual complexity that obscures risk or priority
