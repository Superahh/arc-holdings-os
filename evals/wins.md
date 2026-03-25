# Wins

Use this file to capture patterns that produced strong outputs.

## Win log template

```md
## YYYY-MM-DD

### Prompt
[name]

### Why it worked
- [point]
- [point]

### Keep doing this
- [point]
```

## 2026-03-25

### Prompt
Contract-first task prompts (`opportunity_evaluation`, `approval_decision`, `office_status_summary`)

### Why it worked

- Produced machine-parseable outputs with clear ownership and decision artifacts.
- Reduced interpretation drift across agent handoffs.
- Made conformance checks straightforward against shared contracts.

### Keep doing this

- Put contract objects first in output instructions.
- Keep non-contract narrative capped to short notes.
- Reuse one golden scenario for repeatable regression checks.

## Starter win

### Prompt
Structured prompts with explicit output format

### Why it worked

- They reduce ambiguity.
- They make outputs easier to compare.
- They give the model less room to drift into generic filler.
