---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-078
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture: [architecture:layer-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs: [useLayer, Popover]
---

# Transformed anchor placement system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A trigger can sit inside a box that a CSS transform moves: a panel sliding in, a
composer lifted above an on-screen keyboard, a scaled card. A person who opens a
menu from that trigger needs the menu against the trigger they see. An anchored
layer is placed against the box its anchor paints, in every supported engine,
from its first frame and while the transform changes.

## Non-goals

- Placement along a rotated or skewed anchor's own axes. A rotated or skewed
  anchor is placed against the rectangle that bounds it.
- Layers at fixed coordinates or with custom positioning, whose geometry is the
  caller's.
- The gutter, the size caps, the fallback order, and the app-declared inset,
  which `spec:AST-059` owns and which apply unchanged to the placed layer.
- Engines without CSS Anchor Positioning (`spec:AST-003` FR21–FR23).
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — The painted box is the anchor.** In every supported engine, an
  anchor-mode layer's placement, alignment, fallbacks (`spec:AST-059` FR4), and
  off-screen hold (`spec:AST-059` FR5) MUST resolve against its anchor's painted
  box: the axis-aligned rectangle that bounds the anchor's border box after every
  transform on the anchor and its ancestors. The layer runtime owns this; no
  component or caller measures the anchor to correct it.
- **FR2 — From the first frame and while it moves.** A layer opened while its
  anchor is under a transform MUST paint against the painted box in its first
  frame. When a transform on the anchor or an ancestor starts, changes, or ends
  while the layer is open, including an animated one, the layer MUST follow the
  painted box in every frame.
- **FR3 — Untransformed anchors are unchanged.** A layer whose anchor has no
  transform on it or its ancestors MUST be placed exactly as `spec:AST-059`
  places it. In an engine that resolves the painted box, the runtime adds no
  observation for any anchor.

### Platform support

- Supported feature/engine floor: CSS Anchor Positioning and the Popover API, as
  `spec:AST-059` requires. Engines differ in which box they resolve for an
  anchor under a transform; FR1 holds in each of them.
- Unsupported behavior: without CSS Anchor Positioning there is no anchored
  placement; `spec:AST-003` FR22 describes the reduced behavior.
- Browser evidence: the layer's rectangle against the anchor's painted rectangle
  in real Chromium and real WebKit on iOS, with the anchor inside a translated
  box, at open and in sampled frames while the transform animates.

## Current-state impact

- `spec:AST-059` FR8: "The one observation the runtime makes, whether the anchor
  is in view (FR5)" becomes two observations. Visibility is read before the
  layer's first paint and thereafter only when it changes, as FR8 states. In an
  engine that resolves the untransformed box, the anchor's painted box is read
  before the layer's first paint and thereafter only while the layer is open.
  FR8's guarantee that a layer never paints at a geometry it is about to correct
  is unchanged.
- `architecture:layer-runtime`: Positioning states that anchor mode places
  against the painted box in every engine; INV12 names the second observation.
- `useLayer` and Popover consumer docs: no change for callers; a trigger under a
  transform needs no workaround.

## Verification

| Contract | Verification                                                                          | Representative states                                                                                                       | Mutation or failure expectation                                                                                       |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FR1      | Real-browser geometry in Chromium and in WebKit on iOS                                | Anchor inside a box translated up; placement below and above; a block flip; an off-screen anchor                            | The layer's anchor-facing edge off the painted box by more than the clearance, or placed at the untransformed box     |
| FR2      | First-frame and settled rectangles; rectangles sampled each frame of a transition     | Opened while translated; a 300ms transition that translates the anchor's box while open, from no transform and back to none | A first frame that differs from the settled one, or a sampled frame with the layer off the painted box                |
| FR3      | The `Core/Layer` viewport-inset stories unchanged; a unit test of the observation set | Every existing viewport-inset story; an untransformed anchor; an engine that resolves the painted box                       | Any geometry change for an untransformed anchor, or an observation started in an engine that resolves the painted box |

## Decision log

### DEC-1 — The painted box is the anchor in every engine

**Reference:** `spec:AST-078/DEC-1`
**Decider:** pending owner review

A person sees the trigger where it paints. A layer placed where the trigger
would be without its transforms covers the trigger or opens away from it, in one
engine and not another. The runtime owns the correction, so one layer behaves
the same in every engine and no component measures its anchor on its own.

Rejected: a caller-supplied placement or coordinates for a transformed anchor, which the runtime can derive (`spec:AST-002/FR2`).

### DEC-2 — The anchor's painted box is a second observation where engines need it

**Reference:** `spec:AST-078/DEC-2`
**Decider:** pending owner review

`spec:AST-059` FR8 allows the runtime one observation, anchor visibility.
Placing against the painted box in an engine that resolves the untransformed one
needs a second: the anchor's painted box, read before the first paint and while
the layer is open, so a transform present at open, one that a keyboard or a
sliding panel starts afterwards, and one that changes are all followed. It runs
only in such engines and only while a layer is open, and a layer still never
paints at a geometry it is about to correct.

Rejected: measuring after paint and moving the layer, which FR8 defines as a failure; following only a transform present at open, which leaves the layer behind when a trigger starts moving after it opens.

## Open questions

None.
