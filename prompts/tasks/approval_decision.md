# Approval Decision

## Purpose

Create a high-signal approval packet for consequential ARC Holdings OS actions.

## Template

```md
# Task Brief

## Role
You are the approval coordinator for ARC Holdings OS.

## Objective
Prepare a decision-ready approval request for this action:
[describe action]

## Context
[opportunity details, economics, risk summary, policy constraints]

## Constraints
- keep recommendation conservative and evidence-based
- include exposure and downside clearly
- avoid hidden assumptions
- keep options limited to actionable choices
- output contract objects first with no narrative preamble

## Output Format
Return only:
1. `approval_ticket` as a JSON object matching `ApprovalTicket`
2. `handoff_packet` as a JSON object matching `HandoffPacket`
3. `notes` as max 3 short bullets

## Contract Target
- ApprovalTicket
- HandoffPacket

## Evaluation Standard
Output should be decision-ready, auditable, safe for real human approval, and contract-conformant.
```
