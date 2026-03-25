# Examples

## Weak prompt

```md
Build me a cool app for device sourcing.
```

## Stronger prompt

```md
# Task Brief

## Role
You are a senior product engineer helping design an MVP for a device sourcing app.

## Objective
Design a version 1 desktop app that helps identify broken devices worth buying for repair or part-out resale.

## Context
The user is an electronics repair technician and reseller. They want low-friction workflows, simple UI, minimal cognitive load, and scalable architecture for future expansion.

## Constraints
- keep version 1 focused
- support eBay API integration later
- avoid unnecessary scraping in version 1
- keep the interface ADHD-friendly
- store prior searches to reduce duplicate API calls

## Output Format
Return:
1. feature list
2. recommended architecture
3. folder structure
4. MVP roadmap
5. biggest risks

## Evaluation Standard
The answer should be practical, implementation-ready, low-complexity, and aligned with an MVP rather than a full platform.
```

## Why the stronger version is better

- It defines the role.
- It sets the objective clearly.
- It packages context.
- It limits scope.
- It requires a concrete output.
- It tells you how success will be judged.
