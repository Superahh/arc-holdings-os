# Workflow Spec

## Purpose

Define the v1 operating flow from opportunity intake to outcome logging with explicit contracts and approvals.

## Version 1 workflow

1. Opportunity discovered
2. Opportunity normalized
3. Valuation assessment
4. Risk and compliance review
5. Routing recommendation
6. CEO prioritization
7. Approval gate (when required)
8. Execution (acquire/skip/route)
9. Monetization execution
10. Outcome logging and iteration

## Stage contracts

### 1) Opportunity discovered

- output: initial `OpportunityRecord`
- checks: duplicate filter, obvious junk filter

### 2) Opportunity normalized

- output: updated `OpportunityRecord`
- checks: missing fields, confidence level

### 3) Valuation assessment

- output: enriched `OpportunityRecord`
- checks: value range, path comparison, cost realism

### 4) Risk and compliance review

- output: enriched `OpportunityRecord`
- checks: fraud, policy, legal, operational risk flags

### 5) Routing recommendation

- output: `HandoffPacket` to CEO
- checks: recommended path and fallback path

### 6) CEO prioritization

- output: routed `HandoffPacket` to next owner
- checks: capital exposure, queue priority, blocker impact

### 7) Approval gate

- output: `ApprovalTicket`
- checks: recommendation, exposure, risk summary, deadline

### 8) Execution

- output: workflow state update + `HandoffPacket`
- checks: decision recorded, next owner explicit

### 9) Monetization execution

- output: status updates and route outcome notes
- checks: pricing/listing actions remain approval-aware

### 10) Outcome logging

- output: eval entry in wins/failures/benchmarks
- checks: expected vs realized result noted

## Failure states

- insufficient data
- weak economics
- elevated fraud or policy risk
- budget constrained
- blocked operational capacity

## Metrics to watch

- qualified opportunity rate
- approval conversion rate
- realized margin vs expected margin
- time in stage
- blocked task count
- contract conformance rate
