# Runtime State

Local mutable state for runtime workflows.

## Current state files

- `approval_queue.json`: queue state with pending/decided approval tickets and audit log.
- `workflow_state.json`: opportunity lifecycle state with status history and workflow events.

## Notes

- State files are runtime artifacts and are ignored by git.
- Keep state schema aligned with `runtime/approval_queue.js`.
- Keep lifecycle schema aligned with `runtime/workflow_state.js`.
- Use `runtime/workflow_list_cli.js` to inspect lifecycle state from terminal.
- Use `runtime/workflow_health_cli.js` for stale-state and lifecycle health checks.
