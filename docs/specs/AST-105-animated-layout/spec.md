---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-105
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:react-component-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs: [useAnimatedLayout, TreeList, Collapsible]
---

# Animated layout system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

When something inside an area changes size, the changed element and the
content after it animate together on one shared motion role instead of
jumping. An app opts in once per area; without it, nothing changes.

## Non-goals

- Content outside the area, and content in another document or an iframe.
- How the glide is produced, which `architecture:react-component-runtime`
  INV12 owns.

## Public contract

```tsx
const scrollRef = useRef(null);
const animatedLayout = useAnimatedLayout({containerRef: scrollRef});
<ScrollableArea ref={scrollRef} label="Project">
  <TreeList items={items} animatedLayout={animatedLayout} />
  <p>Notes</p>
</ScrollableArea>;
```

## Requirements

- **FR1 — One hook, one handle, one prop.** `useAnimatedLayout({containerRef})`
  returns an opaque `animatedLayout` handle with no public methods or fields.
  An app passes it to a component whose size changes through that
  component's `animatedLayout` prop, and the component reports each change.
  `containerRef` names the area; ScrollableArea does not register itself, and
  an app passes the ref it already gives ScrollableArea, which reaches the
  native scroll viewport. Each adopting component's record documents its
  `animatedLayout` prop.
- **FR2 — Without a handle, nothing changes.** A component without a handle
  keeps its behavior: the changed element shows its change as its own record
  says, and content after it takes its place at once.
- **FR3 — The content after a change glides within the area.** For any change
  a component holding the handle reports, such as a disclosure opening,
  content loading in, a message appearing, or an item inserted or removed,
  the content after it inside the area moves from its old place to its new
  one instead of jumping, at every ancestor level up to the area and never
  past it. An element moves only when its layout rectangle changed and it is
  in the area's visible part. Which elements move is listed under Coverage.
  Shifted content may mix Astryx components and plain app elements, and none
  of it opts in. Several changes in one area, nested or not, compose: each
  element moves once, by its total change. The area never scrolls because of
  the glide.
- **FR4 — One shared motion.** The changed element plays its own animation,
  entering, exiting, or resizing, and the content after it moves with it.
  Both read the same motion role, `springs.settle` (`spec:AST-094`
  FR4), so the timing is governed centrally, never per component; both start
  on the same frame, and Reduce Motion reaches both through that role, as
  `design:reduced-motion` DR1–DR3 require: a cross-fade under a coarse
  primary pointer, an immediate change otherwise.
- **FR5 — Every pointer.** The glide applies under every pointer, a mouse
  included: it removes a layout jump that people using a fine pointer see
  too, so it is a named fine-pointer change under `spec:AST-017` FR59, and
  adopting pull requests show fine-pointer evidence before and after.
- **FR6 — Admission.** Two otherwise identical pages differ in whether content
  after a size change glides or jumps, and in which container bounds it,
  which only the caller knows (`spec:AST-002` FR1, FR5). The handle is
  configuration, not a rendered slot; no other API does this job; and it is
  not a visual boolean.
- **FR7 — Documentation.** The hook's documentation reads: "Returns a handle
  to pass to a component whose size changes, such as TreeList or Collapsible.
  When that component changes size, it and the content after it inside
  `containerRef` animate together on one shared motion role. Fixed and stuck
  sticky elements stay put, the glide never scrolls the area, and Reduce
  Motion is respected."

## Coverage

What moves inside an area, each case with its test:

| Case                                                                                        | Behavior                                                                                                                | Test                                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Normal-flow block siblings after the changed element, at each ancestor level up to the area | Moves when its rectangle changed                                                                                        | Nested changed element with block siblings at three levels           |
| An element with `display: contents`                                                         | Has no box; its children are taken in its place                                                                         | A following `display: contents` wrapper with two children            |
| Absolutely positioned or fixed elements                                                     | Skipped and take their final place; an absolute child of a moving element rides with it                                 | One of each, plus an absolute badge on a moving row                  |
| Sticky elements                                                                             | In flow while unstuck, so moves when its rectangle changed; a stuck element takes its final place                       | A sticky header above and below its stuck point                      |
| Floats                                                                                      | Moves when its rectangle changed                                                                                        | A float after the changed element                                    |
| Flex and grid items after the changed element, including wrap and row direction             | Moves when its rectangle changed                                                                                        | A wrapping flex row and a row-direction neighbor that does not shift |
| Hidden, `display: none`, or zero-size elements                                              | Skipped                                                                                                                 | One of each after the changed element                                |
| Changed elements outside the area's visible part                                            | Take their final place without animation                                                                                | A long list with changed rows above and below the fold               |
| Elements under a scaled or transformed ancestor                                             | Moves by its layout change, corrected for the ancestor's scale                                                          | A moving row inside a scaled panel                                   |
| Portals and top-layer content                                                               | Never moved                                                                                                             | A popover open from a following row                                  |
| Elements already moving                                                                     | Keep their running motion and add the new move to it                                                                    | Two changes 100 ms apart                                             |
| Nested areas                                                                                | Motion stops at the area of the handle the changed component holds; an inner area moves as one unit within an outer one | An area inside an area, changed in the inner one                     |

Out of coverage, each taking its final place at once:

- content outside the area, and content in another document or an iframe;
- inline text and other non-replaced inline content, which cannot take a
  transform;
- flex or grid items earlier in the DOM that `order` places after the change,
  since only content after the change in the DOM moves;
- text reflowing inside a paragraph beside a float;
- elements the app moves itself with its own transforms;
- an anchored popover tied to a moving element, which layer anchoring keeps
  in place (`architecture:layer-runtime`).

## Current-state impact

- No Core component takes `animatedLayout` yet; TreeList and Collapsible are
  the first adopters, and their docs gain the `animatedLayout` prop.
- Core gains the `useAnimatedLayout` export and its documentation (FR7).
- `architecture:react-component-runtime` INV12 produces the glide.

## Verification

| Contract      | Verification                                                                                               | Representative states                                                                                  | Mutation or failure expectation                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2      | Unit and browser tests with and without a handle                                                           | a handle on TreeList; no handle; a ScrollableArea ref                                                  | a handle with public members, behavior that changes without a handle, or ScrollableArea registering itself fails                                     |
| FR3, Coverage | Real-browser tests, one per Coverage row                                                                   | each Coverage row; mixed Astryx and plain content; two changes in one frame; an area scrolled mid-list | an element that behaves other than its row says, an element moved twice for one frame, content past the area that moves, or the area scrolling fails |
| FR4           | Real-browser frame capture under a coarse and a fine pointer, with and without Reduce Motion               | a changed element and its visible followers                                                            | starting on different frames or reading different motion, a component-specific timing, or Reduce Motion applied to one and not the other fails       |
| FR5           | Fine-pointer before-and-after evidence on each adopting pull request, from the component's Storybook story | a mouse on each adopting component                                                                     | a glide missing under a mouse, or an adopting pull request without that evidence, fails                                                              |

## Decision log

### DEC-1 — One opt-in handle per area; the content after a change glides

**Reference:** `spec:AST-105/DEC-1`
**Decider:** `cixzhang`, `2026-10-25`

Content that jumps when something above it changes size is disorienting, on
any pointer. An app passes one handle per area to the components whose size
changes, so the opt-in is explicit and composes without wrappers; the
content after a change glides on one shared motion role with the changed
element, inside the area and only where it is visible.

Rejected: wrapping following content in an element, and opting in each
following element.

## Open questions

None.
