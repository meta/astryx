---
schema_version: 1
template_version: 1
kind: design
id: design:spatial-hierarchy
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, layout, responsive]
verified_by: []
architecture: [architecture:container-padding, architecture:theme-tokens]
components: []
families: [family:layout-primitives, family:layout-regions]
deciding_specs: []
---

# Spatial hierarchy design specification

## User intent

People should understand what belongs together before reading individual labels.
A dense surface should remain organized because proximity expresses relationship,
not because every group is enclosed by another container.

## Design principles

- **DR1 — Proximity communicates relationship.** Closely related elements MUST
  sit closer than separate concerns.
- **DR2 — Separation grows with grouping level.** Gaps MUST increase from local
  content to groups and from groups to sections.
- **DR3 — Space precedes containment.** Authors SHOULD use spacing and alignment
  to establish groups before adding another card or boundary.
- **DR4 — Variation is intentional.** A composition MUST use enough spatial
  contrast to reveal its hierarchy rather than applying one gap everywhere.

## Anatomy and hierarchy

| Role           | Purpose                                                     | Required relationship                                      |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| local gap      | Joins a label, value, icon, or control to immediate content | Smaller than its containing group gap                      |
| group gap      | Separates peer controls or content groups                   | Larger than local gaps and smaller than section separation |
| section gap    | Separates distinct concerns                                 | Strong enough to survive the squint test                   |
| alignment edge | Connects related content across rows or regions             | Repeats consistently within the same grouping level        |

## State representation

Spatial relationships MUST remain perceptible in populated, sparse, empty, and
error states. Conditional content must not collapse or invert the grouping order.

## Responsive and input behavior

- **DR5 — Reflow preserves grouping.** At constrained widths, content MAY stack or
  move, but local, group, and section relationships MUST remain distinguishable.
- **DR6 — Dynamic content preserves rhythm.** Validation, supporting text, and
  optional actions MUST remain associated with the content they serve.

## Accessibility intent

Visual grouping should agree with semantic reading order and programmatic
relationships. Space must not be the only signal when a group requires a label,
heading, or other semantic boundary.

## Representative examples

- A form uses its tightest relationship between label and field, a larger gap
  between fields, and the largest gap between sections.
- A dashboard separates regions through spacing and alignment before adding
  nested cards.

## Visual references

No normative assets are included. Wide and constrained examples should be added
under `docs/design/assets/spatial-hierarchy/` before promotion.

## Component contract links

No component links are asserted. The listed layout families are candidate
relationships pending adoption review.

## Decision log

No repository design decision has approved this record yet. It distills the
spacing intent from the public Design Conventions wiki without copying token
values or audit thresholds.

## Open questions

- **OQ1 — Evidence set.** Which page, form, and collection examples best verify
  each grouping level?
- **OQ2 — Containment exception.** Which component families require visible
  containment in addition to spatial grouping?

## Content boundary

This file defines perceptual grouping. It does not define spacing token values,
padding algorithms, component props, DOM structure, or audit scoring.
