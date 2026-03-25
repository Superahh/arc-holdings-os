# Task Brief Template

Use this as the default reusable wrapper for serious ARC Holdings OS tasks.

Every strong task brief includes six parts:

1. Role
2. Objective
3. Context
4. Constraints
5. Output format
6. Evaluation standard

## Template

```md
# Task Brief

## Task name
[short name]

## Role
[who the AI is for this task]

## Objective
[exact outcome required]

## Context
[relevant project and scenario context]

## Constraints
- [constraint]
- [constraint]
- [constraint]

## Output Format
Return:
1. [item]
2. [item]
3. [item]

## Contract Target
- [OpportunityRecord | HandoffPacket | ApprovalTicket | AgentStatusCard | CompanyBoardSnapshot]

## Contract Output Rule
- emit target contract object(s) first
- use valid JSON for contract object(s)
- keep non-contract prose to 3 bullets max

## Evaluation Standard
The answer should be:
- practical
- implementation-ready
- constraint-aligned
- contract-conformant
- easy to revise
```

## Example

```md
# Task Brief

## Task name
ARC opportunity workflow plan

## Role
You are a senior product engineer designing the version 1 workflow for ARC Holdings OS.

## Objective
Define the smallest practical workflow for evaluating and approving used electronics opportunities inside a multi-agent company interface.

## Context
ARC Holdings OS is a digital company simulation for finding, evaluating, routing, and monetizing used electronics opportunities. The user needs low cognitive overhead and strong approval control.

## Constraints
- keep version 1 focused
- require human approval on risky actions
- map visuals to real business state
- avoid broad integrations in version 1

## Output Format
Return:
1. workflow stages
2. responsible agents
3. approval points
4. key handoffs
5. biggest risks

## Contract Target
- HandoffPacket
- ApprovalTicket

## Contract Output Rule
- emit contract objects first
- keep prose concise and implementation-focused

## Evaluation Standard
The answer should be practical, implementation-ready, low-complexity, and aligned with v1 constraints.
```
