---
schema_version: 1
template_version: 1
kind: design
id: design:typography-hierarchy
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, theming, accessibility]
verified_by: []
architecture: [architecture:theme-tokens, architecture:theme-authoring-contract]
components: []
families: []
deciding_specs: []
---

# Typography hierarchy design specification

## User intent

People should be able to triage a surface quickly because headings, body copy,
labels, code, and supporting text are unmistakably different. Reading should
remain comfortable across dense and editorial theme personalities.

## Design principles

- **DR1 — Type roles communicate purpose.** Text MUST use a role whose hierarchy
  matches its function rather than an arbitrary nearby size.
- **DR2 — Adjacent roles remain distinguishable.** Meaningful hierarchy MUST come
  from visible contrast in size, weight, placement, or a deliberate combination.
- **DR3 — Multi-line text has room to read.** Body and supporting content MUST
  preserve comfortable leading and line measure.
- **DR4 — Theme personality preserves semantics.** Themes MAY tune scale and
  density, but headings, body, labels, and supporting roles MUST retain their
  relative meaning.

## Anatomy and hierarchy

| Role                    | Purpose                                    | Required relationship                                             |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| display or page heading | Establishes the strongest reading landmark | Clearly outranks section and body content                         |
| section heading         | Organizes content within a surface         | Distinct from both page context and body copy                     |
| body                    | Carries primary reading content            | Optimized for sustained legibility                                |
| label                   | Identifies a control or compact datum      | Remains associated with its value or control                      |
| supporting text         | Adds secondary context                     | Quieter but still readable and distinguishable from disabled text |
| code or data text       | Preserves technical or tabular structure   | Remains legible without borrowing heading emphasis                |

## State representation

Loading, disabled, status, selected, and truncated states MUST preserve the text
role's identity. State styling must not flatten heading and body hierarchy or make
supporting text indistinguishable from unavailable content.

## Responsive and input behavior

- **DR5 — Measure remains readable.** Responsive layouts MUST constrain long-form
  text rather than allowing lines to expand without bound.
- **DR6 — Wrapping preserves hierarchy.** Labels and headings MAY wrap, but their
  relationship to controlled or grouped content MUST remain clear.

## Accessibility intent

Text should remain legible at supported zoom levels, modes, and theme settings.
Hierarchy should not rely on color alone, and all-caps or unusual tracking should
not undermine sustained reading.

## Representative examples

- A page title, section heading, body paragraph, and supporting note remain
  distinguishable when viewed quickly and when zoomed.
- A dense dashboard and an editorial surface use different personalities while
  preserving the same semantic role order.

## Visual references

No normative assets are included. Dense, editorial, zoomed, and constrained
examples should be added under `docs/design/assets/typography-hierarchy/` before
promotion.

## Component contract links

No component links are asserted in this seed draft.

## Decision log

No repository design decision has approved this record yet. It distills the
legibility and hierarchy intent from the public Design Conventions wiki without
copying type scales or numeric checks.

## Open questions

- **OQ1 — Scale reconciliation.** The source material's default scale and its
  adjacent-step hierarchy smell use different ratios. The intent and audit check
  need reconciliation before promotion.
- **OQ2 — Reference content.** Which realistic content set should verify every
  role across themes and widths?

## Content boundary

This file defines typographic intent. It does not define font sizes, weights,
line-height values, token names, text component APIs, or audit thresholds.
