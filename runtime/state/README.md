# Runtime State

Local mutable state for runtime workflows.

## Current state files

- `approval_queue.json`: queue state with pending/decided approval tickets and audit log.

## Notes

- State files are runtime artifacts and are ignored by git.
- Keep state schema aligned with `runtime/approval_queue.js`.
