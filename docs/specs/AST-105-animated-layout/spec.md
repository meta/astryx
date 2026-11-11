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
affects_consumer_docs:
  [useAnimatedLayout, TreeList, Collapsible, useTableRowExpansion, LayoutPanel]
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
content after it animate together on one shared motion instead of jumping,
on the theme's curve tokens, timed by its `character` and `tempo`. An app opts in once per area; without it, nothing changes, except where a
component's record animates its own change (FR2).

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
  The handle's type carries one optional phantom brand member typed `never`,
  so a package handle and a swizzled copy's handle match (`spec:AST-110` FR3);
  it is never present at runtime and offers nothing to read or set.
  An app passes it to a component whose size changes through that
  component's `animatedLayout` prop, or a hook's `animatedLayout` option where
  the component is a hook, and the component reports each change.
  `containerRef` names the area; ScrollableArea does not register itself, and
  an app passes the ref it already gives ScrollableArea, which reaches the
  native scroll viewport. Each adopting component's record documents its
  `animatedLayout` prop or option.
- **FR2 — Without a handle, nothing changes.** A component without a handle
  keeps its behavior: the changed element shows its change as its own record
  says, and content after it takes its place at once. AppShell's content area
  and the SideNav rail animate their own change during a side nav collapse or
  expand, and a resizable pane a LayoutPanel renders animates its own collapse
  and open, as their records state (`component:AppShell` FR17,
  `component:SideNav` FR6, `component:Resizable` FR8, `component:LayoutPanel`
  FR7). Under a coarse pointer, a TreeList with no handle from the app animates
  its own expand and collapse inside the tree (`component:TreeList` FR8).
- **FR3 — The content after a change glides within the area.** For any change
  a component holding the handle reports, such as a disclosure opening,
  content loading in, a message appearing, or an item inserted or removed,
  the content it shifts inside the area moves from its old place to its new
  one instead of jumping: the siblings after it, and the siblings before it
  that its layout moves (a centered, end-aligned or space-between row, or
  `order`), and its own ancestors where the layout moves them (a centered
  column), at every ancestor level up to the area and never past it. An element moves only when its layout rectangle changed and it is
  in the area's visible part. Which elements move is listed under Coverage.
  Shifted content may mix Astryx components and plain app elements, and none
  of it opts in. Several changes in one area, nested or not, compose: each
  element moves once, by its total change. The area never scrolls because of
  the glide.
- **FR4 — One shared motion on the theme's curve tokens.** The changed
  element plays its own animation, entering, exiting, or resizing, and the
  content after it moves with it. Both play the same motion, so the timing is
  governed centrally, never per component: the theme's move curve,
  `--ease-move`, over `--duration-medium`, which follow the theme's
  `character` and `tempo` (`spec:AST-108` FR1, FR2). The glide is curve
  tokens, never a spring, and no character or option plays a
  platform-measured curve for it (`spec:AST-094` FR45). A gesture's release
  settles on `spec:AST-094`'s spring from its release velocity; curve tokens
  govern glides that no gesture releases. Both start on the same frame, and
  Reduce Motion reaches both, as `design:reduced-motion` DR1–DR3
  require: a cross-fade under a coarse primary pointer, an immediate change
  otherwise.
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
  `containerRef` animate together on one shared motion that follows the
  theme's motion tokens and tempo. Fixed and stuck
  sticky elements stay put, the glide never scrolls the area, and Reduce
  Motion is respected."
- **FR8 — Two elements can swap in place.** An area can swap one element for
  another in the same place, such as a skeleton for its content: the two
  overlap so the area is never empty, a short show delay keeps a fast load
  from flashing the first, and a direction carries a forward or back page
  change. The swap shares FR4's one motion. Under reduced motion it follows
  `design:reduced-motion` DR1–DR3: an opacity-only cross-fade under a coarse
  primary pointer, an immediate change otherwise. Layer exits stay with the
  layer runtime's exit copy (`architecture:layer-runtime` INV14). A swap can
  also hold the area's old content as one transient copy, inert and hidden from
  assistive technology, while the new content enters, and removes it when the
  swap ends (`architecture:component-style-authoring` INV7); AppShell's
  content area does this during a side nav collapse or expand
  (`component:AppShell` FR17), and the SideNav rail holds its old state during a collapse or expand
  (`component:SideNav` FR6).
  The swap is internal; the hook's public contract is unchanged.

