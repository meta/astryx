---
schema_version: 3
template_version: 7
kind: component
id: component:Layout
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-30
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layout/Layout.test.tsx,
    packages/core/src/Layout/LayoutSlots.test.tsx,
    packages/core/src/Layout/__tests__/childrenAsContent.test.tsx,
    packages/core/src/Layout/__tests__/contentWidth.test.tsx,
    packages/core/src/Layout/__tests__/nestedPadding.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
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

# Layout component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Five ReactNode slots (`header`, `start`, `content`, `end`, `footer`), `children` as content shorthand, `height`, `padding`, `contentWidth`, `defaultHasDividers`. |
| Behavior                | Layout arranges caller content in five named slots, fills or grows with its container, and sets the inset and content width its region components use.            |
| End-user impact         | People see headers, side panels, content, and footers in stable positions that mirror in right-to-left, with content aligned to one readable width.               |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                      |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                           |
| Review checks           | Reject a target added to arbitrary slot content, an inherited parent Layout padding, a content scrollbar moved off the open edge, or overridable `data-height`.   |
| Governing rules         | `family:layout-regions` FR1–FR12; `architecture:container-padding`; `architecture:component-theming-surface`; `architecture:public-component-api` INV5–INV8.      |

This table is a review projection; the body below is authoritative.

## Intent

Layout is a general layout primitive that arranges five optional named slots —
header, logical-start panel, content, logical-end panel, and footer — within a
page or a bounded container. AppShell owns the page shell.

