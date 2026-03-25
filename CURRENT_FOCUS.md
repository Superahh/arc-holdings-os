# Current Focus

## Active goal

Complete Prompt Lab migration into a lean, contract-driven ARC Holdings OS planning system and validate one end-to-end v1 scenario.

## Current milestone

Stabilize contracts, align prompts to those contracts, and verify approval-aware workflow outputs.

## This week target

- lock [specs/contracts.md](./specs/contracts.md)
- align system/task prompts with contract outputs
- run scenario: intake -> valuation -> risk -> approval -> routing -> status summary
- log first benchmark and iteration notes

## Current blockers

- none for milestone completion

## Next actions

- [x] run contract conformance check on updated prompts
- [x] execute and log one full scenario in [evals/test_cases.md](./evals/test_cases.md)
- [x] collect one failure and one win from real prompt runs
- [x] freeze v1 interface contracts for implementation handoff
- [x] add additional runtime scenario coverage for `request_more_info` and rejection paths
- [x] add acceptance gate CLI for repeatable scenario validation
- [x] implement minimum lifecycle persistence model for v1 runtime
- [x] add workflow state inspection CLI for operator visibility
- [x] add workflow lifecycle health KPI checks
- [x] integrate workflow health into consolidated ops reporting
- [x] propagate workflow health into batch run summaries
- [x] harden acceptance gate with workflow transition checks
- [x] split queue vs workflow health artifact references in ops report
- [x] add fast terminal status snapshot CLI for operators
- [x] add state bootstrap/reset CLI for queue and workflow files
- [x] add workflow replay timeline CLI for lifecycle audits
- [x] add transition-checked manual workflow update CLI
- [x] add actionable awaiting-task queue to ops status output
- [x] include awaiting-task summary in consolidated ops report and loop/batch controls
- [x] source awaiting workflow task details from latest handoff artifacts
- [x] source awaiting workflow task details in ops report from latest handoff artifacts
- [x] enforce remote-safe handoff actions for shipping-only scenarios in acceptance gate
- [x] add one-command runtime test runner for operator/dev workflows
- [x] harden pipeline tests for remote-safe handoff wording across scenario branches

## Out of scope

- autonomous financial commitments
- broad external integration work
- game mechanics detached from operations
- deep ERP modeling

## Exit criteria

This milestone is done when:

- all key prompts emit contract-shaped outputs
- approval-critical actions always produce `ApprovalTicket`
- one end-to-end scenario passes acceptance checks
- implementation can start with low ambiguity
