---
schema_version: 3
template_version: 4
kind: component
id: component:Chart
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/Chart.test.tsx,
    apps/storybook/stories/charts/Chart.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-029]
---

# Chart component contract

## Intent

Chart coordinates one responsive Cartesian plot. It derives shared scales,
assigns default series colors, delegates drawing to series definitions, and hosts
optional chart chrome and interaction layers.

## Compatibility and migration

- Released default preserved: `not yet stable`; `@astryxdesign/charts` is canary-only.
- Compatibility class: existing props, defaults, render order, and output remain unchanged by this observational backfill.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; this draft does not authorize a public API change.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Measuring the chart container and deriving one plot area and scale set.
- Ordering, clipping, and coordinating series, chart chrome, and interaction slots.
- The chart image's accessible name and small-data table fallback.

**Does not own / non-goals**

- Mark-specific geometry or rendering; each series definition owns those details.
- Axis, grid, legend, or tooltip presentation beyond their placement in the root.
- Product-specific interpretation, summary, or analysis of the supplied data.

## Public concepts

| Concept          | Closed values or states                          | Meaning                                                                                    | Availability by variant/orientation/state                                          | Default                                      | Owner             | Stability    | Invalid-value behavior                                                                                |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------- | ----------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| Data model       | `data`, `xKey`, `series`                         | Rows, shared x field, and mark definitions for one plot.                                   | Always required.                                                                   | none                                         | `component:Chart` | experimental | Missing fields are rejected by TypeScript; malformed row values are handled by each mark.             |
| Height           | finite number                                    | Outer SVG height in CSS pixels.                                                            | All charts.                                                                        | `300`                                        | `component:Chart` | experimental | Negative or non-finite values resolve to `0`.                                                         |
| Plot margin      | partial `top`, `right`, `bottom`, `left` numbers | Insets the shared plot area.                                                               | All charts.                                                                        | `{top: 24, right: 24, bottom: 32, left: 48}` | `component:Chart` | experimental | Non-finite resulting geometry is clamped to `0`; the physical field names remain an open API finding. |
| Y baseline       | `auto`, `zero`, `data`                           | Chooses mark-aware zero/headroom, symmetric zero, or tight data extent.                    | Used when `yDomain` is absent.                                                     | `auto`                                       | `component:Chart` | experimental | Unknown values are rejected by TypeScript.                                                            |
| Explicit domains | `xDomain`, `yDomain` finite numeric pairs        | Pins numeric scale domains.                                                                | `xDomain` is ignored for categorical x; `yDomain` overrides baseline and nicening. | absent                                       | `component:Chart` | experimental | Non-finite pairs fall back to automatic derivation.                                                   |
| Chart chrome     | `grid`, `axes`, `legend`, `tooltip`              | Places caller-supplied or built-in chart context consumers around the series.              | Optional.                                                                          | off/absent                                   | `component:Chart` | experimental | False/omitted boolean-or-config values disable the built-in surface.                                  |
| Extension slots  | `interactions`, `children`                       | Adds interaction overlays and advanced SVG content in defined paint order.                 | Optional.                                                                          | absent                                       | `component:Chart` | experimental | Caller content renders as supplied.                                                                   |
| Accessible text  | `title`, `subtitle`, generated fallback          | Names and describes the chart image.                                                       | All charts; visible when supplied.                                                 | localized generated name                     | `component:Chart` | experimental | A generic localized name is used when no primary series exists.                                       |
| Root DOM surface | `BaseProps<HTMLDivElement>`, `ref`               | Forwards standard DOM, data, ARIA, class, style, StyleX, events, and the root element ref. | All charts.                                                                        | absent                                       | `component:Chart` | experimental | Component-owned SVG semantics remain on the SVG.                                                      |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an intentional decision.

