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

## 2026-03-26

### Decision
Define capital controls as explicit contracts (`CapitalAccountSnapshot`, `CapitalMovementRequest`, `CapitalReservation`, `CapitalLedgerEntry`) before enabling capital write paths.

### Why
This keeps capital behavior operator-controlled, auditable, and implementation-ready without introducing unsafe mutation paths early.

### Tradeoff
Adds contract/planning overhead now, but reduces ambiguity and rework when capital writes are implemented.

### Revisit later
Yes.
Trigger: first runtime implementation of capital movement and ledger persistence.

## 2026-03-26

### Decision
Set the first writable UI action surface to approval decision submission only (`approve|reject|request_more_info`).

### Why
Approval decisioning already has policy checks and audit trail rails in runtime, making it the narrowest safe write entry point.

### Tradeoff
Capital movement and broader UI writes are delayed until capital-control implementation catches up.

### Revisit later
Yes.
Trigger: writable approval flow is stable and capital ledger contracts are implemented end-to-end.

## 2026-03-26

### Decision
Keep room-transition controls read-only through v1 (no writable transition endpoint).

### Why
Room-transition behavior is currently a simulation clarity layer, and policy/audit boundaries are defined but not yet proven in production flows.

### Tradeoff
Operators can preview and validate transitions but cannot commit transition writes yet; this delays flexibility in exchange for lower architectural risk.

### Revisit later
Yes.
Trigger: room-transition validator usage is stable and audit expectations are proven in real operator loops.

## 2026-03-26

### Decision
Use explicit evidence thresholds before reconsidering writable room-transition promotion.

### Why
This keeps promotion criteria objective and prevents premature expansion of write surfaces.

### Tradeoff
Potentially slower promotion timeline, but better safety and audit confidence.

### Revisit later
Yes.
Trigger: evidence summary (`room_transition_evidence_cli`) meets thresholds for a rolling 7-day window.
