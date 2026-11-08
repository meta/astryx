---
schema_version: 1
template_version: 1
kind: design
id: design:agentic-states
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, accessibility]
verified_by: []
architecture: [architecture:theme-tokens]
components: []
families: []
deciding_specs: []
---

# Agentic states design specification

## User intent

People working with an agent should understand whether it is progressing,
waiting, inspecting, synchronizing, or presenting a result without learning a
second unrelated state language. Agent feedback should communicate actionable
system status, not expose private or hidden reasoning.

This seed record names the unresolved design surface. It intentionally does not
approve visual treatments for individual agent states.

## Design principles

- **DR1 — Extend established state language first.** Agentic states SHOULD reuse
  representations from `design:user-states` and `design:system-states` when the
  underlying intention is the same.

No additional agentic-state design requirement is approved in this seed draft.
The questions below identify areas that still require human decisions.

## Anatomy and hierarchy

The wiki does not define agentic-state anatomy or relationships. Those remain open
for a future proposal rather than being inferred by this seed draft.

## State representation

No agentic-state visual representation is approved in this seed draft.
Candidate treatments must first show why existing loading, processing, status,
selection, or temporal-overlay language is insufficient.

## Responsive and input behavior

No agentic-state responsive or input requirement is approved. Candidate
proposals must address attribution under reflow, incremental output, interruption,
and reduced motion as part of the relevant open question.

## Accessibility intent

Accessibility requirements remain unresolved with the visual treatments. Each
proposal should evaluate non-motion and non-color alternatives, announcement
frequency, focus stability, reading position, and input operability without
assuming an answer in this draft.

This record does not require disclosure of hidden chain-of-thought. Any
user-visible rationale is product content and must follow its own privacy,
safety, and content contracts.

## Representative examples

No representation is normative yet. Candidate examples should compare reuse of
existing system-state feedback with any proposed agent-specific treatment and explain
what user need the new treatment serves.

## Visual references

No normative visual assets are included. Candidate evidence should be added only
after an open question below receives a proposed treatment.

## Component contract links

No component contract links are asserted. Agent-facing components should not
claim adoption until individual state representations are decided and approved.

## Decision log

No agentic-state visual decisions have been approved. The public Design
Conventions wiki explicitly identified this area as mostly undefined; this draft
preserves that uncertainty rather than converting labels into policy.

## Open questions

- **OQ1 — Thinking or processing.** When does agent work need a representation
  distinct from ordinary system processing?
- **OQ2 — User-visible rationale.** What treatment, if any, distinguishes an
  intentionally authored explanation from ordinary output without implying
  access to hidden reasoning?
- **OQ3 — Streaming.** How should incremental text remain visibly incomplete
  without distracting from text already available?
- **OQ4 — Tool execution.** What information about backend work is useful to the
  person, and when should it remain collapsed?
- **OQ5 — Awaiting input.** How should a required human response outrank passive
  progress while preserving the surrounding task context?
- **OQ6 — Synchronizing and synchronized.** How should pending and completed
  synchronization differ from generic processing and success?
- **OQ7 — Inspecting.** Does agent inspection need a distinct state, or is
  ordinary progress plus scoped context sufficient?
- **OQ8 — Rendering.** How should generated UI communicate partial mounting and
  completion without exposing implementation churn?

## Content boundary

This file frames unresolved human-facing agentic states. It does not define agent
protocols, hidden reasoning disclosure, tool telemetry, progress-event schemas,
product copy, implementation mechanics, or approved visual treatments.
