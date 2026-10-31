---
schema_version: 3
template_version: 7
kind: component
id: component:Resizable
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Resizable/ResizeHandle.test.tsx,
    packages/core/src/Resizable/useResizable.test.ts,
    packages/core/src/Resizable/shippedDirections.test.ts,
    packages/core/src/Resizable/utils.test.ts,
    packages/core/src/Resizable/__tests__/ResizeHandle.a11y.test.tsx,
    packages/core/src/Resizable/__tests__/ResizeHandle.a11y.chromium.spec.ts,
    .github/visual-baseline/manifest.json,
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
system_specs: [spec:AST-010, spec:AST-020, spec:AST-085]
---

# Resizable component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useResizable` (size, bounds, collapse, snaps, persistence) and `ResizeHandle` (`direction`, `position`, `isReversed`, `isDisabled`, `hasDivider`, `isAlwaysVisible`, `pillPlacement`, `label`, `resizable`, `children`), plus the `pixel()` and `percent()` size helpers. |
| Behavior                | The hook owns a region's size in pixels; the Handle is a focusable window splitter that resizes it by pointer and keyboard.                                                                                                                                                |
| End-user impact         | People drag or use the keyboard to resize a panel, collapse and restore it, and have the size remembered, with the divider moving the way the page reads.                                                                                                                  |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                                                                               |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Implementation gaps are listed under Current-state impact.                                                                                                                                      |
| Review checks           | Reject a Handle that loses its splitter role, values, or keys, arrows that move against the reading direction, a percentage default that rescales, or state, paint, storage, and ARIA that disagree.                                                                       |
| Governing rules         | `spec:AST-010`; `spec:AST-020` FR15 (APG Window Splitter); `spec:AST-085`; `architecture:interaction-modality`; `architecture:component-theming-surface`; `architecture:public-component-api`.                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

Resizable combines the useResizable state and behavior hook with a focusable
ResizeHandle. The handle presents a default Grip pill over an enlarged invisible
Grab zone. Sizes may be configured in pixels or percentages, while selected
state, persistence, callbacks, paint, and ARIA stay in resolved pixels.