| ID  | Candidate invariant                                                                                                                                                            | Basis                                                       | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------ |
| FR1 | Chart MUST reserve its configured height while width is zero, then recompute plot geometry after container resizes.                                                            | current implementation and `Chart measurement gate` tests   | verify             |
| FR2 | All series, axes, grid lines, tooltips, and interactions MUST consume one shared scale set derived from the current data, domains, baseline, and measured plot size.           | README, implementation, and package tests                   | verify             |
| FR3 | Paint order MUST remain grid → clipped series → axes → pointer layer → interactions → built-in tooltip → children.                                                             | current implementation and render-delegation tests          | verify             |
| FR4 | Primary series without a static color MUST receive deterministic colors from the active theme palette; utility marks MUST NOT consume palette or legend slots.                 | implementation, palette test, and browser evidence          | verify             |
| FR5 | Pointer movement MUST be normalized into plot coordinates and dispatch the nearest x-position; leaving the plot MUST clear the pointer state.                                  | current implementation and tooltip browser evidence         | verify             |
| FR6 | `legend=true` MUST derive items from primary series; legend and tooltip config objects MUST enable their surfaces while overriding supported options.                          | current implementation and focused tests                    | verify             |
| FR7 | The chart MUST expose a named `role="img"`; a supplied subtitle MUST be its description; datasets up to 100 row×series cells MUST also be mirrored in a visually hidden table. | current implementation, WCAG 1.1.1, and accessibility tests | verify             |
| FR8 | Root DOM props and `ref` MUST reach the root container while Chart's own SVG name and description remain authoritative.                                                        | shared BaseProps convention and focused regression test     | verify             |

### Allowed variation

- **AV1 — Series output.** Mark definitions may render different SVG or canvas content while preserving the shared layout and render-order seams.
- **AV2 — Consumer chrome.** Grid, axes, interaction, and children slots may be absent or contain any valid chart-context consumer.

### Representative states

| State               | Required invariant                                                      | Allowed variation                                            |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Width not measured  | Height-reserving root only; no invalid SVG geometry.                    | Consumer root styling and DOM props remain applied.          |
| Normal data         | Shared finite scales and one clipped group per resolved series.         | Mark shape, color, and content come from series definitions. |
| Empty data          | Finite fallback scales; no invalid mark geometry.                       | Visible empty-state treatment remains unsettled.             |
| Small data          | Named image plus hidden data table.                                     | Cell text follows supplied row values.                       |
| More than 100 cells | Named image; built-in hidden table omitted.                             | Equivalent large-data alternative remains unsettled.         |
| Title and subtitle  | Visible header; SVG title/description associations.                     | Consumer text content.                                       |
| Legend enabled      | Derived or explicit items at top, bottom, start, or end.                | Alignment and supplied items.                                |
| Tooltip enabled     | Pointer updates the indicator and grouped tooltip; leave clears it.     | Custom renderer and placement.                               |
| Narrow / RTL        | No horizontal page overflow; logical stack placement follows direction. | Physical chart-domain order remains data-owned.              |

### Transformation and precedence order

- **ORD1 — Dimensions.** Merge default and supplied margins → clamp height and inner dimensions → derive scales → resolve series → render in FR3 order.
- **ORD2 — Domains.** A finite explicit domain wins; otherwise derive finite data extent → expand degenerate extent → apply the requested baseline/headroom → apply nicening only to automatic domains.
- **ORD3 — Accessible name.** Supplied title wins; otherwise format primary-series labels with the provider locale and interpolate them with `xKey`; with no primary series, use the localized generic name.

### Performance and resources

- **PR1 — Resize observation.** Each mounted chart observes its root with a dedicated `ResizeObserver` and disconnects it on unmount; migration to the shared observer remains an audit FIX.
- **PR2 — Pointer dispatch.** Pointer movement updates subscribers directly; tooltip React state changes only when the nearest data index changes.

## Accessibility contract

