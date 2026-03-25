# Examples

## Golden Scenario Packet (v1 baseline)

Use this packet as the default shared scenario for prompt dry runs and regression checks.

### Metadata

- scenario_id: `golden-2026-03-25-001`
- created_at: `2026-03-25T14:30:00-04:00`
- purpose: contract conformance and workflow realism checks

### Input packet

```json
{
  "opportunity_id": "opp-2026-03-25-001",
  "source": "facebook_marketplace",
  "captured_at": "2026-03-25T14:30:00-04:00",
  "device": {
    "name": "iPhone 14 Pro 256GB",
    "condition": "powers on, back glass cracked, 89% battery health",
    "carrier_status": "unverified",
    "accessories": "none"
  },
  "ask_price_usd": 460,
  "seller_notes": "Needs quick cash, shipping only; can provide IMEI photo/video before payment.",
  "market_comps_usd": [590, 620, 640],
  "estimated_costs": {
    "repair_usd": 120,
    "fees_usd": 72,
    "shipping_usd": 18,
    "labor_usd": 25
  },
  "policy_constraints": {
    "approval_required_for_acquisition": true,
    "max_single_acquisition_without_review_usd": 300
  },
  "known_risks": [
    "carrier lock or blacklist risk",
    "IMEI mismatch risk",
    "condition variance risk"
  ]
}
```

### Expected decision shape

- likely recommendation: `request_more_info` or `acquire` with explicit approval
- mandatory if acquisition path is recommended: `ApprovalTicket`
- mandatory for cross-agent movement: `HandoffPacket`

## Opportunity evaluation example (`OpportunityRecord`)

```json
{
  "opportunity_id": "opp-2026-03-26-001",
  "source": "facebook_marketplace",
  "device_summary": "2021 MacBook Pro, cracked display, powers on",
  "ask_price_usd": 350,
  "estimated_value_range_usd": [480, 640],
  "recommended_path": "repair_and_resale",
  "confidence": "medium",
  "risks": ["battery condition unknown", "no charger", "seller verification pending"]
}
```

## Approval example (`ApprovalTicket`)

```json
{
  "ticket_id": "apr-2026-03-26-014",
  "action_type": "acquisition",
  "requested_by": "CEO Agent",
  "opportunity_id": "opp-2026-03-26-001",
  "decision_options": ["approve", "reject", "request_more_info"],
  "recommended_option": "request_more_info",
  "max_exposure_usd": 350,
  "reasoning_summary": "Value upside exists but condition uncertainty is high.",
  "required_by": "2026-03-27T16:00:00-04:00"
}
```

## Office status example (`CompanyBoardSnapshot` + `AgentStatusCard`)

```md
CEO summary: Two opportunities are viable; one requires approval.

Agent status cards:
- Valuation Agent: working | opp-001 valuation refresh
- Risk Agent: blocked | waiting seller verification data
- Operations Coordinator: awaiting approval | acquisition queue

Board snapshot:
- priority: clear approval queue by 4 PM
- blockers: seller verification missing
- approvals_waiting: 1
- alerts: potential margin compression on opp-001
```

## Why these examples matter

- They tie outputs to reusable contracts.
- They reduce interpretation drift across agents.
- They keep simulation outputs operationally meaningful.
