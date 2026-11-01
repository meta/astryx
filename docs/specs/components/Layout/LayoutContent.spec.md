---
schema_version: 3
template_version: 7
kind: component
id: component:LayoutContent
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
    packages/core/src/Layout/__tests__/contentWidth.test.tsx,
    packages/core/src/Layout/__tests__/Layout.a11y.test.tsx,
    packages/core/src/Layout/__tests__/Layout.a11y.chromium.spec.ts,
    .github/visual-baseline/manifest.json,
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
system_specs: [spec:AST-038]
---

# LayoutContent component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `isScrollable`, `padding`, `label`, `role`, root `BaseProps`, and a root `ref`.                                                   |
| Behavior                | The main content region fills the Layout's middle area, scrolls by default, and insets its children from neighbouring regions and open edges. |
| End-user impact         | People scroll the main content while headers, footers, and panels stay put, with the scrollbar at the content area's open edge.               |
| Builder impact          | None; the record describes shipped behavior.                                                                                                  |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Three implementation gaps are listed under Current-state impact.   |
| Review checks           | Reject an inner wrapper around the children, a scrollbar moved off the open edge, an inferred landmark, or a further publication mismatch.    |
| Governing rules         | `family:layout-regions` FR1, FR3, FR4, FR7, FR8, FR12; `architecture:container-padding`; `architecture:public-component-api` INV5–INV8.       |

This table is a review projection; the body below is authoritative.

## Intent

LayoutContent is the main content region a caller places in a Layout's
`content` slot. It owns the region's scrolling, inset, and caller-supplied
landmark semantics; the caller owns its content.

