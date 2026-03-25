# RUNBOOK

Use this flow to operate ARC Holdings OS planning without overscoping.

## 1) Start from objective and boundary

1. Update [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).
2. Set active milestone in [CURRENT_FOCUS.md](./CURRENT_FOCUS.md).
3. Confirm non-negotiables in [specs/constraints.md](./specs/constraints.md).

## 2) Lock interface contracts before prompt churn

1. Check [specs/contracts.md](./specs/contracts.md).
2. If output shape is unclear, define or revise the contract first.
3. Keep contract changes minimal and explicit.

## 3) Revise specs and prompts

1. Update relevant docs in [specs/](./specs).
2. Use task prompts from [prompts/tasks/](./prompts/tasks).
3. Keep outputs implementation-oriented and contract-shaped.

## 4) Run and evaluate

1. Run prompt on a realistic scenario.
2. Evaluate against [specs/success_criteria.md](./specs/success_criteria.md).
3. Log failures in [evals/failure_log.md](./evals/failure_log.md) and wins in [evals/wins.md](./evals/wins.md).
4. Add/refresh repeatable checks in [evals/test_cases.md](./evals/test_cases.md).
5. Run quality gate: `node tools/run_quality_checks.js --root .`.

## 5) Record memory and next step

1. Capture decisions in [DECISIONS.md](./DECISIONS.md).
2. Record what changed in [CHANGELOG.md](./CHANGELOG.md).
3. Add experiment notes in [experiments/prompt_iterations.md](./experiments/prompt_iterations.md).

## 6) Implementation handoff gate

1. Run [IMPLEMENTATION_HANDOFF_CHECKLIST.md](./IMPLEMENTATION_HANDOFF_CHECKLIST.md).
2. Confirm all contract, prompt, and eval checks pass.
3. Start implementation only after checklist sign-off.

## Practical guardrails

- If a visual element has no operational meaning, cut it.
- If a workflow step is not realistic, cut it.
- If a prompt is one-off, template it or remove it.
- If risky action is proposed without approval ticket, reject it.
