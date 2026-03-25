# RUNBOOK

This is the shortest path for using ARC Holdings OS planning docs without overthinking it.

## For a new product idea or direction change

1. Write or update [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).
2. Set [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md).
3. Add relevant constraints in [`specs/constraints.md`](./specs/constraints.md).
4. Update the relevant spec in [`specs/`](./specs).
5. Run the prompt.
6. Log the result in [`evals/failure_log.md`](./evals/failure_log.md) or [`evals/wins.md`](./evals/wins.md).
7. Revise the prompt or spec if needed.

## For a new agent

1. Update [`specs/agent_roles.md`](./specs/agent_roles.md).
2. Define the job, goals, inputs, outputs, constraints, handoffs, and KPIs.
3. Use [`prompts/tasks/agent_design.md`](./prompts/tasks/agent_design.md).
4. Record scope or hierarchy decisions in [`DECISIONS.md`](./DECISIONS.md).

## For workflow design or revision

1. Update [`specs/workflow_spec.md`](./specs/workflow_spec.md).
2. Use [`prompts/tasks/workflow_design.md`](./prompts/tasks/workflow_design.md).
3. Require human approval points and failure states.
4. Reject steps that depend on magical automation.

## For UI and office simulation work

1. Update [`specs/ux_spec.md`](./specs/ux_spec.md) and [`specs/office_simulation.md`](./specs/office_simulation.md).
2. Use [`prompts/tasks/ui_generation.md`](./prompts/tasks/ui_generation.md).
3. Require visual element to business meaning mapping.
4. Cut any visual concept that does not improve clarity, motivation, or decision quality.

## For debugging

1. Gather the error, context, logs, and affected files.
2. Use [`prompts/tasks/bug_hunting.md`](./prompts/tasks/bug_hunting.md).
3. Require root cause, fix approach, and verification steps.
4. Save any useful pattern into [`context/examples.md`](./context/examples.md).

## For prompt revision

1. Run the prompt on a real ARC task.
2. Log failures in [`evals/failure_log.md`](./evals/failure_log.md).
3. Compare the output against [`specs/success_criteria.md`](./specs/success_criteria.md).
4. Revise the prompt with the smallest useful improvement.

## Minimal rule

If a visual idea is not tied to company state, cut it.
If a workflow step is not operationally realistic, cut it.
If a prompt was useful, preserve it.
If a prompt failed, log why and revise it.
