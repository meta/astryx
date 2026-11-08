---
schema_version: 1
template_version: 1
kind: design
id: design:system-states
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
families: [family:input-fields, family:overlay-dismissal]
deciding_specs: []
---

# System states design specification

## User intent

A person should distinguish unavailable, waiting, processing, successful,
warning, informational, and error conditions without relying on color alone.
Feedback should use prominence appropriate to its persistence and urgency while
preserving surrounding layout.

## Design principles

- **DR1 — System state preserves context.** Loading, processing, and status
  treatments MUST keep enough of the original component's geometry and identity
  for the person to understand what is affected.
- **DR2 — Status meaning survives color.** Every semantic status MUST pair color
  with an icon, label, or other non-color signal.
- **DR3 — Prominence follows persistence and urgency.** Persistent in-flow
  feedback SHOULD remain quiet, compact or urgent feedback MAY use a solid
  treatment, and brief transient feedback MAY use an inverted overlay.
- **DR4 — One meaning remains recognizable across tiers.** Changing prominence
  MUST NOT change the underlying success, information, warning, or error meaning.
- **DR5 — Busy states do not cause layout shift.** Placeholder and processing
  representations MUST preserve the affected content's expected dimensions.

## Anatomy and hierarchy

| Role                    | Purpose                                              | Required relationship                                    |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| affected surface        | Shows what is disabled, waiting, or reporting status | Retains enough geometry to preserve context              |
| progress representation | Shows that content or an action is unresolved        | Fits the scope and duration of the wait                  |
| semantic indicator      | Communicates feedback category                       | Pairs color with icon, label, or equivalent cue          |
| supporting message      | Explains reason, consequence, or next action         | Remains associated with the affected surface             |
| prominence container    | Scales feedback from in-flow to transient            | Matches persistence and urgency without changing meaning |

## State representation

| State                | Required representation                                                                 | Allowed variation                                                      |
| -------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| disabled             | Muted, clearly unavailable, and non-interactive; a reason remains available when needed | Components may place the reason according to their family contract     |
| loading, placeholder | A stable skeleton or structural placeholder stands in for content not yet available     | Shape follows the expected content                                     |
| processing, in place | A progress indicator appears without changing the control's dimensions                  | Indicator may replace or accompany content when identity remains clear |
| status, muted        | A quiet semantic surface combines status color with icon or text                        | Used for persistent banners, fields, and in-flow feedback              |
| status, solid        | A high-prominence semantic fill combines status color with contrasting content          | Used for compact labels or urgent feedback                             |
| temporal overlay     | A brief inverted surface appears above current content and dismisses                    | Used for transient messages and explanatory overlays                   |

## Responsive and input behavior

- **DR6 — Feedback remains attached under reflow.** Supporting messages and
  progress representations MUST remain associated with the affected content at
  narrow widths and across orientation changes.
- **DR7 — Transient feedback remains operable.** Responsive placement MUST NOT
  hide dismissal, pause, or follow-up actions where those actions exist.
- **DR8 — Busy feedback does not depend on motion.** Reduced-motion mode MUST
  still communicate that work is pending.

## Accessibility intent

A person should be able to identify status category, affected scope, and any
available next action without color perception or animation. Disabled reasons
should remain reachable without enabling the blocked action. Busy content should
communicate that it is unresolved without repeatedly disrupting reading or focus.

ARIA mapping, disabled semantics, busy behavior, dismissal, timing, and live
announcements remain component and family responsibilities.

## Representative examples

- A field processing a value keeps its width and label while a progress indicator
  occupies an established end lane.
- A persistent warning uses a quiet in-flow surface with an icon and message.
- An urgent transient error uses stronger prominence but preserves the same error
  meaning and icon language.

## Visual references

No normative assets are included in this seed draft. Representative disabled,
loading, muted, solid, and transient states should be added under
`docs/design/assets/system-states/` before promotion.

## Component contract links

No component contract links are asserted in this seed draft. The listed family
relationships are candidates for review, not claims that those draft or current
contracts have adopted these requirements.

## Decision log

No repository design decision has approved this record yet. It distills the
system-driven state and prominence vocabulary from the public Design Conventions
wiki while leaving semantics and mechanics with components and families.

## Open questions

- **OQ1 — Tier selection.** Which status surfaces have fixed prominence, and
  which may vary based on product context or severity?
- **OQ2 — Processing distinction.** When should an unresolved surface use a
  structural placeholder versus an in-place progress indicator?
- **OQ3 — Temporal boundary.** Which transient feedback belongs in this shared
  vocabulary versus a dedicated overlay or notification design record?

## Content boundary

This file defines visual distinctions and prominence for system-driven feedback.
It does not define prop names, ARIA attributes, loading semantics, dismissal or
timing behavior, token names, audit checks, or consumer usage.
