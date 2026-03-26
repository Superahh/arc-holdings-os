# Test Cases

Use this file to define repeatable prompt tests.

## Test case template

```md
## Test case name

### Goal
[what the prompt should achieve]

### Prompt used
[prompt file or version]

### Input
[task or context]

### Expected contract(s)
- [contract name]

### Expected qualities
- [quality]
- [quality]
- [quality]

### Failure signals
- [signal]
- [signal]
```

## Core migration acceptance scenario

### Intake to status summary

#### Goal
Validate contract-aligned flow from opportunity intake through approval and office summary.

#### Prompt used
- `prompts/tasks/opportunity_evaluation.md`
- `prompts/tasks/workflow_design.md`
- `prompts/tasks/approval_decision.md`
- `prompts/tasks/office_status_summary.md`

#### Input
Use `context/examples.md` -> `Golden Scenario Packet (v1 baseline)`.

#### Expected contract(s)
- `OpportunityRecord`
- `ApprovalTicket`
- `HandoffPacket`
- `AgentStatusCard`
- `CompanyBoardSnapshot`

#### Expected qualities
- realistic economics
- explicit approval gate
- clear next owner at each handoff

#### Failure signals
- missing approval ticket on consequential action
- no owner/next-step in handoff output
- decorative status text without operational meaning

## Dry Run Execution - 2026-03-25

Run type: manual contract dry run using the current prompt templates and the golden scenario input.

### Run 1 - Opportunity Evaluation

#### Prompt used
`prompts/tasks/opportunity_evaluation.md`

#### Output
```json
{
  "opportunity_record": {
    "opportunity_id": "opp-2026-03-25-001",
    "source": "facebook_marketplace",
    "captured_at": "2026-03-25T14:30:00-04:00",
    "device_summary": "iPhone 14 Pro 256GB, powers on, back glass cracked, 89% battery health",
    "ask_price_usd": 460,
    "estimated_value_range_usd": [520, 610],
    "recommended_path": "resale_as_is",
    "recommendation": "acquire",
    "confidence": "medium",
    "risks": [
      "carrier lock or blacklist risk",
      "IMEI mismatch risk",
      "condition variance risk"
    ],
    "notes": "Acquire only after remote IMEI proof checks and approval gate."
  },
  "approval_ticket": {
    "ticket_id": "apr-2026-03-25-001",
    "opportunity_id": "opp-2026-03-25-001",
    "action_type": "acquisition",
    "requested_by": "Valuation Agent",
    "recommended_option": "approve",
    "decision_options": ["approve", "reject", "request_more_info"],
    "max_exposure_usd": 460,
    "reasoning_summary": "Spread remains positive after fees and downside assumptions.",
    "risk_summary": "Carrier/IMEI verification required before payment.",
    "required_by": "2026-03-25T17:00:00-04:00"
  }
}
```

#### Contract conformance
- `OpportunityRecord`: PASS
- `ApprovalTicket`: PASS
- narrative drift check: WARNING (prior prompt version allowed preamble prose)

### Run 2 - Approval Decision

#### Prompt used
`prompts/tasks/approval_decision.md`

#### Output
```json
{
  "approval_ticket": {
    "ticket_id": "apr-2026-03-25-001",
    "opportunity_id": "opp-2026-03-25-001",
    "action_type": "acquisition",
    "requested_by": "CEO Agent",
    "recommended_option": "approve",
    "decision_options": ["approve", "reject", "request_more_info"],
    "max_exposure_usd": 460,
    "reasoning_summary": "Expected resale range supports target margin if verification passes.",
    "risk_summary": "Do not proceed without clean IMEI and carrier unlock confirmation.",
    "required_by": "2026-03-25T17:00:00-04:00"
  },
  "handoff_packet": {
    "handoff_id": "hof-2026-03-25-002",
    "opportunity_id": "opp-2026-03-25-001",
    "from_agent": "CEO Agent",
    "to_agent": "Operations Coordinator Agent",
    "reason": "Execute approved acquisition checklist.",
    "payload_type": "ApprovalTicket",
    "payload_ref": "apr-2026-03-25-001",
    "blocking_items": ["IMEI validation pending"],
    "next_action": "Verify IMEI and seller identity before transfer of funds.",
    "due_by": "2026-03-25T18:00:00-04:00"
  }
}
```

