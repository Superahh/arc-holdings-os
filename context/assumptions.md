# Assumptions

## Current assumptions

- [x] Version 1 remains intentionally narrow.
- [x] Human approval stays in loop for risky actions.
- [x] Office simulation must map to real operating state.
- [x] One realistic opportunity pipeline is enough for v1.
- [x] Reusable prompts/specs beat one-off clever outputs.
- [x] Shared contracts reduce handoff ambiguity.
- [ ] Broad integrations are required for first release.
- [ ] More animation means better product quality.
- [ ] Every role needs a separate file immediately.

## Contract assumptions

- `OpportunityRecord` is the default intake/evaluation payload.
- `HandoffPacket` is required when ownership moves across agents.
- `ApprovalTicket` is required for consequential actions.
- `AgentStatusCard` and `CompanyBoardSnapshot` drive office summary outputs.

## How to use this file

Add assumptions only when they materially affect workflow, policy, UX, or implementation choices. Remove or flip assumptions when failures repeatedly contradict them.
