# UI Shell

This folder contains the first visible ARC Holdings OS UI shell.

## Scope

- desktop-first, read-only v1 shell
- contract-driven rendering from runtime state and latest run artifacts
- zero external dependencies
- no new write-paths or backend mutation logic

## Regions

- KPI strip
- office canvas
- selected agent or opportunity detail panel
- shared company board
- approval queue

## Source of truth

The shell reads:

- `runtime/state/approval_queue.json`
- `runtime/state/workflow_state.json`
- latest run artifacts under `runtime/output/runs/`

The read-only snapshot is composed in [runtime/ui_snapshot.js](../runtime/ui_snapshot.js).

## Run

```powershell
node ui/server.js
```

Custom paths:

```powershell
node ui/server.js --queue-path runtime/state/approval_queue.json --workflow-state-path runtime/state/workflow_state.json --base-dir runtime/output --port 4173
```