Consumer syntax and examples belong in `LayoutContent.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — scrollable, automatic inset, no
  landmark role.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Open inline-end edge keeps the inner inset beside a start panel (FR2).**
  With only a start panel, the open inline-end edge applies the inner inset
  (spacing step 4 by default) instead of the Layout-edge inset, even when the
  Layout sets `padding={0}`, so content stops short of an edge that should be
  full bleed (`family:layout-regions` FR3).
- **Published padding differs from applied padding (FR2).** With only an end
  panel, the inline-end edge applies the inner inset beside the panel but
  publishes the Layout-edge inset. Beside a header or footer without a
  divider, the block edge applies zero but publishes the inner inset, so a
  nested full-bleed child or Layout starts one inner inset away from the
  content box. `architecture:container-padding` has a region publish its
  applied padding.
- **Nested content inherits an outer collapse (FR2).** When an outer Layout's
  header or footer has no divider, its middle row zeroes the content's block
  spacing on that side, and a Layout nested inside that row inherits the zero,
  even inside a Dialog, Drawer, or BottomSheet opened from it, so its content
  sits flush against its own header's or footer's divider, where
  `family:layout-regions` FR6 collapses spacing only where the divider is
  absent and `spec:AST-038` FR7 stops inherited layout state at a layer
  boundary.

## Ownership boundary

**Owns**

- The content root, which carries the `layout-content` target that
  `component:Layout` maps, and is both the scroll container and the direct
  parent of the children.
- The region's inset, scrolling, and caller-supplied role and label.

**Does not own / non-goals**

- Slot placement, the Layout-edge inset, and content width — owned by
  `component:Layout`.
- Content and its meaning — owned by the caller.

## Public concepts

| Concept   | Closed values or states   | Meaning                                                                     | Availability by variant/orientation/state | Default   | Owner                     | Stability | Invalid-value behavior           |
| --------- | ------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | --------- | ------------------------- | --------- | -------------------------------- |
| Scrolling | `true`, `false`           | Scrolls overflow, or clips it.                                              | Always                                    | `true`    | `component:LayoutContent` | Stable    | —                                |
| Inset     | spacing step; `0`; unset  | Uniform padding that replaces the automatic inset; `0` is full bleed.       | Always                                    | automatic | `component:LayoutContent` | Stable    | Closed union; rejected by types. |
| Landmark  | caller `role` and `label` | Exposes the region as the role the caller names, with that accessible name. | Always                                    | none      | caller                    | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| FR1 | LayoutContent renders one `div` carrying the `layout-content` target that fills the middle area's height and remaining width and holds the children directly. It scrolls overflow by default; `isScrollable={false}` clips it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `family:layout-regions` FR7                              |
| FR2 | Without `padding`, each edge that faces another region (a panel, header, or footer) has the inner inset, and each open edge has the Layout-edge inset, where the Layout-edge inset comes from the Layout's `padding`, else the nearest padding container, and the inner inset from the nearest padding container (Card, Section, Dialog, Drawer, or BottomSheet), each spacing step 4 otherwise; a block edge beside a header or footer without a divider collapses to zero. A `padding` step replaces all four edges, and `0` removes them. The region publishes container-padding values equal to the padding it applies, excluding the content-width alignment gutter of FR3, which is applied but not published. Implementation gaps: with only a start panel the open inline-end edge applies the inner inset; the published values differ from the applied padding with only an end panel and beside a header or footer without a divider; and a nested Layout inherits an outer header's or footer's collapse, so its content sits flush against its own divider (Current-state impact). | Current source; `family:layout-regions` FR4, FR6; `architecture:container-padding` |
| FR3 | When the Layout sets a content width, the region keeps its own box and scrollbar where `component:Layout` FR6 places them and aligns its children to that width through its inline padding, never less than its inset. With `padding={0}` it stays full bleed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `family:layout-regions` FR12                             |
| FR4 | `role` and `label` set the root's `role` and `aria-label`; LayoutContent adds no role of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests; `family:layout-regions` FR8                              |
| FR5 | `ref` reaches the root. Supported DOM, data, ARIA, and event props reach the root after the component's own attributes; `xstyle`, `className`, and `style` compose after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests; `architecture:public-component-api` INV5–INV8            |

### Allowed variation

- **AV1 — Content.** Any caller content may fill the region.
- **AV2 — Landmark.** The caller chooses whether the region is a landmark and
  which one.

### Representative states

| State                    | Required invariant                                    | Allowed variation |
| ------------------------ | ----------------------------------------------------- | ----------------- |
| Alone in a Layout        | Layout-edge inset on every edge; scrolls.             | Content.          |
| Beside panels            | Inner inset toward each panel.                        | Panel count.      |
| Content width, no panels | Full-width scrollport; children aligned to the width. | Width.            |
| Full bleed               | No padding; zero published inset.                     | —                 |
| Main landmark            | `role="main"` and the caller's name on the root.      | Name.             |

### Transformation and precedence order

- **ORD1 — Padding.** `padding` → automatic inset per edge (inner toward a
  region, Layout-edge on an open side, zero beside a header or footer without
  a divider); content-width alignment only increases inline padding.

### Performance and resources

- **PR1 — No external lifecycle.** LayoutContent reads which slots its Layout
  fills and adds no listener, observer, timer, or measurement.

## Accessibility contract

- **AR1 — Explicit landmarks only.** The region is a landmark only when the
  caller supplies `role`, named only by the caller's `label`
  (`family:layout-regions` FR8).
- **AR2 — Keyboard scrolling.** A scrolling region is a browser scroll
  container, so its overflow scrolls with the keyboard once focus is inside
  it or on it.

## Design relationships

| Anatomy or state | Design requirement                     | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------- | ------------------------ | -------------- | ------------------ |
| Content area     | The main scrolling region of a Layout. | Current source and docs  | Prominent      | FR1–FR3            |

Theming: the root carries the `layout-content` target, which `Layout.doc.mjs`
declares and `component:Layout` maps. `LayoutContent.doc.mjs` declares no
anatomy of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `family:layout-regions` owns region scrolling, padding replacement, divider
  spacing, landmarks, and content-width scrollbar placement; FR1–FR4 and AR1
  apply them.
- `architecture:container-padding` owns inset publication; FR2 applies it and
  records the gap.
- `component:Layout` owns slot placement, the Layout-edge inset, content
  width, and the `layout-content` target mapping.

## Verification map

| Contract  | Verification                                                                                                         | Representative states                    | Mutation or failure expectation                                                                                                                                                                                                  | Audit section                       |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1       | `LayoutSlots.test.tsx` class, scroll-owner, and Layout-slot tests                                                    | Alone; in a Layout                       | A lost `layout-content` class, a non-scrolling default, or an inner wrapper around the children fails. Gap: `isScrollable={false}` and the fill sizing have no check.                                                            | `audit:LayoutContent/layout`        |
| FR2, ORD1 | `LayoutSlots.test.tsx` padding test                                                                                  | `padding={0}`; numeric padding           | Gap: the padding test checks only that the region renders, and no test covers the automatic per-edge inset, the start-panel inline-end inset, the collapse beside a header or footer without a divider, or the published values. | `audit:LayoutContent/layout`        |
| FR3       | `contentWidth.test.tsx`; stable visual baseline `core-layout--content-width-scrollbar-placement`                     | No panels, one panel, both; zero padding | A content region that is not full width without panels, children not aligned, or a lost full bleed fails; a scrollbar moved off its edge comes back changed for review.                                                          | `audit:LayoutContent/layout`        |
| FR4, AR1  | `LayoutSlots.test.tsx` landmark test; `Layout.a11y.test.tsx` and `Layout.a11y.chromium.spec.ts` `content-main` state | Caller `main` role and label             | A lost role or name fails, including at the accessibility tree. Gap: no test asserts that a region without `role` exposes none.                                                                                                  | `audit:LayoutContent/accessibility` |
| FR5       | `LayoutSlots.test.tsx` ref and className/style tests                                                                 | Ref; caller class and style              | A ref on another element, or a dropped class or style, fails. Gap: no test covers DOM, data, or event props, or the `xstyle` merge order.                                                                                        | `audit:LayoutContent/api`           |
| AR2, PR1  | Source review                                                                                                        | Scrolling region                         | Gap: no automated check covers keyboard scrolling or fails if LayoutContent adds a listener or measurement.                                                                                                                      | `audit:LayoutContent/behavior`      |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, Layout slot rules, or container-padding
mechanics. It links to their owners.
