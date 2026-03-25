# Current Focus

## Active goal

Ship the first visible desktop UI shell on top of the frozen v1 contracts and current runtime state.

## Current milestone

Deliver a read-only, contract-driven operator shell with low-clutter visibility into workflow, approvals, blockers, and top attention.

## This week target

- compose a single UI snapshot from runtime state and latest artifacts
- render office canvas, detail panel, board, approval queue, and KPI strip
- keep the shell desktop-first, ADHD-friendly, and operationally meaningful
- avoid adding write-path backend complexity

## Current blockers

- none for shell delivery

## Next actions

- [x] keep v1 contracts frozen for UI consumption
- [x] add read-only UI snapshot composer over queue/workflow/artifact state
- [x] add first visible shell in [ui/](./ui)
- [x] keep approval queue and workflow state as source of truth
- [x] add UI shell tests for snapshot composition and HTTP serving
- [x] define capital deposit, reserve, approval-to-use, and withdrawal controls with explicit user control and auditability
- [x] decide the first safe writable UI action surface
- [x] add browser-level smoke coverage before expanding interaction scope
- [x] implement first writable UI action: approval decision submission over existing queue policy checks and audit trail
- [ ] keep capital movement flows read-only until capital contracts are implemented in runtime with immutable ledger support
- [x] add UI confirmation and recovery behavior for decision failures/timeouts
- [ ] add explicit success/failure event chips for writable approvals in office events feed

## Out of scope

- autonomous financial commitments
- broad external integration work
- game mechanics detached from operations
- deep ERP modeling

## Exit criteria

This milestone is done when:

- the shell renders all five required regions from runtime truth
- board, cards, and detail views stay contract-driven
- no new backend mutation path is introduced for UI convenience
- the operator can scan blockers, approvals, and next action in seconds
