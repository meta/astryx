---
schema_version: 3
template_version: 7
kind: component
id: component:LayoutFooter
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
    packages/core/src/Layout/__tests__/LayoutHeaderFooterEdges.a11y.browser.spec.ts,
    packages/core/src/Layout/__tests__/headerFooterXstyle.test.tsx,
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

# LayoutFooter component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `hasDivider`, `height`, `padding`, `label`, `role`, root `BaseProps`, and a root `ref`.                                     |
| Behavior                | A non-shrinking footer region whose inner wrapper applies and publishes the Layout inset and aligns to the Layout's content width.      |
| End-user impact         | People see a footer that keeps its height below scrolling content, with content aligned to the page's readable width.                   |
| Builder impact          | None; the record describes shipped behavior.                                                                                            |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. No implementation gap is open (Current-state impact).        |
| Review checks           | Reject a footer that shrinks, a published inset that differs from the applied padding, an inferred landmark, or a lost divider default. |
| Governing rules         | `family:layout-regions` FR1, FR4–FR6, FR8; `architecture:container-padding`; `architecture:public-component-api` INV5–INV8.             |

This table is a review projection; the body below is authoritative.

## Intent

LayoutFooter is the optional footer region a caller places in a Layout's
`footer` slot. It owns the footer's size, inset, divider, and caller-supplied
landmark semantics; the caller owns its content.

