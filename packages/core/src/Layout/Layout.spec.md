---
schema_version: 3
template_version: 3
kind: component
id: component:Layout
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layout/Layout.test.tsx,
    packages/core/src/Layout/LayoutSlots.test.tsx,
    packages/core/src/Layout/__tests__/childrenAsContent.test.tsx,
    packages/core/src/Layout/__tests__/contentWidth.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
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
system_specs: [spec:AST-105]
---

# Layout component contract

## Intent

Layout is a general layout primitive that arranges five optional named slots:
Header, logical-start Panel, Content area, logical-end Panel, and Footer. It can
structure regions within a page or bounded container, while AppShell owns the
page shell. This draft records the aggregate consumer anatomy, theming ownership,
and content-width behavior without adding a public API or changing internal
parent/child communication.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: bug fix; LayoutContent keeps the same root, direct-child
  DOM, props, overflow behavior, padding ownership, and default. Context-aware
  inline insets align content while the root scrollport stays full width.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Layout container and its current `layout` target.
- The five named slot positions: `header`, `start`, `content`, `end`, and
  `footer`; each accepts caller-provided ReactNode content.
- The aggregate optional Header, Panel, Content area, and Footer anatomy when the
  caller composes the corresponding Layout region components, and their current
  `layout-header`, `layout-panel`, `layout-content`, and `layout-footer` targets.
- One LayoutPanel concept and `layout-panel` target shared by instances supplied
  to the logical-start and logical-end slots.

**Does not own / non-goals**

- The page shell, app-wide navigation, responsive shell substitution, skip link,
  or main landmark, which are owned by AppShell.
- Product meaning or content supplied to any slot, which is owned by the caller.
- Automatic responsive substitution of regions outside AppShell, which is owned
  by the caller or another higher-level composition.
- Resize interaction, which is owned by useResizable and ResizeHandle.
- Correcting current container-padding publication mismatches or preventing two
  adjacent divider owners from both painting; those remain current gaps and
  caller obligations recorded below.
- New public API, target, alias, slot-level region wrapper, or parent-to-child
  context communication.

## Public concepts

The current public topology has five independent ReactNode slots. Slot position
is not rendered anatomy and does not add a target to arbitrary content.

| Concept       | Current values                                | Meaning                                                                                      |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| slot topology | `header`, `start`, `content`, `end`, `footer` | Positions caller content in the five-slot arrangement; omitted slots render no area wrapper. |
| slot content  | any ReactNode                                 | The caller may supply Layout region components or unrelated content.                         |
| panel anatomy | LayoutPanel in `start` and/or `end`           | Both positions use one optional Panel anatomy concept and one `layout-panel` target.         |

Consumer syntax, defaults, and recommended region components remain documented
in `Layout.doc.mjs` and the region subcomponent docs. `family:layout-regions`
owns the shared region vocabulary, while `architecture:container-padding` owns
the broader container system shared with Section, Table, Toolbar, and Divider.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                        | Draft review state                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| FR1 | Layout renders one general Layout container carrying the current `layout` target and places arbitrary caller-provided ReactNode content in the `header`, `start`, `content`, `end`, and `footer` slots. Slot placement alone adds no region component or target.                                                                                                                                                                                                                                                                                                                                                                                                          | Current source, docs, and tests              | Verified current behavior; no new behavior decided |
| FR2 | When the caller supplies LayoutHeader, LayoutContent, or LayoutFooter, that component carries its current `layout-header`, `layout-content`, or `layout-footer` target; Layout does not add those targets to arbitrary slot content.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and target metadata           | Verified current inventory; no target change       |
| FR3 | LayoutPanel instances supplied to logical start or end share one aggregate Panel anatomy part and the current `layout-panel` target; slot position does not create a second anatomy part or target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source, docs, tests, and family      | Verified current ownership; no API change          |
| FR4 | `Layout.doc.mjs` is the canonical aggregate consumer document for the five current `layout*` targets and maps each target once; region subcomponent docs continue to document their own props and usage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current documentation organization           | Verified current ownership                         |
| FR5 | LayoutContent and LayoutPanel retain their shipped automatic container-padding publication behavior, including the mismatches recorded by `architecture:container-padding`; this documentation does not claim exact parity.                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and architecture record       | Current conformance gap; not fixed here            |
| FR6 | When an adjacent ResizeHandle owns a panel divider, the caller must keep `LayoutPanel hasDivider={false}`; current composition does not prevent both components from painting the same boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source, docs, and family contract    | Current caller obligation; not fixed here          |
| FR7 | When `contentWidth` is set without panels, LayoutContent spans the available middle area and aligns its direct children through context-aware inline insets. With exactly one panel, the panel stays aligned while LayoutContent extends through the opposite open side; logical start and end mirror. With both panels, or a percentage (including percentage-bearing CSS math), intrinsic, or bare-variable width that cannot safely share one CSS arithmetic basis, the complete middle composition remains constrained. A guaranteed length-valued variable uses `calc(var(...))`. LayoutContent's root remains the scroll, padding, styling, and direct-child owner. | Current family contract and browser evidence | Proposed bug fix; no API or context change         |
| FR8 | A LayoutPanel sized by a resize controller lends its element to that controller through an internal channel, so the panel slides closed and open by `spec:AST-105` FR9's edge reveal when its region collapses or opens, from the edge facing its ResizeHandle, and LayoutContent beside it moves on the same motion (`component:Resizable` FR7). Focus inside the panel when it collapses moves to its ResizeHandle, and the collapsed panel is inert and hidden from assistive technology (`component:Resizable` AR2). A LayoutPanel with no resize controller never animates, and LayoutPanel adds no prop.                                                            | `spec:AST-105` FR9                           | Specified; implementation pending                  |

