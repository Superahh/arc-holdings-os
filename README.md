# ARC Holdings OS

ARC Holdings OS is a markdown-first Prompt Lab workspace for running a lean, multi-agent company OS around used-electronics opportunities.

Core philosophy:

- reusable prompts
- explicit specs
- repeatable evals
- durable context
- tight iteration loops

## Current runtime slice (v1)

The current UI/runtime slice is an operator-facing workflow shell that derives deterministic decision text per opportunity for:

- recommendation readiness
- handoff actionability
- execution readiness
- monetization readiness
- compact operator route summary
- approval decision consequences
- read-only capital posture visibility plus user-controlled withdrawal request/approve/cancel actions

No new lanes or visual systems are introduced in this slice. Existing UI locations are reused for clearer operator actions.

## What this repo is for

Use this repo to:

- define product, workflow, and policy boundaries
- keep agent roles and handoffs explicit
- design office simulation as a view of true company state
- produce reusable prompt assets that emit contract-shaped outputs
- evaluate quality and log revisions

## How it works (runtime + UI)

1. Runtime ingests workflow state, approval queue items, and latest run artifacts.
2. Runtime builds a UI snapshot in `runtime/ui_snapshot.js`.
3. Snapshot derivation computes compact operational fields for recommendation, handoff, execution, monetization, operator route summary, approval consequences, and capital controls.
4. UI reads those fields and renders text only in existing cards/panels, including read-only capital buckets and pending withdrawal requests.
5. Writable UI actions remain narrow and confirmation-gated: approval decisions and withdrawal request/approve/cancel/reject only.
6. Deposit/reserve/release_reserve/approve_use remain runtime-manual (CLI/operator) and no autonomous capital movement is allowed.

### Current workflow semantics (decision stack)

- `operational_recommendation`: whether to proceed, wait, hold, or reject.
- `operational_handoff`: whether ownership transfer is ready, blocked, waiting, or must return.
- `operational_execution`: whether execution can start now, is waiting on intake/parts, is blocked, or is not applicable.
- `operational_market`: whether market action can start now, is waiting on pricing/listing, is blocked, or is not applicable.
- `operational_route`: compact operator-facing route that synthesizes recommendation + handoff + execution + market.
- approval queue items include deterministic decision-consequence summaries so approve/reject/more-info outcomes are explicit before action.

### Current execution readiness model (v1)

- `execution_ready`: execution can start now.
- `execution_waiting_intake`: execution path is valid, but approval/verification/intake acceptance is still pending.
- `execution_waiting_parts`: repair path needs parts/quote readiness.
- `execution_blocked`: hard blocker prevents execution (canonical blocker text reused).
- `execution_not_applicable`: reject/terminal path, execution should not start.

### Current monetization readiness model (v1)

- `market_ready`: market action can start now.
- `market_waiting_pricing`: pricing prerequisite is missing.
- `market_waiting_listing`: listing preparation is still incomplete.
- `market_blocked`: hard blocker prevents market action (canonical blocker text reused).
- `market_not_applicable`: decision path should not proceed to market action.

### Snapshot payload additions used by UI

Per opportunity, snapshot now includes:

- `execution_state`
- `execution_label`
- `execution_reason`
- `execution_next_step`
- `execution_clear_condition`

Execution fields are also grouped under `operational_execution` for direct UI consumption.

Per opportunity, snapshot also includes:

- `market_state`
- `market_label`
- `market_reason`
- `market_next_step`
- `market_clear_condition`

Market fields are also grouped under `operational_market` for direct UI consumption.

Per opportunity, snapshot also includes route summary fields:

- `operator_route_state`
- `operator_route_label`
- `operator_route_reason`
- `operator_route_next_step`

Route fields are also grouped under `operational_route` for direct UI consumption.

Per approval queue ticket item, snapshot now also includes:

- `approve_consequence`
- `reject_consequence`
- `more_info_consequence`
- `resume_owner`
- `resume_condition`

Snapshot also includes `capital_controls` fields used by UI:

- `account_snapshot.available_usd`
- `account_snapshot.reserved_usd`
- `account_snapshot.committed_usd`
- `account_snapshot.pending_withdrawal_usd`
- `capital_left_usd` (display alias of `available_usd`)
- `latest_request`
- `pending_withdrawal_requests`
- `recent_ledger_entries`
- `ledger_integrity`

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
- [ui/](./ui): first visible desktop shell over runtime state and contract outputs

## First files to open

- [specs/product_spec.md](./specs/product_spec.md)
- [specs/workflow_spec.md](./specs/workflow_spec.md)
- [specs/contracts.md](./specs/contracts.md)
- [specs/automation_policy.md](./specs/automation_policy.md)
- [prompts/tasks/opportunity_evaluation.md](./prompts/tasks/opportunity_evaluation.md)
- [IMPLEMENTATION_HANDOFF_CHECKLIST.md](./IMPLEMENTATION_HANDOFF_CHECKLIST.md)
- [runtime/README.md](./runtime/README.md)
- [ui/README.md](./ui/README.md)

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

Runtime/UI validation relevant to this slice:

```powershell
node --test runtime/tests/ui_snapshot.test.js runtime/tests/ui_server.test.js
```

Run the visible UI shell:

```powershell
node ui/server.js
```
