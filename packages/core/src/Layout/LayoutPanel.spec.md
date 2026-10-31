---
schema_version: 3
template_version: 7
kind: component
id: component:LayoutPanel
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-30
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layout/LayoutSlots.test.tsx,
    packages/core/src/Layout/__tests__/Layout.a11y.test.tsx,
    packages/core/src/Layout/__tests__/Layout.a11y.chromium.spec.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-regions]
design_specs: []
architecture:
  [
    architecture:container-padding,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# LayoutPanel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `width`, `resizable`, `hasDivider`, `isScrollable`, `padding`, `label`, `role`, root `BaseProps`, and a root `ref`.                 |
| Behavior                | A fixed-width side region at logical start or end that scrolls by default, with an optional divider on its content-facing edge.                 |
| End-user impact         | People see a side panel that keeps its width, scrolls on its own, and mirrors to the other side in right-to-left.                               |
| Builder impact          | None; the record describes shipped behavior.                                                                                                    |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact.       |
| Review checks           | Reject a divider on the outer edge, a panel that shrinks, an inferred landmark, `width` beating `resizable`, or a further publication mismatch. |
| Governing rules         | `family:layout-regions` FR1, FR2, FR4–FR8, FR10; `architecture:container-padding`; `architecture:public-component-api` INV5–INV8.               |

This table is a review projection; the body below is authoritative.

## Intent

LayoutPanel is the side region a caller places in a Layout's `start` or `end`
slot. It owns the panel's width, inset, scrolling, divider, and
caller-supplied landmark semantics; the caller owns its content.

Consumer syntax and examples belong in `LayoutPanel.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — no divider, scrollable, automatic
  inset, content width.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Published inset differs from applied padding (FR3).** On the automatic
  path a panel applies the Layout-edge inset on its outer inline edge and on
  a block edge with no header or footer, but publishes the inner inset on
  every edge. A full-bleed child then lines up against a value that differs
  from the padding the panel applies, where `architecture:container-padding`
  has a region publish its applied padding.
- **Two divider owners can paint one boundary (FR4).** A panel with
  `hasDivider` beside a ResizeHandle that draws the same line paints the
  boundary twice; nothing prevents it, so callers keep `hasDivider={false}`
  when the ResizeHandle owns the line (`family:layout-regions` FR5).

## Ownership boundary

**Owns**

- The panel root, which carries the `layout-panel` target that
  `component:Layout` maps.
- Panel width, inset, scrolling, divider, and caller-supplied role and label.

**Does not own / non-goals**

- Slot placement and the Layout-edge inset — owned by `component:Layout`.
- Resize interaction and the resize handle — owned by useResizable and
  ResizeHandle (`family:layout-regions` FR10).
- Panel content and its meaning — owned by the caller.

## Public concepts

| Concept   | Closed values or states               | Meaning                                                                    | Availability by variant/orientation/state | Default       | Owner                   | Stability | Invalid-value behavior           |
| --------- | ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- | ------------- | ----------------------- | --------- | -------------------------------- |
| Width     | number (px); CSS length string; unset | The panel's inline size.                                                   | Always                                    | content width | `component:LayoutPanel` | Stable    | —                                |
| Resizable | the value from useResizable           | Supplies a resizable width that wins over `width`.                         | Always                                    | none          | `component:LayoutPanel` | Stable    | —                                |
| Divider   | `true`, `false`                       | Draws a line on the panel's content-facing edge.                           | Start or end slot                         | `false`       | `component:LayoutPanel` | Stable    | —                                |
| Scrolling | `true`, `false`                       | Scrolls overflow, or clips it.                                             | Always                                    | `true`        | `component:LayoutPanel` | Stable    | —                                |
| Inset     | spacing step; `0`; unset              | Uniform padding that replaces the automatic inset; `0` is full bleed.      | Always                                    | automatic     | `component:LayoutPanel` | Stable    | Closed union; rejected by types. |
| Landmark  | caller `role` and `label`             | Exposes the panel as the role the caller names, with that accessible name. | Always                                    | none          | caller                  | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FR1 | LayoutPanel renders one `div` carrying the `layout-panel` target that does not shrink and holds the children directly. `width` sets its inline size, with numbers as pixels; a `resizable` value's size wins over `width`. It scrolls overflow by default; `isScrollable={false}` clips it.                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests; `family:layout-regions` FR7, FR10                   |
| FR2 | In the `start` slot the panel's content-facing edge is its inline end; in the `end` slot it is its inline start; both follow writing direction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests; `family:layout-regions` FR2                         |
| FR3 | Without `padding`, the panel's outer inline edge has the Layout-edge inset, a block edge with no header or footer beside it has the Layout-edge inset, and other edges have the inner inset, where the Layout-edge inset comes from the Layout's `padding`, else the nearest padding container, and the inner inset from the nearest padding container (Card, Section, Dialog, Drawer, or BottomSheet), each spacing step 4 otherwise. A `padding` step replaces all four edges, and `0` removes them. The panel publishes container-padding values equal to the padding it applies. Implementation gap: on the automatic path it publishes the inner inset on every edge (Current-state impact). | Current source; `family:layout-regions` FR4; `architecture:container-padding` |
| FR4 | `hasDivider` draws a 1px solid `--color-border` line on the content-facing edge; LayoutPanel does not read a Layout divider default. Without a divider and with the automatic inset, the panel overlaps the content area by the inner inset so the two share one gap. One boundary has one divider owner (`family:layout-regions` FR5). Implementation gap: nothing prevents a panel divider and an adjacent ResizeHandle line from both painting (Current-state impact).                                                                                                                                                                                                                         | Current source and docs; `family:layout-regions` FR5, FR6                     |
| FR5 | `role` and `label` set the root's `role` and `aria-label`; LayoutPanel adds no role of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests; `family:layout-regions` FR8                         |
| FR6 | `ref` reaches the root. Supported DOM, data, ARIA, and event props reach the root after the component's own attributes; `xstyle`, `className`, and `style` compose after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests; `architecture:public-component-api` INV5–INV8       |

### Allowed variation

- **AV1 — Content.** Any caller content may fill the panel.
- **AV2 — Position.** The caller places the panel at start, end, or both.

### Representative states

| State               | Required invariant                                     | Allowed variation |
| ------------------- | ------------------------------------------------------ | ----------------- |
| Start panel         | Divider and shared gap on the inline-end edge.         | Width.            |
| End panel           | Divider and shared gap on the inline-start edge.       | Width.            |
| Right-to-left       | Start and end mirror.                                  | —                 |
| Resizable           | The resizable size sets the width.                     | Size.             |
| Navigation landmark | `role="navigation"` and the caller's name on the root. | Name.             |

### Transformation and precedence order

- **ORD1 — Width.** `resizable` size → `width` → content width.
- **ORD2 — Padding.** `padding` → automatic inset per edge.

### Performance and resources

- **PR1 — No external lifecycle.** LayoutPanel reads its slot and which slots
  its Layout fills, and adds no listener, observer, timer, or measurement of
  its own.

## Accessibility contract

- **AR1 — Explicit landmarks only.** The panel is a landmark only when the
  caller supplies `role`, named only by the caller's `label`
  (`family:layout-regions` FR8).

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Panel            | A fixed side region with an optional content-facing divider. | Current source and docs  | Supporting     | FR1–FR4            |

Theming: the root carries the `layout-panel` target, which `Layout.doc.mjs`
declares and `component:Layout` maps. `LayoutPanel.doc.mjs` declares no anatomy
of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `family:layout-regions` owns region direction, padding replacement,
  boundary ownership, divider spacing, scrolling, landmarks, and resize
  delegation; FR1–FR5 and AR1 apply them.
- `architecture:container-padding` owns inset publication; FR3 applies it and
  records the gap.
- `component:Layout` owns slot placement, the Layout-edge inset, and the
  `layout-panel` target mapping.

## Verification map

| Contract  | Verification                                                                                                                                                | Representative states                             | Mutation or failure expectation                                                                                                                                                                                                                                                                          | Audit section                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, ORD1 | `LayoutSlots.test.tsx` class, width, and resizable tests                                                                                                    | Numeric and string width; resizable               | A lost `layout-panel` class, a missing width, or `width` beating `resizable` fails. Gap: the non-shrinking root, scrolling, and `isScrollable={false}` have no check. No requirement or check covers how a keyboard user reaches a scrolling panel's overflow when the panel holds no focusable content. | `audit:LayoutPanel/layout`        |
| FR2       | `LayoutSlots.test.tsx` start- and end-slot tests; `Layout.a11y.chromium.spec.ts` `start-end-navigation-rtl` state                                           | Start and end panels; right-to-left               | A panel that fails to render in either slot fails. Gap: no check asserts which edge carries the divider or the shared gap, or the mirrored placement.                                                                                                                                                    | `audit:LayoutPanel/layout`        |
| FR3, ORD2 | Source review                                                                                                                                               | Automatic, explicit, and zero padding             | Gap: no test covers the automatic per-edge inset, the `padding` replacement, full bleed, or the published values.                                                                                                                                                                                        | `audit:LayoutPanel/layout`        |
| FR4       | Source review                                                                                                                                               | `hasDivider`; no divider                          | Gap: no test covers the divider line, the shared gap, or a panel divider beside a ResizeHandle.                                                                                                                                                                                                          | `audit:LayoutPanel/layout`        |
| FR5, AR1  | `LayoutSlots.test.tsx` landmark test; `Layout.a11y.test.tsx` and `Layout.a11y.chromium.spec.ts` `start-end-navigation-rtl` and `nested-panel-region` states | Caller `navigation` and `region` roles and labels | A lost role or name fails, including at the accessibility tree. Gap: no test asserts that a panel without `role` exposes none.                                                                                                                                                                           | `audit:LayoutPanel/accessibility` |
| FR6       | `LayoutSlots.test.tsx` ref and className tests                                                                                                              | Ref; caller class                                 | A ref on another element or a dropped class fails. Gap: no test covers `style`, DOM, data, or event props, or the `xstyle` merge order.                                                                                                                                                                  | `audit:LayoutPanel/api`           |
| PR1       | Source review                                                                                                                                               | Every state                                       | Gap: no automated check fails if LayoutPanel adds a listener, timer, or measurement.                                                                                                                                                                                                                     | `audit:LayoutPanel/behavior`      |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, Layout slot rules, resize interaction, or
container-padding mechanics. It links to their owners.