- **AR1 — Named image.** The SVG MUST expose `role="img"` with the resolved accessible name.
- **AR2 — Description.** A supplied subtitle MUST be linked through `aria-describedby` to an SVG `desc`.
- **AR3 — Small-data alternative.** Up to 100 row×primary-series cells MUST be mirrored in a semantically headed, visually hidden table.
- **AR4 — Large-data gap.** The current name-only path above the table cutoff does not guarantee an equivalent alternative; resolution requires owner review and remains an audit finding.
- **AR5 — Tooltip supplement.** Pointer tooltip content MUST NOT be the only available source for required chart information.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority                                   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------- | -------------- | ------------------ |
| Header           | Core Text roles                                         | delegated to `component:Text`                              | supporting     | FR7                |
| Plot and marks   | Meaningful graphics meet rendered contrast requirements | objective WCAG threshold; mark representation is unsettled | primary        | FR2, FR4           |
| Legend           | Labels and swatches preserve series association         | delegated to `component:ChartLegend`                       | supporting     | FR6                |
| Tooltip          | Temporal overlay                                        | current Design Conventions                                 | supporting     | FR5, FR6, AR5      |
| Hidden table     | Nonvisual data alternative                              | objective accessibility semantics                          | supporting     | AR3, AR4           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Header": {
    "none": {
      "reason": "intentional: Text owns the visible title and subtitle styling."
    }
  },
  "Plot": {
    "none": {
      "reason": "unsettled: Chart does not currently expose a public theme target for the SVG plot root."
    }
  },
  "Grid and axes": {
    "none": {
      "reason": "unsettled: ChartGrid and ChartAxis own their output but do not yet have current component contracts."
    }
  },
  "Legend": {
    "none": {
      "reason": "unsettled: ChartLegend owns the visible legend but does not yet have a current component contract."
    }
  },
  "Tooltip and interactions": {
    "none": {
      "reason": "unsettled: ChartTooltip and consumer interaction layers own their painting surfaces."
    }
  },
  "Data table": {
    "none": {
      "reason": "intentional: The small-data table is visually hidden accessibility content."
    }
  }
}
```

## Family and system relationships

- `architecture:component-test-sufficiency` owns evidence quality and rational state partitioning.
- `architecture:component-theming-surface` owns anatomy-to-theme reachability.
- `spec:AST-002` owns public API admission and operation shape.
- `spec:AST-029` owns observational audit backfill and the external evidence receipt.

## Verification map

| Contract           | Verification                                                        | Representative states                                                        | Mutation or failure expectation                                                                                     | Audit section                        |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, PR1           | `Chart.test.tsx`; Chromium narrow captures                          | zero and positive width; resize; 320 px                                      | Removing measurement or cleanup leaves a blank/stale plot or a leaked observer.                                     | `audit:Chart/responsive-code-health` |
| FR2–FR4, ORD1–ORD2 | Chart and package tests; light/dark browser matrix                  | band and linear x; automatic/explicit domains; grouped/stacked/utility marks | A scale diverges, geometry becomes non-finite, clipping/order changes, or palette ownership drifts.                 | `audit:Chart/behavior-theming`       |
| FR5–FR6, PR2       | tooltip/legend tests; Chromium hover and layout captures            | hover/leave; derived/configured legend; all placements                       | Tooltip state goes stale, pointer work causes per-move commits, or chrome renders in the wrong layer.               | `audit:Chart/behavior`               |
| FR7, AR1–AR5, ORD3 | accessible-name/table tests; package-specific axe; browser receipts | title/subtitle; generated name; small, empty, and large data                 | Name/description disappears, the small-data table is lost, localization regresses, or the large-data gap is hidden. | `audit:Chart/accessibility-i18n`     |
| FR8                | root-prop/ref regression test and package typecheck                 | placeholder and measured render                                              | DOM props or ref stop reaching the root, or consumer styling replaces component styling.                            | `audit:Chart/public-api`             |

## Decision log

None. This draft records observed behavior and open gaps only.

## Open questions

- **OQ1 — Large-data alternative.** What equivalent nonvisual data or summary contract must Chart guarantee after the 100-cell table cutoff? (`human-api`)
- **OQ2 — Directional margins.** Should the experimental physical `left`/`right` margin fields migrate to logical names before a stable release? (`human-api`)
- **OQ3 — Series metadata.** How should per-chart identity, stack state, and resolved colors move behind a private boundary before the canary API stabilizes? (`human-api`)
- **OQ4 — Theming root.** Should Chart expose a public target for its plot/root surface, or intentionally remain token-only? (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
