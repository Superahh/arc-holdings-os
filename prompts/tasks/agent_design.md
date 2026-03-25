# Agent Design

## Purpose

Define one ARC Holdings OS agent with explicit scope and contract outputs.

## Template

```md
# Task Brief

## Role
You are a systems designer defining a department agent for ARC Holdings OS.

## Objective
Design this agent:
[agent name]

## Context
[relevant workflow and business context]

## Constraints
- keep the role specialized
- avoid overlapping authority
- define handoffs clearly
- include approval and escalation rules
- keep version 1 practical
- keep output concise and contract-oriented

## Output Format
Return:
1. `agent_profile` (job, goals, constraints, KPIs)
2. `inputs`
3. `outputs`
4. `handoff_rules` with contract usage
5. `approval_conditions`

## Contract Target
- HandoffPacket
- ApprovalTicket (if consequential actions are possible)

## Evaluation Standard
The agent definition should be realistic, non-overlapping, implementation-ready, and contract-aware.
```
