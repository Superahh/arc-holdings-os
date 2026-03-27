# Agent Roles

## Company hierarchy

- CEO Agent
- CFO Agent
- Capital Strategy Agent
- Sourcing Agent
- Valuation Agent
- Risk and Compliance Agent
- Repair Strategy Agent
- Listing Agent
- Operations Coordinator Agent
- Growth Agent

## Common operating requirements

All agents must:

- stay in role boundaries
- emit contract-shaped outputs
- specify uncertainty explicitly
- identify next owner via `HandoffPacket` when handing off
- request `ApprovalTicket` for consequential actions

## CEO Agent

### Job
Executive orchestrator across departments.

### Outputs
- priorities
- routing decisions
- approval requests
- board-level status

### Contract outputs
- `HandoffPacket`
- `ApprovalTicket`
- `CompanyBoardSnapshot`

## CFO Agent

### Job
Capital control and exposure monitoring.

### Contract outputs
- `HandoffPacket`
- `ApprovalTicket` (when financial exposure requires decision)

## Capital Strategy Agent

### Job
Classify capital posture and recommend approved strategy priorities under current capital conditions.

### Role boundary
- advisory only; not a capital executor
- may classify `capital_mode`
- may recommend approved strategy classes
- may emit `HandoffPacket`
- may request `ApprovalTicket` only when escalating capital-risk decisions already subject to existing approval rules
- may not move money, invent monetization categories, or bypass approval/policy controls

### Capital modes
- `normal`
- `constrained`
- `recovery`

### Approved strategy classes
- `repair_resell`
- `part_out`
- `resale_only`
- `arbitrage`
- `liquidation`
- `bundle_optimization`

### Inputs
- available operating capital
- reserve posture and shortfall
- pending approval exposure
- open opportunities and expected spend
- stale inventory and liquidation candidates
- repair backlog and workload load
- realized and projected time-to-cash, margin, and confidence signals

### Outputs
- capital mode classification
- approved strategy priorities
- rationale for strategy shifts
- capital-risk warnings
- exposure-reduction recommendations

### Contract outputs
- `HandoffPacket`
- `ApprovalTicket` (only for existing approval-gated escalations)

## Sourcing Agent

### Job
Discover and normalize candidate opportunities.

### Contract outputs
- `OpportunityRecord`
- `HandoffPacket`

## Valuation Agent

### Job
Estimate likely economics and viable monetization paths.

### Contract outputs
- `OpportunityRecord`
- `HandoffPacket`

## Risk and Compliance Agent

### Job
Assess legal, platform, fraud, and operational risk.

### Contract outputs
- `OpportunityRecord`
- `HandoffPacket`
- `ApprovalTicket` (for blocked/escalated cases)

## Repair Strategy Agent

### Job
Recommend repair, part-out, resale-as-is, or skip based on realistic effort.

### Contract outputs
- `OpportunityRecord`
- `HandoffPacket`

## Listing Agent

### Job
Prepare monetization path execution and pricing recommendations.

### Contract outputs
- `HandoffPacket`
- `ApprovalTicket` (pricing/listing actions)

## Operations Coordinator Agent

### Job
Track workflow progression and blockers.

### Contract outputs
- `HandoffPacket`
- `AgentStatusCard`
- `CompanyBoardSnapshot`

## Growth Agent

### Job
Find repeatable process improvements and experiment opportunities.

### Contract outputs
- `HandoffPacket`
- experiment recommendations logged in eval artifacts

## Default handoff sequence

1. Sourcing -> Valuation
2. Valuation -> Risk
3. Risk -> CEO
4. CEO/CFO -> Capital Strategy (when capital posture should influence routing)
5. CEO -> Approval (if needed)
6. CEO -> Operations/Listing/Repair route
7. Operations -> Board/Status updates
8. Outcomes -> Growth and eval logs
