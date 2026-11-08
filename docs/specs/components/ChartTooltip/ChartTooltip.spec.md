---
schema_version: 3
template_version: 5
kind: component
id: component:ChartTooltip
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/ChartTooltip.test.tsx,
    apps/storybook/stories/charts/Tooltip.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:theme-application,
    architecture:knowledge-contracts,
    architecture:layer-runtime,
  ]
contributing: []
system_specs:
  [spec:AST-002, spec:AST-003, spec:AST-013, spec:AST-027, spec:AST-029]
---

# ChartTooltip component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | No API shape or default changes. This draft records the shipped grouped-content, indicator, dot, custom-render, and placement surfaces.                                                                                                                                      |
| Behavior                | The nearest pointer x selects one datum; the card, enabled SVG indicator, and eligible dots update together. A visible Layer remains open when both the prior and next selections produce content. The card stays in the nearest chart HTML scope and uses Layer fixed mode. |
| End-user impact         | Pointer users keep the chart's nested Theme/MediaTheme treatment; supported browsers also keep details above clipping or modal top-layer UI, while the reduced fallback preserves ordinary visibility.                                                                       |
| Builder impact          | None. `Chart tooltip`, tooltip configuration objects, and direct `ChartTooltip` composition continue to use the same props and defaults.                                                                                                                                     |
| Compatibility/readiness | Canary-compatible behavioral repair. This observational draft is non-authoritative; placement meaning, focus association, and future theming targets remain unresolved owner choices.                                                                                        |
| Review checks           | Reject a document-body host, premature custom-content open, changed API/default, lost pointer cleanup, duplicate custom-render invocation, invalid SVG coordinates, or any claim that open questions are settled.                                                            |
| Governing rules         | `spec:AST-027/FR7–FR8`, `architecture:layer-runtime/INV1–INV3`, `architecture:theme-application/INV1–INV3`, `spec:AST-013/FR7–FR10`, `architecture:component-test-sufficiency/INV1–INV11`, and `spec:AST-029/DEC-4`.                                                         |

This table is a review projection; the body below is authoritative.

## Intent

ChartTooltip renders supplemental grouped values for the chart datum nearest the
pointer. It owns the pointer-selected card, its viewport positioning, optional
crosshair or band highlight, and eligible hover dots. Chart owns data, scales,
plot geometry, pointer dispatch, accessible naming, and its supported equivalent
data view.

## Compatibility and migration

- Released default preserved: yes at the canary surface; the package has no stable release.
- Compatibility class: no public API or default change; the card moves from a fixed body portal with a page-level z-index to the shared fixed Layer runtime.
- Controlled/uncontrolled behavior: not applicable; Chart's pointer stream owns the active index.
- Migration decision: none; `spec:AST-027/FR7–FR8` already requires the Layer migration.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Selecting tooltip content from the nearest chart pointer event.
- Deriving ordered visible-series rows for the hovered datum.
- Rendering the default card or caller-supplied card content.
- Hosting the Layer under the nearest chart HTML container so nested Theme and MediaTheme scopes remain inherited.
- Positioning and viewport-clamping the card coordinates through Layer fixed mode; custom renderers own their content dimensions.
- Rendering the current crosshair or bar-band indicator and eligible hover dots.
- Unsubscribing from Chart's pointer stream when the component unmounts.

**Does not own / non-goals**

- Chart data, scales, plot geometry, or pointer-event generation — owned by `component:Chart`.
- Product-specific value formatting, series labels, and colors — owned by the product callsite and series definitions.
- The chart's accessible name, hidden data table, summary, or another equivalent non-pointer data view — owned by `component:Chart` and the product callsite.
- A new focusable data-point model or tooltip trigger relationship; those require an owner decision under `spec:AST-002` and `spec:AST-003`.

## Public concepts

