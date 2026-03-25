# Implementation Handoff Checklist

Use this checklist to hand ARC Holdings OS from prompt/spec planning into implementation without contract drift.

## 1) Read-before-build

- [ ] Review [specs/product_spec.md](./specs/product_spec.md), [specs/workflow_spec.md](./specs/workflow_spec.md), and [specs/technical_spec.md](./specs/technical_spec.md).
- [ ] Confirm v1 freeze rules in [specs/contracts.md](./specs/contracts.md).
- [ ] Confirm safety and approval boundaries in [specs/automation_policy.md](./specs/automation_policy.md) and [specs/constraints.md](./specs/constraints.md).

## 2) Contract-to-prompt map

| Contract | Primary prompt producers | Core checks |
|---|---|---|
| `OpportunityRecord` | [prompts/tasks/opportunity_evaluation.md](./prompts/tasks/opportunity_evaluation.md), [prompts/tasks/workflow_design.md](./prompts/tasks/workflow_design.md) | Required fields present, enum values valid, recommendation is explicit |
| `HandoffPacket` | [prompts/tasks/approval_decision.md](./prompts/tasks/approval_decision.md), [prompts/tasks/workflow_design.md](./prompts/tasks/workflow_design.md), [prompts/tasks/agent_design.md](./prompts/tasks/agent_design.md) | `from_agent`, `to_agent`, `next_action`, `due_by` always populated |
| `ApprovalTicket` | [prompts/tasks/approval_decision.md](./prompts/tasks/approval_decision.md), [prompts/tasks/opportunity_evaluation.md](./prompts/tasks/opportunity_evaluation.md), [prompts/tasks/workflow_design.md](./prompts/tasks/workflow_design.md) | Consequential actions always gated, `max_exposure_usd` and `required_by` present |
| `AgentStatusCard` | [prompts/tasks/office_status_summary.md](./prompts/tasks/office_status_summary.md), [prompts/tasks/ui_generation.md](./prompts/tasks/ui_generation.md) | Status enum valid, task and urgency present, timestamp present |
| `CompanyBoardSnapshot` | [prompts/tasks/office_status_summary.md](./prompts/tasks/office_status_summary.md), [prompts/tasks/ui_generation.md](./prompts/tasks/ui_generation.md) | Priorities/alerts populated, counts numeric, capital note present |

## 3) Eval-to-contract gate

- [ ] Run the golden scenario in [context/examples.md](./context/examples.md) (`golden-2026-03-25-001`).
- [ ] Validate outputs against [evals/test_cases.md](./evals/test_cases.md) dry-run acceptance checks.
- [ ] Confirm latest benchmark outcome in [evals/benchmark_runs.md](./evals/benchmark_runs.md).
- [ ] Confirm at least one real failure and one real win are logged in [evals/failure_log.md](./evals/failure_log.md) and [evals/wins.md](./evals/wins.md).

## 4) Prompt conformance checks

- [ ] Task prompts output contract JSON first (no narrative preamble).
- [ ] Consequential actions generate `ApprovalTicket`.
- [ ] Cross-agent ownership changes generate `HandoffPacket`.
- [ ] Office status outputs include `AgentStatusCard` array and `CompanyBoardSnapshot`.
- [ ] Prompt templates in [prompts/templates/task_brief_template.md](./prompts/templates/task_brief_template.md) remain contract-first.

## 5) Implementation readiness sign-off

- [ ] Contract fields are frozen and accepted by implementer.
- [ ] No open ambiguity on workflow ownership or approval gates.
- [ ] Known risks and non-goals are acknowledged.
- [ ] Build can start without requiring new contract decisions.

## Sign-off record

```md
Date:
Reviewer:
Result: PASS / FAIL
Blocking issues:
- [issue]
Next action:
- [action]
```

## Latest execution (2026-03-25)

### 1) Read-before-build

- [x] Review [specs/product_spec.md](./specs/product_spec.md), [specs/workflow_spec.md](./specs/workflow_spec.md), and [specs/technical_spec.md](./specs/technical_spec.md).
- [x] Confirm v1 freeze rules in [specs/contracts.md](./specs/contracts.md).
- [x] Confirm safety and approval boundaries in [specs/automation_policy.md](./specs/automation_policy.md) and [specs/constraints.md](./specs/constraints.md).

### 3) Eval-to-contract gate

- [x] Run the golden scenario in [context/examples.md](./context/examples.md) (`golden-2026-03-25-001`).
- [x] Validate outputs against [evals/test_cases.md](./evals/test_cases.md) dry-run acceptance checks.
- [x] Confirm latest benchmark outcome in [evals/benchmark_runs.md](./evals/benchmark_runs.md).
- [x] Confirm at least one real failure and one real win are logged in [evals/failure_log.md](./evals/failure_log.md) and [evals/wins.md](./evals/wins.md).

### 4) Prompt conformance checks

- [x] Task prompts output contract JSON first (no narrative preamble).
- [x] Consequential actions generate `ApprovalTicket`.
- [x] Cross-agent ownership changes generate `HandoffPacket`.
- [x] Office status outputs include `AgentStatusCard` array and `CompanyBoardSnapshot`.
- [x] Prompt templates in [prompts/templates/task_brief_template.md](./prompts/templates/task_brief_template.md) remain contract-first.

### 5) Implementation readiness sign-off

- [x] Contract fields are frozen and accepted for handoff.
- [x] No open ambiguity on workflow ownership or approval gates.
- [x] Known risks and non-goals are acknowledged.
- [x] Build can start without requiring new contract decisions.

### Sign-off record

```md
Date: 2026-03-25
Reviewer: Codex + user-approved handoff flow
Result: PASS
Blocking issues:
- none
Next action:
- begin implementation against frozen v1 contracts
```
