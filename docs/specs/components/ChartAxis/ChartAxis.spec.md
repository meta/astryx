---
schema_version: 3
template_version: 5
kind: component
id: component:ChartAxis
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/ChartAxis.test.tsx,
    apps/storybook/stories/charts/ChartAxis.stories.tsx,
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

# ChartAxis component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | No API shape or default changes. Truncation and automatic horizontal density now count complete grapheme clusters under the objective Unicode text-segmentation standard. |
| Behavior                | The selected physical plot edge determines scale, placement, label direction, and the default edge line; explicit formatting and density inputs refine labels.            |
| End-user impact         | Chart readers keep complete tick-label characters, and equally short Unicode labels are no longer thinned more aggressively than ASCII labels.                            |
| Builder impact          | None. Existing callsites remain valid and receive direct CLI documentation for the current surface.                                                                       |
| Compatibility/readiness | The canary API and defaults are preserved. This record is draft observational evidence; rendered and accessibility-tree evidence remains incomplete.                      |
| Review checks           | Reject a changed public shape/default, an axis using the wrong Chart scale, broken physical-edge placement, split grapheme labels, or hidden line/tick precedence.        |
| Governing rules         | `spec:AST-029/FR3–FR7`, `architecture:component-test-sufficiency/INV1–INV9`, and [Unicode Text Segmentation](https://www.unicode.org/reports/tr29/).                      |

This table is a review projection; the body below is authoritative.

## Intent

ChartAxis renders labelled Cartesian x or y scale output inside a Chart. It owns
physical-edge placement, tick selection and formatting, optional tick marks, and the
optional axis edge line while Chart owns the scale domains and plot geometry.

## Compatibility and migration

- Released default preserved: yes; the package is canary-only and has no stable release.
- Compatibility class: no public API or default changes; Unicode truncation and automatic thinning intentionally change only labels containing multi-code-unit graphemes, while representative ASCII behavior is preserved.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; this draft does not authorize a public API change.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Selecting the Chart-provided x or y scale for one physical plot edge.
- Generating, formatting, thinning, truncating, positioning, and hiding tick labels.
- Rendering its optional edge line and optional outward tick marks.
- Applying optional transition styling to tick position and visibility changes.

**Does not own / non-goals**

- Data, domains, scale construction, or plot dimensions — owned by `component:Chart`.
- Grid lines — owned by `component:ChartGrid`.
- Product-specific units, locale choices, or label wording supplied through `tickFormat` — owned by the product callsite.
- A standalone chart data alternative — owned by `component:Chart` and its surrounding product content.

## Public concepts

| Concept          | Closed values or states                | Meaning                                                               | Availability by variant/orientation/state                   | Default                              | Owner                 | Stability    | Invalid-value behavior                                                          |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ | --------------------- | ------------ | ------------------------------------------------------------------------------- |
| Physical edge    | `top`, `right`, `bottom`, `left`       | Chooses the plot edge, scale axis, transform, and outward label side. | Required for every axis.                                    | none                                 | `component:ChartAxis` | experimental | Unknown values are rejected by TypeScript.                                      |
| Tick target      | finite number                          | Requests an approximate continuous-scale tick count from d3.          | Continuous scales; also configures the automatic formatter. | `5`                                  | `component:ChartAxis` | experimental | Negative/non-finite values fall back to 5; fractions floor; values cap at 1000. |
| Label cap        | number or absent                       | Evenly skips labels when the generated set exceeds the requested cap. | Every scale.                                                | automatic from available space       | `component:ChartAxis` | experimental | Values outside the intended positive-count domain are not specified.            |
| Label formatter  | `(value: unknown) => string` or absent | Replaces the band string or d3 continuous-scale formatter.            | Every tick.                                                 | scale-appropriate built-in formatter | `component:ChartAxis` | experimental | Exceptions from consumer formatters propagate.                                  |
| Label truncation | positive character count or absent     | Keeps that many user-perceived characters, then appends an ellipsis.  | Every formatted label.                                      | absent                               | `component:ChartAxis` | experimental | Zero/omitted disables truncation; other invalid values are not specified.       |
| Edge line        | shown or hidden                        | Renders a line along the selected axis edge.                          | Every edge; tick marks force it on.                         | shown only for `bottom`              | `component:ChartAxis` | experimental | Not applicable.                                                                 |
| Tick marks       | shown or hidden                        | Renders an outward perpendicular mark beside each visible tick label. | Every edge.                                                 | hidden                               | `component:ChartAxis` | experimental | Not applicable.                                                                 |
| Tick transition  | animated or immediate                  | Animates tick transform and opacity during scale changes.             | Generated ticks.                                            | animated                             | `component:ChartAxis` | experimental | Not applicable.                                                                 |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID   | Candidate invariant                                                                                                                                                         | Basis                                                          | Draft review state |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| FR1  | A top or bottom axis MUST consume Chart's x scale; a left or right axis MUST consume the categorical y scale when present and the linear y scale otherwise.                 | implementation, types, and focused tests                       | verify             |
| FR2  | Continuous tick generation MUST use one sanitized count for both d3 tick generation and its default formatter; band scales MUST use their complete domain before thinning.  | implementation                                                 | verify             |
| FR3  | A supplied `tickFormat` MUST win; otherwise continuous scales use d3 formatting and band values use `String`.                                                               | implementation and focused tests                               | verify             |
| FR4  | Explicit `maxTicks` MUST win over the size-derived cap.                                                                                                                     | implementation and focused tests                               | verify             |
| FR5  | Truncation MUST keep complete Unicode grapheme clusters while preserving the documented content-count-plus-ellipsis output.                                                 | focused red/green test and Unicode Standard Annex #29          | settled            |
| FR6  | Automatic horizontal density MUST estimate formatted label length in user-perceived characters rather than UTF-16 storage units.                                            | focused red/green equivalence test and Unicode segmentation    | settled            |
| FR7  | Bottom MUST show an edge line by default and the other edges MUST hide it by default. `showTicks` MUST force the edge line on and render one mark per surviving tick.       | implementation, JSDoc, focused tests, and Storybook            | verify             |
| FR8  | Bottom and right axes MUST translate to the corresponding plot edge. Top and left remain at the plot origin. Labels and tick marks extend outwards from that physical edge. | implementation and focused tests                               | verify             |
| FR9  | On a mixed-sign linear y domain, the bottom edge line MUST align with y=0; categorical y leaves it on the plot edge.                                                        | implementation                                                 | verify             |
| FR10 | Tick movement and visibility MAY transition when `animated` is true and MUST be immediate when false. Out-of-range ticks remain mounted with zero opacity during updates.   | implementation and streaming examples; motion intent unsettled | human decision     |

### Allowed variation

- **AV1 — Tick count.** d3 may choose a nearby continuous tick count rather than the requested number.
- **AV2 — Label set.** Automatic and explicit density limits may omit evenly spaced labels while preserving their scale order.
- **AV3 — Supplied text.** Product callsites may format values in their own units and locale through `tickFormat`.

### Representative states

| State                       | Required invariant                                                  | Allowed variation                                     |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Bottom categorical          | Band labels are centered; the edge line is shown by default.        | Automatic density may omit labels.                    |
| Top categorical             | Band labels render outside the top edge.                            | Edge line remains hidden unless requested.            |
| Left continuous             | d3 labels render outside the left edge.                             | d3 chooses exact tick values.                         |
| Right continuous            | Axis translates to the right edge and labels render outside it.     | d3 chooses exact tick values.                         |
| Vertical categorical        | Row labels use `yBandScale` and align with band centers.            | Automatic density may omit labels.                    |
| Explicit formatting         | Every retained label uses the supplied formatter.                   | Consumer-owned wording and units.                     |
| Truncated label             | Complete grapheme clusters precede the appended ellipsis.           | The caller chooses the content-character limit.       |
| Tick marks shown            | Every retained label has an outward mark and an edge line.          | Edge-line visibility input is subsumed in this state. |
| Mixed-sign linear y data    | Bottom line represents y=0 rather than the plot boundary.           | Exact pixel position follows the supplied domain.     |
| Streaming / changing domain | Tick positions and visibility update; animation follows `animated`. | Tick identity follows the raw value.                  |

### Transformation and precedence order

- **ORD1 — Scale.** Resolve physical orientation → choose Chart scale → generate and format each tick once → derive the grapheme-aware density cap → evenly filter labels.
- **ORD2 — Label.** Apply the supplied formatter or the scale default → preserve complete grapheme clusters when truncating → render the result.
- **ORD3 — Edge.** Resolve the position default → apply `showAxisLine` → force the line on when `showTicks` is true.

### Performance and resources

- **PR1 — Bounded continuous ticks.** Sanitization caps the d3 request at 1000 so a consumer value cannot allocate an unbounded tick array.
- **PR2 — Derived tick state.** Tick generation and formatting remain render-derived and memoized; each generated label is formatted once and shared by density and rendering, and ChartAxis owns no listener, observer, timer, or persistent resource.

## Accessibility contract

- **AR1 — Visible text integrity.** A truncated tick label MUST preserve complete user-perceived characters under Unicode grapheme-cluster boundaries.
- **AR2 — Chart-level alternative.** ChartAxis renders inside Chart's named image. Chart owns the accessible chart name and supported small-data table; axis labels and pointer content do not replace that alternative.
- **AR3 — Nested axis semantics gap.** The implementation currently emits a position-labelled `role="group"`. Whether that group should be independently exposed and localized beneath Chart's `role="img"` remains unverified and requires owner review.

## Design relationships

| Anatomy or state | Design requirement                                     | Representation authority                          | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------- | -------------- | ------------------ |
| Axis edge line   | Grounds the physical plot edge when present.           | unsettled; no current design record is linked     | supporting     | FR7, FR9           |
| Tick marks       | Associate retained labels with positions on the scale. | unsettled; no current design record is linked     | supporting     | FR7                |
| Tick labels      | Preserve readable value/category text around the plot. | Unicode grapheme boundaries settle text integrity | supporting     | FR3, FR5, FR6, AR1 |
| Tick transition  | Shows continuity during scale changes.                 | unsettled; `design:motion` remains draft          | supporting     | FR10               |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Axis edge line": {
    "none": {
      "reason": "unsettled: ChartAxis consumes semantic color tokens but no current component or family contract decides whether the line is a public theme target."
    }
  },
  "Tick marks": {
    "none": {
      "reason": "unsettled: ChartAxis consumes semantic color tokens but no current component or family contract decides whether tick marks are a public theme target."
    }
  },
  "Tick labels": {
    "none": {
      "reason": "unsettled: ChartAxis consumes semantic color tokens but no current component or family contract decides whether labels are a public theme target."
    }
  }
}
```

## Family and system relationships

- No current family or design record governs ChartAxis.
- `architecture:component-test-sufficiency` owns rational public-state partitions, observable assertions, and red-before-green audit remediation.
- `architecture:component-theming-surface` owns anatomy-to-target disposition; token consumption alone does not enroll ChartAxis in public component theming.
- `spec:AST-002` owns public API admission and forbids an audit from smuggling a new public choice into a repair.
- `spec:AST-029` owns this observational backfill, closed evidence receipt, safe remediation, and fail-closed eligibility report.

## Verification map

| Contract      | Verification                                                        | Representative states                                           | Mutation or failure expectation                                                           | Audit section                     |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, FR8      | `ChartAxis.test.tsx`; `ChartAxis.stories.tsx`                       | top, right, bottom, left; band and linear                       | An edge uses the wrong scale, transform, or outward label side.                           | `audit:ChartAxis/behavior-layout` |
| FR2, FR3      | `ChartAxis.test.tsx`                                                | default count; band, linear, and custom formatting              | Generation and formatting disagree or a supplied formatter is ignored.                    | `audit:ChartAxis/behavior`        |
| FR4           | `ChartAxis.test.tsx`                                                | automatic cap and explicit `maxTicks`                           | Explicit capping stops winning over size-derived thinning.                                | `audit:ChartAxis/behavior`        |
| FR5, FR6, AR1 | red-before-green grapheme regressions; density tests; browser story | ASCII, emoji, flag, and ZWJ labels; truncated wide/narrow plots | A visible label splits a grapheme or equal perceived-width labels retain different ticks. | `audit:ChartAxis/i18n-testing`    |
| FR7           | `ChartAxis.test.tsx`; Axes & Grids Storybook fixture                | defaults; line requested; ticks requested                       | Tick marks lose their edge line or line defaults change.                                  | `audit:ChartAxis/behavior`        |
| FR9           | source review; browser evidence remains pending                     | positive-only, negative-only, mixed-sign, y-band                | The mixed-sign zero line moves to the edge or a categorical axis crosses the plot.        | `audit:ChartAxis/behavior-design` |
| FR10          | streaming stories; exact-head browser evidence remains pending      | animated, immediate, entering/leaving tick                      | Disabling animation retains a transition or a moving label jumps to stale geometry.       | `audit:ChartAxis/design-testing`  |
| AR2, AR3      | Chart accessibility tests; package axe; accessibility-tree review   | title/subtitle, small-data table, nested axis groups            | Chart loses its alternative or an unreviewed nested semantic claim is treated as fact.    | `audit:ChartAxis/accessibility`   |

## Decision log

None. This draft records observed behavior and one objective Unicode correction; it does not approve new ChartAxis policy.

## Open questions

- **OQ1 — Axis semantics.** Should ChartAxis remain purely visual content within Chart's single named image, or expose each axis as an independently localized accessibility group? (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
