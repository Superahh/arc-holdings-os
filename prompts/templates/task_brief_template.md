# Task Brief Template

Use this when you want a practical prompt wrapper for a real task.

```md
# Task Brief

## Task name
[short name]

## Role
[who the AI is]

## Objective
[what needs to happen]

## Context
[project background]

## Constraints
- [constraint]
- [constraint]
- [constraint]

## Inputs
- [file, code, notes, links, examples]

## Output Format
Return:
1. [item]
2. [item]
3. [item]

## Evaluation Standard
The answer should be:
- practical
- implementation-ready
- easy to revise later
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
ARC Holdings OS is a digital company simulation for finding, evaluating, routing, and monetizing used electronics opportunities. The user wants a polished top-down office interface, clear approval control, and realistic business logic.

## Constraints
- keep version 1 focused
- require human approval on risky actions
- keep the interface ADHD-friendly
- map visuals to real business state
- avoid broad integrations in version 1

## Output Format
Return:
1. workflow stages
2. responsible agents
3. approval points
4. UI implications
5. biggest risks

## Evaluation Standard
The answer should be practical, implementation-ready, low-complexity, and aligned with a real version 1 product.
```
