# Prompt Lab

Prompt Lab is a markdown-first workspace for treating prompts like product assets instead of disposable chat messages.

## Core idea

- Prompts get versions.
- Prompts get tests.
- Prompts get supporting docs.
- Prompts get refined from failures, not vibes.

## What this repo is for

Use this repo to:

- define the product and technical context behind a prompt
- write reusable system and task prompts
- evaluate outputs against explicit criteria
- log failures and improvements over time
- build a repeatable prompt engineering loop

## Operating loop

1. Define the goal in [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).
2. Narrow the work in [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md).
3. Capture product and technical context in [`specs/`](./specs).
4. Write or revise prompts in [`prompts/`](./prompts).
5. Run the prompt on a real task.
6. Log what failed in [`evals/failure_log.md`](./evals/failure_log.md).
7. Record improvements in [`CHANGELOG.md`](./CHANGELOG.md) and [`DECISIONS.md`](./DECISIONS.md).

## Fast start

If you just want the shortest operating flow, use [`RUNBOOK.md`](./RUNBOOK.md).

## Repo map

- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md): what this project is and what "done" means
- [`RUNBOOK.md`](./RUNBOOK.md): simplest operating flow for new ideas, debugging, and feature planning
- [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md): active milestone, blockers, next actions
- [`DECISIONS.md`](./DECISIONS.md): important choices and tradeoffs
- [`specs/`](./specs): product, technical, UX, role, constraint, and success specs
- [`prompts/`](./prompts): reusable system prompts, task prompts, and templates
- [`context/`](./context): background notes, assumptions, glossary, and examples
- [`evals/`](./evals): tests, failures, wins, and benchmark comparisons
- [`experiments/`](./experiments): controlled prompt trials and iteration notes

## Best files to start with

- [`README.md`](./README.md)
- [`RUNBOOK.md`](./RUNBOOK.md)
- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)
- [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md)
- [`specs/product_spec.md`](./specs/product_spec.md)
- [`specs/constraints.md`](./specs/constraints.md)
- [`prompts/templates/prompt_template.md`](./prompts/templates/prompt_template.md)
- [`evals/failure_log.md`](./evals/failure_log.md)

## Style rules

- Keep sections short.
- Use strong headings.
- Prefer checklists when action matters.
- Make current state obvious.
- Keep one source of truth per topic.
- Avoid giant graveyard docs that never get updated.

## Naming note

The current working name is `Prompt Lab`. If the project later gets renamed to `Spec Forge`, the structure can stay the same.
