# STATUS

As of March 26, 2026.

## Project North Star
ARC Holdings OS is becoming a contract-driven multi-agent operating system for used-electronics opportunities where the operator can see company state quickly, approve consequential actions explicitly, and keep capital decisions auditable.

## Current Phase
### Phase: Read-only shell hardening with evidence-gated write discipline
This phase keeps the shell operational and readable while proving promotion gates for additional write surfaces with deterministic evidence, thresholds, and explicit go/no-go recommendations.

Shell milestone note: the first visible shell exit criteria are satisfied; active work is now focused on evidence-window completion and maintaining read-only discipline for non-approved write surfaces.

## Completed Phases
### Phase 1: Prompt Lab to ARC OS planning migration
- Prompt/spec/eval/context structure consolidated for ARC Holdings OS.
- Contract-first philosophy established in `specs/contracts.md`.

### Phase 2: Runtime operations backbone
- Core pipeline outputs implemented (`OpportunityRecord`, `HandoffPacket`, `ApprovalTicket`, `AgentStatusCard`, `CompanyBoardSnapshot`).
- Approval queue, workflow lifecycle state, and decision/audit CLIs implemented.
- Ops status/report/attention loop and batch tooling added.

### Phase 3: Reliability and quality gates
- Acceptance scenarios and remote-safe guardrails added.
- One-command runtime + markdown quality checks added.
- Runtime test coverage expanded across CLI and state modules.

### Phase 4: First visible UI shell
- Desktop read-only shell delivered with KPI strip, office canvas, detail panel, shared board, and approval queue.
- `runtime/ui_snapshot.js` established as the UI source adapter over runtime truth.

### Phase 5: Living office presence foundations
- Agent avatars, state-driven motion cues, and task/blocker bubbles tied to real state.
- Handoff-aware visual transitions, office events, zone anchors, route hints, and zone connection rails added.
- Browser smoke gate added (auto-skip in restricted environments).

## Current Milestone
Current milestone remains the first visible read-only shell, now in hardening mode:
- preserve runtime as source of truth
- keep UI contract-driven and low-clutter
- lock sequencing from `CURRENT_FOCUS.md`:
  - capital control model is now defined at spec/contract level
  - first safe writable surface is decided (approval decisioning only)
  - writable approval decision submission is now implemented as the only UI write action
  - capital movement remains read-only and contract-only
  - room-transition write promotion remains read-only and evidence-gated pending a full 7-day window review

Current posture to avoid focus creep:
- do not expand UI surface area beyond checkpoint/evidence usability improvements
- do not add new write endpoints outside the approved decision path
- prioritize completion of open gating tasks before new feature scope
- capital runtime ledger is now implemented for manual/operator CLI use; UI capital write endpoints remain disabled
- room-transition evidence tooling now includes request building + intent-freshness diagnostics; current blocker remains low freshness coverage (`intent_fresh` misses)

## Next Likely Phases
1. Room-transition evidence window completion
   - Complete a full rolling 7-day evidence window and publish a deterministic go/no-go recommendation.
2. Capital runtime implementation phase
   - Implement immutable ledger-backed capital state from already-frozen contracts before any capital writes.
3. Capital writable controls phase
   - Add narrow operator-controlled capital actions (deposit/reserve/approve-to-use/withdraw) with policy checks and audit trail.
4. Movement expansion phase
   - Extend deterministic office movement from route previews to workflow-tied room-to-room transitions.
5. Integration phase (optional after stability)
   - Add scoped external connectors only after write-path and audit discipline remains stable.

## Not Yet Built
- Full room visual system (beyond current zone cards and rails)
- Custom avatar art pipeline
- True room-to-room walking animations
- General writable UI controls
- Completed 7-day room-transition promotion recommendation package
- Capital deposit/reserve/approval-to-use/withdraw execution controls
- External marketplace/API integrations for autonomous actions
- Unsupervised purchasing or listing behavior

## Definition of Progress
Progress is good when:
- contracts stay stable and explicit
- runtime truth remains the single source for UI state
- each visual cue maps to real workflow/approval state
- new capabilities reduce operator ambiguity in seconds, not minutes
- write paths (when added) are narrow, approval-aware, and auditable by default

## How To Use This File
- `STATUS.md`: macro map of where the project is in its multi-phase build.
- `CURRENT_FOCUS.md`: active sprint/milestone tracker and immediate next actions.
- `CHANGELOG.md`: chronological record of what changed.
