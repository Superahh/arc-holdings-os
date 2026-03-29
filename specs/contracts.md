# Contracts

Canonical interfaces for ARC Holdings OS prompt outputs and cross-agent handoffs.

## Contract design rules

- Keep contracts small and explicit.
- Prefer required fields over optional sprawl.
- Include ownership and next-step fields on handoffs.
- Use ISO-8601 timestamps with timezone offset when relevant.
- Use USD values as numeric fields with `_usd` suffix.

## V1 freeze (effective 2026-03-25)

The fields listed in this document are frozen for implementation handoff.

Freeze policy:

- Do not rename or remove required fields during v1 build.
- Do not change enum values during v1 build.
- New fields may be added only if optional and backward compatible.
- Any required-field change must include:
  - entry in `DECISIONS.md`
  - entry in `CHANGELOG.md`
  - updated examples in `context/examples.md`
  - at least one updated test in `evals/test_cases.md`

Versioning rule:

- Add a contract version note as `v1.x` in this file when optional fields are added.
- Move to `v2` only when a breaking change is required.

Current extension note:

- `v1.1` adds capital-control interfaces to support explicit deposit/reserve/approve-to-use and request-first withdrawal modeling with auditability.
- `v1.2` adds optional approval-trace references on capital movement snapshots so later ledger effects can be linked back to the approval ticket that enabled them.
- `v1.3` adds optional operational-next summaries on workflow opportunities and approval-queue snapshot items so the UI can surface one canonical owner/readiness line.

## OpportunityRecord

Purpose: represent opportunity evaluation state from intake through recommendation.

Required fields:

```json
{
  "opportunity_id": "string",
  "source": "string",
  "captured_at": "ISO-8601 datetime",
  "device_summary": "string",
  "ask_price_usd": 0,
  "estimated_value_range_usd": [0, 0],
  "recommended_path": "repair_and_resale|resale_as_is|part_out|skip|request_more_info",
  "recommendation": "acquire|skip|request_more_info",
  "confidence": "low|medium|high",
  "risks": ["string"],
  "notes": "string"
}
```

## HandoffPacket

Purpose: transfer ownership between agents without ambiguity.

Required fields:

```json
{
  "handoff_id": "string",
  "opportunity_id": "string",
  "from_agent": "string",
  "to_agent": "string",
  "reason": "string",
  "payload_type": "OpportunityRecord|ApprovalTicket|other",
  "payload_ref": "string",
  "blocking_items": ["string"],
  "next_action": "string",
  "due_by": "ISO-8601 datetime"
}
```

## ApprovalTicket

Purpose: request human decision before consequential action.

Required fields:

```json
{
  "ticket_id": "string",
  "opportunity_id": "string",
  "action_type": "acquisition|pricing|listing|policy_override|other",
  "requested_by": "string",
  "recommended_option": "approve|reject|request_more_info",
  "decision_options": ["approve", "reject", "request_more_info"],
  "max_exposure_usd": 0,
  "reasoning_summary": "string",
  "risk_summary": "string",
  "required_by": "ISO-8601 datetime"
}
```

## AgentStatusCard

Purpose: power office simulation and status summaries with consistent per-agent data.

Required fields:

```json
{
  "agent": "string",
  "status": "idle|working|blocked|awaiting_approval|alert",
  "active_task": "string",
  "opportunity_id": "string|null",
  "blocker": "string|null",
  "urgency": "low|medium|high",
  "updated_at": "ISO-8601 datetime"
}
```

## CompanyBoardSnapshot

Purpose: provide top-level operational summary.

Required fields:

```json
{
  "snapshot_id": "string",
  "timestamp": "ISO-8601 datetime",
  "priorities": ["string"],
  "approvals_waiting": 0,
  "blocked_count": 0,
  "active_opportunities": ["string"],
  "alerts": ["string"],
  "capital_note": "string"
}
```

## Read-only Office Extensions (UI snapshot)

Purpose: keep office-presence and future movement rails deterministic while runtime remains source of truth.

These shapes are read-only snapshot interfaces and do not create write paths.

### OfficeZoneAnchor

```json
{
  "zone_id": "string",
  "zone_label": "string",
  "department_label": "string",
  "anchor": { "x": 0.0, "y": 0.0 },
  "ingress": { "x": 0.0, "y": 0.0 },
  "egress": { "x": 0.0, "y": 0.0 },
  "handoff_dock": { "x": 0.0, "y": 0.0 },
  "connections": ["zone_id"]
}
```

