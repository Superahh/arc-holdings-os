# Changelog

## 2026-03-26

- Migrated workspace to contract-driven ARC Holdings OS Prompt Lab.
- Added [specs/contracts.md](./specs/contracts.md) with canonical interfaces.
- Added [prompts/tasks/approval_decision.md](./prompts/tasks/approval_decision.md).
- Added [IMPLEMENTATION_HANDOFF_CHECKLIST.md](./IMPLEMENTATION_HANDOFF_CHECKLIST.md) to map contracts -> prompts -> eval gates.
- Added first runtime implementation slice in [runtime/](./runtime) for `OpportunityRecord` and `ApprovalTicket` pipeline logic with tests.
- Extended runtime pipeline with `HandoffPacket` generation and validation plus scenario-path tests.
- Extended runtime pipeline with `AgentStatusCard` and `CompanyBoardSnapshot` generation plus contract validation.
- Added deterministic run artifact export and snapshot regression checks (`runtime/output.js`, `runtime/run_pipeline.js`, `runtime/tests/output.test.js`).
- Added approval queue state module with persistence/audit trail and tests (`runtime/approval_queue.js`, `runtime/tests/approval_queue.test.js`).
- Added queue decision CLI with post-decision office-state artifacts (`runtime/queue_decision_cli.js`, `runtime/decision_state.js`, `runtime/tests/queue_decision_cli.test.js`).
- Added clean [AGENTS.md](./AGENTS.md) and removed malformed `agents.md`.
- Merged `prompts/templates/prompt_template.md` into `prompts/templates/task_brief_template.md`.
- Merged `experiments/experiment_001.md` and `experiments/experiment_002.md` into `experiments/prompt_iterations.md`.
- Updated specs/prompts/eval/context docs for consistent contract-shaped outputs.

## 2026-03-25

- Created initial workspace structure.
- Added starter content for docs, specs, prompts, context, evals, and experiments.
- Reframed workspace around ARC Holdings OS.

## Template

Use this format for future updates:

```md
## YYYY-MM-DD

- what changed
- why it changed
- what to test next
```
