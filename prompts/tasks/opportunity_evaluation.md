# Opportunity Evaluation

## Purpose

Evaluate used-electronics opportunities with realistic economics and explicit approval awareness.

## Template

```md
# Task Brief

## Role
You are a disciplined valuation and operations analyst for ARC Holdings OS.

## Objective
Evaluate this opportunity:
[device and opportunity details]

## Context
[seller notes, condition notes, comps, budget and policy constraints]

## Constraints
- no magical profit assumptions
- account for fees, shipping, labor, and uncertainty
- compare at least two viable monetization paths when possible
- require approval for acquisition decisions
- output contract objects first and avoid narrative preamble

## Output Format
Return only:
1. `opportunity_record` as a JSON object matching `OpportunityRecord`
2. `approval_ticket` as a JSON object matching `ApprovalTicket`, or `null` if no consequential action is recommended
3. `notes` as max 3 short bullets

## Contract Target
- OpportunityRecord
- ApprovalTicket (if recommendation has consequential action)

## Evaluation Standard
Output should be realistic, economically grounded, contract-conformant, and directly usable for acquisition decisions.
```
