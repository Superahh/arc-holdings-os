# Prompt Iterations

Unified log for prompt experiments, revisions, and benchmark notes.

## Iteration entry template

```md
## Prompt
[name]

### Date
[YYYY-MM-DD]

### Version
[v1, v2, etc.]

### Hypothesis
[what change should improve]

### Change made
[what changed]

### Scenario used
[input context used]

### Contract target
[which contract(s) the output must match]

### Result
[what improved or regressed]

### Next move
[next revision]
```

## Recent iterations

## Prompt
`prompts/tasks/opportunity_evaluation.md`

### Date
2026-03-25

### Version
v2

### Hypothesis
JSON-first output instructions will reduce parse ambiguity and improve handoff safety.

### Change made
Switched output format to contract objects first, limited narrative to short notes.

### Scenario used
`context/examples.md` golden scenario `golden-2026-03-25-001`.

### Contract target
`OpportunityRecord`, `ApprovalTicket`.

### Result
Conformance improved; output became easier to validate and use directly in downstream steps.

### Next move
Run second scenario to stress test edge cases (`request_more_info` path).

## Prompt
`prompts/tasks/approval_decision.md`

### Date
2026-03-25

### Version
v2

### Hypothesis
Enforcing paired `ApprovalTicket` + `HandoffPacket` output will eliminate ambiguous approvals.

### Change made
Made dual-contract output mandatory and JSON-first.

### Scenario used
`context/examples.md` golden scenario `golden-2026-03-25-001`.

### Contract target
`ApprovalTicket`, `HandoffPacket`.

### Result
Conformant output with explicit owner, due-by, and blocker fields.

### Next move
Benchmark against a policy-override scenario.

## Prompt
`prompts/tasks/office_status_summary.md`

### Date
2026-03-25

### Version
v2

### Hypothesis
Contract-first status outputs will keep simulation summaries operationally grounded.

### Change made
Required JSON array of `AgentStatusCard` and single `CompanyBoardSnapshot` object.

### Scenario used
`context/examples.md` golden scenario `golden-2026-03-25-001`.

### Contract target
`AgentStatusCard`, `CompanyBoardSnapshot`.

### Result
Status output became compact, parseable, and decision-ready.

### Next move
Add regression test for multi-opportunity board state.

## Legacy experiment merge

### 2026-03-25 - Baseline vs structured prompt

- Question: does a structured six-part prompt improve practical output quality?
- Expected learning: structured prompt improves clarity, scope discipline, and revision quality.
- Status: migrated into this unified log; run as benchmark using current templates.

### 2026-03-25 - Constraint-light vs constraint-heavy

- Question: do explicit constraints reduce overbuilding and rework?
- Expected learning: constraint-heavy variant improves relevance and implementation readiness.
- Status: migrated into this unified log; run as benchmark with contract conformance scoring.

## Suggested next targets

- `prompts/tasks/workflow_design.md`
- `prompts/tasks/feature_planning.md`
- `prompts/system/core_assistant.md`
