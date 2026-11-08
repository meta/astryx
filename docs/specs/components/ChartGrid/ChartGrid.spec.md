---
schema_version: 3
template_version: 5
kind: component
id: component:ChartGrid
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/ChartGrid.test.tsx,
    apps/storybook/stories/charts/ChartGrid.stories.tsx,
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

# ChartGrid component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | No API shape or default changes. This draft records the current horizontal, vertical, and continuous-scale tick-density surface.                                                 |
| Behavior                | Horizontal guides follow continuous y ticks except zero; vertical guides follow categorical x-band centers or continuous x ticks; both directions remain independently optional. |
| End-user impact         | Chart readers receive guide lines aligned with the parent Chart's plot scales; this audit changes no rendered behavior.                                                          |
| Builder impact          | Existing callsites remain valid and gain direct CLI documentation and focused evidence for current density fallbacks.                                                            |
| Compatibility/readiness | The package remains canary-only. This observational draft is non-authoritative, and exact rendered/accessibility evidence remains pending.                                       |
| Review checks           | Reject a changed public shape/default, a guide using a scale outside Chart context, a zero baseline drawn twice, or categorical guides no longer centered on their bands.        |
| Governing rules         | `spec:AST-029/FR3–FR7`, `architecture:component-test-sufficiency/INV1–INV11`, `architecture:component-theming-surface/INV1–INV6`, and `spec:AST-002`.                            |

This table is a review projection; the body below is authoritative.

## Intent

ChartGrid renders passive Cartesian guide lines inside a Chart. It owns line
selection and placement from Chart-provided scales and plot dimensions while Chart
owns the coordinate system, rendering order, and chart-level alternative.

## Compatibility and migration

- Released default preserved: yes at the canary surface; the package has no stable release.
- Compatibility class: no public API, default, or rendered-behavior change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; this draft does not authorize a public API change.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Selecting horizontal and vertical guide values from Chart-provided scales.
- Positioning each guide across the current plot width or height.
- Omitting the horizontal zero guide that the paired axis may emphasize.
- Sanitizing continuous-scale tick requests before passing them to d3.

**Does not own / non-goals**

- Data, domains, scale construction, plot dimensions, or paint order — owned by `component:Chart`.
- Axis labels, tick marks, or plot-edge lines — owned by `component:ChartAxis`.
- The chart's accessible name, description, or data alternative — owned by `component:Chart` and the product callsite.
- Product-specific decisions about whether guides are needed.

## Public concepts

| Concept             | Closed values or states                 | Meaning                                                       | Availability by variant/orientation/state | Default   | Owner                 | Stability    | Invalid-value behavior                                                             |
| ------------------- | --------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------- | --------------------- | ------------ | ---------------------------------------------------------------------------------- |
| Horizontal guides   | shown or hidden                         | Draws lines at continuous y ticks, excluding zero.            | Every ChartGrid                           | shown     | `component:ChartGrid` | experimental | Not applicable.                                                                    |
| Vertical guides     | shown or hidden                         | Draws lines at x ticks or categorical x-band centers.         | Every ChartGrid                           | hidden    | `component:ChartGrid` | experimental | Not applicable.                                                                    |
| Continuous density  | finite non-negative number              | Requests an approximate line count from d3 continuous scales. | Horizontal guides and continuous x guides | `5`       | `component:ChartGrid` | experimental | Fractions floor; values above 1000 cap; negative/non-finite values fall back to 5. |
| Categorical density | one guide per categorical x-band center | Keeps vertical guides aligned to every band.                  | Categorical x with vertical guides        | all bands | `component:ChartGrid` | experimental | `tickCount` currently has no effect.                                               |
| Chart context       | inside a parent `Chart`                 | Supplies scales and current plot dimensions.                  | Always                                    | none      | `component:Chart`     | experimental | Rendering outside Chart throws the shared context error.                           |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                | Basis                                                  | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| FR1 | ChartGrid MUST consume the current width, height, x scale, and y scale from its parent Chart context.                                              | implementation, package composition, and focused tests | verify             |
| FR2 | `horizontal` and `vertical` MUST independently enable their guide sets; enabling both MUST render both sets.                                       | implementation, JSDoc, tests, and Storybook            | verify             |
| FR3 | Horizontal guides MUST use continuous y ticks, span the plot width, and omit y=0 so a paired axis does not receive a duplicate line.               | implementation, JSDoc, and focused tests               | verify             |
| FR4 | Vertical guides MUST use categorical band centers for band x scales and d3 tick positions for continuous x scales, spanning the plot height.       | implementation and focused tests                       | verify             |
| FR5 | Continuous tick requests MUST be finite, non-negative integers no greater than 1000; zero yields no continuous guides and invalid values use five. | implementation, crash-prevention rationale, and tests  | verify             |
| FR6 | Guide paint MUST consume a semantic theme token. Whether grid lines become a public theme target remains unsettled.                                | implementation and current theming architecture        | verify             |

