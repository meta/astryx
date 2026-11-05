---
schema_version: 1
template_version: 1
kind: design
id: design:control-rhythm
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, layout, accessibility]
verified_by: []
architecture: [architecture:theme-tokens]
components: []
families: [family:input-fields]
deciding_specs: []
---

# Control rhythm design specification

## User intent

Mixed controls should feel intentionally composed rather than assembled from
unrelated sizing systems. Visual compactness should not make an interaction
unreasonably difficult to target.

## Design principles

- **DR1 — Mixed controls align.** Fixed-height and content-sized controls used in
  one row MUST share an intentional baseline and apparent height.
- **DR2 — Size and density are tuned together.** Authors MUST evaluate outer size
  and internal padding as one visual rhythm rather than independent settings.
- **DR3 — Content has breathing room.** Text and icons MUST retain enough internal
  space to remain legible and visually centered.
- **DR4 — Visual size and target size serve different needs.** A control MAY look
  compact while preserving an operable target appropriate to its input context.

## Anatomy and hierarchy

| Role                  | Purpose                            | Required relationship                                       |
| --------------------- | ---------------------------------- | ----------------------------------------------------------- |
| fixed control         | Provides a predictable silhouette  | Aligns with peer controls at the selected size              |
| content-sized control | Accommodates variable text or rows | Tunes density to the surrounding rhythm                     |
| content lane          | Holds text and icons               | Remains centered and free from edge crowding                |
| target area           | Receives interaction               | May exceed the visible silhouette without disrupting layout |

## State representation

Rest, focus, loading, value, and status states MUST preserve the intended row
height and alignment unless the component contract explicitly defines expansion.

## Responsive and input behavior

- **DR5 — Rows remain coherent under constraint.** Controls MAY wrap or stack, but
  each resulting row MUST retain deliberate alignment.
- **DR6 — Input context informs targets.** Compact pointer layouts MAY differ
  visually from touch-oriented layouts while preserving the same control identity.

## Accessibility intent

Compact treatment must not compromise readability, focus visibility, or
operability. Target-size mechanics and minimum thresholds remain with component,
accessibility, and audit contracts.

## Representative examples

- A medium action and default-density field in one toolbar land on the same
  apparent height and baseline.
- A compact icon control retains a larger operable target than its glyph suggests.

## Visual references

No normative assets are included. Mixed field/action and pointer/touch examples
should be added under `docs/design/assets/control-rhythm/` before promotion.

## Component contract links

No component links are asserted. `family:input-fields` is a candidate relationship
pending adoption review.

## Decision log

No repository design decision has approved this record yet. It distills the
size-and-density intent from the public Design Conventions wiki.

## Open questions

- **OQ1 — Target intent.** The source material describes a generous touch target
  but a much smaller audit failure threshold. The design target and mechanical
  floor need separate definitions.
- **OQ2 — Reference row.** Which control combination should provide normative
  visual evidence for each supported density?

## Content boundary

This file defines perceived rhythm and target intent. It does not define size
values, density props, padding tokens, hit-area mechanics, or audit thresholds.