Consumer syntax and examples belong in `Resizable.doc.mjs` and
`useResizable.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; numbers and exact `Npx` are pixels, exact
  `N%` is a one-time default, and the broad `defaultSize` string type remains
  source-compatible.
- Compatibility class: records shipped behavior; `minSize` and `maxSize` are
  the bound props, and numeric bounds are pixels.
- Controlled/uncontrolled behavior: collapse may be controlled
  (`isCollapsed`, `onCollapseChange`) or uncontrolled (`defaultIsCollapsed`);
  size is hook-owned.
- Migration decision: none. CSS-like `min()` and `max()` strings are not
  supported; `percent(value, {min: pixel(value)})` and
  `percent(value, {max: pixel(value)})` express a bounded percentage.

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Handle direction not reflected (FR4).** `Resizable.doc.mjs` lists
  `direction` as a visual state of the `resize-handle` target, but the Handle
  does not reflect it, so a theme rule for one direction never matches, where
  `architecture:component-theming-surface` INV6 keeps declared state on the
  owning target.
- **Disabled Handle leaves the tab order (FR3, AR1).** A disabled Handle sets
  `tabIndex={-1}`, so keyboard users cannot reach it to hear that it is
  disabled, where `spec:AST-085` FR1 keeps a disabled control's tab stop.
- **Window-splitter gaps (AR1).** The Handle names the pane it resizes with
  `aria-controls` only when its caller passes one; an unbounded Handle in a
  container that no percentage bound observes carries no `aria-valuemax`; and
  End does not move an unbounded Handle (`spec:AST-020` FR15).
- **Caller focus and double-click handlers replace the Handle's (FR7).**
  Caller props spread after the Handle's own `onFocus`, `onBlur`, and
  `onDoubleClick`, so passing any of them stops the Handle's focus-visible
  pill and its double-click collapse, where
  `architecture:public-component-api` INV7 has handlers compose.
- **`shrinkOrder` is inert.** useResizable accepts and documents
  `shrinkOrder`, but no code reads it, so it has no effect.

## Ownership boundary

**Owns**

- useResizable size, collapse, snapping, persistence, and resize
  lifecycle.
- ResizeHandle's separator semantics, pointer and keyboard interaction, and
  its `resize-handle` target.
- The default Grip pill and its `resize-handle-pill` target, plus the aligned
  invisible Grab zone.

**Does not own / non-goals**

- The region being resized — owned by LayoutPanel, SideNav, or another caller.
- Layout-region topology, inset, divider, or scrolling rules — owned by
  `family:layout-regions`.
- A public target for the Grab zone; none exists.

## Public concepts

| Concept          | Closed values or states                                                                        | Meaning                                                                                                     | Availability by variant/orientation/state | Default                                              | Owner                 | Stability | Invalid-value behavior                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | --------------------- | --------- | ------------------------------------------------------------------------- |
| Size value       | pixel number; exact `Npx`; exact `N%`; `pixel()`; `percent(value, {min} or {max})`             | A size or bound in pixels or a percentage of the container, or of the viewport without a `containerRef`.    | `defaultSize`, `minSize`, `maxSize`       | `defaultSize` 250, `minSize` 50, `maxSize` unbounded | `component:Resizable` | Stable    | Invalid strings and descriptors fail runtime validation (`spec:AST-010`). |
| Collapse         | collapsible; collapsed; expanded                                                               | A collapsible region collapses to 0 when a drag goes below `collapsedSize`, and restores its previous size. | `collapsible`                             | not collapsible; `collapsedSize` 40 (drag threshold) | `component:Resizable` | Stable    | —                                                                         |
| Snaps            | pixel list                                                                                     | The only positions the region rests on, for drag, keyboard, and `resize()`.                                 | Optional                                  | none                                                 | `component:Resizable` | Stable    | —                                                                         |
| Persistence      | `autoSaveId`                                                                                   | Remembers the pixel size across sessions.                                                                   | Optional                                  | none                                                 | `component:Resizable` | Stable    | —                                                                         |
| Axis             | `horizontal`; `vertical`                                                                       | The axis the region resizes along.                                                                          | Handle and hook                           | `horizontal`                                         | `component:Resizable` | Stable    | Closed union.                                                             |
| Handle placement | `position` `inline`, `overlay`; `isReversed`; `pillPlacement` `auto`, `start`, `center`, `end` | Whether the Handle takes layout space or overlays its parent; which side grows; where the pill sits.        | Handle                                    | `inline`; not reversed; `auto`                       | `component:Resizable` | Stable    | Closed union.                                                             |
| Handle state     | enabled; disabled; divider; always-visible pill                                                | Interaction and paint options.                                                                              | Handle                                    | enabled; no divider; pill visible                    | `component:Resizable` | Stable    | —                                                                         |
| Grip content     | caller `children`                                                                              | Replaces the Grip pill.                                                                                     | Handle                                    | Grip pill                                            | caller                | Stable    | —                                                                         |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| FR1 | ResizeHandle renders one focusable Handle and one enlarged Grab zone (a `--spacing-4` strip on the resize axis); the default render also contains a Grip pill, and caller `children` replace the pill.                                                                                                                                                                                                                                                                                                                                                                                                    | Current source, docs, and tests                               |
| FR2 | The Handle carries `resize-handle`, the Grip pill carries `resize-handle-pill`, and the Grab zone carries no public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and docs                                       |
| FR3 | Pointer drag, keyboard, double-click collapse, snapping, persistence, reversal, and size behavior are owned by ResizeHandle and useResizable; dragging under right-to-left inverts the pointer delta so the divider follows the pointer. A disabled Handle ignores pointer and keyboard input and exposes `aria-disabled`, and keeps its tab stop (`spec:AST-085` FR1). Implementation gap: a disabled Handle sets `tabIndex={-1}` (Current-state impact).                                                                                                                                                | Current source, docs, and tests                               |
| FR4 | The Handle reflects the documented `direction` visual state on its target (`architecture:component-theming-surface` INV6). Implementation gap: it reflects no `direction` (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and docs                                       |
| FR5 | A `percent(value, {min: pixel(value)})` or `percent(value, {max: pixel(value)})` resolves against one basis — the supplied container, or the viewport when no `containerRef` is given (`spec:AST-010` FR1, FR2); as a default it selects pixels once, and as a bound it stays live and clamps the selected pixels. A descriptor with both or neither bound is invalid. Selected state, persistence, callbacks, paint, and ARIA are pixels.                                                                                                                                                                | `spec:AST-010`; current source and tests                      |
| FR6 | `minSize` and `maxSize` are the bound props; numeric values are pixels. When resolved bounds conflict, the maximum wins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-010`; current source and tests                      |
| FR7 | `ref`, DOM, data, ARIA, and event props reach the Handle, and a caller's explicit `role`, ARIA attribute, or `tabIndex` reaches it as given; a caller `onKeyDown` runs before the Handle's own key handling; caller `onFocus`, `onBlur`, and `onDoubleClick` compose with the Handle's own focus tracking and double-click collapse (`architecture:public-component-api` INV5, INV7); `xstyle` and `className` compose after component styles, and `style` is not accepted. Implementation gap: caller `onFocus`, `onBlur`, and `onDoubleClick` replace the Handle's own handlers (Current-state impact). | Current source; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Axis.** The Handle resizes along the horizontal or vertical axis;
  separator orientation and cursor follow it.
