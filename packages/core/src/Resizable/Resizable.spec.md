---
schema_version: 3
template_version: 3
kind: component
id: component:Resizable
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Resizable/ResizeHandle.test.tsx,
    packages/core/src/Resizable/useResizable.test.ts,
    packages/core/src/Resizable/shippedDirections.test.ts,
    packages/core/src/Resizable/utils.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-010, spec:AST-105]
---

# Resizable component contract

## Intent

Resizable combines the useResizable state and behavior hook with a focusable
ResizeHandle. The handle presents a default Grip pill over an enlarged invisible
Grab zone. AST-010 adds explicit pixel and percentage configuration while keeping
selected state, persistence, callbacks, paint, and ARIA in resolved pixels.

## Compatibility and migration

- Released default preserved: `yes`; numeric and exact `Npx` stay pixels, exact
  `N%` retains released one-time default behavior, and the broad `defaultSize`
  string type remains source-compatible
- Compatibility class: 0.6 removes the deprecated pixel-bound aliases after two
  stable releases; numeric `minSize` / `maxSize` preserve their pixel semantics
- Controlled/uncontrolled behavior: unchanged
- Migration decision: CSS-like `min()` / `max()` strings are not supported. Use
  `percent(value, {min: pixel(value)})` or
  `percent(value, {max: pixel(value)})`.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- useResizable size, collapse, snapping, persistence, and resize lifecycle.
- ResizeHandle's separator semantics, pointer and keyboard interaction, and
  current `resize-handle` target.
- The default Grip pill and its current `resize-handle-pill` target, plus the
  aligned invisible Grab zone.

**Does not own / non-goals**

- The structural region being resized — owned by LayoutPanel, SideNav, or another
  caller.
- Layout-region topology, inset, divider, or scrolling rules.
- A public target for the Grab zone; none exists on current `main`.
- Fixing the missing runtime reflection for the documented Handle `direction`
  theming state; that remains a separate theming follow-up.

## Public concepts

`ResizableSize` is a Resizable-specific union: pixel number, exact `Npx`, exact
`N%`, `PixelWidth`, or `ResizablePercentSize`.
`pixel(value)` is Table's existing canonical structured pixel helper;
`percent(value, {min: pixel(value)})` creates a literal percentage with a pixel
floor; `percent(value, {max: pixel(value)})` creates one with a pixel ceiling.
The options argument is required and the two bounds are mutually exclusive.
`defaultSize` retains its released broad `SizeValue` type and adds the structured
`PixelWidth` and `ResizablePercentSize` values; runtime validation remains
authoritative for legacy strings.

Numbers and exact `Npx` remain pixels. A descriptor default resolves once; a
descriptor bound remains live. Consumer props, outputs, and examples are documented
in `Resizable.doc.mjs` and `useResizable.doc.mjs`.

## Behavioral and layout contract

