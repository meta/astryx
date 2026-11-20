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
open for separately evidenced decisions, except the hover-to-display rule below.

### Hover-to-display delay

A hover-to-display interaction is anything a hover-capable pointer reveals,
shows, or expands: a tooltip, a hover card, a hover-opened menu or flyout, a
container that reveals content on hover, a preview, or a popover that opens on
hover.

- **Entry delay.** A hover-to-display interaction MUST wait a small delay
  before it renders or updates, so a pointer brushing across the trigger does
  not cause eager rendering or updates. The surface's owner chooses the default
  delay; its record MAY set the delay to zero, with its reason
  (`architecture:interaction-modality` INV11).
- **Exit guard.** Leaving the trigger MUST NOT flicker the content out: the
  content stays until a short exit delay elapses or, for a container reveal,
  until its fade completes, so a brush out and back in reads as one hover. Under
  `prefers-reduced-motion: reduce` a container reveal's fade is instant
  (`design:reduced-motion` DR3), so its content leaves at once.
- **Pointer-specific.** Keyboard focus reveals immediately with no dwell. The
  hover gate never delays touch or a coarse pointer; whether a tap opens a
  surface stays with its owner (`architecture:interaction-modality` INV4).
- **Group hand-off.** Within a group of triggers, a pointer that moves from one
  open trigger to the next shows the next at once; the entry delay applies to
  the first open only (`architecture:interaction-modality` INV11).
- **Default on; adjustable.** The delay and guard are on by default, and each
  owner sets its own default values. A timer-driven surface (a tooltip, a hover
  card, a hover-opened menu or flyout) exposes them as `delay` and `hideDelay`,
  in milliseconds, and a caller shortens or removes them only for a stated use
  case. A container reveal keeps its timing in CSS; a caller opts into its
  entry delay with `hoverDelay`, and its exit fade has no option.

Inventory of hover-to-display surfaces and their defaults:

| Surface                                         | Entry delay                               | Exit guard                              | Conforms                                             |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `Tooltip`                                       | on, `delay`                               | `hideDelay`, else the hover bridge      | yes                                                  |
| `HoverCard`                                     | on, `delay`                               | on, `hideDelay`                         | yes                                                  |
| `TopNavMenu`                                    | on, `delay`                               | on, `hideDelay`                         | yes                                                  |
| `TopNavMegaMenu`                                | on, `delay`                               | on, `hideDelay`                         | yes                                                  |
| `DropdownMenu` submenu                          | on, no option                             | on, no option                           | partial: no `delay` or `hideDelay` option            |
| `SideNavItem` collapsed flyout                  | on, no option                             | on, no option                           | partial: no `delay` or `hideDelay` option            |
| `TopNavHeading` menu                            | none on a first open, no option           | on, no option                           | no: first open has no entry delay (gap, FR5)         |
| `SideNavHeading` menu                           | none on a first open, no option           | on, no option                           | no: first open has no entry delay (gap, FR5)         |
| `Slider` value tooltip                          | none (`delay` set to zero)                | on                                      | no: zero delay with no recorded reason               |
| `Overlay` with `showOn="hover"`                 | none, no option                           | exit fade, instant under reduced motion | no: no entry delay                                   |
| Container reveal (`Thumbnail`, `TreeList` rows) | opt-in                                    | exit fade, instant under reduced motion | partial: entry delay opt-in                          |
| Markdown heading links                          | none (`module:Markdown/headingLinks` AR3) | exit fade, instant under reduced motion | partial: zero delay recorded in AR3 without a reason |

A surface listed as not conforming is a gap for its owner to close or to justify
with a recorded use case; this record does not change its shipped behavior.

### Verification

| Contract | Verification                                                                    | Representative states                                                                       | Failure signal                                                         |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| DEC-1    | Unit tests with fake timers for tooltip, hover card and menu timing             | brush in and out under the delay; dwell past the delay; leave and re-enter within the guard | content rendered before the delay elapses, or removed during the guard |
| DEC-1    | Real-browser tests of container reveals                                         | dwell; brush past; leave; reduced motion                                                    | content revealed before the dwell, or a fade under reduced motion      |
| DEC-1    | Real-browser keyboard and coarse-pointer tests                                  | focus-within; a finger on a trigger                                                         | any dwell before a focus reveal; a hover delay applied to touch        |
| DEC-1    | Evidence gap: no group hand-off test exists until the INV11 recognizer is built | move from one open trigger to the next in a group; first open                               | —                                                                      |
| DEC-1    | Inventory review on a new or changed hover-to-display surface                   | each surface above                                                                          | a surface with no entry delay and no recorded use case                 |

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

- Each surface in the inventory above owns its delay and guard values;
  `architecture:interaction-modality` INV11 owns the hover-intent mechanism.

## Decision log

This record distills motion intent from the public Design Conventions wiki
without copying duration values, CSS properties, or audit mechanics. One point
is decided:

### DEC-1 — Every hover-to-display interaction is debounced

**Reference:** `design:motion/DEC-1`
**Decider:** `cixzhang`, `2026-10-11`; the `delay` and `hideDelay` options, `2026-11-06`

Every hover-to-display interaction requires a small delay to prevent brush-over
eager rendering and updates, and an exit guard so the content does not flicker
out. The delay exists to prevent users brushing the interface from causing janky
rerenders while they move their pointer; it is input handling, not motion
taste. Keyboard focus reveals immediately and coarse pointers are not gated.
Defaults are on; a caller opts out only for a stated use case. Timer-driven
hover surfaces (tooltips, hover cards, hover-opened menus and flyouts) expose
the wait as `delay` and the exit guard as `hideDelay` (milliseconds), as
Tooltip, HoverCard and TopNavMenu already do. Within a group of triggers, a
pointer moving from one open trigger to the next shows the next at once
(`architecture:interaction-modality` INV11). Removing a
surface's default delay is rejected inside this decision: it trades a pointer
guard for no benefit to keyboard or touch users, who already see the content at
once.

## Open questions

- **OQ1 — Reference transitions.** Which component interactions should be the
  normative examples for local, entrance/exit, and large movement?
- **OQ2 — Interruption and reflow.** What requirements should govern reversing,
  cancelling, replacing, or responsively reflowing an active transition?
- **OQ3 — Allowed expressive motion.** Which product contexts, if any, justify a
  deliberately expressive treatment beyond functional continuity?

## Content boundary

This file defines motion intent and the hover-to-display rule. It does not
define duration or easing tokens, CSS properties, animation APIs, other
component behavior, or audit checks.
