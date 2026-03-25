# Technical Spec

## System overview

ARC Holdings OS should be designed as a multi-layer system:

- business state
- agent orchestration
- approval and policy control
- office simulation UI
- evaluation and feedback loop

## Core modules

- company state store
- opportunity intake and evaluation pipeline
- agent role engine
- CEO orchestration layer
- approval queue
- office simulation presentation layer
- evaluation and logging layer

## Data flow

1. A new opportunity enters the system.
2. The sourcing and valuation functions assess likely economics.
3. Risk and compliance checks flag concerns.
4. Repair and listing strategy functions propose monetization paths.
5. The CEO layer prioritizes, routes, and requests approval where needed.
6. Approved work updates company state.
7. The office simulation reflects the current tasks, alerts, and priorities.
8. Outcomes are logged for later evaluation and prompt revision.

## Key entities

- opportunity
- device
- acquisition recommendation
- monetization path
- approval request
- task
- agent
- department
- KPI snapshot
- alert

## State model

Each opportunity should move through explicit states such as:

- discovered
- researching
- awaiting approval
- approved
- acquired
- routed
- monetizing
- closed
- rejected

Each agent should also expose a simple operating state such as:

- idle
- working
- blocked
- awaiting approval
- alert

## Approval model

Human approval is required in version 1 for:

- acquisition decisions
- pricing or listing actions
- outbound marketplace or buyer actions
- policy overrides
- any action with real monetary or compliance consequences

## Integration strategy

Version 1 should not depend on the user supplying API keys during normal use.

That means:

- start with mocked or internal data paths where needed
- keep external integrations optional
- treat real integrations as later modules behind clear interfaces

## Risks

- building a beautiful simulation before the workflow is credible
- giving agents vague responsibilities with overlapping authority
- assuming data quality or marketplace access that does not exist
- overdesigning automation before approval rules are stable
- creating too many one-off prompts instead of reusable patterns

## Open questions

- What is the first concrete opportunity source for version 1?
- How much historical data is required to make valuation useful?
- What minimal persistence layer is needed for the first build?
- Which visual states matter most in the office simulation at launch?
