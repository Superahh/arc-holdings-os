# Runtime Slices

This folder contains the first implementation slice for ARC Holdings OS:

- `OpportunityRecord` generation
- `ApprovalTicket` generation
- `HandoffPacket` generation
- `AgentStatusCard` generation
- `CompanyBoardSnapshot` generation
- read-only office event/anchor/route contracts for UI presence and future movement rails
- contract validation helpers
- deterministic opportunity pipeline logic
- deterministic artifact export
- regression snapshot comparison
- approval queue state management and audit trail

## Files

- `contracts.js`: contract validators for core contracts plus read-only office snapshot contracts (`OfficeZoneAnchor`, `OfficeHandoffSignal`, `OfficeRouteHint`, `OfficeEvent`)
- `pipeline.js`: intake-to-decision pipeline skeleton
- `output.js`: run artifact writing and snapshot comparison helpers
- `run_pipeline.js`: CLI entrypoint for pipeline execution + persistence
- `approval_queue.js`: queue load/save/enqueue/decision helpers
- `workflow_state.js`: opportunity lifecycle state persistence and transition helpers
- `workflow_list_cli.js`: CLI for workflow state inspection (`summary`, `opportunities`, `history`, `opportunity`)
- `workflow_health_cli.js`: CLI for workflow lifecycle health and stale-state monitoring
- `workflow_replay_cli.js`: CLI to replay workflow lifecycle events into timeline artifacts
- `workflow_update_cli.js`: CLI for manual, policy-checked workflow status progression
- `ui_snapshot.js`: read-only snapshot composer for the visible UI shell
- `room_transition_validator_cli.js`: read-only validator for planned room-transition request boundary (no mutation endpoint)
- `room_transition_evidence_cli.js`: read-only evidence summarizer for validator outputs (pass/fail trends + failed check counts)
- `state_bootstrap_cli.js`: CLI to initialize/reset queue and workflow state files safely
- `decision_state.js`: post-decision office state generator
- `queue_decision_cli.js`: CLI entrypoint for applying queue decisions and emitting decision artifacts
- `queue_list_cli.js`: CLI for queue inspection (`pending`, `all`, `history`, `ticket`)
- `queue_replay_cli.js`: CLI to replay queue audit history into timeline artifacts
- `queue_health_cli.js`: CLI to compute queue KPIs and emit health artifacts
- `company_cycle_cli.js`: CLI to run end-to-end cycle and emit cycle artifact
- `ops_report_cli.js`: CLI to emit consolidated ops report (JSON + Markdown) with awaiting-task summary, attention block (`top_task` + `next_attention_at`), and urgency timing signals
- `ops_status_cli.js`: CLI to emit fast terminal status snapshot with actionable awaiting-task queue, attention block (`top_task` + `next_attention_at`), and urgency timing signals
- `ops_attention_cli.js`: CLI to emit compact attention summary with urgency-based nudges and optionally fail when overdue tasks exist (`--fail-on-overdue`)
- `ops_loop_cli.js`: CLI to run full ops loop and emit loop artifact
- `batch_ops_cli.js`: CLI to run ops loop across multiple fixtures and emit batch artifact
- `artifact_index_cli.js`: CLI to index runtime output artifacts by type
- `artifact_prune_cli.js`: CLI to prune old output artifacts (dry-run by default)
- `acceptance_cli.js`: CLI to run acceptance checks for golden + rejection drill scenarios, including lifecycle-state transitions and shipping-only remote-safe handoff checks
- `fixtures/golden-scenario.json`: baseline `request_more_info` scenario input
- `fixtures/rejection-scenario.json`: acquisition candidate fixture for rejection-path testing
- `tests/pipeline.test.js`: unit tests using Node built-in test runner
- `tests/output.test.js`: artifact persistence and regression snapshot tests
- `tests/run_pipeline_cli.test.js`: pipeline CLI integration tests
- `tests/approval_queue.test.js`: approval queue state and audit tests
- `tests/workflow_state.test.js`: workflow state persistence and transition tests
- `tests/workflow_list_cli.test.js`: workflow state query CLI tests
- `tests/workflow_health_cli.test.js`: workflow health KPI CLI tests
- `tests/workflow_replay_cli.test.js`: workflow replay timeline CLI tests
- `tests/workflow_update_cli.test.js`: workflow manual update CLI tests
- `tests/state_bootstrap_cli.test.js`: state bootstrap/reset CLI tests
- `tests/queue_decision_cli.test.js`: queue decision CLI and post-decision artifact tests
- `tests/queue_list_cli.test.js`: queue listing/history CLI tests
- `tests/queue_replay_cli.test.js`: queue replay timeline artifact tests
- `tests/queue_health_cli.test.js`: queue health KPI CLI tests
- `tests/company_cycle_cli.test.js`: end-to-end cycle CLI tests
- `tests/ops_report_cli.test.js`: consolidated ops report CLI tests
- `tests/ops_status_cli.test.js`: fast status CLI tests
- `tests/ops_attention_cli.test.js`: compact attention CLI tests
- `tests/ops_loop_cli.test.js`: full ops loop orchestration tests
- `tests/batch_ops_cli.test.js`: multi-fixture batch ops CLI tests
- `tests/artifact_index_cli.test.js`: artifact index CLI tests
- `tests/artifact_prune_cli.test.js`: artifact prune CLI tests
- `tests/acceptance_cli.test.js`: acceptance CLI scenario gate tests
- `tests/ui_snapshot.test.js`: UI snapshot composition tests
- `tests/ui_server.test.js`: UI shell server and snapshot endpoint tests
- `tests/ui_browser_smoke.test.js`: headless browser smoke check for live shell rendering (skips when browser binary is unavailable)
- `tests/room_transition_validator_cli.test.js`: room-transition request boundary validator tests
- `tests/room_transition_evidence_cli.test.js`: room-transition validator evidence summary CLI tests
- `tests/run_all_tests.js`: helper script to execute all runtime tests in deterministic order
- `tests/run_all_tests.test.js`: test coverage for the runtime test runner helper
- `output/`: generated runs and maintained snapshots
- `state/`: mutable local state files (runtime artifacts)

