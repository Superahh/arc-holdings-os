# Benchmark Runs

Use this file to compare models, prompt versions, or output styles on the same task.

## Benchmark template

```md
## Benchmark name
[name]

## Date
[YYYY-MM-DD]

## Task
[task]

## Variants compared
- [model or prompt version]
- [model or prompt version]

## Contract target
[which contract(s) should be emitted]

## Criteria
- clarity
- practicality
- constraint adherence
- contract conformance
- revision friendliness

## Result summary
[winner and why]

## Notes
[observations]
```

## 2026-03-25

### Benchmark name
Contract-first output vs prose-first output

### Date
2026-03-25

### Task
Run golden scenario across:
- `prompts/tasks/opportunity_evaluation.md`
- `prompts/tasks/approval_decision.md`
- `prompts/tasks/office_status_summary.md`

### Variants compared
- v1 prompts (pre-tightening; narrative allowed before contracts)
- v2 prompts (contract-first JSON output rule)

### Contract target
- `OpportunityRecord`
- `ApprovalTicket`
- `HandoffPacket`
- `AgentStatusCard`
- `CompanyBoardSnapshot`

### Criteria
- clarity
- practicality
- constraint adherence
- contract conformance
- revision friendliness

### Result summary
v2 wins. Both variants can produce correct business reasoning, but v2 is materially better for implementation because contract objects are consistently first and easier to validate programmatically.

### Notes
- v1 showed occasional narrative preamble risk.
- v2 removed that risk by tightening output rules.
- Use v2 as baseline for future prompt iterations.

## Suggested ARC benchmarks

- opportunity evaluation prompt v2 vs v3 (`OpportunityRecord` quality)
- office status summary with and without strict status-card format
- workflow design with and without explicit `ApprovalTicket` requirement