- **FR9 — One shared edge reveal.** An area can reveal or conceal an element
  from one of its edges: its block-end edge by default, or its block-start,
  inline-start or inline-end edge, such as a panel collapsing beside content.
  The reveal measures the element's box before and after the change, as FR3
  measures any change, and the element's moving edge and the content on that
  edge's side move on FR4's one motion, whether that content comes after the
  element or before it (an end panel's LayoutContent comes before the panel),
  so the content beside the edge glides with it and no gap opens. In a
  block-edge form, the element's own child elements slide on that motion under
  a still clip at its content box on the side its parts enter from, so they
  enter and leave at the moving edge; an element with text of its own, a child
  that a translation cannot move, or a box or generated box of its own that it
  paints, keeps a clip that moves with the edge. An optional
  two-state form holds the element's old state as FR8's swap holds it, while
  the element rides the glide of the content beside its moving edge; a reversal
  from the shown state starts from where it is. Under Reduce Motion it follows
  `design:reduced-motion` DR2 under a coarse primary pointer and DR3 otherwise.
  Every edge reveal in Core is this one:
  - Collapsible, TreeList and Table's row expansion keep its block-end form
    (`component:Collapsible`, `component:TreeList`, `component:Table` FR15).
  - The SideNav rail conceals and reveals by its inline edge in the two-state
    form, and keeps only its labels' and icons' fades of its own
    (`component:SideNav` FR6).
  - A resizable pane that a LayoutPanel renders conceals and reveals by the edge
    facing its ResizeHandle each time it collapses or opens, and LayoutContent
    beside it moves on the same motion (`component:Resizable` FR8,
    `component:LayoutPanel` FR7). Only a lift closes the pane, and its conceal
    settles from the lift's release velocity (FR4); a drag that reopens a
    collapsed pane plays nothing, because the pointer drives the edge. A pane
    the caller renders at `useResizable`'s size alone shows no reveal,
    because Core never holds that element, and so does a LayoutPanel given
    the configuration-object form, a hand-built
    `ResizableProps` object that `useResizable` did not return; the hook's own
    `props` passed through `resizable` slide.

  When a resizable pane a LayoutPanel renders collapses and focus is inside
  it, focus moves to its ResizeHandle, the control that opens it again, and
  the collapsed pane is inert and hidden from assistive technology until it
  opens, under any resize controller (`component:LayoutPanel` AR2);
  opening moves no focus. This focus rule covers only a collapsing pane: the
  SideNav rail follows its own record, and Collapsible, TreeList and Table's
  row expansion keep their records' behavior. The edge reveal is internal: `useAnimatedLayout`'s public
  contract is unchanged, and no prop or option is added.

## Coverage

What moves inside an area, each case with its test:

| Case                                                                                             | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Test                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal-flow block siblings after the changed element, at each ancestor level up to the area      | Moves when its rectangle changed                                                                                                                                                                                                                                                                                                                                                                                                                           | Nested changed element with block siblings at three levels                                                                                                                                                                                                                                                                                                                                                                 |
| An element with `display: contents`                                                              | Has no box; its children are taken in its place                                                                                                                                                                                                                                                                                                                                                                                                            | A following `display: contents` wrapper with two children                                                                                                                                                                                                                                                                                                                                                                  |
| Absolutely positioned or fixed elements                                                          | Skipped and take their final place; an absolute child of a moving element rides with it                                                                                                                                                                                                                                                                                                                                                                    | One of each, plus an absolute badge on a moving row                                                                                                                                                                                                                                                                                                                                                                        |
| Content inside an absolutely positioned, fixed, stuck sticky or top-layer ancestor of the change | Only the content after the change moves; that ancestor, the ancestors inside it and the siblings before the change take their final place                                                                                                                                                                                                                                                                                                                  | A header above a card around the change in a bottom-docked panel, and a bottom-stuck sticky footer around the change                                                                                                                                                                                                                                                                                                       |
| Sticky elements                                                                                  | In flow while unstuck, so moves when its rectangle changed; a stuck element takes its final place                                                                                                                                                                                                                                                                                                                                                          | A sticky header above and below its stuck point                                                                                                                                                                                                                                                                                                                                                                            |
| Floats                                                                                           | Moves when its rectangle changed                                                                                                                                                                                                                                                                                                                                                                                                                           | A float after the changed element                                                                                                                                                                                                                                                                                                                                                                                          |
| Flex and grid items after the changed element, including wrap and row direction                  | Moves when its rectangle changed                                                                                                                                                                                                                                                                                                                                                                                                                           | A wrapping flex row and a row-direction neighbor that does not shift                                                                                                                                                                                                                                                                                                                                                       |
| Siblings before the changed element, and its ancestors, at each level                            | Moves when its rectangle changed: a centered, end-aligned or space-between row, a centered column, or `order` among the siblings near the visible part moves them                                                                                                                                                                                                                                                                                          | A centered row, a space-between row, an end-aligned row, a centered column and an `order`-placed sibling                                                                                                                                                                                                                                                                                                                   |
| Hidden, `display: none`, or zero-size elements                                                   | Skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                    | One of each after the changed element                                                                                                                                                                                                                                                                                                                                                                                      |
| Changed elements outside the area's visible part                                                 | Take their final place without animation                                                                                                                                                                                                                                                                                                                                                                                                                   | A long list with changed rows above and below the fold                                                                                                                                                                                                                                                                                                                                                                     |
| Elements under a scaled or transformed ancestor                                                  | Moves by its layout change, corrected for the ancestor's scale                                                                                                                                                                                                                                                                                                                                                                                             | A moving row inside a scaled panel                                                                                                                                                                                                                                                                                                                                                                                         |
| Portals and top-layer content                                                                    | Never moved                                                                                                                                                                                                                                                                                                                                                                                                                                                | A popover open from a following row                                                                                                                                                                                                                                                                                                                                                                                        |
| Elements already moving                                                                          | Keep their running motion and add the new move to it                                                                                                                                                                                                                                                                                                                                                                                                       | Two changes 100 ms apart                                                                                                                                                                                                                                                                                                                                                                                                   |
| Nested areas                                                                                     | Motion stops at the area of the handle the changed component holds; an inner area moves as one unit within an outer one                                                                                                                                                                                                                                                                                                                                    | An area inside an area, changed in the inner one                                                                                                                                                                                                                                                                                                                                                                           |
| Table rows after an opening or closing detail row                                                | The rows glide; a closing detail row hides at once, and its space is held while the rows after it glide up. A table that draws column lines (`component:Table` FR15) does not glide: it and the content after it take their final places at once                                                                                                                                                                                                           | A detail row opening and closing in a table with a pinned column, and in a table with column lines                                                                                                                                                                                                                                                                                                                         |
| An edge reveal or conceal on either axis                                                         | Content revealed or concealed from its block-end edge (default), its block-start edge or an inline edge, with an optional two-state form where the swap holds the old state and the element rides the glide of the content beside its moving edge; the content on the moving edge's side moves, before or after the element; a resizable LayoutPanel pane on collapse and open; focus inside a collapsing LayoutPanel pane moves to its ResizeHandle (FR9) | Animated-layout browser tests of a block-end reveal and conceal, a block-start reveal and conceal (a panel opening above the content after it), an inline-start and an inline-end reveal and conceal (an end panel, with its LayoutContent before it), of the two-state form, of a LayoutPanel pane collapsing and opening by toggle, Enter and a drag past the threshold, and of focus leaving a concealed pane (pending) |

Out of coverage, each taking its final place at once:

- content outside the area, and content in another document or an iframe;
- inline text and other non-replaced inline content, which cannot take a
  transform;
- text reflowing inside a paragraph beside a float;
- elements the app moves itself with its own transforms;
- a closing element whose space no end margin frees (a grid item whose
  track or gap changes when it hides, or a flex-row item that sets its row's
  height): it hides at once, without its exit, and the content after it
  takes its final place at once, other than a table detail row (Coverage);
- an anchored popover tied to a moving element, which layer anchoring keeps
  in place (`architecture:layer-runtime`);
- an item that `order`, or a grid placement (`grid-row`, `grid-column`, a
  named area or dense packing), brings into view from beyond the area's
  visible part plus one viewport (or the changes' size, if larger) in
  document order, which the walk does not reach.

## Current-state impact

- No Core component takes `animatedLayout` yet; TreeList, Collapsible, and
  Table's row expansion (`component:Table` FR15) are the first adopters, and
  their docs gain the `animatedLayout` handle.
- Core gains the `useAnimatedLayout` export and its documentation (FR7).
- `architecture:react-component-runtime` INV12 produces the glide.
- `architecture:react-component-runtime` INV12 also gains the in-place swap
  (FR8); no component swaps yet.
- INV12 also produces the edge reveal (FR9). SideNav's rail clip and ride move
  into it from SideNav's own code, and a resizable LayoutPanel's collapse and
  open, which today jump, adopt it; LayoutPanel's docs say a collapse slides.
- Each running glide that moves a hit-testable element's `translate` reports
  it to `motion/presentation.ts`, as the animator's moves do. An inert copy or
  closing element is not reported. So on iOS WebKit, a touch that the gesture
  host handles goes to what is drawn under the finger (`spec:AST-094` FR11,
  FR19). Implementation gap: on iOS WebKit, a plain tap that no gesture
  handles, on an element mid-glide, still goes to what was at that spot before
  the glide, until the glide ends (glides last at most the theme's move
  duration).
- Each motion of a change also makes the engine resolve its element once
  more, in the first frame the motion is drawn near its end: within half a
  pixel or half a percent, or 0.005 of an opacity or of an indicator's turn.
  WebKit can draw a compositor animation's last frame, and every frame of a
  long task over its end, with the values it last resolved; that frame shows
  the motion's end. It covers the glides, an exit and its parts, a reveal's
  parts and an indicator's transition. A Reduce Motion fade gets none: WebKit
  draws its end values at its end. Implementation gap: a long task that starts
  before that frame still shows the values from the last resolve, and a
  motion near its end only at its last keyframe (a linear curve, or a long
  move on a steep curve) gets no such resolve. Review condition: re-measure on
  each WebKit release, and remove these resolves once WebKit draws an ended
  compositor animation at its final values.

## Verification

| Contract      | Verification                                                                                               | Representative states                                                                                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2      | Unit and browser tests with and without a handle                                                           | a handle on TreeList; no handle; a ScrollableArea ref                                                                                                                                                                                                                                               | a handle with public members, behavior that changes without a handle, or ScrollableArea registering itself fails                                                                                                                                                    |
| FR3, Coverage | Real-browser tests, one per Coverage row                                                                   | each Coverage row; mixed Astryx and plain content; two changes in one frame; an area scrolled mid-list                                                                                                                                                                                              | an element that behaves other than its row says, an element moved twice for one frame, content past the area that moves, or the area scrolling fails                                                                                                                |
| FR4           | Real-browser frame capture under a coarse and a fine pointer, with and without Reduce Motion               | a changed element and its visible followers at each `character`, and at `tempo` 0.75 and 1.5; a lift that closes a LayoutPanel, from its release velocity                                                                                                                                           | starting on different frames or reading different motion, a component's own timing, a glide that ignores the theme's `character` or `tempo`, a spring or a measured curve for a glide no gesture releases, or Reduce Motion applied to one and not the other, fails |
| FR5           | Fine-pointer before-and-after evidence on each adopting pull request, from the component's Storybook story | a mouse on each adopting component                                                                                                                                                                                                                                                                  | a glide missing under a mouse, or an adopting pull request without that evidence, fails                                                                                                                                                                             |
| FR8           | Unit tests of the swap and real-browser proofs of its adopters                                             | a fast load, a slow load, a forward and a back page change, Reduce Motion                                                                                                                                                                                                                           | an empty area during a swap, a placeholder flashed for a fast load, travel under Reduce Motion, a layer exit played by it, or a public export fails                                                                                                                 |
| FR9           | Unit tests of the reveal's measurement and real-browser frame capture of each adopter                      | Collapsible opening; the SideNav rail collapsing and expanding; a start and an end LayoutPanel collapsing and opening by toggle, Enter, the grow arrow, a controlled change and a lift past the threshold; a drag reopening a pane; a hook-only pane; focus inside a collapsing pane; Reduce Motion | a gap opening beside a moving edge, two motions for one rail collapse, a reveal during a drag that reopens a pane, a reveal on a hook-only pane, focus left inside a concealed pane, a concealed pane reachable by Tab, or a public export fails                    |

## Decision log

### DEC-1 — One opt-in handle per area; the content after a change glides

**Reference:** `spec:AST-105/DEC-1`
**Decider:** `cixzhang`, `2026-10-25`

Content that jumps when something above it changes size is disorienting, on
any pointer. An app passes one handle per area to the components whose size
changes, so the opt-in is explicit and composes without wrappers; a component animates
its own change only where its record says so (FR2;
`component:SideNav/DEC-2`); the
content after a change glides on one shared motion role with the changed
element, inside the area and only where it is visible.

Rejected: wrapping following content in an element, and opting in each
following element.

### DEC-2 — The glide plays the theme's curve tokens

**Reference:** `spec:AST-105/DEC-2`
**Decider:** `cixzhang`, `2026-11-04`

A glide is a move like any other, so it takes the theme's move curve and
duration, and a theme that sets `character` or `tempo` sees its glides change
with the rest of its motion, under every pointer. A tap that expands or
collapses content carries no velocity, so the glide that follows plays curve
tokens, never a spring (`spec:AST-094` FR45). A gesture's release settles on
`spec:AST-094`'s spring from its release velocity; curve tokens govern glides
that no gesture releases.

Rejected: the measured spring as the glide; a platform-measured opt-in, such as a separate character.

### DEC-3 — The glide takes the medium duration

**Reference:** `spec:AST-105/DEC-3`
**Decider:** `cixzhang`, `2026-11-06`

The glide plays over `--duration-medium`, the middle of the theme's medium
durations: 300 ms in the Neutral theme and 410 ms with no theme, both scaled
by `tempo`. Collapsible, TreeList, Table's row expansion, AppShell's content
area and List share it, as one motion.

Rejected: `--duration-medium-min`.

## Open questions

None.