| Concept          | Closed values or states                                       | Meaning                                                                                       | Availability by variant/orientation/state | Default                 | Owner                                                          | Stability    | Invalid-value behavior                                                                       |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| Series source    | caller array or omitted                                       | Supplies row labels, values, colors, mark types, and hover-dot eligibility.                   | Every ChartTooltip                        | empty array             | product callsite                                               | experimental | Utility and unresolved series are filtered; missing and non-finite row values are preserved. |
| Card content     | default body; custom React node; custom `null`                | Shows grouped details or suppresses only the card.                                            | Hovered datum                             | default grouped content | `component:ChartTooltip`                                       | experimental | A custom `null` never opens Layer and keeps enabled SVG indicators and dots.                 |
| Hover indicator  | enabled or disabled; bar-band or vertical crosshair           | Marks the active x position inside the plot.                                                  | Valid hovered datum                       | enabled                 | `component:ChartTooltip`                                       | experimental | Invalid or non-finite chart coordinates suppress the mark.                                   |
| Hover dots       | enabled or disabled; one per eligible resolved non-bar series | Marks each eligible series point at the active index.                                         | Valid finite resolved points              | enabled                 | `component:ChartTooltip`                                       | experimental | Missing and non-finite resolved points are skipped.                                          |
| Card placement   | `auto`, `right`, `left`, `top`                                | Selects horizontal placement from the hovered x coordinate and the current vertical rule.     | Visible card                              | `auto`                  | `component:ChartTooltip`                                       | experimental | Unknown values are rejected by TypeScript.                                                   |
| Layer host       | nearest chart HTML container                                  | Preserves the nearest Theme and MediaTheme CSS scopes while remaining valid HTML outside SVG. | Browser render                            | nearest chart container | `architecture:layer-runtime`; `architecture:theme-application` | settled      | A document-body host loses nested CSS scope.                                                 |
| Layer visibility | closed; browser top-layer open; reduced-fallback visible      | Uses native top-layer stacking when supported; otherwise preserves ordinary card visibility.  | Browser render                            | closed                  | `architecture:layer-runtime`                                   | settled      | The reduced fallback does not claim top-layer stacking.                                      |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                                                                              | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | Chart's `tooltip` shorthand MUST inject the chart series; direct composition currently requires the caller to pass the same series array when rows and dots are wanted.                                                                                                                                                                                                           | implementation, types, docs, and focused tests                                                                                     | verify             |
| FR2 | The nearest pointer event MUST select one data index; a present-content-to-present-content change MUST replace content without closing an already-open Layer. Leaving the plot, selecting a stale index, or selecting content suppressed by custom `null` MUST keep Layer closed or hide an already-open card, and a later present-content index MUST be able to reveal it again. | `spec:AST-013/FR8–FR10`; `architecture:component-test-sufficiency/INV4–INV5`; implementation and focused/browser tests             | verify             |
| FR3 | The default card MUST show the x value and either one bare value or one labelled row per visible resolved series. A custom renderer MUST receive the x value and ordered rows once per render and MAY return `null` without opening Layer.                                                                                                                                        | implementation and focused tests                                                                                                   | verify             |
| FR4 | Enabled indicators MUST render a band highlight for bar series on a band scale and a vertical crosshair otherwise. Enabled dots MUST exclude bars and non-finite or missing resolved points.                                                                                                                                                                                      | implementation and focused tests                                                                                                   | verify             |
| FR5 | `auto` currently starts to the right and flips left on inline overflow; explicit `right`, `left`, and `top` use the hovered x coordinate, while every mode currently uses the plot top as its vertical origin and clamps the resulting coordinates. Custom-rendered content keeps its caller-owned dimensions.                                                                    | implementation and partial focused tests                                                                                           | human decision     |
| FR6 | The host MUST remain under the nearest chart HTML container to preserve Theme and MediaTheme scope and MUST use `useLayer({mode: 'fixed'})`; supported browsers receive native top-layer promotion, while browsers without Popover API use Layer's reduced visibility fallback. A document-body host or numeric z-index is not a substitute.                                      | `architecture:theme-application/INV1–INV3`; `spec:AST-027/FR7–FR8`; `architecture:layer-runtime/INV1–INV3`; `spec:AST-013/FR7–FR8` | settled            |
| FR7 | The component MUST subscribe once per active callback identity and MUST release that subscription on unmount.                                                                                                                                                                                                                                                                     | implementation and focused test                                                                                                    | verify             |
| FR8 | Server rendering MUST omit the browser-only layer without reading a portal target; SVG indicators remain render-derived.                                                                                                                                                                                                                                                          | `spec:AST-013/FR9–FR10`; implementation and focused server-render test                                                             | verify             |

### Allowed variation

- **AV1 — Series content.** Callers may choose labels, colors, order, values, and custom rendered card content through existing public inputs.
- **AV2 — Chart geometry.** Chart may change plot dimensions and scale output; ChartTooltip follows the supplied pointer coordinates and clamps its card coordinates. Custom renderers own their content dimensions.
- **AV3 — Supplemental surface.** Products may omit the tooltip when the chart's non-pointer presentation already supplies sufficient detail.