- **AV2 — Placement.** The Handle sits inline or overlays its parent, and the
  Grip pill sits at start, end, center, or the automatic side.
- **AV3 — Grip content.** Caller `children` may replace the Grip pill without
  changing Handle or Grab zone ownership.
- **AV4 — Divider.** The Handle may paint its divider; a composing region
  avoids a duplicate adjacent divider.
- **AV5 — Structured percentage bound.** A descriptor carries exactly one `min`
  or `max`, whose value is a `PixelWidth`; plain percentages use exact `N%`.

### Representative states

| State                  | Required invariant                                               | Allowed variation                |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Default handle         | Handle, Grab zone, and Grip pill render.                         | Divider and always-visible pill. |
| Custom handle content  | Handle and Grab zone remain; caller content replaces the pill.   | Caller content.                  |
| Horizontal or vertical | Interaction follows the axis; ARIA orientation is the divider's. | Size, reversal, pill placement.  |
| Collapsed              | `aria-valuenow` at the minimum and "Collapsed" value text.       | Pill side.                       |
| Disabled               | `aria-disabled`; no resize; tab stop kept (FR3 gap).             | Disabled paint.                  |

### Transformation and precedence order

- **ORD1 — Parsing.** Atomic strings parse exactly; a `percent()` descriptor is
  a finite 0–100 percentage with exactly one finite non-negative pixel bound.
- **ORD2 — Resolution.** Percentages resolve against one active basis, then the
  descriptor's floor or ceiling applies.
- **ORD3 — Commitment.** A structured default commits once as pixels;
  percentage bounds stay live and clamp with
  `Math.min(max, Math.max(min, size))`, so the maximum wins a conflict.

### Performance and resources

- **PR1 — Observers only when needed.** Atomic pixel paths add no observer or
  render work. A structured default observes a supplied container only until
  its initial pixel choice is final, and persisted pixels skip that
  measurement. Percentage bounds reuse the shared ResizeObserver while live.
  Validation and resolution are constant-time, with no CSS parser.

## Accessibility contract

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

## Design relationships

| Anatomy or state | Design requirement                                   | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Handle           | The focusable resize separator and optional divider. | Current source and docs  | Prominent      | FR1–FR3            |
| Grip pill        | The default visible resize affordance.               | Current source and docs  | Supporting     | FR1, FR2           |
| Grab zone        | An enlarged, transparent pointer area.               | Current source and tests | Supporting     | FR1, FR2           |
| Direction state  | Horizontal or vertical presentation.                 | Current docs             | Supporting     | FR4                |

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

- `spec:AST-010` owns structured sizing; FR5 and FR6 apply it.
- `spec:AST-020` FR15 adopts the APG Window Splitter for the Handle; AR1
  applies it and records its gaps.
- `spec:AST-085` owns disabled-control behavior; FR3 records the tab-order gap.
- `architecture:component-theming-surface` owns target mapping and state
  reflection; FR4 records the `direction` gap.
- `architecture:interaction-modality` owns shared modality and focus
  indication; `architecture:public-component-api` owns caller-input routing.
- `family:layout-regions` lists useResizable and ResizeHandle as collaborators
  that may size a LayoutPanel; it does not own resize state or interaction.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Representative states                                                            | Mutation or failure expectation                                                                                                                                                                                                                                    | Audit section                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| FR1                 | `ResizeHandle.test.tsx`; stable visual baseline `core-resizable--horizontal-split`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default, collapsed, both axes                                                    | Handle and Grab zone regressions fail focused tests; a changed default handle comes back changed for review. Gap: no test renders `children` to prove they replace the Grip pill.                                                                                  | `audit:Resizable/anatomy`       |
