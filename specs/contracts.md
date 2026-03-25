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

## Usage guidance

- Task prompts should declare a `Contract Target` section and emit one or more contracts.
- System prompts should enforce contract compliance when generating operational outputs.
- Evals should score both quality and contract conformance.
