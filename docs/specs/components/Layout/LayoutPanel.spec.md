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
    apps/storybook/rtl-audit/targets.json,
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
system_specs: [spec:AST-105]
---

# LayoutPanel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `width`, `resizable`, `hasDivider`, `isScrollable`, `padding`, `label`, `role`, root `BaseProps`, and a root `ref`.                                                                                         |
| Behavior                | A fixed-width side region at logical start or end that scrolls by default, with an optional divider on its content-facing edge.                                                                                         |
| End-user impact         | People see a side panel that keeps its width, scrolls on its own, and mirrors to the other side in right-to-left.                                                                                                       |
| Builder impact          | None: no API change; a collapsing resizable panel slides with no code change.                                                                                                                                           |
| Compatibility/readiness | No API or default changes; a collapsing resizable panel slides (FR7) and moves focus out, then becomes inert (AR2): patch, `[feat]` slide and `[fix]` focus. Implementation gaps are listed under Current-state impact. |
| Review checks           | Reject a divider on the outer edge, a panel that shrinks, an inferred landmark, `width` beating `resizable`, or a further publication mismatch.                                                                         |
| Governing rules         | `family:layout-regions` FR1, FR2, FR4–FR8, FR10; `architecture:container-padding`; `architecture:public-component-api` INV5–INV8.                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

LayoutPanel is the side region a caller places in a Layout's `start` or `end`
slot. It owns the panel's width, inset, scrolling, divider, and
caller-supplied landmark semantics; the caller owns its content.

