# UX Spec

## UX goal

Make ARC Holdings OS feel like a living company while keeping the interface low-clutter, scannable, and decision-first.

## Design principles

- show company state at a glance
- emphasize priorities, blockers, and approvals
- keep controls and status language consistent
- ensure each visual cue maps to real state

## Core screen regions

- office canvas
- selected agent/opportunity detail panel
- shared company board
- approval queue
- KPI strip

## Contract-driven UX mapping

- detail panel reads `OpportunityRecord` and `HandoffPacket`
- approval queue reads `ApprovalTicket`
- agent cards read `AgentStatusCard`
- board reads `CompanyBoardSnapshot`

## ADHD-friendly rules

- main state readable in seconds
- minimal hidden state
- no dense control clusters
- explicit next actions

## Interaction states (v1)

- agent selected
- opportunity selected
- awaiting approval
- blocked
- alert active
- board updated

## Visual guardrails

- avoid decorative clutter
- avoid fake "AI thinking" cues
- avoid dashboard overload with tiny metrics
- use motion only to reinforce state change
