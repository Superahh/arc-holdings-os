# Runtime Output

This folder stores persisted pipeline artifacts.

## Structure

- `runs/`: per-execution artifacts with deterministic filenames
- `snapshots/`: regression baselines keyed by opportunity id
- `decisions/`: decision-time office-state artifacts keyed by ticket id + timestamp

## Notes

- `runs/` files are operational logs and are ignored by git.
- `decisions/` files are runtime logs and are ignored by git.
- `snapshots/` are intended to be reviewed and committed when baselines are intentionally updated.
