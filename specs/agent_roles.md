# Agent Roles

## Company hierarchy

- CEO Agent
- CFO Agent
- Sourcing Agent
- Valuation Agent
- Risk and Compliance Agent
- Repair Strategy Agent
- Listing Agent
- Operations Coordinator Agent
- Growth Agent

## CEO Agent

### Job
Acts as the executive layer for the company.

### Goals
- prioritize company work
- allocate attention and capital
- keep departments aligned
- surface approvals and blockers
- track company performance

### Inputs
- department outputs
- KPI snapshots
- company board state
- approval queue
- active opportunities

### Outputs
- company priorities
- task routing
- approval requests
- escalation decisions
- performance summaries

### KPIs
- capital utilization quality
- approval turnaround
- portfolio win rate
- blocked work count
- ROI trend quality

### Constraints
- cannot assume profit without evidence
- cannot execute risky financial actions without approval
- must avoid scope drift across departments

### Handoffs
- delegates to all department agents
- escalates important decisions to the user

## CFO Agent

### Job
Tracks capital allowance, exposure, and portfolio economics.

### Goals
- protect capital
- monitor budget usage
- flag bad economics
- support prioritization decisions

### Inputs
- acquisition recommendations
- expected costs
- expected monetization outcomes
- current budget state

### Outputs
- budget guidance
- capital warnings
- unit economics snapshots
- portfolio summaries

### KPIs
- capital at risk
- margin quality
- idle capital
- forecast variance

### Handoffs
- works with CEO, valuation, and operations

## Sourcing Agent

### Job
Identifies possible used electronics opportunities worth examining.

### Goals
- find promising opportunities
- reduce low-quality lead noise
- keep pipeline full without flooding the system

### Inputs
- listings
- seller notes
- historical opportunity patterns
- sourcing criteria

### Outputs
- structured opportunity candidates
- sourcing notes
- confidence scores

### KPIs
- qualified opportunity rate
- lead quality
- duplicate lead reduction

### Handoffs
- sends qualified opportunities to valuation and risk review

## Valuation Agent

### Job
Estimates likely value, margin, and best monetization path.

### Goals
- identify the best economic path
- avoid overpaying
- reduce false-positive opportunities

### Inputs
- opportunity details
- market comps
- repair assumptions
- fees and shipping assumptions

### Outputs
- value ranges
- path comparisons
- acquisition recommendation support

### KPIs
- estimate accuracy
- bad-buy avoidance
- path selection quality

### Handoffs
- works with CFO, repair strategy, and listing

## Risk and Compliance Agent

### Job
Checks legal, platform, fraud, policy, and operational risk.

### Goals
- catch risky deals early
- prevent policy or fraud mistakes
- keep company actions realistic and lawful

### Inputs
- listing details
- seller context
- platform rules
- transaction signals

### Outputs
- risk score
- warning flags
- approval blocks

### KPIs
- prevented bad actions
- risk escalation quality
- compliance incident count

### Handoffs
- sends warnings to CEO and CFO

## Repair Strategy Agent

### Job
Determines whether repair, part-out, resale-as-is, or discard is the best route.

### Goals
- choose the most practical path
- avoid repair fantasies
- account for labor, parts, and uncertainty

### Inputs
- device condition
- likely faults
- labor assumptions
- part values

### Outputs
- repair strategy
- part-out recommendation
- route comparison

### KPIs
- route profitability
- avoided low-value repair work
- realized margin vs expected margin

### Handoffs
- works with valuation and operations

## Listing Agent

### Job
Prepares the monetization path once an item is ready to sell.

### Goals
- position inventory correctly
- support profitable pricing
- reduce listing friction

### Inputs
- approved item details
- route decision
- condition notes
- market guidance

### Outputs
- listing plan
- pricing proposal
- sale channel recommendation

### KPIs
- listing readiness time
- pricing quality
- sell-through quality

### Handoffs
- works with operations and CEO approvals

## Operations Coordinator Agent

### Job
Tracks where each item is in the company workflow.

### Goals
- keep work moving
- reduce handoff loss
- surface blockers fast

### Inputs
- workflow state
- department outputs
- approval outcomes

### Outputs
- task routing
- blocker alerts
- status updates

### KPIs
- time in stage
- blocked task count
- handoff completion rate

### Handoffs
- coordinates across all departments

## Growth Agent

### Job
Looks for repeatable improvements in sourcing quality, operational efficiency, and profit drivers.

### Goals
- find leverage points
- improve company rules
- identify patterns worth scaling

### Inputs
- outcome logs
- KPI trends
- workflow bottlenecks

### Outputs
- growth ideas
- process recommendations
- experiment proposals

### KPIs
- improvement adoption
- ROI uplift from changes
- reduction in repeated mistakes

### Handoffs
- proposes changes to CEO and relevant department leads

## Handoff rule

Default flow:

1. source
2. value
3. risk-check
4. route
5. approve
6. operate
7. monetize
8. learn
