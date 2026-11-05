---
schema_version: 1
template_version: 1
kind: design
id: design:color-emphasis
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, theming, accessibility]
verified_by: []
architecture:
  [
    architecture:theme-tokens,
    architecture:theme-authoring-contract,
    architecture:component-theming-surface,
  ]
components: []
families: []
deciding_specs: []
---

# Color emphasis design specification

## User intent

People should find the primary action and understand surface and status roles
without decoding arbitrary colors. Color should preserve legibility and hierarchy
across supported modes and themes.

## Design principles

- **DR1 — Foreground and background are one decision.** A color choice MUST be
  evaluated in the context of the surface it sits on.
- **DR2 — Neutral color follows semantic role.** Interaction overlays, tracks,
  content containers, and self-contained elements MUST remain distinguishable
  even when their neutral values look similar.
- **DR3 — Emphasis remains scarce.** A local action group SHOULD expose one clear
  primary emphasis rather than making every action compete equally.
- **DR4 — Status follows its canonical feedback contract.** Color emphasis MUST
  preserve the non-color cues and prominence defined by
  `design:system-states` rather than inventing another status treatment.
- **DR5 — Interaction overlays preserve context.** Hover and press treatment
  SHOULD visually combine with the underlying surface rather than replace it with
  an unrelated opaque block.

## Anatomy and hierarchy

| Role             | Purpose                                              | Required relationship                                       |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| base surface     | Establishes page, container, or element context      | Determines the meaning and legibility of foreground choices |
| foreground       | Carries text, icon, or boundary information          | Remains legible against its paired surface                  |
| interaction tint | Communicates transient response                      | Preserves the identity of the underlying surface            |
| primary accent   | Directs attention to the most important local action | Remains visually stronger than peer actions                 |

## State representation

Rest, hover, press, focus, selected, and disabled states MUST remain perceptually
distinct in every supported mode. Status representation is owned by
`design:system-states`. Supporting and disabled text MUST not become
indistinguishable merely because both are quieter than body text.

## Responsive and input behavior

- **DR6 — Emphasis survives density.** When actions collapse or move, the primary
  action MUST remain identifiable without amplifying every remaining control.
- **DR7 — Hover color is optional feedback.** Touch and keyboard paths MUST retain
  state meaning without depending on hover tint.

## Accessibility intent

Foreground/background pairs must remain legible across supported modes. Color
emphasis must not weaken the non-color status cues owned by
`design:system-states`. Exact thresholds and mechanical contrast
verification remain accessibility and audit responsibilities.

## Representative examples

- A toolbar exposes one primary action while secondary and destructive actions
  remain clear without sharing the same emphasis.

## Visual references

No normative assets are included. Action hierarchy and semantic-neutral examples
should be added under `docs/design/assets/color-emphasis/` before promotion.
Status examples remain with `design:system-states`.

## Component contract links

No component links are asserted in this seed draft.

## Decision log

No repository design decision has approved this record yet. It distills color
role and emphasis intent from the public Design Conventions wiki while delegating
token vocabulary and theme mechanics to architecture.

## Open questions

- **OQ1 — Primary-action scope.** Which containers reset the local primary-action
  hierarchy?
- **OQ2 — Representative themes.** Which themes and modes form the minimum
  evidence set for role preservation?

## Content boundary

This file defines color role and emphasis. It does not define token names, raw
values, contrast thresholds, theme APIs, component props, or audit checks.
