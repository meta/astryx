---
schema_version: 3
template_version: 7
kind: component
id: component:VegaChart
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-12
owners: [cixzhang]
review_triggers: [behavior, theming, public-api]
verified_by:
  [
    packages/vega/src/VegaChart.test.tsx,
    packages/vega/src/vegaLiteConfig.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: []
---

# VegaChart component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The props in Public concepts, as built.                                                                                                                                                   |
| Behavior                | A Vega-Lite spec compiles with the Astryx theme config as its base, the caller's `compileOptions.config` on top, and the spec's own inline config last. A native Vega spec is not themed. |
| End-user impact         | A chart matches the active theme's axes, legends, marks and categorical palette without extra setup.                                                                                      |
| Builder impact          | A builder overrides any theme key through `compileOptions.config` or the spec's own `config`; a native Vega spec takes its config through `parseConfig`.                                  |
| Compatibility/readiness | Canary-only package.                                                                                                                                                                      |
| Review checks           | Reject a Vega-Lite spec that renders without the theme config, a caller config that the theme overrides, or a native Vega spec that the theme changes.                                    |
| Governing rules         | None recorded.                                                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

VegaChart renders a Vega or Vega-Lite specification inside a container that
follows the active Astryx theme. This record states how the theme config
reaches a chart. Consumer usage lives in `VegaChart.doc.mjs` and the package
README.

## Compatibility and migration

- Released default preserved: `no` for a Vega-Lite spec, which now compiles with the theme config as its base (FR1).
- Compatibility class: behavioral, canary-only.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none. A builder who wants a key without the theme sets it in `compileOptions.config` or in the spec.

## Ownership boundary

**Owns**

- The order in which the theme config, the caller's compile config and the spec's own config apply (FR1).

**Does not own / non-goals**

- The categorical palette, which comes from `@astryxdesign/charts`.
- The Vega and Vega-Lite runtimes and their own config semantics.

## Public concepts

| Concept          | Closed values or states                   | Meaning                                                                     | Availability by variant/orientation/state | Default | Owner                 | Stability    | Invalid-value behavior          |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------- | ------------ | ------------------------------- |
| `spec`           | A Vega or Vega-Lite spec with a `$schema` | The chart to render; `$schema` selects Vega or Vega-Lite                    | Always                                    | None    | `component:VegaChart` | experimental | `onError` with the schema error |
| `data`           | Named dataset values                      | Initial values for named datasets, read once when the View is built         | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |
| `compileOptions` | Vega-Lite `compile()` options             | Options for Vega-Lite compilation; its `config` applies over the theme      | Vega-Lite specs only                      | None    | `component:VegaChart` | experimental | Ignored for a native Vega spec  |
| `parseConfig`    | A Vega config                             | Config passed to `vega.parse()`                                             | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |
| `parseOptions`   | Vega parse options                        | Options passed to `vega.parse()`                                            | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |
| `viewOptions`    | Vega View options without `container`     | Options passed to the Vega View; the component sets `container`             | Always                                    | None    | `component:VegaChart` | experimental | `container` is overridden       |
| `onReady`        | Callback with the live View               | Called once the chart has rendered                                          | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |
| `onError`        | Callback with an error                    | Called when the schema is invalid, compilation fails, or the runtime throws | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |
| `ref`            | A ref to the root `div`                   | Ref forwarded to the root container                                         | Always                                    | None    | `component:VegaChart` | experimental | Not applicable                  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                   | Basis                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR1 | A Vega-Lite spec MUST compile with the Astryx theme config as its base, the caller's `compileOptions.config` on top, and the spec's own inline config last. A native Vega spec MUST pass through untouched. | The package README's themed-by-default promise |

## Accessibility contract

None recorded.

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Chart            | None recorded      | Not applicable           | primary        | FR1                |

The component implements design requirements without copying their rationale.

## Family and system relationships

None recorded.

## Verification map

| Contract | Verification                                                                       | Representative states                                                              | Mutation or failure expectation                                                                         | Audit section |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| FR1      | `VegaChart.test.tsx` theming cases; `vegaLiteConfig.test.ts` merge and range cases | Vega-Lite with no config, with a caller config, with an inline config; native Vega | A themeless Vega-Lite chart, a caller config the theme overrides, or a themed native Vega spec fails it | None          |

## Decision log

None.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
