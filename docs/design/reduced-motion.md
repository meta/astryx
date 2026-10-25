---
schema_version: 1
template_version: 2
kind: design
id: design:reduced-motion
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [motion, interaction, accessibility]
verified_by: [scripts/check-knowledge.mjs]
architecture: [architecture:interaction-modality]
components: []
families: []
deciding_specs: []
---

# Reduced motion design specification

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/**"]
}
```

## User intent

A person who asks their device to reduce motion still sees every change Astryx
shows, with no travel, scaling, or springing. On a touch screen a change
cross-fades, as iOS does with Reduce Motion and Prefer Cross-Fade; with a mouse,
trackpad, or keyboard the change is immediate.

## Design principles

- **DR1 — No travel under reduced motion.** While the person prefers reduced
  motion (`prefers-reduced-motion: reduce`), a transition that a core component
  animates — an entrance, an exit, a switch between presentations, or a change
  of state — MUST NOT move, scale, resize, or spring its content. DR2 and DR3
  say what each pointer gets instead.

## Anatomy and hierarchy

| Role              | Purpose                                      | Required relationship                                 |
| ----------------- | -------------------------------------------- | ----------------------------------------------------- |
| origin state      | What the person sees before the change       | Leaves without moving                                 |
| destination state | What the person sees after the change        | Appears in its final place, size, and order           |
| cross-fade        | Connects the two states on a touch screen    | Changes opacity only, 200 ms or less                  |
| direct movement   | Content the person moves with their own hand | Follows the pointer or finger; it is not a transition |

## State representation

| State                             | Required representation                                     | Allowed variation          |
| --------------------------------- | ----------------------------------------------------------- | -------------------------- |
| reduced motion, coarse pointer    | Opacity-only cross-fade of 200 ms or less (DR2)             | A shorter cross-fade       |
| reduced motion, any other pointer | Immediate change (DR3), except a touch drag's release (DR2) | None                       |
| no reduced-motion preference      | Outside this record                                         | Component and theme motion |

## Responsive and input behavior

- **DR2 — Touch presentations cross-fade.** Under reduced motion, when the
  primary pointer is coarse (`pointer: coarse`), or when the release of a touch
  drag starts the transition, each DR1 transition MUST change opacity only and MUST finish in 200 ms or less. An entering element
  appears in its final place and fades in; a leaving element fades out where it
  is.
- **DR3 — Fine-pointer presentations change at once.** Under reduced motion,
  every other DR1 transition, when the primary pointer is not coarse, MUST complete
  immediately, with no animated property.
- **DR4 — No opt-out in core.** A core component, its props, and its theme
  values offer no way to keep travel, scaling, springs, or a longer animation
  under reduced motion, and a component's own motion settings do not override
  DR1–DR3.

Content that moves with the person's own pointer or finger during a drag
follows it as direct manipulation and is not a DR1 transition. A transition a
component starts when a touch drag is released, such as a swiped row sliding
out or returning (`spec:AST-057` FR5), cross-fades as DR2 says, because a
finger started it. Any other transition, such as one sheet handing off to
another (`component:BottomSheetSwitcher` FR3), follows DR2 on a coarse primary
pointer and DR3 otherwise.

## Accessibility intent

Reduced motion removes movement, never information. The person still perceives
that something appeared, left, or changed, and the result is the same as
without the preference. Focus and announcements are unchanged.

## Representative examples

- With Reduce Motion on a phone, a menu opened by a tap fades in where it lands
  instead of sliding or scaling in.
- With Reduce Motion on a phone, a bottom sheet presented by a tap fades in at
  its resting height instead of rising from the bottom edge.
- With reduced motion and a mouse, a Tooltip, Popover, or Dialog appears and
  disappears in one frame.

## Visual references

No normative assets are included.

## Component contract links

- `spec:AST-057` FR5 implements DR2 for a swiped row's slide out,
  spring back, and hold-out.
- `component:BottomSheetSwitcher` FR3 and ORD1 implement DR2 and DR3 for a
  handoff between sheets.

### Verification

| Contract | Verification                                                          | Representative states                                                                              | Failure signal                                                                                                              |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| DR1, DR2 | Real-browser computed animations under reduced motion, coarse pointer | Layer entrance and exit (Tooltip, Popover, menu); Dialog; modal BottomSheet; a presentation switch | An animated transform, size, or position; a spring; a property other than opacity; over 200 ms; a change with no cross-fade |
| DR1, DR3 | Real-browser computed animations under reduced motion, fine pointer   | The same components                                                                                | Any animated property, or a frame where the change is partly applied                                                        |
| DR4      | Component prop and theme review plus the browser checks above         | A component with a motion prop or theme motion value set                                           | A prop or theme value that restores travel or a longer animation under reduced motion                                       |

## Decision log

### DEC-1 — Reduced motion matches iOS: cross-fade on touch, immediate otherwise

**Reference:** `design:reduced-motion/DEC-1`
**Decider:** `cixzhang`, `2026-10-24`

People who turn on Reduce Motion on a touch device expect the platform's
behavior, where changes cross-fade instead of moving, and a fade keeps the
change noticeable without travel. With a fine pointer the change happens at
once, so nothing moves and nothing waits. One rule for every core component,
with no component able to keep its motion, means the preference is honored
everywhere the same way.

Rejected: a per-component setting that keeps full motion under reduced motion.

## Open questions

None.

## Content boundary

This record defines what a person sees under reduced motion. It does not
define durations or easing outside reduced motion, tokens, CSS properties,
animation APIs, continuous status indicators such as a spinner, or audit
checks.
