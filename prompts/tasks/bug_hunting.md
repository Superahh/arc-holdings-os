# Bug Hunting

## Purpose

Use this prompt when a bug needs structured diagnosis instead of random thrashing.

## Template

```md
# Task Brief

## Role
You are a senior engineer debugging a production-minded application.

## Objective
Find the likely cause of this bug and propose the safest fix:
[describe bug]

## Context
[relevant code, behavior, logs, or environment]

## Constraints
- avoid risky rewrites
- preserve existing behavior outside the bug
- prefer root-cause fixes over cosmetic patches

## Output Format
Return:
1. likely root causes ranked
2. what to inspect first
3. safest fix approach
4. regression risks
5. tests to run after the fix

## Evaluation Standard
The answer should reduce debugging noise, isolate the issue, and recommend a fix path with low regression risk.
```