### Allowed variation

- **AV1 — Continuous tick count.** d3 may choose a nearby set of values rather than exactly the requested number.
- **AV2 — Categorical values.** Each current x-band domain value contributes one centered vertical guide.

### Representative states

| State                      | Required invariant                                               | Allowed variation                              |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Default                    | Horizontal guides only; continuous density defaults to five.     | d3 chooses the exact y tick set.               |
| Horizontal disabled        | No horizontal guides.                                            | Vertical guides may remain enabled.            |
| Vertical categorical       | One vertical guide at each x-band center.                        | Band width and center follow Chart's x scale.  |
| Vertical continuous        | One guide at each generated continuous x tick.                   | d3 chooses the exact x tick set.               |
| Both directions            | Horizontal and vertical sets render together.                    | Their exact counts may differ.                 |
| Zero continuous tick count | Continuous guide sets are empty.                                 | Categorical vertical guides remain unaffected. |
| Invalid tick count         | Continuous guide generation falls back to the default request.   | d3 chooses the resulting exact ticks.          |
| Narrow / RTL               | Guides remain tied to physical data coordinates and plot bounds. | Plot width and data-domain order vary.         |

### Transformation and precedence order

- **ORD1 — Continuous density.** Validate finiteness and non-negativity → floor fractions → cap at 1000 → request d3 ticks.
- **ORD2 — Placement.** Select enabled directions → choose the scale path → derive tick or band-center positions → span the current opposite plot dimension.

### Performance and resources

- **PR1 — Derived output.** Guide arrays remain render-derived and memoized from enabled directions, scales, dimensions, and sanitized density. ChartGrid owns no listener, observer, timer, or persistent resource.
- **PR2 — Bounded tick allocation.** A public density value cannot request more than 1000 continuous ticks from d3.

## Accessibility contract

- **AR1 — Chart-level alternative.** ChartGrid renders passive supporting guides inside Chart's named image. Chart owns the accessible chart name and supported data-table alternative.
- **AR2 — No grid-only information.** Grid lines do not replace visible labels, meaningful marks, or the parent Chart alternative.

## Design relationships

| Anatomy or state | Design requirement                                                | Representation authority                      | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------- | -------------- | ------------------ |
| Grid lines       | Support position comparison without carrying chart meaning alone. | unsettled; no current design record is linked | supporting     | FR2–FR6, AR1–AR2   |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Grid lines": {
    "none": {
      "reason": "unsettled: ChartGrid consumes a semantic color token, but no current component or family contract decides whether grid lines are a public theme target."
    }
  }
}
```

## Family and system relationships

- No current family or design record governs ChartGrid.
- `architecture:component-test-sufficiency` owns rational public-state partitions, observable assertions, and audit evidence quality.
- `architecture:component-theming-surface` owns anatomy-to-target disposition; token consumption alone does not enroll ChartGrid in public component theming.
- `spec:AST-002` owns public API admission and prevents this audit from adding or reinterpreting a public choice.
- `spec:AST-029` owns this observational backfill, closed evidence receipt, safe remediation, and fail-closed eligibility report.

## Verification map

| Contract | Verification                                           | Representative states                                       | Mutation or failure expectation                                                    | Audit section                      |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| FR1–FR2  | `ChartGrid.test.tsx`; `ChartGrid.stories.tsx`          | default, horizontal off, vertical on, both, neither         | A direction stops respecting its input or output escapes the parent Chart context. | `audit:ChartGrid/behavior`         |
| FR3      | `ChartGrid.test.tsx`                                   | positive and mixed-sign y domains                           | Guides stop spanning the plot or y=0 is drawn twice.                               | `audit:ChartGrid/behavior-layout`  |
| FR4      | `ChartGrid.test.tsx`; `ChartGrid.stories.tsx`          | categorical and continuous x                                | A band guide leaves its center or a continuous tick lands at the wrong coordinate. | `audit:ChartGrid/behavior-layout`  |
| FR5, PR2 | focused zero/invalid-density tests and source review   | zero and invalid requests; fractional and capped partitions | Invalid input crashes render or bypasses the bounded fallback.                     | `audit:ChartGrid/behavior-testing` |
| FR6      | strict lint; Storybook theme matrix remains pending    | light, dark, and supported non-default themes               | A raw color or component-side mode choice replaces semantic token paint.           | `audit:ChartGrid/theming-design`   |
| AR1–AR2  | Chart accessibility tests; package axe remains pending | named Chart, small-data table, grid enabled                 | Grid content replaces or becomes the only source of required chart information.    | `audit:ChartGrid/accessibility`    |

## Decision log

None. This draft records observed behavior and evidence gaps only.

## Open questions

- **OQ1 — Categorical density.** Should `tickCount` remain continuous-scale-only, or should vertical categorical guides gain a documented thinning contract aligned with ChartAxis? (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