## Run tests

Run the full runtime test suite:

```powershell
node runtime/tests/run_all_tests.js
```

Or run tests individually:

```powershell
node runtime/tests/pipeline.test.js
node runtime/tests/output.test.js
node runtime/tests/run_pipeline_cli.test.js
node runtime/tests/approval_queue.test.js
node runtime/tests/workflow_state.test.js
node runtime/tests/workflow_list_cli.test.js
node runtime/tests/workflow_health_cli.test.js
node runtime/tests/workflow_replay_cli.test.js
node runtime/tests/workflow_update_cli.test.js
node runtime/tests/state_bootstrap_cli.test.js
node runtime/tests/queue_decision_cli.test.js
node runtime/tests/queue_list_cli.test.js
node runtime/tests/queue_replay_cli.test.js
node runtime/tests/queue_health_cli.test.js
node runtime/tests/company_cycle_cli.test.js
node runtime/tests/ops_report_cli.test.js
node runtime/tests/ops_status_cli.test.js
node runtime/tests/ops_attention_cli.test.js
node runtime/tests/ops_loop_cli.test.js
node runtime/tests/batch_ops_cli.test.js
node runtime/tests/artifact_index_cli.test.js
node runtime/tests/artifact_prune_cli.test.js
node runtime/tests/acceptance_cli.test.js
node runtime/tests/ui_snapshot.test.js
node runtime/tests/ui_server.test.js
node runtime/tests/ui_browser_smoke.test.js
node runtime/tests/room_transition_validator_cli.test.js
node runtime/tests/room_transition_evidence_cli.test.js
```

## Execute pipeline and persist artifacts

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --check-snapshot
```

Persist pipeline lifecycle state:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --workflow-state-path runtime/state/workflow_state.json
```

Run rejection-path fixture:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/rejection-scenario.json
```

Update snapshot baseline:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --update-snapshot
```

