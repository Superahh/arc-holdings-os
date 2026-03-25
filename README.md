# ARC Holdings OS

ARC Holdings OS is a markdown-first Prompt Lab workspace for running a lean, multi-agent company OS around used-electronics opportunities.

Core philosophy:

- reusable prompts
- explicit specs
- repeatable evals
- durable context
- tight iteration loops

## What this repo is for

Use this repo to:

- define product, workflow, and policy boundaries
- keep agent roles and handoffs explicit
- design office simulation as a view of true company state
- produce reusable prompt assets that emit contract-shaped outputs
- evaluate quality and log revisions

## Operating loop

1. Update [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) and [CURRENT_FOCUS.md](./CURRENT_FOCUS.md).
2. Lock constraints and interfaces in [specs/constraints.md](./specs/constraints.md) and [specs/contracts.md](./specs/contracts.md).
3. Draft or revise docs/prompts.
4. Run prompts on real scenarios.
5. Evaluate against [specs/success_criteria.md](./specs/success_criteria.md).
6. Log outcomes in [evals/](./evals).
7. Record decisions and cuts in [DECISIONS.md](./DECISIONS.md).

## Repo map

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md): product target and definition of done
- [CURRENT_FOCUS.md](./CURRENT_FOCUS.md): active milestone and next actions
- [RUNBOOK.md](./RUNBOOK.md): practical execution flow
- [IMPLEMENTATION_HANDOFF_CHECKLIST.md](./IMPLEMENTATION_HANDOFF_CHECKLIST.md): contract-to-prompt-to-eval build handoff gate
- [DECISIONS.md](./DECISIONS.md): durable decision memory
- [specs/](./specs): product, workflow, UX, policy, and interface contracts
- [prompts/system/](./prompts/system): reusable system roles
- [prompts/tasks/](./prompts/tasks): reusable task prompts
- [prompts/templates/](./prompts/templates): prompt and eval templates
- [context/](./context): domain assumptions and examples
- [evals/](./evals): test cases, wins, failures, benchmarks
- [experiments/prompt_iterations.md](./experiments/prompt_iterations.md): unified experiment log
- [runtime/](./runtime): implementation slice(s) aligned to frozen contracts

## First files to open

- [specs/product_spec.md](./specs/product_spec.md)
- [specs/workflow_spec.md](./specs/workflow_spec.md)
- [specs/contracts.md](./specs/contracts.md)
- [specs/automation_policy.md](./specs/automation_policy.md)
- [prompts/tasks/opportunity_evaluation.md](./prompts/tasks/opportunity_evaluation.md)
- [IMPLEMENTATION_HANDOFF_CHECKLIST.md](./IMPLEMENTATION_HANDOFF_CHECKLIST.md)
- [runtime/README.md](./runtime/README.md)

## Minimal rules

- keep v1 narrow
- map visuals to true state
- keep risky actions approval-gated
- avoid one-off prompt sprawl
- prefer small, reversible changes

## Quality checks

Run these from repo root:

```powershell
node tools/run_quality_checks.js --root .
```

Or run each command separately:

```powershell
node runtime/tests/run_all_tests.js
node tools/check_markdown_links.js --root .
```
