---
schema_version: 3
template_version: 7
kind: component
id: component:LayoutHeader
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
    packages/core/src/Layout/Layout.test.tsx,
    packages/core/src/Layout/__tests__/contentWidth.test.tsx,
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
system_specs: [spec:AST-038]
---

# LayoutHeader component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `hasDivider`, `height`, `padding`, `paddingBlockEnd`, `label`, `role`, root `BaseProps`, and a root `ref`.                    |
| Behavior                | A non-shrinking header region whose inner wrapper applies and publishes the Layout inset and aligns to the Layout's content width.        |
| End-user impact         | People see a header that keeps its height above scrolling content, with content aligned to the page's readable width.                     |
| Builder impact          | None; the record describes shipped behavior.                                                                                              |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact. |
| Review checks           | Reject a header that shrinks, a published inset that differs from the applied padding, an inferred landmark, or a lost divider default.   |
| Governing rules         | `family:layout-regions` FR1, FR4–FR6, FR8; `architecture:container-padding`; `architecture:public-component-api` INV5–INV8.               |

This table is a review projection; the body below is authoritative.

## Intent

LayoutHeader is the optional header region a caller places in a Layout's
`header` slot. It owns the header's size, inset, divider, and caller-supplied
landmark semantics; the caller owns its content.

Consumer syntax and examples belong in `LayoutHeader.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — no divider unless a Layout default says
  so, automatic inset, no landmark role.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller `data-divider` overrides the reflected divider (FR5).** Caller
  props spread after the component's `data-divider`, so a caller value replaces
  it: `data-divider="false"` draws no line yet stops the middle row below
  from collapsing its spacing, where `architecture:public-component-api` INV5
  keeps component-owned behavior from being overwritten.
- **Nested Layouts inherit the collapse (FR3).** When this header has no
  divider, Layouts nested in the middle row, including inside a Dialog,
  Drawer, or BottomSheet opened from it, inherit its spacing collapse and sit
  flush against their own dividers (`family:layout-regions` FR6;
  `spec:AST-038` FR7).

## Ownership boundary

**Owns**

- The header root, which carries the `layout-header` target that
  `component:Layout` maps, and its inner padding wrapper.
- Header height, divider, inset, and caller-supplied role and label.

**Does not own / non-goals**

- Slot placement, the Layout-edge inset, content width, and the divider
  default — owned by `component:Layout`.
- Header content and its meaning — owned by the caller.

## Public concepts

| Concept         | Closed values or states               | Meaning                                                                     | Availability by variant/orientation/state | Default                   | Owner                    | Stability | Invalid-value behavior           |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- | ------------------------ | --------- | -------------------------------- |
| Divider         | `true`, `false`, unset                | Draws a line on the header's block-end edge.                                | Always                                    | Layout default, else none | `component:LayoutHeader` | Stable    | —                                |
| Height          | number (px); CSS length string; unset | Fixes the header's block size.                                              | Always                                    | content height            | `component:LayoutHeader` | Stable    | —                                |
| Inset           | spacing step; `0`; unset              | Uniform padding that replaces the automatic inset; `0` is full bleed.       | Always                                    | automatic                 | `component:LayoutHeader` | Stable    | Closed union; rejected by types. |
| Block-end inset | spacing step; unset                   | Replaces the block-end padding alone.                                       | Always                                    | automatic                 | `component:LayoutHeader` | Stable    | Closed union; rejected by types. |
| Landmark        | caller `role` and `label`             | Exposes the header as the role the caller names, with that accessible name. | Always                                    | none                      | caller                   | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| FR1 | LayoutHeader renders a root `div` carrying the `layout-header` target that does not shrink, around an inner `div` that holds the children, has the Layout's content width as its maximum width, and centers within the root. `height` fixes the root's block size, with numbers as pixels.                                                                                                                                                                                                                                                                                                                                       | Current source and tests                                                                |
| FR2 | Without `padding`, the inner wrapper's inline and block-start padding is the Layout-edge inset and its block-end padding is the inner inset, where the Layout-edge inset comes from the Layout's `padding`, else the nearest padding container, and the inner inset from the nearest padding container (Card, Section, Dialog, Drawer, or BottomSheet), each spacing step 4 otherwise. A `padding` step replaces all four edges, and `0` removes them. `paddingBlockEnd` replaces the block-end edge alone. The wrapper publishes container-padding values equal to the padding it applies.                                      | Current source and tests; `family:layout-regions` FR4; `architecture:container-padding` |
| FR3 | A divider draws a 1px solid `--color-border` line on the root's block-end edge and reflects `data-divider="true"`. `hasDivider` decides; when unset, the nearest Layout `defaultHasDividers` in the same layer decides (the default stops at a layer boundary, `spec:AST-038` FR7); otherwise there is no divider. A header without a divider lets the middle row below it collapse its block-start spacing. Implementation gap: Layouts nested in that middle row, including inside a Dialog, Drawer, or BottomSheet opened from it, inherit the collapse (`component:LayoutContent` Current-state impact; `spec:AST-038` FR7). | Current source and tests; `family:layout-regions` FR6                                   |
| FR4 | `role` and `label` set the root's `role` and `aria-label`; LayoutHeader adds no role of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests; `family:layout-regions` FR8                                   |
| FR5 | `ref` reaches the root. Supported DOM, data, ARIA, and event props reach the root, `xstyle`, `className`, and `style` compose after component styles, and the reflected `data-divider` stays component-owned (`architecture:public-component-api` INV5). Implementation gap: caller props spread after `data-divider`, so a caller `data-divider` replaces the reflected value and changes the neighbouring spacing collapse (Current-state impact).                                                                                                                                                                             | Current source and tests; `architecture:public-component-api` INV5–INV8                 |

### Allowed variation

- **AV1 — Content.** Any caller content may fill the header.
- **AV2 — Landmark.** The caller chooses whether the header is a landmark and
  which one.

### Representative states

| State             | Required invariant                                 | Allowed variation |
| ----------------- | -------------------------------------------------- | ----------------- |
| Default in Layout | Automatic inset, no divider, no role.              | Content.          |
| With divider      | Block-end line and `data-divider="true"`.          | —                 |
| Explicit padding  | Uniform padding, published to children.            | Step.             |
| `paddingBlockEnd` | Only the block-end edge changes.                   | Step.             |
| Banner landmark   | `role="banner"` and the caller's name on the root. | Name.             |

### Transformation and precedence order

- **ORD1 — Divider.** `hasDivider` → Layout `defaultHasDividers` → none.
- **ORD2 — Padding.** `paddingBlockEnd` for block-end → `padding` → the
  automatic inset.

### Performance and resources

- **PR1 — No external lifecycle.** LayoutHeader reads the divider default from
  its Layout and adds no listener, observer, timer, or measurement.

## Accessibility contract

- **AR1 — Explicit landmarks only.** The header is a landmark only when the
  caller supplies `role`, and it is named only by the caller's `label`
  (`family:layout-regions` FR8).

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Header           | A fixed header band with an optional block-end divider. | Current source and docs  | Supporting     | FR1–FR3            |

Theming: the root carries the `layout-header` target, which `Layout.doc.mjs`
declares and `component:Layout` maps. `LayoutHeader.doc.mjs` declares no anatomy
of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `family:layout-regions` owns region boundaries, padding replacement, divider
  spacing, and landmark rules; FR2–FR4 and AR1 apply them.
- `architecture:container-padding` owns inset publication; FR2 applies it.
- `component:Layout` owns slot placement, the Layout-edge inset, content
  width, the divider default, and the `layout-header` target mapping.
- `architecture:public-component-api` owns caller-input routing; FR5 applies
  it.

## Verification map

| Contract  | Verification                                                                                                                        | Representative states                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                       | Audit section                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1       | `LayoutSlots.test.tsx` class, height, and inner-wrapper tests; `contentWidth.test.tsx` LayoutHeader inner-wrapper and divider tests | Default; numeric height                                 | A lost `layout-header` class, a missing pixel height, children placed directly on the root, or a divider off the outer element fails. Gap: the non-shrinking root, the content-width maximum, and centering have no check.                                                                            | `audit:LayoutHeader/layout`        |
| FR2, ORD2 | `Layout.test.tsx` `paddingBlockEnd` tests                                                                                           | `paddingBlockEnd` alone and with `padding`              | A `paddingBlockEnd` that adds no class, changes more than the block-end edge, or leaves the shared per-edge family fails. Gap: the automatic inset, the `padding` replacement, full bleed, and the published values have no check.                                                                    | `audit:LayoutHeader/layout`        |
| FR3, ORD1 | `LayoutSlots.test.tsx` and `Layout.test.tsx` divider tests                                                                          | Default; `hasDivider`; Layout default; explicit `false` | A missing or unexpected `data-divider`, an ignored Layout default, or an explicit `false` that loses fails. Gap: the line's paint and the collapsed spacing below a header without a divider have no check. No test covers the default stopping at a layer boundary or the inherited nested collapse. | `audit:LayoutHeader/layout`        |
| FR4, AR1  | `LayoutSlots.test.tsx` landmark test; `Layout.a11y.test.tsx` and `Layout.a11y.chromium.spec.ts` `header-banner` state               | Caller `banner` role and label                          | A lost role or name fails, including at the accessibility tree. Gap: no test asserts that a header without `role` exposes none.                                                                                                                                                                       | `audit:LayoutHeader/accessibility` |
| FR5       | `LayoutSlots.test.tsx` ref and className tests                                                                                      | Ref; caller class                                       | A ref on another element or a dropped class fails. Gap: no test covers DOM, data, or event props, `style`, or the `xstyle` merge order. No test covers a caller `data-divider`.                                                                                                                       | `audit:LayoutHeader/api`           |
| PR1       | Source review                                                                                                                       | Every state                                             | Gap: no automated check fails if LayoutHeader adds a listener, timer, or measurement.                                                                                                                                                                                                                 | `audit:LayoutHeader/behavior`      |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, Layout slot rules, or container-padding
mechanics. It links to their owners.
