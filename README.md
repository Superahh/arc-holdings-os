# ARC Holdings OS

ARC Holdings OS is a markdown-first planning and specification workspace for a digital, agent-run electronics opportunity company.

The workspace preserves the Prompt Lab operating model:

- prompts are reusable assets
- specs are explicit
- failures are logged
- revisions are deliberate

## Core project idea

ARC Holdings OS is not just a sourcing tool.

It is a top-down company operating system where specialized agents act like departments inside a business. The user should be able to see the company working through a polished office simulation while the underlying system handles real business reasoning around used electronics opportunities.

## What this repo is for

Use this repo to:

- define the business and product boundaries of ARC Holdings OS
- specify the agent hierarchy and workflow handoffs
- design the office simulation as a visual layer over real company state
- write reusable prompts for planning, orchestration, evaluation, and UI work
- log failures and decisions as the system evolves

## Operating loop

1. Update [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).
2. Set the active milestone in [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md).
3. Define or revise the relevant specs in [`specs/`](./specs).
4. Use or revise prompts in [`prompts/`](./prompts).
5. Evaluate outputs against [`specs/constraints.md`](./specs/constraints.md) and [`specs/success_criteria.md`](./specs/success_criteria.md).
6. Log results in [`evals/`](./evals).
7. Capture decisions and scope cuts in [`DECISIONS.md`](./DECISIONS.md).

## Fast start

If you want the shortest path, open [`RUNBOOK.md`](./RUNBOOK.md).

## Repo map

- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md): project goal, business model, and definition of done
- [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md): active milestone, blockers, and next actions
- [`RUNBOOK.md`](./RUNBOOK.md): how to use the system without overthinking it
- [`DECISIONS.md`](./DECISIONS.md): major product, technical, and scope decisions
- [`specs/product_spec.md`](./specs/product_spec.md): product truth
- [`specs/technical_spec.md`](./specs/technical_spec.md): architecture and system design
- [`specs/ux_spec.md`](./specs/ux_spec.md): interface and interaction rules
- [`specs/agent_roles.md`](./specs/agent_roles.md): company hierarchy and department roles
- [`specs/workflow_spec.md`](./specs/workflow_spec.md): operational pipeline
- [`specs/office_simulation.md`](./specs/office_simulation.md): top-down office visual system
- [`specs/automation_policy.md`](./specs/automation_policy.md): approval and automation guardrails

## First files to use

- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)
- [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md)
- [`specs/product_spec.md`](./specs/product_spec.md)
- [`specs/constraints.md`](./specs/constraints.md)
- [`specs/agent_roles.md`](./specs/agent_roles.md)
- [`specs/workflow_spec.md`](./specs/workflow_spec.md)
- [`specs/office_simulation.md`](./specs/office_simulation.md)
- [`prompts/tasks/feature_planning.md`](./prompts/tasks/feature_planning.md)

## Working principles

- keep the company model realistic
- keep version 1 narrow
- treat visuals as a view of real state, not fantasy decoration
- preserve ADHD-friendly clarity
- prefer one clean operating system over too many disconnected docs
