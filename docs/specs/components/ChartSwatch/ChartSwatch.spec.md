---
schema_version: 3
template_version: 5
kind: component
id: component:ChartSwatch
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/charts/src/ChartSwatch.test.tsx,
    apps/storybook/stories/charts/Swatch.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-029]
---

# ChartSwatch component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | No API shape or default changes. This draft records the current caller-owned color, square/line shape, and exported series-type mapping utility.                         |
| Behavior                | Omitted `variant` renders a square; explicit `line` renders a short stroke; `swatchVariantForType` maps `bar` to square and every other or omitted type to line.         |
| End-user impact         | Chart readers keep the same decorative mark-shaped color keys next to visible series labels; this audit changes no rendered behavior.                                    |
| Builder impact          | Existing callsites remain valid and gain consumer documentation for the shipped props, defaults, composition, and accessibility boundary.                                |
| Compatibility/readiness | The package remains canary-only. This observational draft is non-authoritative; the public utility name and future theming reachability remain unresolved owner choices. |
| Review checks           | Reject a changed default or type mapping, lost decorative semantics, geometry drift presented as policy, or a claim that color alone always identifies a series.         |
| Governing rules         | `spec:AST-029/FR3–FR7`, `architecture:component-test-sufficiency/INV1–INV11`, `architecture:component-theming-surface/INV1–INV11`, and `spec:AST-002/FR17`.              |

This table is a review projection; the body below is authoritative.

## Intent

ChartSwatch paints a compact decorative key that visually connects a series label
to a chart mark. It owns the square and line shapes and the current mapping from a
series type to those shapes. A legend, tooltip, chart, or product callsite owns the
visible series name and the surrounding relationship.

## Compatibility and migration

- Released default preserved: yes at the canary surface; the package has no stable release.
- Compatibility class: no public API, default, or rendered-behavior change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none; this draft does not authorize a public utility rename or removal.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Painting one caller-owned color as a compact square or line.
- Keeping the swatch decorative to assistive technology.
- Mapping a `bar` series type to square and every other or omitted type to line.

**Does not own / non-goals**

- Selecting, validating, or adapting a chart palette — owned by the chart and product callsite.
- Naming a series or supplying an accessible chart alternative — owned by the surrounding legend, tooltip, Chart, or product callsite.
- Establishing that color alone distinguishes series across the plotted chart and its chrome.
- Interaction, selection, filtering, visibility, or tooltip behavior.

## Public concepts

| Concept          | Closed values or states                      | Meaning                                                         | Availability by variant/orientation/state | Default  | Owner                   | Stability    | Invalid-value behavior                                         |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------- | ------------ | -------------------------------------------------------------- |
| Series color     | caller-owned CSS color string                | Paints the decorative mark.                                     | Every ChartSwatch                         | required | product callsite        | experimental | Invalid CSS color syntax may leave the swatch without a paint. |
| Swatch shape     | `square`, `line`                             | Visually echoes a bar or non-bar chart mark.                    | Every ChartSwatch                         | `square` | `component:ChartSwatch` | experimental | Closed by the exported TypeScript union.                       |
| Series-type map  | `bar`; every other string; omitted           | Converts a series type to the component's two supported shapes. | Exported utility                          | line     | `component:ChartSwatch` | experimental | Unknown and omitted types use the line shape.                  |
| AT participation | decorative, hidden from assistive technology | Leaves the surrounding visible text responsible for meaning.    | Every ChartSwatch                         | built in | `component:ChartSwatch` | experimental | Not configurable.                                              |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                             | Basis                                                    | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| FR1 | ChartSwatch MUST render one decorative element and MUST use `square` when `variant` is omitted.                                                 | implementation, focused tests, and browser sensors       | verify             |
| FR2 | Square MUST currently render as an 8 by 8 mark with 2 radius and 1 inline margin; line MUST currently render as a 10 by 3 mark with 1.5 radius. | implementation and receipted browser matrix              | verify             |
| FR3 | The rendered paint MUST follow the caller-supplied `color` without choosing or adapting a palette.                                              | implementation, focused tests, and browser sensors       | verify             |
| FR4 | The swatch MUST remain hidden from assistive technology; surrounding content MUST provide the visible and accessible series meaning.            | implementation, focused tests, focused axe, and browsers | verify             |
| FR5 | `swatchVariantForType` MUST return `square` only for `bar` and MUST return `line` for every other string and for `undefined`.                   | implementation and focused tests                         | verify             |
| FR6 | Light, dark, narrow, and coarse-pointer media MUST NOT change the component-owned shape contract or introduce horizontal viewport overflow.     | receipted browser matrix                                 | verify             |

### Allowed variation

- **AV1 — Series paint.** Any valid caller-owned CSS color may paint either shape.
- **AV2 — Surrounding layout.** A legend, tooltip, or custom callsite may position the swatch anywhere that preserves its association with a visible series label.

### Representative states

