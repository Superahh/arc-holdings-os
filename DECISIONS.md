# Decisions

Important decisions go here so the project does not lose its own memory.

## Decision log template

```md
## YYYY-MM-DD

### Decision
Write the decision in one sentence.

### Why
Why this was chosen now.

### Tradeoff
What you gain and what you give up.

### Revisit later
Yes or No.
If yes, state the trigger for revisiting it.
```

## 2026-03-25

### Decision
Use the existing Prompt Lab workspace as the ARC Holdings OS planning system.

### Why
The workspace already has the right operating model: specs, prompts, constraints, evals, and revision loops.

### Tradeoff
Some generic language must be rewritten, but this is much lower risk than creating a second parallel planning repo.

### Revisit later
No.

## 2026-03-25

### Decision
Version 1 will require human approval on key actions.

### Why
Purchasing, marketplace activity, pricing, and fulfillment decisions have real financial and operational consequences.

### Tradeoff
The system will feel less autonomous at first, but it will be safer, more realistic, and easier to trust.

### Revisit later
Yes.
Revisit after the company workflow and audit trail are stable.

## 2026-03-25

### Decision
The office simulation is a presentation layer over real company state.

### Why
This keeps the interface motivating and memorable without letting the product drift into a fake game.

### Tradeoff
Some visually fun ideas will be cut if they do not improve clarity or decision-making.

### Revisit later
No.

## 2026-03-25

### Decision
Define the company hierarchy in one file first.

### Why
Keeping all core agents in [`specs/agent_roles.md`](./specs/agent_roles.md) makes version 1 easier to reason about and prevents prompt sprawl.

### Tradeoff
That file may get long, but it keeps the operating model centralized while the system is still forming.

### Revisit later
Yes.
Split only if the file becomes difficult to maintain.

## 2026-03-25

### Decision
Keep version 1 focused on one realistic opportunity pipeline.

### Why
This proves the company model without pretending to run an entire electronics empire on day one.

### Tradeoff
Coverage is narrower, but execution quality and implementation speed are much better.

### Revisit later
Yes.
Expand once the first pipeline is validated.