### Current evidence and gaps

- LayoutContent does not republish a matching inline-end container-padding value
  on its automatic no-end path, and its no-start path writes the outer inline
  value to both inline geometry variables. LayoutPanel applies automatic outer
  Layout-edge padding while retaining baseline inner geometry variables. A
  full-bleed descendant can therefore compensate against a published value that
  differs from the region's applied padding. This is shipped evidence and a
  runtime conformance gap, not behavior corrected or approved by this draft.
- LayoutPanel and an adjacent ResizeHandle can both draw the same content-facing
  divider. The current caller obligation is to set
  `LayoutPanel hasDivider={false}` when ResizeHandle owns that line. This draft
  does not add coordination or duplicate-divider prevention.

### Allowed variation

- **AV1 — Slot presence and content.** Header, start, content, end, and footer may
  be independently present or absent and may contain any caller-provided
  ReactNode. Slot content does not become Layout anatomy by position alone.
- **AV2 — Region composition.** Callers may supply LayoutHeader, LayoutContent,
  LayoutFooter, or LayoutPanel in the matching slot when they need those region
  components and targets; Layout does not insert them automatically.
- **AV3 — Panel position.** LayoutPanel may occupy logical start or end, or both
  positions may be supplied; all instances remain one Panel anatomy concept and
  target.

### Representative states

| State                          | Required invariant                                                                         | Allowed variation                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Arbitrary content only         | Layout container carries `layout`; arbitrary content gains no region target from its slot. | Caller content and current height/width configuration.                              |
| Composed header/content/footer | Supplied Layout region components retain their own anatomy and targets.                    | Without panels, contentWidth aligns inside the full-width LayoutContent scrollport. |
| Start or end LayoutPanel       | Either logical position uses the one Panel anatomy part and `layout-panel` target.         | Position, width, scrolling, padding, caller role, and content-area edge scrolling.  |
| Two LayoutPanels               | Both instances remain repetitions of the same Panel anatomy part and target.               | The constrained content scrollbar remains between the two panels.                   |
| ResizeHandle-adjacent          | Divider ownership follows the current caller obligation in FR6.                            | Resize state remains owned by the resize components.                                |

### Transformation and precedence order

- `contentWidth` keeps LayoutContent's root scrollport full width without panels.
  With exactly one panel, the root extends through the opposite open side; the
  panel and LayoutContent's direct children stay aligned through inline insets.
  Start and end mirror. With both panels, or with a percentage (including
  percentage-bearing CSS math), intrinsic, or bare variable that cannot safely
  share one CSS arithmetic basis, the complete middle composition stays constrained. A guaranteed length-valued variable
  uses `calc(var(...))`. Layout does not add a context field or inspect/mutate
  the child.
- No new slot, padding, divider, scrolling, sizing, or public styling precedence
  rule is introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

