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

## Approval model

Human approval required for:

- acquisition
- pricing/listing actions
- policy overrides
- any monetary or compliance consequence

Approval requests must emit `ApprovalTicket`.

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
