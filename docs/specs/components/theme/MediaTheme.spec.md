---
schema_version: 3
template_version: 7
kind: component
id: component:MediaTheme
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, theming]
verified_by: [packages/core/src/theme/MediaTheme.dom.test.tsx]
modules: []
families: []
design_specs: []
architecture: [architecture:theme-application]
contributing: []
system_specs: []
---

# MediaTheme component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `MediaTheme` with a required `mode` (`dark`, `light`, `auto`, `off`), `fallback` (`dark`, `light`; default `dark`), and `children`.             |
| Behavior                | Marks a subtree as sitting on a dark or light surface so tokens switch to match, through a layout-neutral wrapper; `auto` measures the surface. |
| End-user impact         | Text and controls placed over images or video stay readable against that surface while keeping the app's theme.                                 |
| Builder impact          | None.                                                                                                                                           |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                                     |
| Review checks           | Reject a wrapper that remounts children when the mode changes, a probe element left behind, or a surface mode that replaces the theme.          |
| Governing rules         | `architecture:theme-application` INV8.                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

MediaTheme marks content that sits on a dark or light surface, such as text
over a photo, so compiled theme CSS switches its surface tokens while keeping
the active theme. Consumer usage lives in `MediaTheme.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: `mode` is caller-owned; `auto` measures
  the surface
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The wrapper, its surface marker, and resolving `auto` with `fallback`
  (FR1–FR3).

**Does not own / non-goals**

- What the surface marker does to tokens and component rules — owned by
  `architecture:theme-application` INV8 and the compiled theme CSS.
- The active theme and color mode — owned by `component:Theme`.

## Public concepts

| Concept  | Closed values or states        | Meaning                                                   | Availability by variant/orientation/state | Default  | Owner                  | Stability | Invalid-value behavior           |
| -------- | ------------------------------ | --------------------------------------------------------- | ----------------------------------------- | -------- | ---------------------- | --------- | -------------------------------- |
| Mode     | `dark`, `light`, `auto`, `off` | The surface the subtree sits on, measured, or no marker.  | Every MediaTheme.                         | required | `component:MediaTheme` | Stable    | TypeScript rejects other values. |
| Fallback | `dark`, `light`                | The side `auto` uses when the surface cannot be measured. | `auto` only.                              | `dark`   | `component:MediaTheme` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                       | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | MediaTheme always renders one wrapper with `display: contents`, so switching to or from `off` never remounts its children.                                                                                                                      | Current source and tests |
| FR2 | `dark` and `light` mark the wrapper with that surface and the primary text color; `off` renders no marker.                                                                                                                                      | Current source and tests |
| FR3 | `auto` measures the surface behind the wrapper and marks it dark or light, using `fallback` when the surface cannot be measured; it re-measures when the surface changes and leaves no probe element. `fallback` is ignored for explicit modes. | Current source and tests |

### Allowed variation

- **AV1 — Content.** Children vary; components inside adapt through tokens.

### Representative states

| State              | Required invariant                 | Allowed variation |
| ------------------ | ---------------------------------- | ----------------- |
| `dark` or `light`  | Surface marker set.                | Content.          |
| `off`              | No marker; children not remounted. | Content.          |
| `auto`, unmeasured | Marker from `fallback`.            | Fallback.         |
| `auto`, measured   | Marker from the measured surface.  | Surface.          |

### Transformation and precedence order

- **ORD1 — Mode.** An explicit mode wins; `auto` uses the measurement, then
  `fallback`.

### Performance and resources

- **PR1 — Measurement.** Only `auto` measures the surface.

## Accessibility contract

- **AR1 — No semantics.** The wrapper adds no role, name, or focus target.

## Design relationships

| Anatomy or state | Design requirement                               | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Wrapper          | Carries the surface marker without a layout box. | Current source           | Supporting     | FR1, FR2           |

MediaTheme renders no themable part of its own, so no anatomy-theming map
applies.

## Family and system relationships

- `architecture:theme-application` INV8 owns what a surface marker changes and
  keeps the active theme.
- `component:Theme` owns the active theme and color mode.

## Verification map

| Contract | Verification                                                                             | Representative states  | Mutation or failure expectation                                | Audit section               |
| -------- | ---------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- | --------------------------- |
| FR1, FR2 | `MediaTheme.dom.test.tsx` explicit-mode marker and `off` tests                           | `dark`; `light`; `off` | A wrong marker, a marker on `off`, or a missing element fails. | `audit:MediaTheme/behavior` |
| FR3      | `MediaTheme.dom.test.tsx` fallback, explicit-fallback, ignored-fallback, and probe tests | `auto` unmeasured      | A wrong fallback or a leftover probe fails.                    | `audit:MediaTheme/behavior` |

Read from source, with no focused test yet:

- FR1: `display: contents`, and children not remounting when the mode
  switches to or from `off`.
- FR2: the primary text color.
- FR3: re-measuring when the surface changes.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, theme
authoring, token definitions, or compiler output. It links to their owners.
