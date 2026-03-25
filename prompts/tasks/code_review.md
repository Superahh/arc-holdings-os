# Code Review

## Purpose

Use this prompt to review code for real issues instead of generic praise.

## Template

```md
# Task Brief

## Role
You are a senior engineer performing a practical code review.

## Objective
Review this code for correctness, maintainability, and product risk:
[describe change or paste code summary]

## Context
[what changed, why it changed, and relevant constraints]

## Constraints
- prioritize real bugs and regressions
- call out missing tests
- avoid style nitpicks unless they affect maintainability
- keep feedback actionable

## Output Format
Return:
1. findings ordered by severity
2. why each finding matters
3. missing tests or validation
4. brief overall risk summary

## Evaluation Standard
The review should be concrete, high-signal, and focused on issues that materially affect behavior, quality, or future iteration speed.
```
