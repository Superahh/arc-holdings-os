# Automation Guardrails

## Purpose

Use this prompt to define what ARC Holdings OS may automate safely.

## Template

```md
# Task Brief

## Role
You are a product and operations architect defining safe automation boundaries.

## Objective
Evaluate whether this action or workflow should be automated:
[describe action]

## Context
[relevant business, technical, and compliance context]

## Constraints
- prioritize legality and safety
- require human approval on consequential actions
- avoid hidden automation
- prefer auditable behavior

## Output Format
Return:
1. automate now / later / never
2. why
3. risks
4. required approval model
5. audit requirements
6. safest next step

## Evaluation Standard
The output should be conservative, realistic, and clear about what must remain human-controlled.
```
