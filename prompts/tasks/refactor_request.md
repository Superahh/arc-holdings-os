# Refactor Request

## Purpose

Use this prompt when code works but the structure needs to improve.

## Template

```md
# Task Brief

## Role
You are a senior engineer planning a low-risk refactor.

## Objective
Refactor this code or module to improve maintainability:
[describe target]

## Context
[relevant code structure, current pain points, product needs]

## Constraints
- preserve behavior
- keep the refactor incremental
- avoid introducing unnecessary abstractions
- make future changes easier

## Output Format
Return:
1. current problems
2. refactor strategy
3. proposed module or file structure
4. migration steps
5. regression risks
6. recommended validation steps

## Evaluation Standard
The plan should reduce complexity without destabilizing working behavior.
```
