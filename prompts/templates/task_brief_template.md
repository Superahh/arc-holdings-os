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
Device sourcing MVP plan

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
