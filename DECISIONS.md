# Decisions

Important decisions go here so the project keeps operational memory.

## Decision log template

```md
## YYYY-MM-DD

### Decision
One-sentence decision.

### Why
Why this is the right move now.

### Tradeoff
What is gained and what is given up.

### Revisit later
Yes or No.
If yes, define the trigger.
```

## 2026-03-25

### Decision
Use the existing Prompt Lab workspace as ARC Holdings OS planning system.

### Why
The architecture already supports specs, prompts, context, evals, and iteration.

### Tradeoff
Requires targeted rewrites, but avoids creating a parallel planning repo.

### Revisit later
No.

## 2026-03-25

### Decision
Version 1 requires human approval on consequential actions.

### Why
Financial, marketplace, and policy actions require trust and auditability.

### Tradeoff
Less automation initially, more safety and realism.

### Revisit later
Yes.
Trigger: stable workflow plus audit trail quality.

## 2026-03-25

### Decision
Office simulation is a representation layer, not a game layer.

### Why
This preserves operational clarity and avoids visual drift.

### Tradeoff
Some fun ideas are intentionally rejected.

### Revisit later
No.

## 2026-03-26

### Decision
Standardize prompt outputs with shared contracts in [specs/contracts.md](./specs/contracts.md).

### Why
A single shape system reduces handoff ambiguity and accelerates implementation.

### Tradeoff
Slightly more structure in prompts, less output flexibility.

### Revisit later
Yes.
Trigger: implementation proves specific fields are unnecessary or missing.

## 2026-03-26

### Decision
Consolidate duplicate templates and fragmented experiments into single sources.

### Why
Lean structure improves maintainability and reduces context switching.

### Tradeoff
Less file granularity, better coherence.

### Revisit later
No.
