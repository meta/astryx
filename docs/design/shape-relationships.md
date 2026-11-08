---
schema_version: 1
template_version: 1
kind: design
id: design:shape-relationships
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, theming, layout]
verified_by: []
architecture: [architecture:theme-tokens, architecture:theme-authoring-contract]
components: []
families: []
deciding_specs: []
---

# Shape relationships design specification

## User intent

Nested surfaces should read as parts of one intentional shape. Inner corners
should not visually fight their container, and decorative accents should not
break the geometry of rounded surfaces.

## Design principles

- **DR1 — Radius follows role.** Corner character MUST reflect whether an element
  is inner content, a control, a container, a page region, or a fully rounded form.
- **DR2 — Nested curves remain concentric.** Inner and outer corners MUST read as
  parallel shapes after accounting for the space between them.
- **DR3 — Shape character is systemic.** Themes SHOULD tune overall sharpness or
  roundness coherently rather than override isolated elements.
- **DR4 — Accents respect geometry.** Borders and edge accents MUST integrate with
  the corner shape instead of visibly colliding with it.

## Anatomy and hierarchy

| Role              | Purpose                           | Required relationship                                               |
| ----------------- | --------------------------------- | ------------------------------------------------------------------- |
| outer surface     | Establishes the containing shape  | Determines the curve available to nested content                    |
| intervening space | Separates nested boundaries       | Visually accounts for the difference between outer and inner curves |
| inner surface     | Continues the containing geometry | Reads as concentric with the outer surface                          |
| accent edge       | Adds emphasis or status           | Follows rather than interrupts the surface shape                    |

## State representation

Hover, focus, selection, and status borders MUST preserve the base geometry.
Changing state must not introduce a conflicting corner system.

## Responsive and input behavior

- **DR5 — Shape survives resizing.** Responsive changes MAY alter dimensions, but
  nested corner relationships MUST remain coherent.
- **DR6 — State rings follow the owner.** Focus or selection treatments MUST trace
  the visible owning shape without producing doubled or mismatched curves.

## Accessibility intent

Shape should reinforce boundaries and ownership but must not be the only signal
for state or grouping. Focus and status remain perceivable independent of corner
style.

## Representative examples

- A nested panel's inner curve follows its container and intervening space.
- A selected rounded card receives an integrated boundary rather than a thick
  side stripe that collides with its corners.

## Visual references

No normative assets are included. Nested and stateful examples should be added
under `docs/design/assets/shape-relationships/` before promotion.

## Component contract links

No component links are asserted in this seed draft.

## Decision log

No repository design decision has approved this record yet. It distills the
concentric-shape intent from the public Design Conventions wiki without copying
radius values or calculations.

## Open questions

- **OQ1 — Allowed exceptions.** Which components intentionally break concentric
  geometry because their content or clipping model requires it?
- **OQ2 — Evidence set.** Which nested surfaces and themes best demonstrate the
  relationship across sharp and rounded theme personalities?

## Content boundary

This file defines perceptual shape relationships. It does not define radius token
values, formulas, CSS, theme APIs, border widths, or audit checks.
