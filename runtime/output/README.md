# Runtime Output

This folder stores persisted pipeline artifacts.

## Structure

- `runs/`: per-execution artifacts with deterministic filenames
- `snapshots/`: regression baselines keyed by opportunity id
- `decisions/`: decision-time office-state artifacts keyed by ticket id + timestamp
- `timelines/`: replayed queue timeline artifacts for audits/debugging
- `health/`: queue health KPI artifacts for monitoring
- `cycles/`: end-to-end cycle summary artifacts
- `reports/`: consolidated ops reports in JSON and Markdown
- `loops/`: orchestrated multi-step ops loop summary artifacts
- `batches/`: multi-fixture batch run summary artifacts
- `indexes/`: output inventory index artifacts

## Notes

- `runs/` files are operational logs and are ignored by git.
- `decisions/` files are runtime logs and are ignored by git.
- `timelines/` files are runtime logs and are ignored by git.
- `health/` files are runtime logs and are ignored by git.
- `cycles/` files are runtime logs and are ignored by git.
- `reports/` files are runtime logs and are ignored by git.
- `loops/` files are runtime logs and are ignored by git.
- `batches/` files are runtime logs and are ignored by git.
- `indexes/` files are runtime logs and are ignored by git.
- `snapshots/` are intended to be reviewed and committed when baselines are intentionally updated.
