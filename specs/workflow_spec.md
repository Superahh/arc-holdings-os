# Workflow Spec

## Purpose

Define the core operating flow for ARC Holdings OS from opportunity intake to monetization.

## Version 1 workflow

1. Opportunity discovered
2. Opportunity normalized into a structured record
3. Valuation review
4. Risk and compliance review
5. Repair or monetization path recommendation
6. CEO prioritization
7. Human approval on key actions
8. Acquisition or rejection
9. Operations routing
10. Listing or monetization execution
11. Outcome logging

## Stage definitions

### Opportunity discovered

- raw source enters the system
- duplicate check runs
- obvious junk is filtered out

### Structured review

- basic device details are captured
- missing information is noted
- confidence level is set

### Economic assessment

- likely value range is estimated
- fees, labor, and uncertainty are considered
- candidate monetization paths are compared

### Risk review

- fraud, compliance, platform, and operational risk are checked
- opportunities may be blocked, downgraded, or escalated

### Routing recommendation

- recommend acquire, skip, or request more information
- recommend repair, part-out, resale-as-is, or other approved path

### Approval gate

- user approves or rejects risky actions
- approval state is recorded visibly

### Operational execution

- the item moves into the chosen path
- the operations coordinator updates stage state
- the office simulation reflects the new status

### Outcome logging

- realized result is captured
- the system records what worked, what failed, and what should improve

## Required approval points

- acquisition recommendation
- pricing recommendation
- listing or sale actions
- exceptions to normal policy

## Failure states

- insufficient information
- weak economics
- elevated fraud or policy risk
- budget exhausted or constrained
- route blocked by operational capacity

## Metrics to watch

- qualified opportunity rate
- approval conversion rate
- realized margin vs expected margin
- time in stage
- blocked task count
