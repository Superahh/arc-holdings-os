# Changelog

## 2026-03-26

- Refreshed room-transition checkpoint metadata in `CURRENT_FOCUS.md` from the latest deterministic checkpoint run (`latest run 2026-03-26T01:37:07.672Z`; still `insufficient_data` / `no_go`).
- Expanded capital read-only guard coverage to include ops-loop flow, proving standard runtime cycles still do not create capital write-state artifacts while capital writes remain manual CLI-only (`runtime/tests/capital_read_only_guard.test.js`, `CURRENT_FOCUS.md`).
- Added capital audit CLI to emit read-only ledger/account summaries with integrity verdicts for manual capital runtime monitoring (`runtime/capital_audit_cli.js`, `runtime/tests/capital_audit_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`).
- Wired runtime capital ledger state into the read-only UI snapshot so board rendering can display available/reserved/committed balances and ledger entry count without introducing new UI mutation paths (`runtime/ui_snapshot.js`, `runtime/tests/ui_snapshot.test.js`, `ui/app.js`, `CURRENT_FOCUS.md`).
- Implemented runtime capital ledger foundation with manual/operator CLI execution and tamper-evident hash-chain integrity checks (`runtime/capital_state.js`, `runtime/capital_bootstrap_cli.js`, `runtime/capital_movement_cli.js`, `runtime/tests/capital_state.test.js`, `runtime/tests/capital_bootstrap_cli.test.js`, `runtime/tests/capital_movement_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`, `STATUS.md`, `specs/capital_controls.md`).
- Documented formal exit-criteria check for the first visible shell milestone and set explicit no-creep focus boundaries while remaining gating tasks are completed (`CURRENT_FOCUS.md`, `STATUS.md`).
- Added room-transition operator brief CLI to produce a consolidated markdown checkpoint summary from latest checkpoint + trend artifacts (`runtime/room_transition_operator_brief_cli.js`, `runtime/tests/room_transition_operator_brief_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`, `evals/test_cases.md`).
- Added room-transition trend rollup CLI to summarize checkpoint momentum across timestamped evidence summaries with latest/previous deltas (`records_considered`, `allowed_rate`, `observed_hours`) for 7-day gate tracking (`runtime/room_transition_trend_cli.js`, `runtime/tests/room_transition_trend_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`, `evals/test_cases.md`).
- Added capital read-only boundary runtime guard test to ensure pipeline/decision flows do not create capital write-state artifacts prior to ledger implementation (`runtime/tests/capital_read_only_guard.test.js`, `CURRENT_FOCUS.md`, `evals/test_cases.md`).
- Added one-command room-transition checkpoint CLI that generates evidence snapshot, window status, and deterministic promotion recommendation in a single read-only bundle (`runtime/room_transition_checkpoint_cli.js`, `runtime/tests/room_transition_checkpoint_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`, `evals/test_cases.md`).
- Added room-transition promotion recommendation CLI to produce deterministic go/no-go reports (JSON/Markdown) from latest evidence summary and window coverage state (`runtime/room_transition_recommendation_cli.js`, `runtime/tests/room_transition_recommendation_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`, `evals/test_cases.md`).
- Added UI server guard coverage asserting unsupported capital and room-transition write endpoints return `404`, preserving the current read-only boundary outside approval decision submission (`runtime/tests/ui_server.test.js`, `CURRENT_FOCUS.md`).
- Added read-only room-transition window status CLI to report deterministic 7-day evidence coverage progress (`observed/remaining hours`, `next_review_at`, `recommendation_state`) from latest summaries (`runtime/room_transition_window_status_cli.js`, `runtime/tests/room_transition_window_status_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`).
- Added explicit room-transition evidence `coverage` metrics (oldest/newest timestamps, observed hours, full-window flag) to support deterministic 7-day monitoring before writable promotion review (`runtime/room_transition_evidence_cli.js`, `runtime/room_transition_evidence_snapshot_cli.js`, `runtime/tests/room_transition_evidence_cli.test.js`, `runtime/tests/room_transition_evidence_snapshot_cli.test.js`, `runtime/README.md`).
- Documented room-transition evidence monitoring baseline (`insufficient_data`) and added explicit checkpoint timing for the first full 7-day go/no-go review (`CURRENT_FOCUS.md`, `STATUS.md`, `evals/benchmark_runs.md`).
- Added explicit readiness recommendation states (`insufficient_data`, `no_go`, `candidate_for_review`) to room-transition evidence summaries for deterministic promotion reporting (`runtime/room_transition_evidence_cli.js`, `runtime/tests/room_transition_evidence_cli.test.js`, `runtime/README.md`).
- Added recurring evidence snapshot helper CLI to persist timestamped readiness summaries and `latest.summary.json` for room-transition boundary trend review (`runtime/room_transition_evidence_snapshot_cli.js`, `runtime/tests/room_transition_evidence_snapshot_cli.test.js`, `runtime/README.md`, `CURRENT_FOCUS.md`).
- Added `--fail-on-not-ready` to room-transition evidence CLI so recurring checks can gate on readiness thresholds with exit code signaling (`runtime/room_transition_evidence_cli.js`, `runtime/tests/room_transition_evidence_cli.test.js`, `runtime/README.md`).
- Added explicit room-transition promotion thresholds and readiness gating (run count, allowed rate, parse errors, critical failures) across policy/decision/focus/runtime docs and evidence CLI output (`specs/automation_policy.md`, `DECISIONS.md`, `CURRENT_FOCUS.md`, `runtime/room_transition_evidence_cli.js`, `runtime/README.md`, `evals/test_cases.md`).
- Added read-only room-transition evidence summarizer CLI (validator trend rollup with fail-check counts and parse-error accounting), plus tests and runtime/eval docs (`runtime/room_transition_evidence_cli.js`, `runtime/tests/room_transition_evidence_cli.test.js`, `runtime/README.md`, `evals/test_cases.md`, `CURRENT_FOCUS.md`).
- Added evaluator scenario coverage for the room-transition boundary validator so read-only evidence can accumulate before any writable promotion (`evals/test_cases.md`).
- Logged decision to keep room-transition controls read-only through v1 and delay writable endpoint promotion until validator/audit evidence is proven (`DECISIONS.md`, `CURRENT_FOCUS.md`, `specs/automation_policy.md`).
- Added a read-only room-transition boundary validator CLI with strict request parsing and policy checks against live/read snapshot state, plus fixture and tests (`runtime/room_transition_validator_cli.js`, `runtime/tests/room_transition_validator_cli.test.js`, `runtime/fixtures/room-transition-request.sample.json`, `runtime/README.md`, `CURRENT_FOCUS.md`).
- Defined the first safe writable room-transition boundary in specs/contracts/policy docs (manual-only, intent-bound, immutable-audit, no workflow/capital mutation) without implementing a write endpoint yet (`specs/contracts.md`, `specs/automation_policy.md`, `specs/technical_spec.md`, `CURRENT_FOCUS.md`).
- Added read-only route playback controls in movement-intent detail sections (select intent + scrub route progress) and preview-dot rendering on the office canvas, with no backend mutation paths (`ui/app.js`, `ui/styles.css`, `CURRENT_FOCUS.md`).
- Added movement-intent timeline context to opportunity/agent detail panels so operators can inspect route, trigger, and duration metadata before future controls are introduced (`ui/app.js`, `ui/styles.css`, `CURRENT_FOCUS.md`).
- Added deterministic in-flight travel dots on office handoff routes, driven by fresh `movement_intents` trigger timestamps and durations, with no new write paths or random roaming (`ui/app.js`, `ui/styles.css`, `CURRENT_FOCUS.md`).
- Added deterministic read-only `office.movement_intents` contracts (route + duration + trigger event) and wired the office overlay to consume them as future walking rails without adding roaming/write paths (`runtime/contracts.js`, `runtime/ui_snapshot.js`, `ui/app.js`, contract/docs/tests).
- Added explicit approval outcome chips in the office event feed (`Approval success`, `Approval failed`, `Needs more info`) driven from runtime `office.events` decision fields (`ui/app.js`, `ui/styles.css`, `runtime/tests/ui_server.test.js`).
- Hardened approval-decision reliability with client-side timeout/retry UX and stricter API/CLI argument validation plus tests (`ui/app.js`, `ui/server.js`, `runtime/queue_decision_cli.js`, `runtime/run_pipeline.js`, related tests).
- Added first writable UI action surface for approval decision submission only (`ui/server.js`, `ui/app.js`, `ui/styles.css`, `runtime/tests/ui_server.test.js`), routed through existing queue decision policy/audit logic.
- Added macro project navigation map [STATUS.md](./STATUS.md) to separate phase-level orientation from sprint tracking.
- Defined capital-control contract layer and lifecycle spec for deposit/reserve/approve-use/withdraw modeling (`specs/contracts.md`, `specs/capital_controls.md`, `specs/technical_spec.md`, `specs/automation_policy.md`).
- Locked first writable UI surface to approval decision submission only and updated milestone sequencing (`CURRENT_FOCUS.md`, `DECISIONS.md`, `STATUS.md`).
- Added headless browser smoke coverage for the live UI shell using local Edge/Chrome binaries with auto-skip fallback (`runtime/tests/ui_browser_smoke.test.js`, `CURRENT_FOCUS.md`, `runtime/README.md`).
- Added a read-only zone connection rail overlay in the office canvas, highlighted by live handoff routes from `office.route_hints`, to strengthen spatial identity and future walking foundations (`ui/app.js`, `ui/styles.css`).
- Added deterministic read-only office transition rails with `office.events`, `office.zone_anchors`, `office.route_hints`, and runtime contract validation for each shape (`runtime/contracts.js`, `runtime/ui_snapshot.js`, `runtime/tests/contracts_office.test.js`, `runtime/tests/ui_snapshot.test.js`).
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
