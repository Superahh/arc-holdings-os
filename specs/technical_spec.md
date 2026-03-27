# Technical Spec

## System overview

ARC Holdings OS is a layered system:

- business state layer
- agent orchestration layer
- approval/policy layer
- office simulation view layer
- evaluation and iteration layer

## Core modules

- opportunity intake and normalization
- valuation and risk evaluation
- CEO routing and prioritization
- approval queue
- approval decision write endpoint (narrow writable surface)
- workflow/state tracker
- capital strategy classifier (read-only, planned)
- read-only UI snapshot composer
- office status composer
- desktop UI shell
- eval logger

## Canonical interfaces

All cross-agent outputs must use contracts in [contracts.md](./contracts.md):

- `OpportunityRecord`
- `HandoffPacket`
- `ApprovalTicket`
- `AgentStatusCard`
- `CompanyBoardSnapshot`
- `CapitalStrategySnapshot` (planned)
- `CapitalAccountSnapshot` (planned)
- `CapitalMovementRequest` (planned)
- `CapitalReservation` (planned)
- `CapitalLedgerEntry` (planned)
- `RoomTransitionRequest` (planned)
- `RoomTransitionAuditEntry` (planned)

## Data flow (v1)

1. Intake creates `OpportunityRecord`.
2. Valuation and risk enrich the record.
3. CEO produces route recommendation and `HandoffPacket`.
4. Consequential action generates `ApprovalTicket`.
5. Approved action updates workflow state.
6. Office layer emits `AgentStatusCard` and `CompanyBoardSnapshot`.
7. Evals log quality, failures, and revisions.

## State model

Opportunity states:

- discovered
- researching
- awaiting_seller_verification
- awaiting_approval
- approved
- acquired
- routed
- monetizing
- closed
- rejected

Agent states:

- idle
- working
- blocked
- awaiting_approval
- alert

Capital mode states:

- normal
- constrained
- recovery

Approved capital strategy classes:

- `repair_resell`
- `part_out`
- `resale_only`
- `arbitrage`
- `liquidation`
- `bundle_optimization`

`arbitrage` is narrow in scope:

- approved marketplaces only
- approved product classes only
- no off-policy sourcing
- no autonomous capital movement

## Capital Strategy Model

### Goal
Add a formal capital-awareness layer so the company can shift strategy when available operating capital is low, without introducing unbounded or unsafe behavior.

### Design intent
This is not a treasury or bank-integration feature.
This is a decision and prioritization feature.

The system should become capital-aware before it becomes capital-autonomous.

### Decision rules
Capital strategy should evaluate:

- available capital relative to operating thresholds
- reserve shortfall
- pending approval exposure
- repair backlog and labor load
- expected time-to-cash by strategy class
- estimated upfront cost per opportunity
- risk-adjusted confidence

### Behavior by capital mode

#### Normal
- standard routing remains allowed
- `repair_resell` and `part_out` remain normal primary strategies

#### Constrained
- reduce appetite for repair-heavy or long-cycle opportunities
- prioritize `resale_only`, `arbitrage`, and selected low-cost opportunities
- favor faster-turn inventory decisions

#### Recovery
- prioritize `liquidation`, `resale_only`, `arbitrage`, and `bundle_optimization`
- minimize capital lock-up
- surface capital-restoration recommendations before expansion behavior

### Future runtime/state additions
These should begin as read-only derived fields:

- `capital_mode`
- `capital_mode_reason`
- `approved_strategy_priorities`
- `capital_risk_flags`
- `capital_recovery_recommendations`
- `capital_fit`

Derivation should come from capital account state plus approval/workflow exposure, not from manual operator guesses inside the model.

### Capital-fit annotation rubric
`capital_fit` is a read-only explanatory layer for opportunities. It must not change ranking, scoring, or routing in v1.

Allowed outputs:

- `favored`
- `neutral`
- `discouraged`

Rule order:

1. if `capital_mode = normal`, output `neutral`
2. if current opportunity shape aligns with one of the current `approved_strategy_priorities` and implies lower capital lock-up, output `favored`
3. if current opportunity shape implies higher capital lock-up or repair-heavy exposure while the current mode favors faster-turn or capital-light strategies, output `discouraged`
4. otherwise output `neutral`

Opportunity-shape signals allowed in v1:

- recommended path from the current opportunity contract
- current ask price / upfront spend band
- repair-heavy vs resale-as-is shape
- basic verification state when it materially affects fast-turn confidence

Interpretation guidance:

- `favored` means the opportunity fits the current capital mode well
- `neutral` means the opportunity is still viable but capital mode does not currently strengthen the case
- `discouraged` means the opportunity shape conflicts with the current capital-preservation posture

This rubric must remain deterministic and rule-based in v1. No hidden weighting, opaque scoring, or ranking side effects are allowed.

Future anti-flapping note:

- do not switch between `normal`, `constrained`, and `recovery` too aggressively
- add threshold bands and persistence rules before mode switching is allowed to influence deeper automation

### Office and board placement
- no new room in v1
- Capital Strategy Agent should initially share the executive/finance zone
- future board state may expose capital mode, strategy priorities, and rationale as read-only company context

## Approval model

Human approval required for:

- acquisition
- pricing/listing actions
- policy overrides
- any monetary or compliance consequence

Approval requests must emit `ApprovalTicket`.

Capital-strategy guardrail:

- capital strategy recommendations must not imply capital movement execution and must not create autonomous financial commitments

## Integration strategy

- no required user API-key setup for normal v1 operation
- use mocked/internal inputs where needed
- keep external integrations optional behind interfaces

## Key implementation risks

- contract drift across prompts
- overlapping agent authority
- simulation-first output with weak operational core
- unclear ownership at handoffs

## Open questions

- first concrete source feed for opportunity intake
- KPI subset required at launch
- exact operator interaction flow for writable approval decisions in the UI

## Planned writable room-transition boundary

Objective:

- allow operator-controlled route transition commits for office simulation only, without enabling autonomous movement or business-state mutation

First safe boundary:

1. request payload must bind to existing `OfficeMovementIntent.intent_id`
2. request may update only office simulation presentation state
3. request must never mutate `approval_queue`, workflow lifecycle, or capital contracts
4. request must write immutable `RoomTransitionAuditEntry` records for every state change
5. server must reject requests when the referenced intent is stale/missing or opportunity is terminal

Non-goals for this boundary:

- autonomous patrol/walking loops
- batched multi-agent transitions
- any hidden or implicit transition execution
