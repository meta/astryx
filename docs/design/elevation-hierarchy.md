---
schema_version: 1
template_version: 1
kind: design
id: design:elevation-hierarchy
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, theming]
verified_by: []
architecture: [architecture:layer-runtime, architecture:theme-tokens]
components: []
families: [family:overlay-dismissal]
deciding_specs: []
---

# Elevation hierarchy design specification

## User intent

People should understand which surface is above another without noticing an
overbuilt shadow system. A surface that looks higher should also cover lower
content and remain unclipped.

## Design principles

- **DR1 — Perceived and actual order agree.** A surface that appears higher MUST
  behave as the higher layer.
- **DR2 — Depth remains quiet.** Shadows and edges SHOULD communicate separation
  without becoming the dominant visual feature.
- **DR3 — One edge language leads.** A surface SHOULD use either a defined edge or
  soft elevation as its primary boundary rather than combining both at full
  strength.
- **DR4 — State rings are not elevation.** Input and focus rings MUST remain
  visually distinct from shadows that communicate layer depth.

## Anatomy and hierarchy

| Role             | Purpose                                      | Required relationship                            |
| ---------------- | -------------------------------------------- | ------------------------------------------------ |
| base content     | Establishes the reference plane              | Remains beneath temporary and floating surfaces  |
| floating surface | Presents content above the base              | Uses depth appropriate to its interaction role   |
| boundary cue     | Separates the surface from what is behind it | Supports rather than competes with elevation     |
| escape path      | Allows a floating surface to remain visible  | Prevents unintended clipping by lower containers |

## State representation

Resting content, floating menus, persistent overlays, and transient feedback MUST
form a coherent depth sequence. Focus or validation rings MUST NOT imply that a
control moved to another layer.

## Responsive and input behavior

- **DR5 — Depth survives repositioning.** A surface MAY move or resize to fit the
  viewport, but its perceived place in the hierarchy MUST remain stable.
- **DR6 — Floating content escapes containers.** Responsive clipping or scrolling
  MUST NOT make a surface appear underneath content it is meant to cover.

## Accessibility intent

Layer order must remain understandable through focus movement, semantics, and
content relationship, not shadow alone. High-contrast presentation should retain
clear boundaries even when soft shadows are unavailable.

## Representative examples

- A menu appears above its trigger and nearby sticky content without an exaggerated
  shadow.
- A modal and transient notification preserve their relative hierarchy when the
  viewport becomes constrained.

## Visual references

No normative assets are included. Representative layer combinations should be
added under `docs/design/assets/elevation-hierarchy/` before promotion.

## Component contract links

No component links are asserted. `family:overlay-dismissal` is a candidate
relationship for review, not an adoption claim.

## Decision log

No repository design decision has approved this record yet. It distills the
perceptual elevation intent from the public Design Conventions wiki and delegates
stacking mechanics to `architecture:layer-runtime`.

## Open questions

- **OQ1 — Boundary balance.** Which surface archetypes intentionally combine a
  subtle edge and shadow?
- **OQ2 — Evidence set.** Which nested layer sequence should be the normative
  visual and behavioral example?

## Content boundary

This file defines perceived depth. It does not define z-index values, portals,
layer allocation, overflow mechanics, shadow tokens, or dismissal behavior.
