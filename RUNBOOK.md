# RUNBOOK

This is the shortest path for using the system without overthinking it.

## For a new idea

1. Write or update [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).
2. Set [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md).
3. Add relevant constraints in [`specs/constraints.md`](./specs/constraints.md).
4. Choose or create a task prompt in [`prompts/tasks/`](./prompts/tasks).
5. Run the prompt.
6. Log the result in [`evals/failure_log.md`](./evals/failure_log.md) or [`evals/wins.md`](./evals/wins.md).
7. Revise the prompt or spec if needed.

## For debugging

1. Gather the error, context, logs, and affected files.
2. Use [`prompts/tasks/bug_hunting.md`](./prompts/tasks/bug_hunting.md).
3. Require root cause, fix approach, and verification steps.
4. Save any successful pattern into [`context/examples.md`](./context/examples.md).

## For feature planning

1. Update [`specs/product_spec.md`](./specs/product_spec.md).
2. Use [`prompts/tasks/feature_planning.md`](./prompts/tasks/feature_planning.md).
3. Require MVP-only output.
4. Log any scope creep or boundary decisions in [`DECISIONS.md`](./DECISIONS.md).

## Minimal rule

If a prompt was useful, preserve it.
If a prompt failed, log why and revise it.
