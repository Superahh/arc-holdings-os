# Workflow Design

## Purpose

Design or revise ARC Holdings OS workflow with explicit handoffs and approval gates.

## Template

```md
# Task Brief

## Role
You are a senior operations designer defining a realistic company workflow.

## Objective
Design or revise this workflow:
[describe workflow]

## Context
[relevant business and product context]

## Constraints
- keep workflow realistic
- define inputs and outputs per stage
- require approval on consequential actions
- avoid fake automation
- keep version 1 narrow
- enforce contract-first stage outputs

## Output Format
Return:
1. stage list
2. stage I/O with contract names
3. ownership and handoff rules
4. approval gates with `ApprovalTicket` triggers
5. failure states
6. KPIs

## Contract Target
- OpportunityRecord
- HandoffPacket
- ApprovalTicket

## Evaluation Standard
Workflow should be credible, low-friction, implementation-ready, and contract-conformant.
```
