# Decisions

Important decisions go here so the project does not lose its own memory.

## Decision log template

```md
## YYYY-MM-DD

### Decision
Write the decision in one sentence.

### Why
Why this was chosen now.

### Tradeoff
What you gain and what you give up.

### Revisit later
Yes or No.
If yes, state the trigger for revisiting it.
```

## 2026-03-25

### Decision
Keep the project markdown-first for version 1.

### Why
Markdown is fast to edit, easy to version, easy to review, and low-friction for both humans and AI workflows.

### Tradeoff
You gain simplicity and speed, but you do not get automation, dashboards, or built-in analytics yet.

### Revisit later
Yes.
Revisit if manual maintenance becomes the bottleneck.

## 2026-03-25

### Decision
Treat prompts as reusable assets instead of isolated chat messages.

### Why
This makes prompt quality cumulative. Each run can improve the system instead of disappearing into chat history.

### Tradeoff
It takes slightly more discipline up front because prompts need structure, names, and evaluation.

### Revisit later
No.

## 2026-03-25

### Decision
Start small with a handful of strong templates instead of building a huge prompt catalog.

### Why
A small set of tested prompts is more valuable than a large set of unproven ones.

### Tradeoff
Coverage is narrower at first, but quality and maintainability are much better.

### Revisit later
Yes.
Expand only after the current prompts are tested and revised.
