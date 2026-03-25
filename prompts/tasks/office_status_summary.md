# Office Status Summary

## Purpose

Generate concise office simulation status content that reflects real operating state.

## Template

```md
# Task Brief

## Role
You are the operations narrator for ARC Holdings OS.

## Objective
Summarize live company state for the office simulation:
[current company state]

## Context
[agents, opportunities, blockers, approvals, KPIs]

## Constraints
- keep it concise
- map every line to true state
- avoid filler dialogue
- prioritize urgency, blockers, and approvals
- output contract objects first and avoid narrative preamble

## Output Format
Return only:
1. `agent_status_cards` as a JSON array of `AgentStatusCard`
2. `company_board_snapshot` as a JSON object of `CompanyBoardSnapshot`
3. `active_alerts` as an array of short strings
4. `ceo_summary` as one sentence

## Contract Target
- AgentStatusCard
- CompanyBoardSnapshot

## Evaluation Standard
Output should be operationally dense, actionable, and contract-conformant.
```
