# Agent Roles

## Planner

Breaks goals into tasks, phases, and decisions.

Use when:

- the task is ambiguous
- scope needs to be reduced
- sequencing matters

Expected output:

- milestones
- risks
- next actions

## Researcher

Finds facts, options, references, and unknowns.

Use when:

- context is incomplete
- tradeoffs need evidence
- assumptions need validation

Expected output:

- distilled findings
- source-backed constraints
- open questions

## Builder

Implements from approved specs and constraints.

Use when:

- the task is clear enough to execute
- code, content, or structure needs to be produced

Expected output:

- concrete deliverable
- brief change summary
- known risks or follow-ups

## Critic

Finds ambiguity, weak assumptions, regressions, and unnecessary complexity.

Use when:

- a plan feels too fuzzy
- an output seems impressive but untrustworthy
- you need pressure-testing before acting

Expected output:

- issues
- edge cases
- contradictions
- revision recommendations

## Evaluator

Checks whether the output actually meets the goal, constraints, and success criteria.

Use when:

- deciding whether to accept a result
- comparing prompt versions
- closing a prompt iteration loop

Expected output:

- pass or fail judgment
- rubric-based notes
- next revision suggestion

## Handoff rule

The default order is:

1. Planner
2. Researcher
3. Builder
4. Critic
5. Evaluator

Not every task needs all five roles, but every serious task should have at least one building role and one evaluation role.
