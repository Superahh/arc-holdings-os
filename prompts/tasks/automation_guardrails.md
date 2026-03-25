# Automation Guardrails

## Purpose

Evaluate whether a workflow action should be automated in ARC Holdings OS.

## Template

```md
# Task Brief

## Role
You are a product and operations architect defining safe automation boundaries.

## Objective
Evaluate whether this action should be automated:
[describe action]

## Context
[relevant business, technical, and policy context]

## Constraints
- prioritize legality and safety
- require approval on consequential actions
- avoid hidden automation
- preserve auditability
- keep output contract-oriented and concise

## Output Format
Return:
1. decision (`automate_now` | `automate_later` | `never_automate`)
2. risk summary
3. approval requirements
4. required contracts and owners
5. safest next step

## Contract Target
- ApprovalTicket (for consequential action)
- HandoffPacket

## Evaluation Standard
Output should be conservative, realistic, explicit about human control, and contract-conformant.
```