Consumer syntax and examples belong in `LayoutFooter.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — no divider unless a Layout default says
  so, automatic inset, no landmark role.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

None.

## Ownership boundary

**Owns**

- The footer root, which carries the `layout-footer` target that
  `component:Layout` maps, and its inner padding wrapper.
- Footer height, divider, inset, and caller-supplied role and label.

**Does not own / non-goals**

- Slot placement, the Layout-edge inset, content width, and the divider
  default — owned by `component:Layout`.
- Footer content and its meaning — owned by the caller.

## Public concepts

| Concept  | Closed values or states               | Meaning                                                                     | Availability by variant/orientation/state | Default                   | Owner                    | Stability | Invalid-value behavior           |
| -------- | ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- | ------------------------ | --------- | -------------------------------- |
| Divider  | `true`, `false`, unset                | Draws a line on the footer's block-start edge.                              | Always                                    | Layout default, else none | `component:LayoutFooter` | Stable    | —                                |
| Height   | number (px); CSS length string; unset | Fixes the footer's block size.                                              | Always                                    | content height            | `component:LayoutFooter` | Stable    | —                                |
| Inset    | spacing step; `0`; unset              | Uniform padding that replaces the automatic inset; `0` is full bleed.       | Always                                    | automatic                 | `component:LayoutFooter` | Stable    | Closed union; rejected by types. |
| Landmark | caller `role` and `label`             | Exposes the footer as the role the caller names, with that accessible name. | Always                                    | none                      | caller                   | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| FR1 | LayoutFooter renders a root `div` carrying the `layout-footer` target that does not shrink, around an inner `div` that holds the children, has the Layout's content width as its maximum width, and centers within the root. `height` fixes the root's block size, with numbers as pixels.                                                                                                                                                                                                                                                                                                           | Current source and tests                                                                |
| FR2 | Without `padding`, the inner wrapper's inline and block-end padding is the Layout-edge inset and its block-start padding is the inner inset, where the Layout-edge inset comes from the Layout's `padding`, else the nearest padding container, and the inner inset from the nearest padding container (Card, Section, Dialog, Drawer, or BottomSheet), each spacing step 4 otherwise. A `padding` step replaces all four edges, and `0` removes them. The wrapper publishes container-padding values equal to the padding it applies.                                                               | Current source and tests; `family:layout-regions` FR4; `architecture:container-padding` |
| FR3 | A divider draws a 1px solid `--color-border` line on the root's block-start edge and reflects `data-divider="true"`. `hasDivider` decides; when unset, the nearest Layout `defaultHasDividers` in the same layer decides (the default stops at a layer boundary, `spec:AST-038` FR7); otherwise there is no divider. A footer without a divider lets the middle row above it collapse its block-end spacing. The collapse stops at each Layout, so a Layout nested in that middle row, including inside a Dialog, Drawer, or BottomSheet opened from it, keeps its own spacing (`spec:AST-038` FR7). | Current source and tests; `family:layout-regions` FR6                                   |
| FR4 | `role` and `label` set the root's `role` and `aria-label`; LayoutFooter adds no role of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests; `family:layout-regions` FR8                                   |
| FR5 | `ref` reaches the root. Supported DOM, data, ARIA, and event props reach the root, `xstyle`, `className`, and `style` compose after component styles, and the reflected `data-divider` stays component-owned: a caller's `data-divider` never replaces it, so the neighbouring spacing collapse always follows the divider state (`architecture:public-component-api` INV5).                                                                                                                                                                                                                         | Current source and tests; `architecture:public-component-api` INV5–INV8                 |

### Allowed variation

- **AV1 — Content.** Any caller content may fill the footer.
- **AV2 — Landmark.** The caller chooses whether the footer is a landmark and
  which one.

### Representative states

| State                | Required invariant                                      | Allowed variation |
| -------------------- | ------------------------------------------------------- | ----------------- |
| Default in Layout    | Automatic inset, no divider, no role.                   | Content.          |
| With divider         | Block-start line and `data-divider="true"`.             | —                 |
| Explicit padding     | Uniform padding, published to children.                 | Step.             |
| Contentinfo landmark | `role="contentinfo"` and the caller's name on the root. | Name.             |

### Transformation and precedence order

- **ORD1 — Divider.** `hasDivider` → Layout `defaultHasDividers` → none.
- **ORD2 — Padding.** `padding` → the automatic inset.

### Performance and resources

- **PR1 — No external lifecycle.** LayoutFooter reads the divider default from
  its Layout and adds no listener, observer, timer, or measurement.

## Accessibility contract

- **AR1 — Explicit landmarks only.** The footer is a landmark only when the
  caller supplies `role`, and it is named only by the caller's `label`
  (`family:layout-regions` FR8).

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Footer           | A fixed footer band with an optional block-start divider. | Current source and docs  | Supporting     | FR1–FR3            |

Theming: the root carries the `layout-footer` target, which `Layout.doc.mjs`
declares and `component:Layout` maps. `LayoutFooter.doc.mjs` declares no anatomy
of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `family:layout-regions` owns region boundaries, padding replacement, divider
  spacing, and landmark rules; FR2–FR4 and AR1 apply them.
- `architecture:container-padding` owns inset publication; FR2 applies it.
- `component:Layout` owns slot placement, the Layout-edge inset, content
  width, the divider default, and the `layout-footer` target mapping.
- `architecture:public-component-api` owns caller-input routing; FR5 applies
  it.

## Verification map

| Contract  | Verification                                                                                                                                                                                                                                                                                                                                                 | Representative states                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                  | Audit section                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1       | `LayoutSlots.test.tsx` class and `applies a numeric height as pixels on the root` tests; `contentWidth.test.tsx` LayoutFooter inner-wrapper and divider tests; `headerFooterXstyle.test.tsx` `keeps the own styles that xstyle does not set` (non-shrinking root)                                                                                            | Default; numeric height; content width                                                          | A lost `layout-footer` class, a missing pixel height, children placed on the root instead of the inner wrapper, or a divider off the outer element fails. A footer root that shrinks fails. Gap: the content-width maximum and centering have no check.                                                                                                          | `audit:LayoutFooter/layout`        |
| FR2, ORD2 | `LayoutHeaderFooterEdges.a11y.browser.spec.ts` per-case insets and published values                                                                                                                                                                                                                                                                          | Automatic, explicit, and zero padding                                                           | An inset that differs from the expected step on any edge (automatic, `padding`, full bleed, or a nested Layout), or a published value that differs from the applied padding, fails. Gap: the automatic inset taken from a surrounding Card, Section, Dialog, Drawer or BottomSheet has no named check; the edge spec renders each case in a plain frame.         | `audit:LayoutFooter/layout`        |
| FR3, ORD1 | `LayoutSlots.test.tsx` and `Layout.test.tsx` divider tests, including `an explicit hasDivider={false} on a footer overrides the context default` and `stops the footer default at a layer boundary`; `LayoutHeaderFooterEdges.a11y.browser.spec.ts` line paint and the collapse of the content above the footer, including where it stops at a nested Layout | Default; `hasDivider`; Layout default; explicit `false`; Layout default across a layer boundary | A missing or unexpected `data-divider`, an ignored Layout default, an explicit `false` that loses, or a Layout default that crosses a layer boundary fails. A line that is not 1px solid `--color-border`, a line without `data-divider="true"`, or content above the footer that does not collapse without a divider, or collapses past a nested Layout, fails. | `audit:LayoutFooter/layout`        |
| FR4, AR1  | `LayoutSlots.test.tsx` landmark and `exposes no role or name without a caller role` tests; `Layout.a11y.test.tsx` and `Layout.a11y.chromium.spec.ts` `footer-contentinfo` state                                                                                                                                                                              | Caller `contentinfo` role and label; no caller role                                             | A lost role or name fails, including at the accessibility tree. A footer without a caller `role` that exposes a role or name fails.                                                                                                                                                                                                                              | `audit:LayoutFooter/accessibility` |
| FR5       | `LayoutSlots.test.tsx` ref, `passes className, style, DOM, data, and event props to the root`, and `keeps data-divider when a caller passes its own value` tests; `headerFooterXstyle.test.tsx` `xstyle` merge-order tests; `LayoutHeaderFooterEdges.a11y.browser.spec.ts` `caller-attribute` case                                                           | Ref; caller class, style, DOM, data, and event props; caller `data-divider`                     | A ref on another element, a dropped caller prop, or a caller `data-divider` that replaces or removes the reflected value fails. An `xstyle` that loses to the footer's own styles, or a caller `data-divider` that changes the spacing above the footer, fails.                                                                                                  | `audit:LayoutFooter/api`           |
| PR1       | Source review                                                                                                                                                                                                                                                                                                                                                | Every state                                                                                     | Gap: no automated check fails if LayoutFooter adds a listener, timer, or measurement.                                                                                                                                                                                                                                                                            | `audit:LayoutFooter/behavior`      |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, Layout slot rules, or container-padding
mechanics. It links to their owners.
