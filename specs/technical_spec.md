# Technical Spec

## Stack

- markdown files as the primary source of truth
- optional git versioning for prompt history
- local editor plus AI assistant workflow
- no required external services in version 1

## Data flow

1. Project context is captured in `PROJECT_OVERVIEW.md`, `CURRENT_FOCUS.md`, and `specs/`.
2. Reusable prompt structure is defined in `prompts/templates/`.
3. System role prompts and task prompts are assembled for a real task.
4. Outputs are reviewed against `specs/constraints.md` and `specs/success_criteria.md`.
5. Results are logged in `evals/` and refined through `experiments/`.

## Key modules

- `specs/`: stable project-level truth
- `prompts/system/`: baseline assistant behaviors
- `prompts/tasks/`: task-specific execution prompts
- `prompts/templates/`: copyable prompt scaffolds
- `context/`: background and examples
- `evals/`: feedback loop and evidence
- `experiments/`: controlled prompt iteration

## APIs / integrations

Version 1 does not require integrations.

Possible later additions:

- git-based version comparison
- external model benchmarking
- issue tracker links
- Notion or docs sync

## Storage

- markdown files in a local repo
- git commits for prompt version history
- optional date-based entries in changelog, decisions, evals, and experiments

## Risks

- too much structure before enough real usage
- stale docs that stop matching how prompts are actually used
- duplicate information spread across too many files
- evaluation becoming optional instead of routine

## Open questions

- Should the project stay as `Prompt Lab`, or be renamed later to `Spec Forge`?
- Which three real project types should become the first benchmark set?
- When should lightweight automation be added, if at all?
