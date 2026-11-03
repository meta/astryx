---
schema_version: 3
template_version: 1
kind: module
id: module:Table/useTableColumnResize
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-10
owners: [cixzhang]
review_triggers: [behavior, layout, visual, accessibility]
verified_by:
  [
    packages/core/src/Table/plugins/columnResize/useTableColumnResize.test.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    component:Table,
    architecture:interaction-modality,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
---

# useTableColumnResize module contract

## Intent

`useTableColumnResize` lets a person change a column's width from its trailing
boundary. This record owns what that boundary looks like before anybody drags it:
when a column boundary is drawn, how far the drawn line runs, which pointer
capabilities see it, and what else on the header may change while it is shown.

Width resolution, per-column minimums, proportional-neighbor behavior, the commit
callback, and the module's configuration remain uncontracted. This record is their
canonical owner when they are recorded; today it states only the affordance, its
extent, and its modality.

Current width behavior is on record as the starting point for that later contract,
and two parts of it are already known to be wrong: a drag snapshots every column to
pixel widths, so proportional columns stop being proportional, and a trailing
proportional column does not absorb the delta when the column before it is resized.
Both are defects to correct there, not variations this record allows.

## Compatibility and migration

- Released default preserved: `no` for the resting appearance of a hovered header
  under a hover-capable pointer, and `no` for boundary presence on a coarse-primary
  device that has another input — a keyboard-driven tablet gains a tab stop it did
  not have. `yes` for public API, DOM shape, keyboard behavior on hover-capable
  pointers, and every width outcome.
- Compatibility class: presentation-only change to one transient state, plus one
  accessibility correction that adds a control where keyboard resize was already
  promised. No public API, prop, export, target, or accessibility mapping is added
  or changed.
- Migration decision: none. No consumer edit and no codemod.

This specification-only change carries no package Changeset. The implementation
pull request owns runtime code, tests, and its Changeset.

## Ownership boundary

**Owns**

- Presence and placement of one resize boundary control per resizable column, and
  its pointer target versus its drawn indicator.
- The disclosure contract: which boundaries are drawn at rest, on header hover, on
  pointer, on visible focus, and during drag, and the precedence between them.
- The vertical extent of the drawn indicator and the requirement that it never
  makes the Table scroll region scroll vertically.
- Which pointer capabilities receive the affordance at all, and which receive its
  hover reveal.
- The bound on what else header hover may change.
- Whether header disclosure responds to a pointer while the scroll region is
  scrolling.

**Does not own / non-goals**

- Aggregate `TablePlugin` protocol, transform phases, plugin ordering, and header
  row and header cell render slots — owned by `component:Table`.
- Shared modality state and focus-indicator visibility rules — owned by
  `architecture:interaction-modality`.
- Public theme targets and token exposure — owned by
  `architecture:component-theming-surface`. No `table-resize-handle` target is
  approved by this contract.
- Sort, selection, column-settings, or any other header control's own hover, focus,
  and press treatments.
- A touch-drag resize affordance. Dragging a hairline boundary by finger is a
  non-goal under DEC-4; a touch-reachable resize path would be a separate
  affordance with its own record.
- Width computation, clamping, commit semantics, RTL width math, and the module's
  configuration surface. They stay in consumer docs until this record contracts
  them.

## Public API and concepts

This contract adds no public API. Consumer signatures, defaults, and examples
remain in `useTableColumnResize.doc.mjs`.

| Concept            | Closed values or states          | Meaning                                                                           | Default                            | Owner                               | Stability |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- | --------- |
| Boundary control   | Present or absent per column     | One resizable boundary at a column's trailing inline edge.                        | Present for every resizable column | `module:Table/useTableColumnResize` | Stable    |
| Disclosure state   | `hidden`, `hinted`, `emphasized` | How strongly one boundary is drawn right now.                                     | `hidden`                           | `module:Table/useTableColumnResize` | Stable    |
| Pointer capability | Hover-capable or coarse          | Whether hover reveals the affordance. Does not decide whether the control exists. | Derived from the input             | `architecture:interaction-modality` | Stable    |
| Scroll activity    | Settling or scrolling            | Whether the scroll region is moving under the pointer right now.                  | Settling                           | `module:Table/useTableColumnResize` | Stable    |

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                             | Basis                                            | Implementation/evidence state                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| FR1  | Each resizable column receives one boundary control at its trailing inline edge, with a pointer target wider than the drawn indicator so the line stays hairline while the grab area stays usable. A column that opts out of resizing, and a generated plugin column, receive none.                                                                                   | Current source and docs                          | Verified current behavior; sizes are source-inspected.                           |
| FR2  | The drawn indicator runs from the top of the header through the body rows so a drag reads against the rows it moves. It MUST end at or above the table's bottom edge and MUST NOT make the Table scroll region scroll vertically; that region exists for horizontal overflow only.                                                                                    | Owner direction, 2026-09-10                      | Current release overhangs the last row; correction pending.                      |
| FR3  | With no hover-capable pointer in the header row, no visible focus on a boundary, and no drag in progress, every boundary is `hidden`.                                                                                                                                                                                                                                 | Current source and docs                          | Verified current behavior.                                                       |
| FR4  | While a hover-capable pointer is anywhere inside a header row, every boundary in that row is `hinted` at border weight at the same time. The boundaries return to `hidden` when the pointer leaves the row.                                                                                                                                                           | Owner direction, 2026-09-10 (DEC-1)              | Owner-directed; implementation and focused coverage pending.                     |
| FR5  | A boundary under the pointer, a boundary with a visible focus indicator, and the boundary being dragged are `emphasized` at accent weight, over any `hinted` state.                                                                                                                                                                                                   | Current source plus DEC-1                        | Pointer and focus states verified; hint interaction pending.                     |
| FR6  | Pointer capability gates the hover reveal, not the control. Where no pointer can hover, entering a header row reveals nothing and every boundary stays `hidden`. The boundary control itself, with its tab stop and accessible name and values, exists wherever any available input can operate it, so a coarse-primary device with a keyboard keeps keyboard resize. | DEC-3 plus `architecture:interaction-modality`   | Coarse-primary suppression is current behavior and is the defect DEC-3 corrects. |
| FR7  | Header hover changes only these indicators. It MUST NOT change header background, label, cursor, layout, column width, or any body-row treatment, and MUST NOT alter another header control's own states.                                                                                                                                                             | Owner direction, 2026-09-10                      | Owner-directed; focused coverage pending.                                        |
| FR8  | Resizing stays available without hover. A boundary remains in tab order with its accessible name and values, keyboard resize is unchanged, and the reveal adds discovery only — it is never a precondition for use. This holds on every device whose input can operate the control, including a coarse-primary device with a keyboard.                                | Current source, WAI-ARIA splitter pattern, DEC-3 | Keyboard path verified on hover-capable pointers; coarse-primary parity pending. |
| FR9  | A boundary with a visible focus indicator is `emphasized` alone. Focus MUST NOT raise the row-level hint, so focusing one boundary never draws its neighbors. Only a hover-capable pointer inside the header row does that.                                                                                                                                           | Owner direction, 2026-09-21 (DEC-5)              | Owner-directed; focused coverage pending.                                        |
| FR10 | While the Table's scroll region is scrolling, header hover resolves no new disclosure: a boundary the pointer reaches only because content moved under it stays `hidden`, and boundaries already `hinted` when the scroll began settle back to `hidden`. Disclosure resumes when scrolling stops. A drag in progress and a visible focus indicator are unaffected.    | Owner direction, 2026-09-21 (DEC-6)              | Owner-directed; implementation and coverage pending.                             |

### Transformation and precedence order

- **ORD0 — Scroll gate.** Scroll activity is evaluated before ORD1's hover branch.
  While the scroll region scrolls, the `hinted` branch is unreachable; drag and
  visible focus still resolve to `emphasized` (FR10).
- **ORD1 — Disclosure precedence.** Drag, visible focus, and pointer-on-boundary
  resolve to `emphasized`; otherwise header-row hover resolves to `hinted`;
  otherwise `hidden`. A boundary's own state always outranks the row-level hint, so
  the boundary under the pointer reaches accent while its neighbors stay at border
  weight. Precedence runs one way only: a boundary's own state never raises the
  row-level hint, which is why focus alone emphasizes one boundary and draws no
  neighbors (FR9).
- **ORD2 — Reveal scope.** The reveal is published once at header-row scope, not per
  cell, so entering the header anywhere reveals every boundary in that row together
  rather than the one under the pointer.
- **ORD3 — Parent pipeline.** The module contributes its header row and header cell
  transforms at the position `component:Table` gives it and does not redefine plugin
  order.

### Performance and resources

- **PR1 — Disclosure costs no render.** Entering or leaving the header MUST NOT set
  React state or rerender the Table. Disclosure is a declarative style state.
  FR10's scroll gate is the one permitted exception to the no-listener rule: the
  module MAY attach a single passive scroll listener on the scroll region, plus the
  settle signal that tells it when to reopen — `scrollend` where the browser has
  it, otherwise one debounced timer. It MUST write its scroll state straight to the
  DOM, as an attribute or an inline custom property that CSS reads, and MUST NOT
  set React state or rerender the Table. No other listener or timer may be added
  for disclosure.
- **PR2 — One measurement path.** Indicator extent reuses the module's existing
  shared resize observation of the table. Disclosure adds no observer, and extent
  measurement MUST NOT observe anything whose size the indicator itself changes.

## Accessibility contract

- **AR1 — Unchanged semantics.** Each boundary keeps its separator role, vertical
  orientation, accessible name naming its column, and current value bounds.
- **AR2 — Decorative disclosure.** `hinted` is presentation only. It changes no ARIA
  state, announces nothing, and does not enter or reorder tab order.
- **AR3 — Parity without hover.** Keyboard focus draws the same boundary at accent,
  so a person who never hovers gets an equal cue at the moment it is useful. Focus
  draws that one boundary and no others (FR9).
- **AR4 — Honest strength claim.** The `hinted` weight is a discovery aid, not a
  state indicator. This contract makes no non-text contrast promise for it and MUST
  NOT let it become the only signal that a control is available; `emphasized` and
  the focus indicator carry that signal.
- **AR5 — Motion restraint.** Any transition on disclosure MUST remain a short
  color change and MUST NOT move layout or the indicator's position.
- **AR6 — Parity across inputs.** The tab stop does not depend on primary pointer
  capability. A device whose primary pointer is coarse but which has a keyboard
  keeps the boundary control, its name, and its values (FR6, DEC-3).

## Design relationships

| Anatomy or state                 | Design requirement                                                                                      | Representation authority            | Module contract |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------- |
| Boundary control                 | Offers a grabbable column edge without drawing a permanent divider, on every input that can operate it. | `module:Table/useTableColumnResize` | FR1, FR6, AR6   |
| `hidden` boundary                | Keeps a resting header free of controls the person is not using.                                        | `module:Table/useTableColumnResize` | FR3             |
| `hinted` boundary                | Answers "can these columns move?" at the moment attention enters the header.                            | `module:Table/useTableColumnResize` | FR4, FR7, AR4   |
| `emphasized` boundary            | Names the one boundary that pointer, focus, or drag is acting on, and only that one.                    | `module:Table/useTableColumnResize` | FR5, FR9, ORD1  |
| Disclosure at rest during scroll | Keeps content moving under a still pointer from reading as intent.                                      | `module:Table/useTableColumnResize` | FR10, ORD0      |
| Indicator extent                 | Reads the drag against the rows it resizes, without changing what the table scrolls.                    | `module:Table/useTableColumnResize` | FR2             |

### Theming

No public target is approved for the boundary control or its indicator, and the
module's consumer doc records no anatomy of its own. This contract therefore adds
no `anatomy-theming:v1` block; a direct target requires its own review under
`architecture:component-theming-surface` with synchronized consumer anatomy.

DEC-7 settles this as a decision rather than an open question: the hint and accent
weights already resolve from theme tokens, so a theme change moves the boundary
without a target of its own.

## Parent and system relationships

- `component:Table` owns the plugin protocol, ordering, header row and header cell
  slots, and the scroll region this contract's FR2 protects. Table's aggregate
  record does not own column-resize anatomy, which is why this boundary is separate.
- The sticky-columns plugin (`useTableStickyColumns`, no record of its own yet)
  composes with this module on the same header cell. Both contribute `position` —
  this module appends `relative` so its absolute boundary control anchors, sticky
  needs `sticky` to pin — and while both went through the cell's `xstyle`, the
  later plugin's value won and composition order decided whether a pinned column
  actually pinned. Ordering is not the fix: `component:Table` owns plugin order and
  treats it as a layout decision, never a correctness one, so a pair that works in
  one order and breaks in the other is a defect in the pair. Sticky therefore
  writes `position` inline alongside the offsets it already wrote there, which
  outranks either plugin's classes and makes the composition order-independent. A
  second coupling stays open: sticky computes its cumulative pin offsets from
  declared column widths while a drag writes rendered pixel widths to the DOM, so
  pin offsets go stale after a resize. Neither record contracts that reconciliation
  yet.
- `architecture:interaction-modality` owns hover capability versus modality history
  and the visibility rules for the shared focus indicator. FR6 and AR3 apply those
  rules; they do not restate them.
- `architecture:component-theming-surface` owns target qualification. Structural
  custom properties used to carry extent and hint values are implementation, not
  theme surface.
- `architecture:public-component-api` owns the public boundary. This record adds no
  export, prop, or type.

## Verification map

| Contract           | Verification                                                                                                                      | Representative states                                                                                            | Mutation or failure expectation                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR6           | `useTableColumnResize.test.tsx` boundary-presence cases plus hover-capability and coarse-primary cases                            | Resizable, opted-out, and generated columns; hover-capable, coarse-primary with keyboard, and coarse-only inputs | A boundary appears on a non-resizable column, disappears from a resizable one, the hover reveal fires where no pointer can hover, or the control is absent where an input can operate it. |
| FR2                | Browser measurement of scroll-region vertical overflow with the plugin enabled                                                    | Short and tall tables, wrapped and single-line headers, dense and default                                        | The indicator ends below the last row or the scroll region gains vertical scroll that the same table lacks without resize.                                                                |
| FR3-FR5, FR9, ORD1 | New focused tests for resting, header-hovered, pointer-on-boundary, focused, and dragging states                                  | Rest, header hover, hover plus pointer on one boundary, keyboard focus with no pointer in the row, drag          | A resting header draws boundaries, header hover misses a boundary, the pointed/focused boundary fails to outrank the hint, or focus alone draws a neighbor.                               |
| FR10, ORD0         | Scroll-gate test driving the scroll region with a stationary pointer over the header                                              | Pointer resting over a header while the region scrolls and after it settles                                      | Boundaries reveal mid-scroll, an existing hint survives the scroll, or disclosure fails to resume once scrolling stops.                                                                   |
| FR7                | Snapshot or assertion that header hover changes no other header or row treatment                                                  | Header hover over a sortable and a selectable header                                                             | Header hover changes background, label, cursor, width, or another control's state.                                                                                                        |
| FR8, AR1-AR3, AR6  | Existing keyboard and ARIA suites and a coarse-primary keyboard case; an assistive-technology spot check is recommended follow-up | Tab to boundary, arrow resize, screen-reader navigation of the header, coarse-primary device with a keyboard     | The boundary leaves tab order on any input that can operate it, loses its name or values, or the hint reaches the accessibility tree.                                                     |
| PR1, PR2           | Render-count assertion around header pointer enter/leave and during a scroll; listener and observer inspection                    | Pointer enters and leaves the header repeatedly; the region scrolls under a resting pointer                      | Disclosure rerenders the Table, the scroll gate sets React state, more than one scroll listener or any timer is added, or the extent measurement observes what it resizes.                |
| Plugin composition | Test mounting the resize and sticky-columns plugins together in both insertion orders                                             | Pinned start column with resize enabled, before and after a drag                                                 | A pinned column loses `position: sticky` in either order, or the composition depends on caller insertion order.                                                                           |
| Record shape       | `scripts/check-knowledge.mjs`                                                                                                     | Colocated module record, canonical id and filename, parent backlink                                              | A missing, misnamed, mis-parented, or unlinked record passes validation.                                                                                                                  |

Browser, render-count, and assistive-technology evidence are pending. Passing this
specification pull request proves record integrity only.

## Decision log

### DEC-1 — The header discloses every resizable boundary on hover

**Reference:** `module:Table/useTableColumnResize/DEC-1`
**Decider:** cixzhang, 2026-09-10

A boundary drawn only once the pointer is already inside its grab area asks the
person to suspect the column is resizable before they can find out. Entering the
header now reveals every boundary at border weight, and the boundary under the
pointer still takes accent, so discovery and targeting stay distinguishable. The
reveal is bounded by FR7 and is pointer-only by FR6.

Rejected: revealing only the boundary under the pointer, which keeps the discovery
problem; drawing permanent dividers, which adds a resting visual the columns do not
earn; relying on the resize cursor alone, which requires the same prior suspicion;
and a public prop to opt out, which makes a discovery affordance a caller decision.

### DEC-2 — The indicator is bounded by the table it belongs to

**Reference:** `module:Table/useTableColumnResize/DEC-2`
**Decider:** cixzhang, 2026-09-10

A full-height indicator is the intended design because a drag has to read against
the rows it moves. An indicator that ends past the last row is a defect, not an
allowed variation: the scroll region promotes vertical overflow as soon as it
scrolls horizontally, so an invisible overhang becomes visible stray scrolling.
Ending a fraction short of the last row is within FR2; hanging past it is not.

Rejected: leaving the overhang and suppressing vertical scroll on the region, which
would hide real overflow from other content.

### DEC-3 — Pointer capability gates the reveal, not the control

**Reference:** `module:Table/useTableColumnResize/DEC-3`
**Decider:** cixzhang, 2026-09-21

Suppressing the whole boundary control on a coarse primary pointer also removes its
tab stop, so a keyboard-driven tablet loses resize entirely while FR8 and AR3
promise it. Capability decides disclosure only: hover reveals where a pointer can
hover, and the control exists wherever any available input can operate it. The
current coarse suppression is a defect against this decision, not the behavior it
records.

Rejected: keeping existence gated on pointer capability and weakening FR8 to
hover-capable devices, which trades an accessibility guarantee for an
implementation convenience; and gating on a touch-capability test, which still
misreads devices carrying both inputs.

### DEC-4 — Touch-drag resize is a non-goal

**Reference:** `module:Table/useTableColumnResize/DEC-4`
**Decider:** cixzhang, 2026-09-21

A hairline boundary cannot be dragged reliably by finger, and widening the grab
area enough for touch would either swallow header presses or draw a resting
affordance the columns have not earned. Touch users are not given a degraded
version of the pointer path. This closes OQ3.

Rejected: enlarging the grab area under coarse pointers, which conflicts with FR7's
bound on header changes; and a long-press drag mode, which collides with text
selection and scrolling without solving the target size.

A touch-reachable resize path remains wanted as separate work — a drag pill or
resize inside a column-settings sheet — with its own affordance and record.

### DEC-5 — Focus emphasizes one boundary and never hints the row

**Reference:** `module:Table/useTableColumnResize/DEC-5`
**Decider:** cixzhang, 2026-09-21

Keyboard focus is already aimed at one boundary, so drawing every boundary in the
row adds noise rather than discovery. The row-level hint answers "can these columns
move?" for a pointer arriving without a target; focus has one. Focus therefore
resolves `emphasized` on its own boundary and leaves its neighbors `hidden`.

Rejected: firing the row hint on focus for symmetry with hover, which repeats a
discovery cue to a modality that does not need it and makes the focused boundary
harder to pick out of eight drawn lines.

### DEC-6 — Disclosure is suppressed while the scroll region scrolls

**Reference:** `module:Table/useTableColumnResize/DEC-6`
**Decider:** cixzhang, 2026-09-21

A pointer that ends up over a header because the content moved under it has not
expressed intent, so boundaries appearing mid-scroll read as flicker. Disclosure
holds while the region scrolls and resumes when it settles. A drag in progress and
a visible focus indicator are unaffected, since both are deliberate.

Rejected: revealing on scroll-triggered hover as the browser reports it, which is
the flicker; and a debounce on pointer entry, which delays the deliberate case to
fix the accidental one.

### DEC-7 — The boundary gets no public theme target

**Reference:** `module:Table/useTableColumnResize/DEC-7`
**Decider:** cixzhang, 2026-09-21

The hint and accent weights already resolve from theme tokens, so a theme change
moves the boundary correctly without a direct target. Publishing one would freeze
`boundary` and `indicator` anatomy into the theming surface before the width model
is contracted, and `architecture:component-theming-surface` requires synchronized
consumer anatomy this module's doc does not have. This closes OQ2.

Rejected: publishing a target now and revising it when the width contract lands,
which puts a stable public surface in front of an undecided one.

Revisit if a consumer needs the hint weight to differ from their own border token.

## Open questions

- **OQ1 — Forced colors.** How do `hinted` and `emphasized` resolve under forced-colors
  and high-contrast modes? (`checkable`)
- **OQ4 — Draft design record.** `design:user-states` is draft. When it is promoted,
  its conditional-hover requirement should be cited here instead of restated.
- **OQ5 — Sticky offset reconciliation.** After a drag writes rendered pixel widths,
  sticky pin offsets computed from declared widths are stale. Which record owns the
  reconciliation, and does it belong to the width contract or to sticky columns?
  (`checkable`)

OQ2 (theme selection) is closed by DEC-7 and OQ3 (coarse pointers) by DEC-3 and
DEC-4. Their numbers are retained rather than reused.

## Content boundary

This record does not duplicate consumer signatures or examples, the parent Table
plugin protocol, shared modality mechanics, theme target policy, width computation,
current audit results, or implementation steps. It links to their owners.