| FR2                 | `themingTargets.test.ts`; source review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Handle, Grip pill, Grab zone                                                     | A removed target fails the inventory. `themingTargets.test.ts` catches only a renamed or undocumented target; no check fails if the Handle or Grip pill stops carrying its target.                                                                                 | `audit:Resizable/theming`       |
| FR3                 | `ResizeHandle.test.tsx` and `useResizable.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pointer, keyboard, snap, collapse, persistence; RTL drag; disabled keyboard      | A changed transformation, an RTL drag that moves against the pointer, or keyboard input that resizes a disabled Handle fails. Gap: no test covers disabled pointer input or the disabled tab stop.                                                                 | `audit:Resizable/behavior`      |
| FR4                 | Source and docs comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Horizontal and vertical Handle                                                   | Gap: no test detects that the documented `direction` is not reflected.                                                                                                                                                                                             | `audit:Resizable/theming`       |
| FR5, ORD1–ORD3      | `useResizable.test.ts`, `utils.test.ts`, typecheck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Floor, ceiling, default; invalid shapes; basis changes; numeric container parity | Wrong resolution, a rescaled default, a stale clamp, an observer leak, or state, paint, storage, and ARIA that disagree fails.                                                                                                                                     | `audit:Resizable/behavior`      |
| FR6                 | `useResizable.test.ts`; typecheck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Numeric bounds; conflicting bounds                                               | A removed alias that type-checks, a numeric bound that is not pixels, or a minimum that wins a conflict fails.                                                                                                                                                     | `audit:Resizable/behavior`      |
| FR7                 | `ResizeHandle.test.tsx` consumer `onKeyDown` test; source review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Caller props and `onKeyDown`                                                     | A consumer `onKeyDown` that stops keyboard resizing, or keyboard resizing that skips the consumer handler, fails. Gap: no test covers other caller props, the styling merge, caller `onFocus`, `onBlur`, or `onDoubleClick`, or a caller `role` or ARIA attribute. | `audit:Resizable/api`           |
| AR1                 | `ResizeHandle.test.tsx` ("makes the separator focusable", "exposes the region size and bounds via ARIA", "grows the panel by a step on ArrowRight", "shrinks the panel by a step on ArrowLeft", "uses the large step when Shift is held", "jumps to the minimum on Home", "jumps to the maximum on End", "collapses on Enter when the region is collapsible", "inverts the pointer delta under RTL so dragging resizes intuitively", "restores the previous size, not the minimum, when Enter reopens a collapsed pane", "reopens on Enter even when the minimum size sits below the collapse threshold", "reports the window basis as aria-valuemax when no maximum is configured; End leaves an unbounded region alone", "reports the container basis as aria-valuemax while a percentage bound already observes it", "never reports aria-valuemax below aria-valuemin while collapsed in a small window", "reports no aria-valuemax for an unbounded pixel-only region in a container, which stays unobserved", "a grow arrow opens a collapsed pane one step above its minimum; the shrink arrow leaves it collapsed", "a grow arrow opens a collapsed pane at its collapsedSize when the minimum sits below it", "a grow arrow opens a collapsed pane in the reversed layout and under RTL too", "in a reversed layout, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed", "under RTL, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed", "a grow arrow opens a hand-built collapsed region one step above its minimum", "with snap points, an arrow moves to the adjacent point in its direction and Shift moves two, clamped to the ends", "with snap points past the bounds, a point beyond maxSize or minSize counts as that bound", "with snap points, the arrows follow the reversed layout and the reading direction", "with snap points in a reversed layout, ArrowLeft moves to the next point and ArrowRight to the previous", "with snap points, the grow arrow opens a collapsed pane at the snap point nearest one step above its minimum") and `shippedDirections.test.ts`; `SideNav.test.tsx` ("names the nav it resizes with aria-controls (APG window splitter)"); RTL keyboard mirroring, and the disabled state under the Window Splitter accessibility contract (`internal/a11y-spec`, pending); `ResizeHandle.a11y.test.tsx` and `ResizeHandle.a11y.chromium.spec.ts` | Inline and block axes; LTR and RTL; collapsed; disabled                          | The Handle loses its role, name, orientation, or value properties; an arrow, Home, End, or Enter stops moving the divider or moves it against the reading direction.                                                                                               | `audit:Resizable/accessibility` |
| PR1                 | `useResizable.test.ts` observer tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pixel, percentage default, percentage bound                                      | An observer on a pixel-only path, or one that outlives a final default, fails.                                                                                                                                                                                     | `audit:Resizable/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Canonical anatomy and two targets                                                | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                      | `audit:Resizable/theming`       |

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

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, resize algorithms,
layout-region rules, current audit results, or implementation steps. It links to
their owners.
