---
schema_version: 1
template_version: 1
kind: design
id: design:motion
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [ernestt, cixzhang]
review_triggers: [visual, interaction, accessibility, motion]
verified_by: []
architecture: [architecture:theme-tokens]
components: []
families: []
deciding_specs: []
---

# Motion design specification

## User intent

Movement should clarify what changed and where content came from without making a
surface feel theatrical or sluggish. Every state change should remain understandable
when motion is reduced.

## Design principles

- **DR1 — Motion carries meaning.** Animation MUST explain response, continuity,
  entry, exit, or spatial change rather than decorate otherwise static content.
- **DR2 — Weight determines timing.** Small local feedback SHOULD feel faster
  than large entrances, exits, or continuous movement.
- **DR3 — Movement settles naturally.** Easing SHOULD communicate controlled
  deceleration rather than ornamental bounce or elasticity; a theme's
  expressive character may overshoot on entrances and moves only
  (`spec:AST-108`).
- **DR4 — Stable content stays stable.** Motion SHOULD avoid unnecessary layout
  disruption and preserve reading and interaction context.
- **DR5 — Reduced motion preserves meaning.** Every animated transition MUST have
  an immediate or minimally moving form that communicates the same state change.
  `design:reduced-motion` owns the current reduced-motion rule.

## Anatomy and hierarchy

| Role                | Purpose                                     | Required relationship                               |
| ------------------- | ------------------------------------------- | --------------------------------------------------- |
| origin state        | Establishes what is changing                | Remains identifiable until continuity is clear      |
| transition cue      | Connects origin and destination             | Uses only the movement needed to explain the change |
| destination state   | Shows the completed result                  | Settles without residual decorative activity        |
| reduced-motion path | Communicates the same result without travel | Preserves timing and status meaning where needed    |

## State representation

Hover and press use the lightest useful response; entrances and exits may use a
more visible transition; large or continuous movement requires stronger user
justification. Loading and status MUST remain understandable without animation.

## Responsive and input behavior

The source wiki does not establish responsive-path, interruption, or
input-specific motion rules beyond the principles above. Those concerns remain
open for separately evidenced decisions.

### Hover-summoned layer entrance

This rule is DEC-2, pending owner review. A layer is hover-summoned when it
opens because a hover-capable pointer rested on its trigger and no press or key
started the opening: a tooltip, a hover card, or a menu, flyout, or popover that
opens on hover.

- A hover-summoned layer appears at once, or with an entrance that does not
  travel and runs no longer than the shortest timed hover or press response.
- The same layer opened by a press or a key keeps its own entrance.
- The entrance follows the input that opened the layer, not a per-surface
  setting.

Verification is a real-browser measurement of the entrance when the same layer
opens by hover, by a press, and by a key. It fails when the hover open's
entrance travels or runs longer than the shortest timed hover or press response,
or when the press or key open loses the layer's own entrance.

## Accessibility intent

Motion must not be required to perceive status, hierarchy, or completion. Reduced
motion should suppress unnecessary travel while preserving feedback. Animated
content should not repeatedly steal attention from reading or input.

## Representative examples

- A pressed control responds immediately without launching decorative movement.
- A surface entrance explains where new content belongs, then settles quietly.
- Reduced-motion mode shows the same completed state without spatial travel.

## Visual references

No normative assets are included. Micro-interaction, entrance/exit, and
reduced-motion pairs should be added under `docs/design/assets/motion/` before
promotion.

## Component contract links

No component links are asserted in this seed draft.

## Decision log

No repository design decision has approved this record yet. It distills motion
intent from the public Design Conventions wiki without copying duration values,
CSS properties, or audit mechanics.

### DEC-2 — A hover-summoned layer enters as local feedback

**Reference:** `design:motion/DEC-2`
**Decider:** pending owner review

A pointer has already waited out the hover dwell when a hover-summoned layer
opens, so a full entrance on top makes every hover reveal feel slow, and a
pointer sweeping across several hover triggers replays that entrance each time.
The entrance therefore appears at once or runs no longer than the shortest timed
hover or press response, and the input that opened the layer decides it, so no
surface tunes a duration of its own.

Rejected: the same entrance for every input, which stacks the full entrance on the dwell; a duration chosen per surface, which restates a timing value at every call site.

## Open questions

- **OQ1 — Reference transitions.** Which component interactions should be the
  normative examples for local, entrance/exit, and large movement?
- **OQ2 — Interruption and reflow.** What requirements should govern reversing,
  cancelling, replacing, or responsively reflowing an active transition?
- **OQ3 — Allowed expressive motion.** Which product contexts, if any, justify a
  deliberately expressive treatment beyond functional continuity?

## Content boundary

This file defines motion intent. It does not define duration or easing tokens,
CSS properties, animation APIs, component behavior, or audit checks.