#### Contract conformance
- `ApprovalTicket`: PASS
- `HandoffPacket`: PASS
- narrative drift check: PASS

### Run 3 - Office Status Summary

#### Prompt used
`prompts/tasks/office_status_summary.md`

#### Output
```json
{
  "agent_status_cards": [
    {
      "agent": "CEO Agent",
      "status": "awaiting_approval",
      "active_task": "Review acquisition ticket apr-2026-03-25-001",
      "opportunity_id": "opp-2026-03-25-001",
      "blocker": null,
      "urgency": "high",
      "updated_at": "2026-03-25T15:20:00-04:00"
    },
    {
      "agent": "Risk and Compliance Agent",
      "status": "working",
      "active_task": "Validate IMEI and carrier status",
      "opportunity_id": "opp-2026-03-25-001",
      "blocker": null,
      "urgency": "high",
      "updated_at": "2026-03-25T15:20:00-04:00"
    },
    {
      "agent": "Operations Coordinator Agent",
      "status": "blocked",
      "active_task": "Awaiting verification before payment",
      "opportunity_id": "opp-2026-03-25-001",
      "blocker": "IMEI verification not completed",
      "urgency": "high",
      "updated_at": "2026-03-25T15:20:00-04:00"
    }
  ],
  "company_board_snapshot": {
    "snapshot_id": "brd-2026-03-25-001",
    "timestamp": "2026-03-25T15:20:00-04:00",
    "priorities": [
      "Resolve acquisition approval for opp-2026-03-25-001",
      "Clear verification blocker before 6 PM"
    ],
    "approvals_waiting": 1,
    "blocked_count": 1,
    "active_opportunities": ["opp-2026-03-25-001"],
    "alerts": ["Verification blocker may expire seller availability window"],
    "capital_note": "460 USD pending approval; no additional exposure allowed until decision."
  },
  "active_alerts": [
    "IMEI verification pending",
    "Seller time-window risk"
  ],
  "ceo_summary": "One viable acquisition is pending approval and verification; clear blocker before committing capital."
}
```

#### Contract conformance
- `AgentStatusCard`: PASS
- `CompanyBoardSnapshot`: PASS
- narrative drift check: PASS

## Dry Run Follow-up Actions (completed)

- tightened output rules in prompt templates to make contract JSON first
- reduced narrative allowance to short notes only
- aligned reusable golden scenario with these test cases

## Runtime Scenario Drill - 2026-03-26

### Approval rejection path

#### Goal
Verify that a valid acquisition candidate can be rejected while keeping queue state, alerts, and capital messaging consistent.

#### Inputs
- `runtime/fixtures/rejection-scenario.json`
- `runtime/queue_decision_cli.js --decision reject`

#### Expected contract(s)
- `ApprovalTicket`
- `AgentStatusCard`
- `CompanyBoardSnapshot`

#### Pass checks
- queue item transitions to `reject`
- office snapshot includes rejection alert
- `capital_note` confirms no newly approved spend
- operations card stays actionable (`working`) without false blocker

### Room-transition boundary validator

#### Goal
Verify that planned room-transition requests are validated against snapshot truth and policy checks without enabling mutation.

#### Inputs
- `runtime/fixtures/room-transition-request.sample.json`
- `runtime/room_transition_validator_cli.js --stale-minutes 15`

#### Expected contract(s)
- `RoomTransitionRequest` (planned)
- `RoomTransitionAuditEntry` (planned boundary output expectation)
- `OfficeMovementIntent`

#### Pass checks
- validator returns `allowed=true` for intent-aligned manual request with complete policy checks
- stale or mismatched request returns `allowed=false` with explicit failing checks (`intent_fresh`, identity mismatch, or policy list incomplete)
- validation run produces no queue/workflow/capital mutation side effects

### Room-transition evidence summary

#### Goal
Verify that boundary-validation outcomes are summarized into operator-readable evidence trends before any writable promotion discussion.

#### Inputs
- JSON outputs from `runtime/room_transition_validator_cli.js --output-path ...`
- `runtime/room_transition_evidence_cli.js --window-hours 168`

#### Expected contract(s)
- validator output records (read-only)

#### Pass checks
- summary reports `allowed_count`, `denied_count`, and `allowed_rate`
- summary surfaces top failing policy checks for denied requests
- summary includes parse error accounting for malformed records
