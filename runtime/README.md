# Runtime Slices

This folder contains the first implementation slice for ARC Holdings OS:

- `OpportunityRecord` generation
- `ApprovalTicket` generation
- `HandoffPacket` generation
- `AgentStatusCard` generation
- `CompanyBoardSnapshot` generation
- contract validation helpers
- deterministic opportunity pipeline logic
- deterministic artifact export
- regression snapshot comparison
- approval queue state management and audit trail

## Files

- `contracts.js`: contract validators for `OpportunityRecord`, `ApprovalTicket`, `HandoffPacket`, `AgentStatusCard`, and `CompanyBoardSnapshot`
- `pipeline.js`: intake-to-decision pipeline skeleton
- `output.js`: run artifact writing and snapshot comparison helpers
- `run_pipeline.js`: CLI entrypoint for pipeline execution + persistence
- `approval_queue.js`: queue load/save/enqueue/decision helpers
- `decision_state.js`: post-decision office state generator
- `queue_decision_cli.js`: CLI entrypoint for applying queue decisions and emitting decision artifacts
- `fixtures/golden-scenario.json`: baseline scenario input
- `tests/pipeline.test.js`: unit tests using Node built-in test runner
- `tests/output.test.js`: artifact persistence and regression snapshot tests
- `tests/approval_queue.test.js`: approval queue state and audit tests
- `tests/queue_decision_cli.test.js`: queue decision CLI and post-decision artifact tests
- `output/`: generated runs and maintained snapshots
- `state/`: mutable local state files (runtime artifacts)

## Run tests

```powershell
node runtime/tests/pipeline.test.js
node runtime/tests/output.test.js
node runtime/tests/approval_queue.test.js
node runtime/tests/queue_decision_cli.test.js
```

## Execute pipeline and persist artifacts

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --check-snapshot
```

Update snapshot baseline:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --update-snapshot
```

Execute pipeline and enqueue ticket when approval is required:

```powershell
node runtime/run_pipeline.js --fixture runtime/fixtures/golden-scenario.json --queue-path runtime/state/approval_queue.json --queue-actor pipeline_runner
```

Apply decision and emit post-decision office-state artifact:

```powershell
node runtime/queue_decision_cli.js --queue-path runtime/state/approval_queue.json --ticket-id apr-opp-2026-03-25-001 --decision approve --actor owner_operator --note "Remote checks complete"
```

## Scope note

This is a minimal v1 skeleton. It intentionally avoids external dependencies and does not implement external APIs or UI rendering.
