# Changelog

## 2026-03-26

- Extended the UI shell office canvas with visible agent-presence zones, state-driven avatar motion cues, and task/blocker bubbles derived from runtime truth.
- Added an explicit read-only office presence layer to [runtime/ui_snapshot.js](./runtime/ui_snapshot.js) so visual behavior stays tied to real agent/task state.
- Added the first visible desktop UI shell in [ui/](./ui) with office canvas, selected detail panel, shared company board, approval queue, and KPI strip.
- Added [runtime/ui_snapshot.js](./runtime/ui_snapshot.js) as a read-only snapshot composer over queue state, workflow state, and latest run artifacts.
- Added UI shell verification coverage with [runtime/tests/ui_snapshot.test.js](./runtime/tests/ui_snapshot.test.js) and [runtime/tests/ui_server.test.js](./runtime/tests/ui_server.test.js).
- Fixed docs-sync drift by adding `awaiting_seller_verification` to [specs/technical_spec.md](./specs/technical_spec.md) and documenting future capital-control requirements.
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
- Added queue listing/history CLI for terminal queue operations (`runtime/queue_list_cli.js`, `runtime/tests/queue_list_cli.test.js`).
- Added queue replay CLI for timeline artifact generation (`runtime/queue_replay_cli.js`, `runtime/tests/queue_replay_cli.test.js`).
- Added queue health CLI for KPI artifact generation (`runtime/queue_health_cli.js`, `runtime/tests/queue_health_cli.test.js`).
- Added company cycle CLI for end-to-end cycle artifact generation (`runtime/company_cycle_cli.js`, `runtime/tests/company_cycle_cli.test.js`).
- Added ops report CLI for consolidated JSON/Markdown reporting (`runtime/ops_report_cli.js`, `runtime/tests/ops_report_cli.test.js`).
- Added ops loop CLI for orchestrated cycle/replay/health/report artifact generation (`runtime/ops_loop_cli.js`, `runtime/tests/ops_loop_cli.test.js`).
- Added batch ops CLI for multi-fixture ops loop execution (`runtime/batch_ops_cli.js`, `runtime/tests/batch_ops_cli.test.js`).
- Added artifact index CLI for output observability (`runtime/artifact_index_cli.js`, `runtime/tests/artifact_index_cli.test.js`).
- Added artifact prune CLI for retention management (`runtime/artifact_prune_cli.js`, `runtime/tests/artifact_prune_cli.test.js`).
- Added rejection-path runtime scenario fixture and decision coverage (`runtime/fixtures/rejection-scenario.json`, `runtime/tests/queue_decision_cli.test.js`).
- Updated scenario docs to include explicit rejection drill acceptance checks (`context/examples.md`, `evals/test_cases.md`, `CURRENT_FOCUS.md`).
- Added acceptance scenario gate CLI for contract checks across golden + rejection drills (`runtime/acceptance_cli.js`, `runtime/tests/acceptance_cli.test.js`).
- Added workflow lifecycle persistence module and CLI integrations (`runtime/workflow_state.js`, `runtime/run_pipeline.js`, `runtime/queue_decision_cli.js`, `runtime/company_cycle_cli.js`, `runtime/ops_loop_cli.js`, `runtime/batch_ops_cli.js`).
- Added workflow and pipeline CLI integration tests (`runtime/tests/workflow_state.test.js`, `runtime/tests/run_pipeline_cli.test.js`, `runtime/tests/queue_decision_cli.test.js`, `runtime/tests/company_cycle_cli.test.js`, `runtime/tests/ops_loop_cli.test.js`, `runtime/tests/batch_ops_cli.test.js`).
- Added workflow inspection CLI with summary/history/opportunity views (`runtime/workflow_list_cli.js`, `runtime/tests/workflow_list_cli.test.js`).
- Added workflow health CLI for stale lifecycle monitoring and KPI artifacts (`runtime/workflow_health_cli.js`, `runtime/tests/workflow_health_cli.test.js`).
- Integrated workflow health into consolidated reporting and ops loop outputs (`runtime/ops_report_cli.js`, `runtime/ops_loop_cli.js`, `runtime/tests/ops_report_cli.test.js`, `runtime/tests/ops_loop_cli.test.js`).
- Extended batch ops summary to include final workflow health signal (`runtime/batch_ops_cli.js`, `runtime/tests/batch_ops_cli.test.js`).
- Extended acceptance gate to verify workflow lifecycle transitions for golden and rejection scenarios (`runtime/acceptance_cli.js`, `runtime/tests/acceptance_cli.test.js`).
- Refined ops report artifact indexing to separate queue-health and workflow-health references in latest artifact metadata (`runtime/ops_report_cli.js`, `runtime/tests/ops_report_cli.test.js`).
- Added fast operator status CLI for queue + optional workflow health snapshot without full report generation (`runtime/ops_status_cli.js`, `runtime/tests/ops_status_cli.test.js`).
- Added state bootstrap/reset CLI for queue/workflow state initialization with safe default and force override (`runtime/state_bootstrap_cli.js`, `runtime/tests/state_bootstrap_cli.test.js`).
- Added workflow replay CLI for timeline artifacts from lifecycle event logs (`runtime/workflow_replay_cli.js`, `runtime/tests/workflow_replay_cli.test.js`).
- Added workflow update CLI with transition policy checks and force override for manual lifecycle progression (`runtime/workflow_update_cli.js`, `runtime/tests/workflow_update_cli.test.js`, `runtime/workflow_state.js`).
- Extended ops status CLI with actionable awaiting-task queue output (queue approvals + workflow follow-ups, due/overdue flags) (`runtime/ops_status_cli.js`, `runtime/tests/ops_status_cli.test.js`).
- Added awaiting-task summary to consolidated ops reports and propagated task-limit controls through ops loop/batch CLIs (`runtime/ops_report_cli.js`, `runtime/ops_loop_cli.js`, `runtime/batch_ops_cli.js`, related tests).
- Enhanced ops status workflow tasks to use latest run-artifact handoff `next_action` and `due_by` when available (`runtime/ops_status_cli.js`, `runtime/tests/ops_status_cli.test.js`).
- Enhanced ops report workflow tasks to use latest run-artifact handoff `next_action` and `due_by` when available (`runtime/ops_report_cli.js`, `runtime/tests/ops_report_cli.test.js`).
- Added shipping-only delivery-mode acceptance guardrail to require remote-safe handoff actions (no in-person instructions) in scenario checks (`runtime/acceptance_cli.js`, `runtime/tests/acceptance_cli.test.js`).
- Added single-command runtime test runner helper to execute all CLI/unit tests in deterministic order (`runtime/tests/run_all_tests.js`, `runtime/tests/run_all_tests.test.js`, `runtime/README.md`).
- Hardened pipeline scenario tests with explicit remote-safe handoff assertions across request-more-info, acquisition, and skip paths (`runtime/tests/pipeline.test.js`).
- Added reusable markdown link checker utility and wired it into repo quality-check docs (`tools/check_markdown_links.js`, `README.md`, `RUNBOOK.md`).
- Added one-command quality gate wrapper to run runtime tests + markdown link checks from repo root (`tools/run_quality_checks.js`, `README.md`, `RUNBOOK.md`).
- Added due-soon awaiting-task signal and counters to status/report outputs and propagated the signal into ops loop and batch summaries (`runtime/ops_status_cli.js`, `runtime/ops_report_cli.js`, `runtime/ops_loop_cli.js`, `runtime/batch_ops_cli.js`, related tests and runtime docs).
- Added task-level urgency and minutes-to-due fields to awaiting-task outputs for faster operator triage in status/report surfaces (`runtime/ops_status_cli.js`, `runtime/ops_report_cli.js`, related tests and runtime docs).
- Added attention summary (`top_task`, `next_attention_at`) to status/report outputs so operators can immediately identify the next item to act on (`runtime/ops_status_cli.js`, `runtime/ops_report_cli.js`, related tests and runtime docs).
- Added compact attention CLI with optional fail-fast behavior when overdue tasks exist (`runtime/ops_attention_cli.js`, `runtime/tests/ops_attention_cli.test.js`, runtime docs).
- Added urgency-based nudge generation to compact attention output with configurable limit (`--nudge-limit`) for automation-friendly follow-ups (`runtime/ops_attention_cli.js`, `runtime/tests/ops_attention_cli.test.js`, runtime docs).
- Added optional persisted attention snapshot output (`--output`) for automation/monitoring ingestion (`runtime/ops_attention_cli.js`, `runtime/tests/ops_attention_cli.test.js`, runtime docs).
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