## Capital Control Extensions (`v1.1` planned)

Purpose: define explicit capital lifecycle contracts before writable UI actions are introduced.

These contracts are planning and interface definitions in the current phase. They do not imply active write-path support yet.

### CapitalStrategySnapshot

Purpose: expose read-only capital posture and approved strategy priorities without implying capital execution authority.

```json
{
  "as_of": "ISO-8601 datetime",
  "capital_mode": "normal|constrained|recovery",
  "capital_mode_reason": "string",
  "board_history": [
    {
      "timestamp": "ISO-8601 datetime",
      "capital_mode": "normal|constrained|recovery",
      "rationale_snapshot": "string"
    }
  ],
  "approved_strategy_priorities": [
    "repair_resell|part_out|resale_only|arbitrage|liquidation|bundle_optimization"
  ],
  "capital_risk_flags": ["string"],
  "recommended_avoidances": ["string"],
  "recommended_actions": ["string"],
  "source_capital_account_id": "string|null"
}
```

### CapitalStrategyHistoryEntry

Purpose: expose a bounded recent capital-posture snapshot in executive/company context without implying a generic event system or transition log. `rationale_snapshot` is derived snapshot text, not immutable historical narrative storage.

```json
{
  "timestamp": "ISO-8601 datetime",
  "capital_mode": "normal|constrained|recovery",
  "rationale_snapshot": "string"
}
```

### CapitalFitAnnotation

Purpose: annotate a single opportunity against the current company capital mode without changing ordering or execution authority.

```json
{
  "stance": "favored|neutral|discouraged",
  "reason": "string"
}
```

### CapitalAccountSnapshot

```json
{
  "account_id": "string",
  "as_of": "ISO-8601 datetime",
  "currency": "USD",
  "available_usd": 0,
  "reserved_usd": 0,
  "committed_usd": 0,
  "pending_withdrawal_usd": 0,
  "manual_only": true
}
```

### CapitalMovementRequest

```json
{
  "request_id": "string",
  "action": "deposit|reserve|release_reserve|approve_use|withdraw|request_withdrawal",
  "amount_usd": 0,
  "requested_by": "string",
  "requested_at": "ISO-8601 datetime",
  "reason": "string",
  "opportunity_id": "string|null",
  "approval_ticket_id": "string|null",
  "status": "requested|approved|rejected|executed|cancelled"
}
```

### CapitalReservation

```json
{
  "reservation_id": "string",
  "opportunity_id": "string",
  "amount_usd": 0,
  "created_from_request_id": "string",
  "approval_ticket_id": "string|null",
  "status": "active|released|consumed|expired",
  "created_at": "ISO-8601 datetime",
  "updated_at": "ISO-8601 datetime"
}
```

### CapitalLedgerEntry

```json
{
  "entry_id": "string",
  "timestamp": "ISO-8601 datetime",
  "action": "deposit|reserve|release_reserve|approve_use|withdraw|adjustment|request_withdrawal|approve_withdrawal|cancel_withdrawal|reject_withdrawal",
  "amount_usd": 0,
  "balance_after_usd": 0,
  "reserved_after_usd": 0,
  "committed_after_usd": 0,
  "pending_withdrawal_after_usd": 0,
  "performed_by": "string",
  "authorized_by": "string|null",
  "request_id": "string|null",
  "opportunity_id": "string|null",
  "approval_ticket_id": "string|null",
  "notes": "string"
}
```

### CapitalControlsSnapshot

```json
{
  "status": "manual_only",
  "note": "string",
  "state_path": "string",
  "account_snapshot": "CapitalAccountSnapshot|null",
  "capital_left_usd": "number|null",
  "ledger_integrity": {
    "ok": true,
    "errors": ["string"],
    "entry_count": 0,
    "latest_entry_id": "string|null"
  },
  "latest_request": "CapitalMovementRequest|null",
  "pending_withdrawal_requests": [
    {
      "request_id": "string",
      "amount_usd": 0,
      "status": "requested",
      "requested_at": "ISO-8601 datetime",
      "requested_by": "string|null",
      "reason": "string",
      "current_available_usd": 0,
      "current_pending_withdrawal_usd": 0,
      "resulting_available_usd_after_execution": 0
    }
  ],
  "recent_ledger_entries": [
    {
      "entry_id": "string",
      "timestamp": "ISO-8601 datetime",
      "action": "string",
      "amount_usd": 0,
      "performed_by": "string",
      "request_id": "string|null",
      "opportunity_id": "string|null",
      "approval_ticket_id": "string|null",
      "approval_decision": "pending|approve|reject|request_more_info|null",
      "approval_decided_at": "ISO-8601 datetime|null"
    }
  ]
}
```

