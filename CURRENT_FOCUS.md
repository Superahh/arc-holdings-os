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