Consumer syntax and examples belong in `LayoutPanel.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — no divider, scrollable, automatic
  inset, content width.
- Compatibility class: patch. No public prop, default, target, or styling
  output changes. A collapsing resizable panel now slides (FR7, `[feat]`,
  visual-only under `spec:AST-017/DEC-17`), and focus inside it moves to the
  adjacent ResizeHandle while the collapsed panel becomes inert (DOM: `inert`
  and `aria-hidden`; AR2, `[fix]` under `spec:AST-017` FR53).
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
- **A collapsing panel jumps and keeps focus (FR7, AR2).** A resizable panel
  closes and opens at once, where `spec:AST-105` FR9 slides it, and a panel
  collapsed by app code keeps focus inside it and its controls in the tab
  order while it is out of sight.

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

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FR1 | LayoutPanel renders one `div` carrying the `layout-panel` target that does not shrink and holds the children directly. `width` sets its inline size, with numbers as pixels; a `resizable` value's size wins over `width`. It scrolls overflow by default; `isScrollable={false}` clips it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests; `family:layout-regions` FR7, FR10                   |
| FR2 | In the `start` slot the panel's content-facing edge is its inline end; in the `end` slot it is its inline start; both follow writing direction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests; `family:layout-regions` FR2                         |
| FR3 | Without `padding`, the panel's outer inline edge has the Layout-edge inset, a block edge with no header or footer beside it has the Layout-edge inset, and other edges have the inner inset, where the Layout-edge inset comes from the Layout's `padding`, else the nearest padding container, and the inner inset from the nearest padding container (Card, Section, Dialog, Drawer, or BottomSheet), each spacing step 4 otherwise. A `padding` step replaces all four edges, and `0` removes them. The panel publishes container-padding values equal to the padding it applies. Implementation gap: on the automatic path it publishes the inner inset on every edge (Current-state impact).                                                                                   | Current source; `family:layout-regions` FR4; `architecture:container-padding` |
| FR4 | `hasDivider` draws a 1px solid `--color-border` line on the content-facing edge; LayoutPanel does not read a Layout divider default. Without a divider and with the automatic inset, the panel overlaps the content area by the inner inset so the two share one gap. One boundary has one divider owner (`family:layout-regions` FR5). Implementation gap: nothing prevents a panel divider and an adjacent ResizeHandle line from both painting (Current-state impact).                                                                                                                                                                                                                                                                                                           | Current source and docs; `family:layout-regions` FR5, FR6                     |
| FR5 | `role` and `label` set the root's `role` and `aria-label`; LayoutPanel adds no role of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests; `family:layout-regions` FR8                         |
| FR6 | `ref` reaches the root. Supported DOM, data, ARIA, and event props reach the root after the component's own attributes; `xstyle`, `className`, and `style` compose after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests; `architecture:public-component-api` INV5–INV8       |
| FR7 | A LayoutPanel whose size comes from a resize controller lends its element to the controller of the ResizeHandle on its content-facing edge through an internal channel, so the panel slides closed and open by `spec:AST-105` FR9's edge reveal when its region collapses or opens: its content-facing edge (FR2) moves, and the content on that edge's side moves on the same motion (`component:Resizable` FR8). A panel given the configuration-object form, a hand-built `ResizableProps` object that `useResizable` did not return passed through `resizable`, and a panel with no resize controller, never slide; `useResizable`'s own `props` passed through `resizable` do slide. LayoutPanel adds no prop. Implementation gap: no panel slides yet (Current-state impact). | `spec:AST-105` FR9; `component:Resizable` FR8                                 |

### Allowed variation

- **AV1 — Content.** Any caller content may fill the panel.
- **AV2 — Position.** The caller places the panel at start, end, or both.

### Representative states

| State               | Required invariant                                                                                                 | Allowed variation                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Start panel         | Divider and shared gap on the inline-end edge.                                                                     | Width.                                                                    |
| End panel           | Divider and shared gap on the inline-start edge.                                                                   | Width.                                                                    |
| Right-to-left       | Start and end mirror.                                                                                              | —                                                                         |
| Resizable           | The resizable size sets the width.                                                                                 | Size.                                                                     |
| Collapsing          | The panel slides closed from its content-facing edge; focus inside it moves to the ResizeHandle; it is then inert. | Start or end; Reduce Motion; configuration-object form without the slide. |
| Navigation landmark | `role="navigation"` and the caller's name on the root.                                                             | Name.                                                                     |

### Transformation and precedence order

- **ORD1 — Width.** `resizable` size → `width` → content width.
- **ORD2 — Padding.** `padding` → automatic inset per edge.

### Performance and resources

- **PR1 — No external lifecycle.** LayoutPanel reads its slot and which slots
  its Layout fills, and adds no listener, observer, timer, or measurement of
  its own; the slide's measurement is the resize controller's (FR7).

## Accessibility contract

- **AR1 — Explicit landmarks only.** The panel is a landmark only when the
  caller supplies `role`, named only by the caller's `label`
  (`family:layout-regions` FR8).
- **AR2 — Focus leaves a collapsing panel.** When a panel's region collapses
  while focus is inside the panel, under any resize controller, the
  configuration-object form (FR7) included, focus moves to
  the adjacent ResizeHandle on the panel's content-facing edge, the control
  that opens it again; the collapsed panel is then inert and `aria-hidden`
  until it opens (`spec:AST-105` FR9). Opening moves no focus. A collapse
  started from the Handle, or from a control outside the panel, leaves focus
  where it is. Only the slide (FR7) excludes the configuration-object form.
  Implementation gap: focus stays in a collapsed panel, which stays reachable
  (Current-state impact).

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
- `spec:AST-105` FR9 owns the edge reveal FR7 plays and the focus rule AR2
  applies; `component:Resizable` FR8 owns when it plays.
- `architecture:container-padding` owns inset publication; FR3 applies it and
  records the gap.
- `component:Layout` owns slot placement, the Layout-edge inset, and the
  `layout-panel` target mapping.

## Verification map

| Contract     | Verification                                                                                                                                                     | Representative states                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                          | Audit section                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, ORD1    | `LayoutSlots.test.tsx` class, width, and resizable tests                                                                                                         | Numeric and string width; resizable                                                                  | A lost `layout-panel` class, a missing width, or `width` beating `resizable` fails. Gap: the non-shrinking root, scrolling, and `isScrollable={false}` have no check. No requirement or check covers how a keyboard user reaches a scrolling panel's overflow when the panel holds no focusable content. | `audit:LayoutPanel/layout`        |
| FR2          | `LayoutSlots.test.tsx` start- and end-slot tests; `Layout.a11y.chromium.spec.ts` `start-end-navigation-rtl` state                                                | Start and end panels; right-to-left                                                                  | A panel that fails to render in either slot fails. Gap: no check asserts which edge carries the divider or the shared gap.                                                                                                                                                                               | `audit:LayoutPanel/layout`        |
| FR3, ORD2    | Source review                                                                                                                                                    | Automatic, explicit, and zero padding                                                                | Gap: no test covers the automatic per-edge inset, the `padding` replacement, full bleed, or the published values.                                                                                                                                                                                        | `audit:LayoutPanel/layout`        |
| FR4          | Source review                                                                                                                                                    | `hasDivider`; no divider                                                                             | Gap: no test covers the divider line, the shared gap, or a panel divider beside a ResizeHandle.                                                                                                                                                                                                          | `audit:LayoutPanel/layout`        |
| FR5, AR1     | `LayoutSlots.test.tsx` landmark test; `Layout.a11y.test.tsx` and `Layout.a11y.chromium.spec.ts` `start-end-navigation-rtl` and `nested-panel-region` states      | Caller `navigation` and `region` roles and labels                                                    | A lost role or name fails, including at the accessibility tree. Gap: no test asserts that a panel without `role` exposes none.                                                                                                                                                                           | `audit:LayoutPanel/accessibility` |
| FR6          | `LayoutSlots.test.tsx` ref and className tests                                                                                                                   | Ref; caller class                                                                                    | A ref on another element or a dropped class fails. Gap: no test covers `style`, DOM, data, or event props, or the `xstyle` merge order.                                                                                                                                                                  | `audit:LayoutPanel/api`           |
| FR7, AR2     | Real-browser frame capture of a start and an end panel collapsing and opening, with focus inside, with the hook's `props` and with a hand-built object (pending) | Start and end; toggle, Enter and a drag past the threshold; configuration-object form; Reduce Motion | A jump instead of a slide, a gap beside the moving edge, a slide under the configuration-object form, focus left in a collapsed panel, a collapsed panel reachable by Tab or exposed to assistive technology, or a new prop fails.                                                                       | `audit:LayoutPanel/behavior`      |
| PR1          | Source review                                                                                                                                                    | Every state                                                                                          | Gap: no automated check fails if LayoutPanel adds a listener, timer, or measurement.                                                                                                                                                                                                                     | `audit:LayoutPanel/behavior`      |
| RTL relation | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on the `Content width with start panel` story                                              | Start panel beside the content; LTR and RTL                                                          | A start panel that is not at the inline start of the content in both directions fails D2.                                                                                                                                                                                                                | `audit:LayoutPanel/i18n-rtl`      |

## Decision log

None recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, Layout slot rules, resize interaction, or
container-padding mechanics. It links to their owners.