### OfficeHandoffSignal

```json
{
  "opportunity_id": "string",
  "from_agent": "string",
  "to_agent": "string",
  "from_zone_id": "string",
  "to_zone_id": "string",
  "next_action": "string",
  "due_by": "ISO-8601 datetime",
  "blocking_count": 0,
  "source_stale": false
}
```

### OfficeRouteHint

```json
{
  "route_id": "string",
  "opportunity_id": "string",
  "from_zone_id": "string",
  "to_zone_id": "string",
  "path_zone_ids": ["zone_id"],
  "waypoints": [{ "x": 0.0, "y": 0.0 }],
  "source": "handoff_signal"
}
```

### OfficeEvent

```json
{
  "event_id": "string",
  "type": "handoff_started|handoff_completed|focus_changed|lane_changed|approval_waiting|approval_resolved",
  "source": "handoff_signal|workflow_state|approval_queue",
  "timestamp": "ISO-8601 datetime",
  "opportunity_id": "string|null",
  "from_agent": "string|null",
  "to_agent": "string|null",
  "from_zone_id": "string|null",
  "to_zone_id": "string|null",
  "lane_from": "verification|approval|execution|market|monitor",
  "lane_to": "verification|approval|execution|market|monitor",
  "lane_stage": "verification|approval|execution|market|monitor",
  "blocking_count": 0,
  "ticket_id": "string|null",
  "decision": "pending|approve|reject|request_more_info|null",
  "agent": "string|null",
  "summary": "string",
  "severity": "info|attention|alert"
}
```

### OfficeMovementIntent

```json
{
  "intent_id": "string",
  "opportunity_id": "string",
  "movement_kind": "handoff|approval|workflow",
  "transition_state": "in_flight|arrived",
  "agent": "string",
  "from_agent": "string",
  "to_agent": "string",
  "from_zone_id": "string",
  "to_zone_id": "string",
  "route_id": "string",
  "path_zone_ids": ["zone_id"],
  "waypoints": [{ "x": 0.0, "y": 0.0 }],
  "trigger_event_id": "string",
  "trigger_type": "handoff_started|handoff_completed|focus_changed|lane_changed|approval_waiting|approval_resolved",
  "trigger_timestamp": "ISO-8601 datetime",
  "source": "handoff_signal|workflow_state|approval_queue",
  "duration_ms": 0,
  "blocking_count": 0
}
```

### OperationalNextSummary

Purpose: compress ownership, readiness, dependency, and next-step state into one additive read-only summary for workflow opportunities and approval-queue items.

```json
{
  "owner": "string",
  "state": "ready|waiting|blocked|moving",
  "waiting_on": "string|null",
  "next_action": "string",
  "ready_once": "string",
  "movement_in_flight": false
}
```

## Planned Office Transition Write Contracts (`v1.2` planned)

Purpose: define the first safe writable boundary for manual route-transition commits without enabling autonomous movement.

### RoomTransitionRequest

```json
{
  "request_id": "string",
  "intent_id": "string",
  "opportunity_id": "string",
  "agent": "string",
  "from_zone_id": "string",
  "to_zone_id": "string",
  "requested_by": "string",
  "requested_at": "ISO-8601 datetime",
  "reason": "string",
  "mode": "manual_preview_commit",
  "status": "requested|approved|rejected|executed|cancelled",
  "policy_checks": [
    "intent_exists",
    "non_terminal_opportunity",
    "no_capital_side_effects",
    "no_workflow_mutation",
    "audit_required"
  ]
}
```

### RoomTransitionAuditEntry

```json
{
  "entry_id": "string",
  "timestamp": "ISO-8601 datetime",
  "request_id": "string",
  "intent_id": "string",
  "opportunity_id": "string",
  "actor": "string",
  "action": "request|approve|reject|execute|cancel",
  "result": "accepted|denied|applied",
  "notes": "string"
}
```

## Usage guidance

- Task prompts should declare a `Contract Target` section and emit one or more contracts.
- System prompts should enforce contract compliance when generating operational outputs.
- Evals should score both quality and contract conformance.