| State                   | Required invariant                                   | Allowed variation                                         |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Omitted / square        | Square geometry and decorative semantics remain.     | Caller color and surrounding placement may vary.          |
| Line                    | Line geometry and decorative semantics remain.       | Caller color and surrounding placement may vary.          |
| `bar` mapping           | Utility returns `square`.                            | Source series definition may carry other fields.          |
| Non-bar / omitted map   | Utility returns `line`.                              | Unknown and future non-bar type strings use the fallback. |
| Light / dark            | Shape and supplied paint remain unchanged.           | Surrounding surface follows its active theme.             |
| Narrow / coarse pointer | No component-owned overflow or interaction is added. | Surrounding layout may wrap or reposition the swatch.     |

### Transformation and precedence order

- **ORD1 — Render.** Apply the default variant when omitted → select square or line geometry → paint with caller color → hide the resulting element from assistive technology.
- **ORD2 — Series mapping.** Compare the series type with `bar` → return square for the exact match → return line otherwise.

### Performance and resources

- **PR1 — No persistent resources.** Rendering, rerendering, and unmounting ChartSwatch MUST NOT create or retain a listener, observer, timer, request, subscription, or other persistent browser resource, and MUST require no consumer cleanup.

## Accessibility contract

- **AR1 — Decorative mark.** ChartSwatch stays hidden from assistive technology because its surrounding visible series label supplies the meaning.
- **AR2 — Meaningful context.** A standalone callsite pairs the swatch with visible text; the swatch does not replace a Chart accessible name, equivalent data view, or summary.
- **AR3 — Series distinction.** Evidence for whether same-shaped series need an additional association cue must cover the composed chart and its labels, not the isolated decorative swatch.

## Design relationships

| Anatomy or state | Design requirement                                         | Representation authority                      | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------- | -------------- | ------------------ |
| Series swatch    | Echo the chart mark while remaining decorative to AT.      | unsettled; no current design record is linked | supporting     | FR1–FR6, AR1–AR3   |
| Square shape     | Represent the current bar-series mapping.                  | observed implementation                       | supporting     | FR1–FR2, FR5       |
| Line shape       | Represent the current non-bar and fallback series mapping. | observed implementation                       | supporting     | FR2, FR5           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Series swatch": {
    "none": {
      "reason": "unsettled: caller-owned color and fixed component geometry currently paint the swatch without a public theme target; this draft does not decide future reachability."
    }
  }
}
```

ChartSwatch is the visible painter but exposes no current public theme target.
Whether themes should gain a stable target remains an owner decision.

## Family and system relationships

- No current family or design record governs ChartSwatch.
- `architecture:component-test-sufficiency` owns rational public-state partitions, observable assertions, and audit evidence quality.
- `architecture:component-theming-surface` owns anatomy-to-target disposition; this draft records current absence without deciding future themeability.
- `architecture:knowledge-contracts` keeps consumer syntax in `ChartSwatch.doc.mjs` and observed behavior in this draft component record.
- `spec:AST-002/FR17` owns the unresolved public utility naming question.
- `spec:AST-029` owns this observational backfill, closed evidence receipt, safe remediation, and fail-closed eligibility report.

## Verification map

| Contract | Verification                                                 | Representative states                          | Mutation or failure expectation                                                          | Audit section                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR1–FR3  | `ChartSwatch.test.tsx`; receipted browser matrix             | omitted, square, line, six colors, light, dark | Default, geometry, or caller paint changes without visible evidence.                     | `audit:ChartSwatch/behavior-design`            |
| FR4      | focused DOM assertion; focused axe; browser sensors          | square, line, light, dark                      | The swatch enters the accessibility tree or surrounding meaning is assigned to the mark. | `audit:ChartSwatch/accessibility`              |
| FR5      | `ChartSwatch.test.tsx`                                       | bar, line, dot, area, unknown, omitted         | A bar loses its square or another type gains one.                                        | `audit:ChartSwatch/public-utility-behavior`    |
| FR6      | receipted Storybook browser matrix                           | 1280 px, 320 px, coarse pointer, light, dark   | Shape changes, overflow appears, or the component gains a media-dependent behavior.      | `audit:ChartSwatch/responsive-rendered-design` |
| AR1–AR3  | focused axe; ChartLegend and ChartTooltip composition review | standalone and composed use                    | Decorative semantics are lost or isolated evidence is used to decide chart association.  | `audit:ChartSwatch/accessibility-composition`  |

## Decision log

None. This draft records observed behavior and evidence gaps only.

## Open questions

- **OQ1 — Public utility name.** Should the series-type mapping remain public and, if so, what verb-led name and compatibility path satisfy `spec:AST-002/FR17`? (`human-api`)
- **OQ2 — Swatch theming reachability.** Should ChartSwatch expose a public theme target, or should its paint and geometry remain caller/component owned? (`human-api`)
- **OQ3 — Composed series association.** Does a composed chart with multiple same-shaped series need an additional association cue, and which layer owns it? (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results,
implementation steps, or shared system rules. It links to their owners.