| ID       | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                            | Draft review state                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| FR1      | ResizeHandle renders one focusable Handle and one enlarged Grab zone; the default render also contains a Grip pill, while caller-provided children replace that pill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source, docs, and tests  | Verified current behavior; no new behavior decided            |
| FR2      | Handle carries `resize-handle`, Grip pill carries `resize-handle-pill`, and Grab zone carries no public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and public docs   | Verified current target inventory; no target change           |
| FR3      | Pointer, keyboard, collapse, snap, persistence, reversal, and size behavior remain owned by ResizeHandle and useResizable rather than layout-regions collaborators.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source, docs, and tests  | Verified current ownership; resize semantics remain unchanged |
| FR4      | Resizable metadata advertises `direction` as a Handle visual state, but current runtime calls `themeProps('resize-handle')` without reflecting that value, so direction selectors cannot match.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and public docs   | Verified audit gap; deliberately not fixed in this change     |
| FR5      | `percent(value, {min: pixel(value)})` and `percent(value, {max: pixel(value)})` resolve against the AST-010 basis; a default selects pixels once, while a bound re-resolves and clamps selected pixels. Both/neither bounds are invalid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | AST-010, source, tests, Chromium | New structured sizing behavior; selected state remains pixels |
| FR6      | `minSize` and `maxSize` are the only bound spellings in 0.6; numeric values retain pixel semantics, and the upgrade codemod rewrites static inline uses of the removed aliases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AST-010, source, codemod tests   | Breaking cleanup with mechanical migration                    |
| FR7, AR2 | Real-browser frame capture of a start and an end LayoutPanel collapsing and opening by each listed path, a drag reopening a pane, a hook-only pane, and focus inside a collapsing pane (pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR7      | When a region collapses or opens, its pane slides by `spec:AST-105` FR9's edge reveal when a LayoutPanel renders it (`component:Layout` FR8): the resize controller measures the pane's box before and after the collapse state commits, before its subscribers hear of it, and the pane's edge facing its ResizeHandle, read from the region's direction and reversal, moves with the content beside it on one motion. Every collapse and open plays it: `collapse()`, `expand()`, a resize out of collapse, Enter, a double-click, the grow arrow, a controlled `isCollapsed` change, and a drag that crosses `collapsedSize` to collapse. A drag that reopens a collapsed pane plays nothing, because the pointer drives the edge; a resize that neither collapses nor opens, and the first render, play nothing. A pane the caller renders at the hook's size alone, and the configuration-object form whose `props` a LayoutPanel takes through `resizable`, show no reveal. No prop, option or return member is added; size, `isCollapsed`, callbacks, persistence and the Handle's ARIA values are unchanged. Focus follows AR2. | `spec:AST-105` FR9               | Specified; implementation pending                             |

### Allowed variation

- **AV1 — Axis.** Handle may resize along the horizontal or vertical layout axis;
  separator orientation and cursor follow the current implementation.
- **AV2 — Placement.** Handle may participate inline or overlay its parent, and
  Grip pill may sit at start, end, center, or the current automatic side.
- **AV3 — Grip content.** Caller-provided children may replace Grip pill without
  changing Handle or Grab zone ownership.
- **AV4 — Divider.** Handle may paint its current divider treatment; a composing
  region remains responsible for avoiding a duplicate adjacent divider.
- **AV5 — Structured percentage bound.** A descriptor carries exactly one `min`
  or `max`, whose value is a `PixelWidth`. Atomic percentages use the existing
  exact `N%` string; arbitrary CSS expressions are outside this contract.

### Representative states

| State                       | Required invariant                                                                                      | Allowed variation                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Default handle              | Handle, Grab zone, and Grip pill render.                                                                | Divider and always-visible treatment may vary.     |
| Custom handle content       | Handle and Grab zone remain; caller content replaces Grip pill.                                         | Caller content remains caller-owned.               |
| Horizontal or vertical      | Interaction follows the selected axis and current ARIA orientation.                                     | Size, reversal, and pill placement may vary.       |
| Collapsed or expanded       | Handle preserves valid separator value semantics and resize controls.                                   | Grip pill automatic side follows current behavior. |
| Collapsing in a LayoutPanel | The pane slides closed from the edge facing the Handle; focus inside it moves to the Handle (FR7, AR2). | Start or end panel; Reduce Motion.                 |
| Disabled                    | Handle remains represented but is removed from interactive tab order.                                   | Painted treatment follows existing styles.         |

### Transformation and precedence order

- Parse atomic strings exactly; validate `percent()` descriptors as a finite 0–100
  percentage with exactly one finite non-negative pixel bound.
- Resolve percentages against one active basis, then apply the descriptor's floor or
  ceiling.
- Commit a structured default as one initial pixel choice; keep percentage bounds
  live and clamp with `Math.min(max, Math.max(min, size))`.
- Maximum wins when resolved bounds conflict; interaction and persistence stay
  pixel-only.

### Performance and resources

- Atomic pixel paths add no observer or render work.
- A structured default observes a supplied container only until its initial pixel
  choice is final; persisted pixels skip that measurement.
- Percentage bounds reuse the shared ResizeObserver and remain subscribed while
  live. Structured validation and resolution are constant-time; no CSS parser is
  introduced.

## Accessibility contract

The structured API does not change ResizeHandle's separator role, label,
orientation, collapsed value text, focus, pointer, or keyboard behavior. Its
`aria-valuemin`, `aria-valuemax`, and `aria-valuenow` remain the same resolved pixel
values used by hook state and painted geometry.

- **AR1 — ResizeHandle adopts the APG Window Splitter pattern**
  (`spec:AST-020/FR15`), as one composite control: the Handle is a focusable
  `role="separator"` with an accessible name, `aria-orientation` (the axis the
  divider lies along), `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` in
  pixels, `aria-valuetext` while collapsed, and `aria-disabled` when disabled.
  ArrowRight and ArrowDown move the divider toward the end of its axis and
  ArrowLeft and ArrowUp toward the start, the inline arrows following the
  reading direction under RTL, with Shift for a larger step, so the pane grows
  or shrinks by the side of the Handle it sits on; with snap points set, an
  arrow moves to the adjacent snap point, a point beyond `minSize` or `maxSize`
  counting as that bound (Shift, two); Home moves to the minimum size and End to
  the maximum; Enter collapses a collapsible pane and restores it, and the arrow
  that grows a collapsed pane opens it one step above its minimum, or at its
  `collapsedSize` when that is larger (with snap points, at the snap point
  nearest that size; the shrinking arrow leaves it collapsed). An unbounded
  Handle reports a measured stand-in as `aria-valuemax`: the window's extent
  along its axis when no container is supplied, or its container's content box
  while a percentage bound observes it, never below its current size or, while
  collapsed, its minimum. Implementation gaps under `spec:AST-020/FR15`: the
  Handle names the pane it resizes with `aria-controls` only when its caller
  passes one (SideNav does); an unbounded Handle in a container that no
  percentage bound observes carries no `aria-valuemax`, because measuring that
  container would add an observer to a region whose bounds are all in pixels
  (Performance and resources); and End does not move an unbounded Handle.

- **AR2 — Focus leaves a collapsing pane.** When a pane a LayoutPanel renders
  collapses while focus is inside it, focus moves to its ResizeHandle, the
  control that opens it again, and the collapsed pane is inert and hidden from
  assistive technology until it opens (`spec:AST-105` FR9). Opening moves no
  focus. A collapse started from the Handle, or from a control outside the
  pane, leaves focus where it is.

## Design relationships

| Anatomy or state | Design requirement                                                      | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Handle           | Presents the focusable resize separator and optional divider treatment. | Current source and public docs | Prominent      | FR1, FR2, FR3      |
| Grip pill        | Presents the default visible resize affordance.                         | Current source and public docs | Supporting     | FR1, FR2           |
| Grab zone        | Enlarges pointer reach while remaining visually transparent.            | Current source and tests       | Supporting     | FR1, FR2           |
| Direction state  | Selects horizontal or vertical resize presentation.                     | Current public metadata        | Supporting     | FR3, FR4           |

Grab zone is interaction structure rather than a painted public theming seam. Its
`none` disposition records factual reachability. The missing Handle direction
reflection is a separate current audit gap: the target exists, but runtime does
not emit the documented target state.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Handle": {"target": "resize-handle"},
  "Grip pill": {"target": "resize-handle-pill"},
  "Grab zone": {
    "none": {
      "reason": "intentional: The invisible pointer hit area is nonvisual interaction structure and has no public target"
    }
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, and target-state reflection requirements.
- `architecture:interaction-modality` owns shared modality behavior;
  `architecture:public-component-api` owns the additive structured API and
  compatibility boundary.
- `Resizable/utils` is server-safe and re-exports Table's exact `pixel()` binding
  plus `PixelWidth`, alongside Resizable's `percent()` and structured types.
- `spec:AST-105` FR9 owns the edge reveal a LayoutPanel's pane plays on
  collapse and open; Resizable supplies only when it plays and from which edge.
- `family:layout-regions` lists useResizable and ResizeHandle as collaborators
  that may drive a LayoutPanel's size. Resizable is not a layout-regions member,
  and that family does not own or redefine resize state, snapping, persistence,
  collapse, pointer, or keyboard semantics.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Representative states                                                                                           | Mutation or failure expectation                                                                                                                                   | Audit section                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1                 | `ResizeHandle.test.tsx` plus source inspection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Default, custom, collapsed, disabled, both axes                                                                 | Handle and Grab zone regressions fail focused tests; custom Grip replacement currently relies on source review.                                                   | `audit:Resizable/anatomy`       |
| AR1                 | `ResizeHandle.test.tsx` ("makes the separator focusable", "exposes the region size and bounds via ARIA", "grows the panel by a step on ArrowRight", "shrinks the panel by a step on ArrowLeft", "uses the large step when Shift is held", "jumps to the minimum on Home", "jumps to the maximum on End", "collapses on Enter when the region is collapsible", "inverts the pointer delta under RTL so dragging resizes intuitively", "restores the previous size, not the minimum, when Enter reopens a collapsed pane", "reopens on Enter even when the minimum size sits below the collapse threshold", "reports the window basis as aria-valuemax when no maximum is configured; End leaves an unbounded region alone", "reports the container basis as aria-valuemax while a percentage bound already observes it", "never reports aria-valuemax below aria-valuemin while collapsed in a small window", "reports no aria-valuemax for an unbounded pixel-only region in a container, which stays unobserved", "a grow arrow opens a collapsed pane one step above its minimum; the shrink arrow leaves it collapsed", "a grow arrow opens a collapsed pane at its collapsedSize when the minimum sits below it", "a grow arrow opens a collapsed pane in the reversed layout and under RTL too", "in a reversed layout, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed", "under RTL, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed", "a grow arrow opens a hand-built collapsed region one step above its minimum", "with snap points, an arrow moves to the adjacent point in its direction and Shift moves two, clamped to the ends", "with snap points past the bounds, a point beyond maxSize or minSize counts as that bound", "with snap points, the arrows follow the reversed layout and the reading direction", "with snap points in a reversed layout, ArrowLeft moves to the next point and ArrowRight to the previous", "with snap points, the grow arrow opens a collapsed pane at the snap point nearest one step above its minimum") and `shippedDirections.test.ts`; `SideNav.test.tsx` ("names the nav it resizes with aria-controls (APG window splitter)"); RTL keyboard mirroring, and the disabled state under the Window Splitter accessibility contract (`internal/a11y-spec`, pending) | Inline and block axes; LTR and RTL; collapsed; disabled                                                         | The Handle loses its role, name, orientation or value properties; an arrow, Home, End or Enter stops moving the divider or moves it against the reading direction | `audit:Resizable/accessibility` |
| FR2                 | Source inspection and `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Handle, Grip pill, and Grab zone                                                                                | Removing a target or documenting an unshipped Grab zone target fails evidence or inventory.                                                                       | `audit:Resizable/theming`       |
| FR3                 | `ResizeHandle.test.tsx` and `useResizable.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pointer, keyboard, snap, collapse, persistence                                                                  | Moving resize ownership or changing current transformations fails focused behavior coverage.                                                                      | `audit:Resizable/behavior`      |
| FR4                 | Source and public metadata comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Horizontal and vertical Handle                                                                                  | No current test detects that documented `direction` is absent from runtime target-state reflection.                                                               | `audit:Resizable/theming`       |
| FR5                 | Hook/utils tests, typecheck, and Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Canonical floor/ceiling/default; invalid XOR shape; SSR/hydration; basis changes; numeric `containerRef` parity | Wrong resolution, rescaling defaults, stale clamps, observer leaks, extra numeric renders/ref reads, or state/paint/storage/ARIA divergence fails.                | `audit:Resizable/behavior`      |
| FR6                 | Hook type/runtime and codemod tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Removed alias type errors; single/multi-region inline migrations; numeric pixel bounds                          | A removed alias still type-checks, or migration changes its numeric meaning.                                                                                      | `audit:Resizable/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Canonical anatomy and two current targets                                                                       | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.                                                                        | `audit:Resizable/theming`       |

Current tests exercise Handle and Grab zone structure and behavior but do not
render `children` to prove that custom content replaces Grip pill. That branch is
source-inspected and lacks focused regression evidence. The documented
`direction` visual axis is a closed union, so `extensibleAxes.test.ts` does not
cover its missing runtime reflection; that mismatch is currently unguarded.

## Decision log

### Structured percentages use a Table-style helper

**Decision:** `percent(value, {min: pixel(value)})` or
`percent(value, {max: pixel(value)})` represents a percentage with exactly one
pixel bound. Reuse Table's exact `pixel()` binding and `PixelWidth`; do not create
a parallel static helper. The required options and XOR type avoid a second
spelling for plain percentages and make every supported combination explicit.
The pure helper is available with the same `pixel()` binding from the server-safe
`Resizable/utils` subpath, matching Table's established helper/export pattern.
`proportional()` is deliberately not reused because it means sibling weight, not a
literal percentage.

**Rejected:** parsing recursive CSS `min()` / `max()` strings. That would create a
partial second CSS implementation without a demonstrated need for arbitrary
composition.

### The Handle is an APG window splitter

**Decision:** ResizeHandle already acts as one composite control with the splitter's role, value properties, and keyboard, so it adopts the pattern's required parts and its keyboard (AR1), with `aria-controls` the caller does not pass, `aria-valuemax` on an unbounded Handle in a container that no percentage bound observes, and End on an unbounded Handle recorded as implementation gaps; the inline arrows follow the reading direction because a key that moves the divider against the way it travels on screen is a defect. Decided by `cixzhang`, `2026-10-13`.

**Rejected:** a separate button to collapse the pane; a direction-free ArrowLeft under RTL.

## Open questions

- **OQ1 — Which follow-up should add and verify the missing Handle `direction`
  target-state reflection?** (`checkable`)
- **OQ2 — Which focused test should pin custom content replacing Grip pill?**
  (`checkable`)

## Content boundary

This file does not duplicate consumer prop tables/examples, resize algorithms,
layout-region rules, current audit results, or implementation steps. It links to
their owners.