Execute pipeline and enqueue ticket when approval is required:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --queue-actor pipeline_runner
```

Bootstrap queue/workflow state files (safe default: does not overwrite existing):

```powershell
node runtime/state_bootstrap_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json
```

Force reset state files:

```powershell
node runtime/state_bootstrap_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --force
```

Apply decision and emit post-decision office-state artifact:

```powershell
node runtime/queue_decision_cli.js --queue-path runtime/state/approval_queue.json --ticket-id apr-opp-2026-03-25-001 --decision approve --actor owner_operator --note "Remote checks complete"
```

Apply decision and update lifecycle state:

```powershell
node runtime/queue_decision_cli.js --queue-path runtime/state/approval_queue.json --ticket-id apr-opp-2026-03-25-001 --decision reject --workflow-state-path runtime/state/workflow_state.json --actor owner_operator --note "Rejected after review"
```

Inspect workflow lifecycle state:

```powershell
node runtime/workflow_list_cli.js --state-path runtime/state/workflow_state.json --mode summary
node runtime/workflow_list_cli.js --state-path runtime/state/workflow_state.json --mode history --opportunity-id opp-2026-03-26-002 --limit 10
```

Generate workflow health KPI artifact:

```powershell
node runtime/workflow_health_cli.js --state-path runtime/state/workflow_state.json --stale-minutes 240
```

Replay workflow lifecycle events into timeline artifact:

```powershell
node runtime/workflow_replay_cli.js --state-path runtime/state/workflow_state.json --limit 50
```

Apply manual workflow status progression (transition-checked):

```powershell
node runtime/workflow_update_cli.js --state-path runtime/state/workflow_state.json --opportunity-id opp-2026-03-25-001 --status awaiting_approval --actor risk_agent --reason "Remote verification complete"
```

Force manual transition override:

```powershell
node runtime/workflow_update_cli.js --state-path runtime/state/workflow_state.json --opportunity-id opp-2026-03-25-001 --status monetizing --force-transition --actor owner_operator --reason "Recovery override"
```

Inspect queue from terminal:

```powershell
node runtime/queue_list_cli.js --queue-path runtime/state/approval_queue.json --mode pending
node runtime/queue_list_cli.js --queue-path runtime/state/approval_queue.json --mode history --limit 10
```

Replay queue history into timeline artifact:

```powershell
node runtime/queue_replay_cli.js --queue-path runtime/state/approval_queue.json --limit 50
```

Generate queue health KPI artifact:

```powershell
node runtime/queue_health_cli.js --queue-path runtime/state/approval_queue.json --sla-minutes 120
```

Run one full company cycle (pipeline + optional enqueue + health summary):

```powershell
node runtime/company_cycle_cli.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --sla-minutes 120
```

Run cycle with queue and lifecycle state persistence:

```powershell
node runtime/company_cycle_cli.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --sla-minutes 120
```

Generate consolidated ops report:

```powershell
node runtime/ops_report_cli.js --queue-path runtime/state/approval_queue.json --pending-limit 10 --sla-minutes 120
```

Generate consolidated ops report with workflow health:

```powershell
node runtime/ops_report_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --pending-limit 10 --task-limit 20 --sla-minutes 120 --workflow-stale-minutes 240 --due-soon-minutes 30
```

Get fast status snapshot (no report artifact generation):

```powershell
node runtime/ops_status_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --sla-minutes 120 --workflow-stale-minutes 240 --due-soon-minutes 30
```

Limit returned awaiting tasks:

```powershell
node runtime/ops_status_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --task-limit 10
```

Use custom output base dir for handoff-driven task details:

```powershell
node runtime/ops_status_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --base-dir runtime/output
```

Run compact attention check and fail on overdue tasks:

```powershell
node runtime/ops_attention_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --due-soon-minutes 30 --nudge-limit 5 --fail-on-overdue
```

Persist compact attention summary to file:

```powershell
node runtime/ops_attention_cli.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --output runtime/output/attention/latest.attention.json
```

Run full ops loop in one command:

```powershell
node runtime/ops_loop_cli.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --sla-minutes 120 --replay-limit 50 --pending-limit 10 --task-limit 20 --due-soon-minutes 30
```

Run ops loop with workflow lifecycle persistence:

```powershell
node runtime/ops_loop_cli.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --workflow-stale-minutes 240 --sla-minutes 120 --replay-limit 50 --pending-limit 10 --task-limit 20 --due-soon-minutes 30
```

Run batch ops across all JSON fixtures in a directory:

```powershell
node runtime/batch_ops_cli.js --fixtures-dir runtime/fixtures --queue-path runtime/state/approval_queue.json --sla-minutes 120 --task-limit 20 --due-soon-minutes 30
```

Run batch ops with shared workflow lifecycle state:

```powershell
node runtime/batch_ops_cli.js --fixtures-dir runtime/fixtures --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --sla-minutes 120 --task-limit 20 --due-soon-minutes 30
```

Generate output artifact index:

```powershell
node runtime/artifact_index_cli.js --base-dir runtime/output --top-n 5
```

Preview prune plan (safe dry-run):

```powershell
node runtime/artifact_prune_cli.js --base-dir runtime/output --keep 20
```

Apply prune:

```powershell
node runtime/artifact_prune_cli.js --base-dir runtime/output --keep 20 --apply
```

Run acceptance scenario gate:

```powershell
node runtime/acceptance_cli.js
```

Validate a planned room-transition request against snapshot policy boundary:

```powershell
node runtime/room_transition_validator_cli.js --request-path runtime/fixtures/room-transition-request.sample.json --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --stale-minutes 15
```

Summarize room-transition validation evidence (last 7 days by default):

```powershell
node runtime/room_transition_evidence_cli.js --inputs-dir runtime/output/room_transition_validations --window-hours 168 --min-runs 30 --min-allowed-rate 0.95 --max-parse-errors 0 --max-critical-failures 0 --output-path runtime/output/room_transition_validations/latest.summary.json
```

Fail CI/automation when readiness thresholds are not met:

```powershell
node runtime/room_transition_evidence_cli.js --inputs-dir runtime/output/room_transition_validations --window-hours 168 --min-runs 30 --min-allowed-rate 0.95 --max-parse-errors 0 --max-critical-failures 0 --fail-on-not-ready
```

## Scope note

This is a minimal v1 skeleton. It intentionally avoids external dependencies and external APIs.

The first visible shell now lives in [ui/](../ui), but runtime remains the source of truth and does not add UI-side mutation paths.