This draft does not add inferred landmark semantics. LayoutHeader,
LayoutContent, LayoutFooter, and LayoutPanel retain their current explicit
caller-supplied role and label behavior. A collapsing resizable LayoutPanel
moves focus out of itself to its ResizeHandle and is inert while collapsed
(FR8).

## Design relationships

| Anatomy or state | Design requirement                                                                       | Representation authority                  | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ------------------ |
| Layout container | Places arbitrary caller content in the five named slots without becoming the page shell. | Current source, docs, and family contract | Supporting     | FR1                |
| Header           | Presents an optional caller-supplied LayoutHeader region.                                | Current source, docs, and family contract | Supporting     | FR2                |
| Panel            | Presents a caller-supplied LayoutPanel at logical start or end.                          | Current source, docs, and family contract | Supporting     | FR3, FR6           |
| Content area     | Presents an optional caller-supplied LayoutContent region.                               | Current source, docs, and family contract | Prominent      | FR2, FR5           |
| Footer           | Presents an optional caller-supplied LayoutFooter region.                                | Current source, docs, and family contract | Supporting     | FR2                |

Slot position is topology, not anatomy. Arbitrary ReactNode content supplied to
a slot does not acquire the corresponding region part or target.

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

The exact map records each current public target once. Panel represents every
caller-supplied LayoutPanel instance, whether placed at logical start, logical
end, or both. It does not map the `start` and `end` slots themselves.

## Family and system relationships

- `family:layout-regions` owns the shared named-region topology, logical
  direction, boundaries, scrolling, and component ownership. Layout adopts that
  vocabulary without owning the page shell.
- `architecture:container-padding` owns the broader container system shared by
  Section, Layout and its regions, Table, Toolbar, and Divider, including the
  current LayoutContent/LayoutPanel conformance gap. Participation in that
  system does not make Table or Divider Layout regions.
- `architecture:component-theming-surface` owns anatomy qualification and exact
  target mapping rules.
- `architecture:public-component-api` owns the stable slots, props, exports, and
  compatibility boundary; this documentation adds no API.

## Verification map

| Contract      | Verification                                                                                                               | Representative states                                                              | Mutation or failure expectation                                                                                                                                                   | Audit section                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1–FR3       | Layout render, slot-context, children-as-content, region-component, and target inventory tests                             | Arbitrary slot content, optional region components, logical start/end LayoutPanels | Removing slot placement, a composed region, or a current target fails existing structure, context, or target assertions; arbitrary slot content is not asserted to gain a target. | `audit:Layout/anatomy`       |
| FR4           | `scripts/check-knowledge.mjs`                                                                                              | Canonical aggregate doc and exact five-target map                                  | Missing, extra, prefixed, or stale target mappings fail repository validation.                                                                                                    | `audit:Layout/theming`       |
| FR5           | Source inspection plus `architecture:container-padding` verification evidence                                              | Automatic outer-edge Content area and Panel paths                                  | This draft adds no parity assertion; a runtime correction requires separate compatibility evidence.                                                                               | `audit:Layout/layout`        |
| FR6           | LayoutPanel source/docs plus `family:layout-regions` verification evidence                                                 | Panel beside a divider-owning ResizeHandle                                         | This draft adds no prevention assertion; changing ownership requires separate runtime coverage.                                                                                   | `audit:Layout/layout`        |
| FR7           | `contentWidth.test.tsx` plus the Storybook scrollbar-placement matrix                                                      | No panels, start only, start and end, end only                                     | Removing the full-width no-panel content scrollport or moving any scrollbar away from its content-area edge fails focused structure or browser geometry checks.                   | `audit:Layout/layout`        |
| FR8           | Real-browser frame capture of a start and an end LayoutPanel collapsing and opening, with focus inside the panel (pending) | Start and end panels; toggle, Enter and a drag past the threshold; Reduce Motion   | A jump instead of a slide, a gap beside the moving edge, focus left in a collapsed panel, or a new LayoutPanel prop fails.                                                        | `audit:Layout/layout`        |
| Accessibility | `LayoutSlots.test.tsx` landmark assertions                                                                                 | Header, Content area, Footer, and Panel roles                                      | Supplied role or label no longer reaches the region element.                                                                                                                      | `audit:Layout/accessibility` |

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