Consumer syntax and examples belong in `Layout.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — `height="fill"`, no padding override,
  no content width, divider defaults inherited.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A `false` slot still counts as present (FR1).** Slot presence is
  `!= null`, so `header={isOpen && <LayoutHeader />}` renders no header when
  `isOpen` is false, yet the content and panels keep the inner inset on their
  block-start edge instead of the outer inset `family:layout-regions` FR3 gives
  an edge on the Layout boundary. With `contentWidth`, a `false` start or end
  slot (the `showPanel && <LayoutPanel />` idiom) switches Layout to its
  one- or two-panel composition, so LayoutContent stops at the content-width frame on
  that side, and with a `false` end slot its scrollbar does too, instead of
  reaching the Layout edge (FR6).

## Ownership boundary

**Owns**

- The Layout container, its `layout` target, and the five slot positions.
- Height, the Layout-edge inset, content width, and the header and footer
  divider default that its region components read.
- The aggregate consumer document and theming map for the `layout`,
  `layout-header`, `layout-panel`, `layout-content`, and `layout-footer`
  targets.

**Does not own / non-goals**

- The page shell, app-wide navigation, responsive shell substitution, skip
  link, or main landmark — owned by AppShell.
- Product meaning or content in any slot — owned by the caller.
- Region semantics, scrolling, insets, and dividers — owned by
  `component:LayoutHeader`, `component:LayoutContent`,
  `component:LayoutFooter`, and `component:LayoutPanel`.
- Resize interaction — owned by useResizable and ResizeHandle.

## Public concepts

| Concept           | Closed values or states                       | Meaning                                                                 | Availability by variant/orientation/state | Default             | Owner              | Stability | Invalid-value behavior              |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ------------------- | ------------------ | --------- | ----------------------------------- |
| Slot topology     | `header`, `start`, `content`, `end`, `footer` | Positions caller content; an omitted slot renders nothing.              | Always                                    | all omitted         | `component:Layout` | Stable    | —                                   |
| Content shorthand | `children`                                    | Fills the content slot when `content` is omitted.                       | Always                                    | omitted             | `component:Layout` | Stable    | `content` wins when both are given. |
| Height            | `fill`, `auto`                                | Fill the container, or grow with content.                               | Always                                    | `fill`              | `component:Layout` | Stable    | Closed union; rejected by types.    |
| Layout-edge inset | spacing step; `0`                             | The inset regions apply at the Layout's outer edges; `0` is full bleed. | Always                                    | inherited or step 4 | `component:Layout` | Stable    | Closed union; rejected by types.    |
| Content width     | number (px); CSS length string                | Width of the aligned content in every slot.                             | Always                                    | none                | `component:Layout` | Stable    | —                                   |
| Divider default   | `true`, `false`, unset                        | Divider default for LayoutHeader and LayoutFooter children.             | Always                                    | inherited           | `component:Layout` | Stable    | —                                   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| FR1 | Layout renders an outer `div` carrying the `layout` target, which reflects `height`, around an inner vertical stack: the header slot, a middle row holding the start slot, the content slot, and the end slot, then the footer slot. An omitted header, start, end, or footer slot renders nothing; a slot that renders nothing is absent, so the neighbouring regions take the outer inset on that side (`family:layout-regions` FR3); the middle row and the content slot's fill wrapper always render. `content` fills the content slot, and `children` fill it when `content` is omitted. Slot position adds no element, region component, or target to the caller's content. Implementation gap: a slot counts as present unless it is `null` or `undefined`, so a `false` slot renders nothing yet leaves its neighbours on the inner inset, and with `contentWidth` a `false` start or end slot switches to the one- or two-panel composition of FR6 (Current-state impact). | Current source, docs, and tests; `family:layout-regions` FR1, FR3                              |
| FR2 | The outer `div` escapes the parent's published container padding on all four edges, and the inner stack publishes zero container padding before its regions publish their own. `fill` (the default) makes the Layout fill its container's height, including the escaped block padding; `auto` lets it grow with content, at least as tall as its container.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests; `architecture:container-padding`                                     |
| FR3 | `padding` sets the inset that this Layout's own region components apply at its outer edges; `0` is full bleed. A nested Layout does not inherit a parent Layout's padding: without its own `padding`, its regions use the nearest padding container's padding (Card, Section, Dialog, Drawer, or BottomSheet), or spacing step 4. How each region applies and publishes that inset is owned by its record (`component:LayoutHeader`, `component:LayoutContent`, `component:LayoutFooter`, `component:LayoutPanel`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source, docs, and tests; `family:layout-regions` FR4; `architecture:container-padding` |
| FR4 | When the caller supplies LayoutHeader, LayoutContent, LayoutFooter, or LayoutPanel, that component carries its own `layout-header`, `layout-content`, `layout-footer`, or `layout-panel` target. LayoutPanel at logical start, end, or both is one Panel part and one `layout-panel` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source, docs, and tests; `family:layout-regions` FR11                                  |
| FR5 | `defaultHasDividers` sets the divider default for LayoutHeader and LayoutFooter descendants; an explicit `hasDivider` wins, and when unset a nested Layout keeps its parent's default within the same layer; the default stops at a Dialog, Drawer, BottomSheet, or other layer boundary (`spec:AST-038` FR7). LayoutPanel does not read the default (`component:LayoutPanel` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source, docs, and tests                                                                |
| FR6 | With `contentWidth` and no panels, LayoutContent spans the middle area and aligns its direct children to the content width, so its scrollbar stays at the outer edge. With exactly one panel, the panel stays aligned while LayoutContent extends through the opposite open side; start and end mirror. With both panels, or a percentage (including percentage-bearing CSS math), intrinsic, or bare-variable width, the whole middle composition stays constrained; a length-valued variable uses `calc(var(...))`. Numbers are pixels. A nested Layout without `contentWidth` does not inherit its parent's.                                                                                                                                                                                                                                                                                                                                                                     | Current source, docs, and tests; `family:layout-regions` FR12                                  |
| FR7 | `ref`, DOM, data, ARIA, and event props, `xstyle`, `className`, and `style` reach or compose on the outer `div`; the reflected `data-height` replaces a caller's value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests; `architecture:public-component-api` INV5–INV8                        |

### Allowed variation

- **AV1 — Slot presence and content.** Any slot may be present or absent and
  hold any ReactNode; content does not become Layout anatomy by position.
- **AV2 — Region composition.** Callers choose which region components to
  supply; Layout does not insert them.

### Representative states

| State                  | Required invariant                                                                             | Allowed variation              |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| Arbitrary content only | `layout` target on the root; slot content gains no target.                                     | Content and height.            |
| Composed regions       | Each supplied region carries its own target.                                                   | Which regions are supplied.    |
| One panel              | The panel aligns to the content width; content extends to the open side.                       | Start or end; mirrored in RTL. |
| Two panels             | The whole middle composition is constrained to the content width.                              | Panel widths.                  |
| Nested Layout          | No inherited Layout padding or content width; divider default inherited within the same layer. | Its own explicit values.       |

### Transformation and precedence order

- **ORD1 — Content slot.** `content` → `children`.
- **ORD2 — Inset.** This Layout's `padding` → the enclosing Card, Section,
  Dialog, Drawer, or BottomSheet padding → spacing step 4; a parent Layout's padding never applies.
- **ORD3 — Divider default.** A region's `hasDivider` → the nearest
  `defaultHasDividers` in the same layer → no divider.

### Performance and resources

- **PR1 — No external lifecycle.** Layout adds no listener, observer, timer,
  or measurement; content-width alignment is CSS-only.

## Accessibility contract

- **AR1 — No inferred landmarks.** Layout adds no role or name; landmark
  semantics come only from a region component's caller-supplied `role` and
  `label` (`family:layout-regions` FR8).
- **AR2 — Logical order.** Slots render in DOM order header, start, content,
  end, footer, and start and end follow writing direction
  (`family:layout-regions` FR2).

## Design relationships

| Anatomy or state | Design requirement                                     | Representation authority     | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------ | ---------------------------- | -------------- | ------------------ |
| Layout container | Places caller content in five named slots.             | Current source, docs, family | Supporting     | FR1, FR2           |
| Header           | An optional caller-supplied LayoutHeader.              | Current source, docs, family | Supporting     | FR4, FR5           |
| Panel            | A caller-supplied LayoutPanel at logical start or end. | Current source, docs, family | Supporting     | FR4, FR5           |
| Content area     | An optional caller-supplied LayoutContent.             | Current source, docs, family | Prominent      | FR4, FR6           |
| Footer           | An optional caller-supplied LayoutFooter.              | Current source, docs, family | Supporting     | FR4, FR5           |

Slot position is topology, not anatomy.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Layout container": {"target": "layout"},
  "Header": {"target": "layout-header"},
  "Panel": {"target": "layout-panel"},
  "Content area": {"target": "layout-content"},
  "Footer": {"target": "layout-footer"}
}
```

