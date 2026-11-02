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

- **Entry delay.** Every hover-to-display interaction MUST wait a small delay
  before it renders or updates, so a pointer brushing across the trigger does
  not cause eager rendering or updates.
- **Exit guard.** Leaving the trigger MUST NOT flicker the content out: the
  content stays until a short exit delay elapses or, for a container reveal,
  until its fade completes, so a brush out and back in reads as one hover.
- **Pointer-specific.** Keyboard focus reveals immediately with no dwell. Coarse
  pointers and touch are not gated; they reveal or keep the content visible.
- **Default on; stated opt-out.** The delay and guard are on by default. A
  caller may shorten or remove them only for a stated use case, through the
  surface's documented option.
- **Shared timing.** A surface takes its timing from the shared defaults rather
  than inventing its own: `useMenuHover` (`showDelay`, `hideDelay`) for
  hover-opened menus and flyouts, `useTooltip` and `useHoverCard` (`delay`,
  `hideDelay`) for tooltips and hover cards, and `useContainerReveal`
  (`hoverDelay`, with the exit fade on the `--duration-fast` token) for
  container reveals. A new hover-to-display surface reuses one of these.

Inventory of hover-to-display surfaces and their defaults:

| Surface                                                                     | Entry delay                     | Exit guard                                   | Conforms                                            |
| --------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `Tooltip` (`useTooltip`)                                                    | `delay` on                      | `hideDelay`, else the hover bridge           | yes                                                 |
| `HoverCard` (`useHoverCard`)                                                | `delay` on                      | `hideDelay` on                               | yes                                                 |
| `DropdownMenu` submenu (`useMenuHover`)                                     | `showDelay` on                  | `hideDelay` on                               | yes                                                 |
| `TopNavMegaMenu` (`useMenuHover`)                                           | `delay` on                      | `hideDelay` on                               | yes                                                 |
| `TopNavHeading` menu (`useMenuHover`)                                       | `showDelay` set to none         | `hideDelay` on                               | no: entry delay removed without a recorded use case |
| `SideNavHeading` collapsed flyout (`useMenuHover`)                          | `showDelay` set to none         | `hideDelay` on                               | no: entry delay removed without a recorded use case |
| `SideNavItem` collapsed flyout (`useMenuHover`)                             | `showDelay` on                  | `hideDelay` on                               | yes                                                 |
| `useContainerReveal` (`Thumbnail`, `TreeList` rows, Markdown heading links) | `hoverDelay`, off unless passed | exit fade with deferred `position` reset, on | partial: exit guard on, entry delay opt-in          |

A surface listed as not conforming is a gap for its owner to close or to justify
with a recorded use case; this record does not change its shipped behavior.

### Verification

| Contract | Verification                                                                           | Representative states                                  | Failure signal                                             |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| DEC-1    | Hook unit tests with fake timers: a hover shorter than the entry delay renders nothing | brush in and out under the delay; dwell past the delay | content rendered or state updated before the delay elapses |
| DEC-1    | Hook unit tests: leaving and re-entering within the exit guard keeps the content       | brush out and back in; leave past the guard            | content unmounted or faded out during the guard            |
| DEC-1    | Keyboard and coarse-pointer tests                                                      | focus-within; coarse pointer                           | any dwell before a focus reveal; touch content hidden      |
| DEC-1    | Inventory review on a new or changed hover-to-display surface                          | each surface above                                     | a surface with no entry delay and no recorded use case     |

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

- `useMenuHover`, `useTooltip`, `useHoverCard`, and `useContainerReveal`
  (core hooks) carry the hover-to-display delay and exit guard for the surfaces
  in the inventory above.

## Decision log

This record distills motion intent from the public Design Conventions wiki
without copying duration values, CSS properties, or audit mechanics. One point
is decided:

### DEC-1 — Every hover-to-display interaction is debounced

**Reference:** `design:motion/DEC-1`
**Decider:** `cixzhang`, `2026-10-11`

Every hover-to-display interaction requires a small delay to prevent brush-over
eager rendering and updates, and an exit guard so the content does not flicker
out. The delay exists to prevent users brushing the interface from causing janky
rerenders while they move their pointer; it is input handling, not motion
taste. Keyboard focus reveals immediately and coarse pointers are not gated.
Defaults are on; a caller opts out only for a stated use case. Removing a
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

This file defines motion intent. It does not define duration or easing tokens,
CSS properties, animation APIs, component behavior, or audit checks.
