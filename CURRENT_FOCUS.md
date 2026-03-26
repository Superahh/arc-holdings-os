# Current Focus

## Active goal

Ship the first visible desktop UI shell on top of the frozen v1 contracts and current runtime state.

## Current milestone

Deliver a read-only, contract-driven operator shell with low-clutter visibility into workflow, approvals, blockers, and top attention.

Milestone status: exit criteria met as of 2026-03-26. Remaining work is gate-monitoring and boundary discipline, not shell expansion.

## This week target

- compose a single UI snapshot from runtime state and latest artifacts
- render office canvas, detail panel, board, approval queue, and KPI strip
- keep the shell desktop-first, ADHD-friendly, and operationally meaningful
- avoid adding write-path backend complexity

## Current blockers

- none for shell delivery
- open gating work before any additional write-surface expansion:
  - complete one full 7-day room-transition evidence window and issue final go/no-go recommendation
  - keep capital movement flows read-only until immutable-ledger runtime implementation exists

## Next actions

- [x] keep v1 contracts frozen for UI consumption
- [x] add read-only UI snapshot composer over queue/workflow/artifact state
- [x] add first visible shell in [ui/](./ui)
- [x] keep approval queue and workflow state as source of truth
- [x] add UI shell tests for snapshot composition and HTTP serving
- [x] add explicit UI server guard tests proving unsupported capital/room-transition write endpoints remain unavailable
- [x] add runtime guard tests proving pipeline/decision flows do not create capital write-state files
- [x] define capital deposit, reserve, approval-to-use, and withdrawal controls with explicit user control and auditability
- [x] decide the first safe writable UI action surface
- [x] add browser-level smoke coverage before expanding interaction scope
- [x] implement first writable UI action: approval decision submission over existing queue policy checks and audit trail
- [ ] keep capital movement flows read-only until capital contracts are implemented in runtime with immutable ledger support
- [x] add UI confirmation and recovery behavior for decision failures/timeouts
- [x] add explicit success/failure event chips for writable approvals in office events feed
- [x] define deterministic movement intent payloads (route + duration + trigger event) for future room-to-room walking, without enabling free roaming
- [x] animate deterministic room-to-room travel progress along `movement_intents` routes when trigger events are fresh, while keeping movement read-only
- [x] expose `movement_intents` timeline context in the detail panel to support future operator controls before enabling additional writable actions
- [x] add lightweight route playback controls (read-only scrub/select) in detail panel before enabling writable room transitions
- [x] define first safe writable room-transition action boundary (policy checks + audit constraints) without enabling autonomous movement
- [x] add a read-only room-transition request validator (contract + policy checks only, no mutation endpoint) to prove boundary discipline
- [x] decide whether to promote room-transition requests to an approval-gated writable endpoint or keep them read-only through v1
- [x] keep room-transition controls read-only through v1 and gather validator/audit evidence before reconsidering writable promotion
- [x] set a concrete evidence threshold for re-evaluating writable room-transition promotion (minimum run count, pass rate, and failure profile)
- [x] enable recurring evidence snapshot capture and trend review workflow before any writable room-transition proposal
- [x] add read-only window status reporting over latest evidence summary so 7-day coverage progress and next review timing are deterministic
- [x] add deterministic recommendation report generation (`go/no-go`) from latest evidence summary to standardize promotion checkpoint communication
- [x] add one-command read-only checkpoint runner combining snapshot, window status, and recommendation outputs
- [x] add trend rollup reporting across timestamped evidence summaries to track week-over-week checkpoint deltas
- [x] add consolidated operator brief generation from checkpoint + trend artifacts for fast checkpoint review
- [ ] monitor at least one full 7-day evidence window and document go/no-go recommendation for writable room-transition promotion

## Evidence checkpoint

- latest run: `2026-03-26T01:21:08.993Z` (`window-hours=168`)
- summary: `records_considered=0`, `allowed_rate=0`, `recommendation.state=insufficient_data`, `promotion_decision=no_go`
- trend: `points_count=3`, delta vs previous remains `records=0`, `allowed_rate=0`, `observed_hours=0`
- next decision checkpoint: on/after `2026-04-02` once a full rolling 7-day evidence window is available

## Out of scope

- autonomous financial commitments
- broad external integration work
- game mechanics detached from operations
- deep ERP modeling
- additional UI surface expansion unrelated to the open gating work above

## Exit criteria

This milestone is done when:

- the shell renders all five required regions from runtime truth
- board, cards, and detail views stay contract-driven
- no new backend mutation path is introduced for UI convenience
- the operator can scan blockers, approvals, and next action in seconds

## Exit Criteria Check (2026-03-26)

- `shell renders all five required regions from runtime truth`: met (`runtime/tests/ui_snapshot.test.js`, `runtime/tests/ui_server.test.js`)
- `board, cards, and detail views stay contract-driven`: met (`runtime/tests/ui_snapshot.test.js`, contract validators in `runtime/contracts.js`)
- `no new backend mutation path is introduced for UI convenience`: met for capital/room-transition paths (`runtime/tests/ui_server.test.js`, `runtime/tests/capital_read_only_guard.test.js`)
- `operator can scan blockers, approvals, and next action in seconds`: met by shell + office state assertions (`runtime/tests/ui_snapshot.test.js`, `runtime/tests/ui_server.test.js`)
