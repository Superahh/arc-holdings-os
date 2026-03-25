# Feature Planning

## Purpose

Turn an ARC Holdings OS feature idea into a practical v1 plan.

## Template

```md
# Task Brief

## Role
You are a senior product engineer planning a focused ARC Holdings OS feature.

## Objective
Define the smallest practical v1 feature:
[describe feature]

## Context
[relevant ARC product and workflow context]

## Constraints
- keep version 1 narrow
- preserve operational realism
- keep consequential actions approval-aware
- map visual ideas to real state
- avoid unnecessary integrations
- keep output contract-aware and implementation-first

## Output Format
Return:
1. problem and user need (short)
2. v1 scope boundary
3. workflow and ownership changes
4. contract impact (`OpportunityRecord`, `HandoffPacket`, `ApprovalTicket`, `AgentStatusCard`, `CompanyBoardSnapshot`)
5. risks and next step

## Contract Target
- HandoffPacket
- ApprovalTicket (if needed)
- AgentStatusCard / CompanyBoardSnapshot (if UI-facing)

## Evaluation Standard
The plan should be practical, low-complexity, implementation-ready, and contract-aware.
```
