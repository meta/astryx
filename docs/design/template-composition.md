---
schema_version: 1
template_version: 1
kind: design
id: design:template-composition
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, layout, theming, responsive]
verified_by: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:theme-tokens,
  ]
components: []
families: [family:layout-primitives, family:layout-regions]
deciding_specs: []
---

# Template composition design specification

## User intent

A page template or reusable block should look like an intentional product
surface, not merely a valid collection of components. It should establish a
clear reading order, coherent regions, and theme-safe emphasis while leaving
product content and application chrome to the adopting product.

## Design principles

- **DR1 — Layout communicates purpose.** Structural regions, grid, and stacking
  MUST make the page's primary task apparent before individual content is read.
- **DR2 — Visual hierarchy directs the eye.** Size, weight, and placement MUST
  establish an intentional path from page context to primary content and action.
- **DR3 — Spacing and alignment express relationships.** Repeated edges, gaps,
  and grouping tiers MUST remain coherent across the whole composition.
- **DR4 — Components preserve their affordances.** A template MUST choose
  components and variants whose visual language matches the intended action,
  navigation, data, or status role.
- **DR5 — Color and theming preserve hierarchy.** Surface and accent choices MUST
  retain meaning and emphasis in every supported theme and color mode.

## Anatomy and hierarchy

| Role               | Purpose                                                         | Required relationship                                              |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| page context       | Establishes where the person is and what the surface is for     | Leads the visual hierarchy without competing with the primary task |
| structural region  | Groups navigation, controls, content, or supporting information | Uses layout boundaries and spacing that match its role             |
| primary content    | Carries the page's main task or information                     | Receives the strongest sustained hierarchy                         |
| primary action     | Offers the most important local next step                       | Remains singular and easy to identify within its action group      |
| supporting content | Adds explanation, metadata, or secondary action                 | Remains available without flattening hierarchy                     |
| repeated item      | Forms a list, grid, table, or card collection                   | Preserves alignment and rhythm across realistic content variation  |

## State representation

| State              | Required representation                                                     | Allowed variation                                                                   |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| populated          | Regions and hierarchy remain clear with realistic content                   | Content length and collection size may vary within the template's purpose           |
| sparse             | Empty space preserves intentional grouping rather than collapsing structure | Optional supporting regions may disappear                                           |
| constrained        | Regions reflow without losing reading order or primary action               | Navigation and secondary content may move or collapse according to family contracts |
| light or dark mode | Surface hierarchy, contrast, and accent meaning remain intact               | Theme controls palette and visual personality                                       |
| interactive        | Component states remain recognizable inside the larger composition          | Components retain their family-owned treatments                                     |

## Responsive and input behavior

- **DR6 — Reflow preserves reading order.** Responsive changes MUST retain the
  relationship among page context, primary content, supporting regions, and
  actions.
- **DR7 — Collections adapt without arbitrary clipping.** Repeated content MUST
  use a layout strategy that remains coherent across supported widths and
  realistic item lengths.
- **DR8 — Input modes keep the same task hierarchy.** Keyboard, pointer, and
  touch paths MUST reach the same primary task and actions without relying on
  hover-only discovery.

## Accessibility intent

Visual hierarchy should agree with semantic reading and focus order. Reflow must
not separate labels, explanations, errors, or actions from the content they
serve. Theme variation must preserve legibility and state meaning, and realistic
content must not expose inaccessible overflow or truncation.

Semantic markup, component APIs, focus management, and responsive implementation
belong to components, layout families, and consumer guidance.

## Representative examples

- A dense data page still exposes one clear title, control region, primary data
  region, and action hierarchy when viewed at a glance.
- A card collection retains alignment and grouping with realistic titles,
  metadata, and missing optional content.
- A narrow layout moves supporting regions without changing reading order or
  hiding the primary action.

## Visual references

No normative assets are included in this seed draft. Representative full-page
and block examples should be added under
`docs/design/assets/template-composition/` in light, dark, wide, and constrained
states before promotion.

## Component contract links

No component contract links are asserted. The listed layout-family relationships
are candidates for review; consumer templates remain responsible for using the
public contracts those families expose.

## Decision log

No repository design decision has approved this record yet. This draft migrates
only the human visual-quality axes from the public Design Conventions wiki; it
deliberately excludes authoring mechanics and audit grading.

## Open questions

- **OQ1 — Representative templates.** Which page templates and blocks should be
  normative examples for each composition requirement?
- **OQ2 — Product chrome boundary.** Which structural regions belong to a
  reusable page template versus the host application?
- **OQ3 — Evidence.** How should screenshot review demonstrate hierarchy and
  composition without turning subjective judgment into a misleading score?

## Content boundary

This file defines human visual intent for template composition. It does not
define required React components, raw-HTML policy, icon plumbing, styling
mechanics, mock-data sources, documentation metadata, line-count targets, audit
grades, or consumer instructions.
