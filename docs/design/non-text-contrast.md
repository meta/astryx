---
schema_version: 1
template_version: 2
kind: design
id: design:non-text-contrast
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [rubyycheung, cixzhang]
review_triggers: [visual, theming, accessibility]
verified_by: [scripts/check-knowledge.mjs]
architecture: [architecture:theme-authoring-contract]
components: []
families: []
deciding_specs: []
---

# Non-text contrast design specification

## User intent

People with low vision find each control, see which state it is in, and read
the parts of a graphic that carry its meaning. A treatment that only decorates,
or that repeats information another visible cue already carries, does not
block that, so it does not have to reach the non-text threshold itself.

## Design principles

- **DR1 — Contrast follows the necessary visual information.** For WCAG 2.2
  1.4.11, the 3:1 threshold applies to the visual information a person needs to
  identify a component or a state, and to the parts of a graphic a person needs
  to understand its content.
- **DR2 — Suppression decides what is necessary.** A review MUST suppress the
  treatment under review, or inspect an equivalent rendering without it. If the
  component or state becomes materially less identifiable, or the graphic
  becomes materially less understandable, the treatment carries necessary
  information.
- **DR3 — An independent cue can carry the information.** A treatment need not
  itself meet 3:1 only when, with that treatment suppressed, another
  independent cue carries the same necessary information and meets its own
  threshold: 3:1 for a user-interface or graphic cue, or WCAG 2.2 1.4.3 for
  text.
- **DR4 — One qualifying cue is always present.** At least one cue that
  identifies each component or state MUST meet its applicable threshold.
  Several cues below their thresholds MUST NOT exempt one another.

## Anatomy and hierarchy

| Role            | Purpose                                                                                                                                                                                                                                                                       | Required relationship                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Treatment       | The boundary, fill, indicator, or graphic part reviewed                                                                                                                                                                                                                       | Meets 3:1 against adjacent colors, or DR3 names its independent cue |
| Independent cue | A different visible cue that carries the same meaning                                                                                                                                                                                                                         | Meets its own applicable threshold against its adjacent colors      |
| Adjacent colors | The colors the treatment or cue touches. A boundary is measured against the surface outside the component; its own fill counts as adjacent only when that fill is the interactive area or the cue that identifies the component, and an adornment's decorative fill does not. | Named in the evidence, per mode and state                           |

## State representation

| State            | Required representation                                              | Allowed variation                                            |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| resting boundary | The control is findable from at least one cue at its threshold       | A sub-threshold boundary when DR3 names the qualifying cue   |
| selected or on   | The state is identifiable from at least one cue at its threshold     | A sub-threshold fill when an indicator or text carries state |
| graphic part     | Each part needed to understand the graphic meets 3:1, or DR3 applies | Decorative parts have no threshold                           |
| inactive control | WCAG's inactive-component exception applies                          | Any contrast                                                 |

## Responsive and input behavior

- **DR5 — Evidence names what it measured.** Non-text contrast evidence MUST
  name the exact component, state, or graphic part; its adjacent colors; the
  treatment under review; the independent cue and its measured contrast, when
  DR3 is used; and the visual or manual evidence layer.

## Accessibility intent

This record decides when a treatment carries necessary information. The
WCAG 2.2 completeness review in `spec:AST-020` and the theme evidence in
`spec:AST-008` FR12 apply it; neither restates it.

## Representative examples

No examples are included yet.

## Visual references

No normative assets are included yet.

## Component contract links

No component contract links are asserted in this draft.

## Decision log

No design decision has approved this record yet.

## Open questions

None.

## Content boundary

This file decides which visual information carries the non-text contrast
threshold. It does not define token values, theme pairings, component props,
audit scores, or the checklist runner.