Panel stands for every LayoutPanel, at logical start, end, or both.

## Family and system relationships

- `family:layout-regions` owns region topology, logical direction, boundaries,
  scrolling, landmarks, and content-width scrollbar placement; FR1–FR6 and
  AR1–AR2 apply it.
- `architecture:container-padding` owns publication and escape of container
  inset; FR2 and FR3 apply it.
- `component:LayoutHeader`, `component:LayoutContent`, `component:LayoutFooter`,
  and `component:LayoutPanel` own each region's behavior, including the
  publication gaps LayoutContent and LayoutPanel record.
- `architecture:component-theming-surface` owns anatomy and target mapping.
- `architecture:public-component-api` owns caller-input routing; FR7 applies
  it.

## Verification map

| Contract            | Verification                                                                                     | Representative states                                                                         | Mutation or failure expectation                                                                                                                                                                                                                                     | Audit section                |
| ------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, ORD1, AV1      | `Layout.test.tsx` slot and content tests; `childrenAsContent.test.tsx`                           | Every slot; omitted slots; `content` and `children`                                           | A missing slot or `children` beating `content` fails. Gap: the omitted-slot test checks only the content text, so a wrapper rendered for an omitted slot passes, and no test asserts that slot content gains no target or element. No test covers a `false` slot.   | `audit:Layout/anatomy`       |
| FR2                 | `Layout.test.tsx` height-reflection tests                                                        | `fill`, `auto`                                                                                | A lost `data-height` reflection fails. Gap: the escape margins, the zero publication, and the fill and auto heights have no automated check.                                                                                                                        | `audit:Layout/layout`        |
| FR3, ORD2           | `nestedPadding.test.tsx`                                                                         | Inside AppShell, Card, Section; nested full-bleed and padded Layouts; explicit nested padding | A nested Layout inheriting a parent Layout's padding, or losing the enclosing Card or Section padding or the default inset, fails. Gap: `Layout.test.tsx` padding tests assert only that rendering succeeds.                                                        | `audit:Layout/layout`        |
| FR4                 | `LayoutSlots.test.tsx` class tests; `themingTargets.test.ts`                                     | Each region component; start and end panels                                                   | A lost region target fails.                                                                                                                                                                                                                                         | `audit:Layout/theming`       |
| FR5, ORD3           | `Layout.test.tsx` divider-default tests                                                          | Default true; unset; explicit `false`                                                         | A header or footer that ignores the default, or an explicit `hasDivider={false}` that loses, fails. Gap: nested inheritance has no check. No test covers the default stopping at a layer boundary.                                                                  | `audit:Layout/layout`        |
| FR6                 | `contentWidth.test.tsx`; stable visual baseline `core-layout--content-width-scrollbar-placement` | No panels, start only, end only, both; zero padding; nested                                   | A no-panel content region that is not full width, a both-panel middle that is not constrained, or a nested Layout inheriting content width fails; a scrollbar moved off its content edge comes back changed for review. No test covers a `false` start or end slot. | `audit:Layout/layout`        |
| FR7                 | `Layout.test.tsx` ref, className, style, passthrough, and owned-metadata tests                   | Ref; caller inputs; colliding `data-height`                                                   | A ref on another element, a dropped caller input, or a caller `data-height` that wins fails. Gap: no test covers event props or the `xstyle` merge order.                                                                                                           | `audit:Layout/api`           |
| AR1, AR2, PR1       | Source review                                                                                    | Every slot                                                                                    | Gap: no automated check fails if Layout adds a role, reorders slots, or adds a listener or measurement.                                                                                                                                                             | `audit:Layout/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                    | Consumer anatomy and current targets                                                          | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                       | `audit:Layout/theming`       |

## Decision log

### DEC-1 — AppShell owns the page shell; Layout owns five-slot arrangement

**Reference:** `component:Layout/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

AppShell is the page shell. Layout is the general layout primitive for arranging
the `header`, `start`, `content`, `end`, and `footer` slots within a page or
bounded container. Container-padding participation by Section, Table, Toolbar,
and Divider does not make those components Layout-owned anatomy.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, family region
rules, container-padding mechanics, resize interaction, implementation steps,
or system rules. It links to their owners.
