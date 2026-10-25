---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-100
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:interaction-modality]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Release velocity system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/BottomSheet/**",
    "packages/core/src/Item/**",
    "packages/core/src/Toast/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

When a person flicks a sheet, a toast, a row, a page, or a wheel and lifts
their finger, every Core and Lab component of that kind reads the same speed
from that motion, as iOS does, and a finger that stopped before lifting never
counts as a flick. Components share the reading of a flick; each decides, by
its own threshold, what that speed does. One release filter defines the
speed every component reads; components decide only what a given velocity
means for them.

## Non-goals

- What a component does with the velocity: its flick threshold, its commit
  point, its projection, and its settle curve stay with the component and its
  record.
- Pinch scale velocity and scroll physics the browser owns.
- Public API: the velocity source, its filter values, and every threshold stay
  internal (`spec:AST-002` FR3).
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — One velocity per kind of surface.** Every Core and Lab component that
  reads the velocity of a pointer gesture reports it in CSS pixels per second
  on each physical axis, and components of the same kind report the same
  velocity for the same contact motion. Dragged surfaces are a sheet's drag, a
  toast's swipe, a row swipe, a navigation pop, and interactive dismiss;
  scrolling surfaces are paging and a wheel picker. `architecture:interaction-modality` INV10
  owns the source in Core and how a Lab component matches it.
- **FR2 — A moving finger reads as on iOS; a still finger never flicks.** The
  velocity a component reads when the contact lifts is the velocity iOS
  reports for the same motion: a pan's velocity for a dragged surface, and a
  scroll view's release velocity for a scrolling surface. It is 0 when the
  contact stayed still for longer than a fixed stillness interval before
  lifting, the one case where it differs from iOS. Every component of a kind
  reads the same release velocity and none reads another estimate. The stillness
  interval is an internal tuning value; how the velocity is computed is
  `architecture:interaction-modality` INV10.
- **FR3 — Thresholds sit on top of the one velocity.** A component's flick,
  fling, or commit threshold compares the FR2 velocity, possibly with travel
  or projection the component owns. Thresholds are per-component tuning that
  stays internal (`spec:AST-002` FR3); a component never derives a second
  velocity to compare against.
- **FR4 — Event time for every pointer.** The velocity follows the input
  events' own timestamps, so a handler that runs late does not change it, and
  the same motion gives the same velocity for touch, pen, and mouse pointers.
- **FR5 — Direction follows the rendered direction.** A flick toward the
  logical end moves toward the logical end in both directions
  (`design:bidirectionality` DR13); a component maps the physical velocity onto
  its logical axis from the rendered direction
  (`architecture:internationalization` INV11).

### Platform support

- Supported feature/engine floor: the package's supported browsers
  (`spec:AST-013` FR1, FR3); pointer events with event timestamps.
- Unsupported behavior: a gesture with fewer than two moved samples
  has a release velocity of 0.
- Browser evidence: FR4 depends on the timestamps browsers put on pointer
  events, so it needs real-browser evidence in Safari on iOS and Chrome on
  Android (`spec:AST-013` FR10); unit and component tests in Verification prove
  FR1–FR3 and FR5, and real-device feel for each component remains that
  component's evidence.

## Current-state impact

- No velocity source exists in Core on `main`. Its first landing meets FR1–FR5
  and `architecture:interaction-modality` INV10: iOS's blend with the FR2
  stillness reset, and no selectable alternative filters. A Lab gesture
  matches it as INV10 describes.
- BottomSheet's drag estimates velocity from a two-point window over its
  recent samples with event timestamps. Under FR1 and FR2 it reads the tracker.
- Item's row swipe compares a speed in pixels per millisecond timed with the
  handler's clock. Under FR1, FR2, and FR4 it reads the tracker in pixels per
  second with event timestamps, and keeps its own threshold (FR3).
- Toast's swipe averages travel over the whole drag timed with the wall clock.
  Under FR1, FR2, and FR4 it reads the tracker, and keeps its own threshold
  (FR3).
- A component that later reads gesture velocity, such as paging, a wheel
  picker, a navigation pop, or interactive dismiss, reads it from the tracker.

## Verification

| Contract | Verification                                                                                                                          | Representative states                                                                                                               | Mutation or failure expectation                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR1      | One recorded sample stream read through two different components, plus a unit check                                                   | a sheet drag and a row swipe fed the same stream; a Lab gesture and a Core gesture fed the same stream; steady motion in x and y    | Two components of the same kind reporting different velocities for the same stream, or a unit other than pixels per second |
| FR2      | Release velocity tests through a component over recorded iOS streams                                                                  | recorded pan and scroll-view releases; acceleration before lift; a pause longer than the stillness interval before lift; one sample | A release that differs from the velocity iOS recorded for the same stream, or a non-zero release after a still pause       |
| FR3      | Component tests at each threshold                                                                                                     | a flick just under and just over a component's threshold; the same velocity across two components                                   | Two components of the same kind reading different velocities for the same flick, or a threshold reachable from public API  |
| FR4      | Unit tests with handler delay and per-pointer streams, plus real-browser pointer-event streams in Safari on iOS and Chrome on Android | delayed handlers with fixed event timestamps; touch, pen, and mouse streams                                                         | Velocity that changes with handler delay or pointer type                                                                   |
| FR5      | Component tests in both directions                                                                                                    | a flick toward the inline end in left-to-right and right-to-left                                                                    | A flick toward the inline end treated as the opposite action in right-to-left                                              |

## Decision log

### DEC-1 — One release filter that reads as iOS does, with a stillness reset; thresholds stay per component

**Reference:** `spec:AST-100/DEC-1`
**Decider:** `cixzhang`, `2026-10-24`

Each component estimating velocity its own way reads the same flick at
different speeds in components of the same kind, and counts a finger that
paused before lifting as a flick in one place and not another. One release filter, with one source in Core and no copy in Lab, gives every
component of a kind the same speed for the same motion. Reading a moving finger the way
iOS does keeps flicks, paging, and dismissal near their thresholds where an
iPhone puts them, and the stillness reset stops a resting finger from flinging,
which is the one place the filter departs from iOS. What a speed means stays
with each component as internal tuning, so components keep their feel without
a second estimator.

Rejected: a fixed time window, which reads quick flicks much faster than iOS; iOS's blend with no stillness reset, which flings after a rest; and several selectable estimators or per-component filters, which reintroduce the disagreement this record removes.

## Open questions

None.