### Representative states

| State                        | Required invariant                                                                         | Allowed variation                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Present-content transition   | Card content and position update while the same Layer host remains continuously open.      | The selected values and resulting coordinates vary.          |
| Initial / pointer leave      | Card is closed and no stale card content is exposed.                                       | SVG indicators are absent.                                   |
| Stale index                  | Layer does not open for a pointer index absent from current data.                          | Prior valid content may already have been closed.            |
| Single series                | Card shows x value plus one value.                                                         | Caller label, color, and value vary.                         |
| Multiple series              | Card preserves the derived visible-series order and labels each row.                       | Number and type of rows vary.                                |
| Custom content               | Renderer receives the current x value and rows.                                            | Any non-interactive React content may be returned.           |
| Custom `null`                | Layer never opens while enabled plot indicators remain.                                    | Indicator and dot options remain independently configurable. |
| Bar on band scale            | Band highlight replaces the crosshair; bars receive no hover dot.                          | Band geometry follows the scale.                             |
| Line, area, or dot           | Crosshair and eligible finite hover dots follow the selected index.                        | Series paint and resolved coordinates vary.                  |
| Nested Theme / MediaTheme    | Layer host remains a DOM descendant of the nearest active scopes.                          | Theme name and media mode vary.                              |
| Clipped or modal composition | Layer host is an open native popover above clipping and top-layer peers.                   | Surrounding clipping and modal geometry vary.                |
| Reduced Popover fallback     | Host starts hidden, opens on a valid hover, and hides again without a false visible state. | Native top-layer enhancement is unavailable.                 |
| Server render                | No portal or browser layer is emitted.                                                     | Rendered SVG fragment may be empty without pointer state.    |

### Transformation and precedence order

- **ORD1 — Pointer selection.** Receive Chart pointer event → resolve nearest data index → derive datum and rows → resolve custom or default card content → preserve an open Layer when the next selection also produces content, otherwise keep Layer closed for absent content or show it for present content → measure final card geometry and clamp its coordinates.
- **ORD2 — Indicator selection.** Check `hoverIndicator` → prefer bar-band representation when any bar uses a band scale → otherwise resolve the crosshair x → suppress non-finite output.
- **ORD3 — Dot selection.** Check `showHoverDots` → retain eligible non-bar series → find the current resolved point → suppress missing or non-finite points.

### Performance and resources

- **PR1 — Pointer render boundary.** Pointer movement within one resolved data index SHOULD NOT force a React commit when the computed card position is unchanged.
- **PR2 — Subscription ownership.** ChartTooltip owns exactly one current pointer subscription and MUST release it when the subscription identity changes or the component unmounts.
- **PR3 — Render callback.** A custom card renderer MUST NOT be invoked twice for one React render merely to decide visibility.

## Accessibility contract

- **AR1 — Supplemental information.** Tooltip-only content does not replace Chart's accessible name, supported hidden data table, summary, or another complete data view.
- **AR2 — Current semantics.** The card currently exposes `role="tooltip"` and remains non-interactive. This draft does not assert that the pointer-only trigger path completes the WAI-ARIA tooltip pattern.
- **AR3 — Association gap.** Keyboard exposure and an `aria-describedby` owner remain unresolved because Chart has no focusable data-point trigger. An audit MUST NOT invent that interaction or API without owner approval.

## Design relationships

