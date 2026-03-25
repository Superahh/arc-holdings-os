# Failure Log

Use this file to log prompt failures and revisions.

## Prompt run log template

```md
## Prompt name
[name]

## Date
[YYYY-MM-DD]

## Model used
[model]

## Goal
[goal]

## Prompt version
[version]

## Output summary
[summary]

## What worked
- [point]

## What failed
- [point]

## What was missing
- [point]

## Revision for next run
[change]
```

## 2026-03-25

### Prompt name
`prompts/tasks/opportunity_evaluation.md`

### Model used
`gpt-5`

### Goal
Emit contract-ready opportunity evaluation for the golden scenario.

### Prompt version
v1 (pre contract-first tightening)

### Output summary
Produced useful economics and risk analysis with required contract fields, but response could include narrative text before contract objects.

### What worked
- Opportunity economics were realistic and conservative.
- `OpportunityRecord` and `ApprovalTicket` were both present for acquisition recommendation.

### What failed
- Contract objects were not guaranteed to be first output.
- Narrative preamble increased parse and handoff risk.

### What was missing
- Hard rule to return JSON contract objects first with minimal prose.

### Revision for next run
- Updated prompt to: "Return only contract objects first".
- Added explicit JSON-first output shape and limited prose notes.

## Reminder

Do not log only that something felt "off."
Log what specifically failed and what should change next.