| Anatomy or state | Design requirement                                                                                                                              | Representation authority                                                                   | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- | ------------------ |
| Layer host       | Stay under the nearest chart HTML scope; use native top-layer stacking when available and preserve ordinary visibility in the reduced fallback. | `architecture:theme-application/INV1–INV3`; `spec:AST-027/FR7–FR8`; `spec:AST-013/FR7–FR8` | overlay        | FR6                |
| Tooltip card     | Present grouped supplemental detail without accepting pointer interaction.                                                                      | unsettled; no current design record is linked                                              | supporting     | FR3, AR1–AR3       |
| Series row       | Associate one visible label and value with its decorative series swatch.                                                                        | observed implementation                                                                    | supporting     | FR3                |
| Hover indicator  | Mark the active x region without changing the chart's data or accessible name.                                                                  | unsettled; no current design record is linked                                              | supporting     | FR4                |
| Hover dot        | Echo an eligible series point at the selected index.                                                                                            | unsettled; no current design record is linked                                              | supporting     | FR4                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Layer host": {
    "none": {
      "reason": "unsettled: the host paints the card with semantic tokens but no current contract decides whether ChartTooltip needs a public target."
    }
  },
  "Tooltip card": {
    "none": {
      "reason": "intentional: the semantic role-only child adds no component-owned paint; the Layer host owns the card chrome."
    }
  },
  "Series row": {
    "none": {
      "reason": "intentional: shared Layout, Text, and ChartSwatch components own the rendered row surfaces."
    }
  },
  "Hover indicator": {
    "none": {
      "reason": "unsettled: semantic tokens paint the current SVG mark but no current contract selects public theme reachability."
    }
  },
  "Hover dot": {
    "none": {
      "reason": "unsettled: series-owned paint and current fixed geometry have no approved public theme target."
    }
  }
}
```

## Family and system relationships

- No current family or design record governs ChartTooltip.
- `architecture:layer-runtime` and `spec:AST-027/FR7–FR8` require fixed Layer composition and browser top-layer promotion where supported.
- `architecture:theme-application/INV1–INV3` requires the host to remain in the nearest Theme and MediaTheme CSS scope rather than portal to the document body.
- `architecture:component-test-sufficiency` owns rational public-state partitions and observable assertions.
- `architecture:component-theming-surface` owns anatomy-to-target disposition; this draft records current absence without deciding future themeability.
- `architecture:knowledge-contracts` keeps consumer syntax in `ChartTooltip.doc.mjs` and observed behavior in this draft component record.
- `spec:AST-013/FR7–FR10` owns the reduced Popover fallback, server-render boundary, and real-browser evidence requirement.
- `spec:AST-002` owns any future public API or compatibility decision.
- `spec:AST-003` owns any future passive-overlay coordination model.
- `spec:AST-029/DEC-4` owns red-before-green behavior remediation; the broader Night Watch contract owns this observational backfill, finite evidence inventory, objective remediation, and fail-closed readiness report.

## Verification map

| Contract     | Verification                                                                                   | Representative states                                                                      | Mutation or failure expectation                                                                                            | Audit section                      |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1, FR3–FR4 | `ChartTooltip.test.tsx`; Tooltip Storybook fixture                                             | single, multi, custom, null, stale index, bar, line, missing values                        | A stale/custom-null state opens Layer, a public option changes output, or a missing/non-finite point leaks invalid SVG.    | `audit:ChartTooltip/behavior`      |
| FR2          | present-content continuity focused test; modal Storybook play assertion                        | initial open, present→present, leave→reopen, open→stale→valid, content→custom-null→content | A present-content change closes/reopens Layer, leaves old content, or prevents later present content after a closed state. | `audit:ChartTooltip/behavior`      |
| FR5          | focused placement test; source review                                                          | right; other modes remain gaps                                                             | Positioning changes without an owner ruling or evidence for every public value.                                            | `audit:ChartTooltip/api-behavior`  |
| FR6          | red/green Layer host, nested-theme, and reduced-fallback tests; modal Storybook play assertion | nested Theme/MediaTheme, closed, fallback open/closed, native modal hover                  | A document-body host loses local theme scope, native top-layer state is absent, or fallback visibility is false.           | `audit:ChartTooltip/layering`      |
| FR7          | focused lifecycle test                                                                         | mount and unmount                                                                          | A pointer listener remains after unmount.                                                                                  | `audit:ChartTooltip/code-health`   |
| FR8          | `renderToString` focused test                                                                  | server render                                                                              | Server evaluation reads `document` or emits the browser-only card.                                                         | `audit:ChartTooltip/runtime`       |
| AR1–AR3      | Chart accessibility tests; focused axe; owner review pending                                   | small-data alternative and hovered card                                                    | Tooltip content becomes the only data path or draft semantics are treated as policy.                                       | `audit:ChartTooltip/accessibility` |

## Decision log

None. This draft records observed behavior plus the Layer and theme-locality corrections
already required by current shared authority; it does not approve new ChartTooltip
policy.

## Open questions

- **OQ1 — Placement meaning.** Should `top`, `left`, `right`, and `auto` be relative to the hovered point in both axes, or should the public description name the current plot-top vertical origin? (`human-api`)
- **OQ2 — Keyboard and tooltip association.** Should Chart expose a focusable data-point trigger and `aria-describedby` relationship, or should this surface use different semantics while the data table remains the keyboard/AT path? (`human-api`)
- **OQ3 — Theming reachability.** Should the Layer host or any SVG indicator become a stable public theme target? (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
