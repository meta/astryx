---
schema_version: 3
template_version: 7
kind: component
id: component:Theme
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, theming]
verified_by: [packages/core/src/theme/Theme.test.tsx]
modules: []
families: []
design_specs: []
architecture: [architecture:theme-application, architecture:theme-compilation]
contributing: []
system_specs: [spec:AST-108]
---

# Theme component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Theme` with a required `theme` (a defined theme), `mode` (`light`, `dark`, `system`; default `system`), and `children`.                                 |
| Behavior                | Applies a theme and color mode to its subtree through a layout-neutral wrapper. The outermost Theme also writes the theme and a forced mode to `<html>`. |
| End-user impact         | Everything inside renders in the chosen theme and in light, dark, or the system's mode; browser chrome follows the root Theme.                           |
| Builder impact          | None.                                                                                                                                                    |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                                              |
| Review checks           | Reject a wrapper that affects layout, a nested Theme that changes `<html>`, or a `system` mode that writes a forced mode.                                |
| Governing rules         | `architecture:theme-application` INV1–INV9; `architecture:theme-compilation`.                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Theme is the provider that applies one defined theme and a color mode to the
part of the tree it wraps. How providers nest, share runtime styles, and sync
the document is owned by `architecture:theme-application`; this record owns
what the component itself renders. Consumer usage lives in `Theme.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: `theme` and `mode` are caller-owned
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The wrapper element, its theme and mode attributes, and its color scheme
  (FR1, FR2).
- Providing the theme and mode to descendants (FR3).

**Does not own / non-goals**

- Provider nesting, root document sync, runtime style sharing and removal, and
  `system` resolution — owned by `architecture:theme-application`.
- The CSS a theme compiles to — owned by `architecture:theme-compilation`.
- Theme authoring and tokens — owned by their architecture records.

## Public concepts

| Concept | Closed values or states   | Meaning                                    | Availability by variant/orientation/state | Default  | Owner             | Stability | Invalid-value behavior                                                                                                      |
| ------- | ------------------------- | ------------------------------------------ | ----------------------------------------- | -------- | ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mode    | `light`, `dark`, `system` | Forces a color mode or follows the system. | Every Theme.                              | `system` | `component:Theme` | Stable    | TypeScript rejects other values; at runtime any other value is treated as `system` (`architecture:theme-application` INV7). |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                         | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Theme renders one wrapper with `display: contents`, so it adds no layout box, carrying `data-astryx-theme` with the theme's name and the primary text color and body font.                                                                                                                                                                                        | Current source and tests |
| FR2 | `mode="light"` or `"dark"` sets that `data-theme` and color scheme on the wrapper; `system` sets no `data-theme` and a `light dark` color scheme. A nested Theme sets its own wrapper's mode. A Theme given any other value still writes it unchanged to its own wrapper's `data-theme`, with the `light dark` color scheme, though nothing reads that attribute. | Current source and tests |
| FR3 | Descendants read the theme and mode through Theme context; the nearest Theme wins (`architecture:theme-application` INV1).                                                                                                                                                                                                                                        | Current source and tests |
| FR4 | The outermost Theme writes the theme name and any forced mode to `<html>` and removes them on unmount; a nested Theme never changes `<html>` (`architecture:theme-application` INV2, INV7).                                                                                                                                                                       | Current source and tests |

### Allowed variation

- **AV1 — Theme.** Any defined theme, built or runtime.

### Representative states

| State        | Required invariant                               | Allowed variation |
| ------------ | ------------------------------------------------ | ----------------- |
| Root, system | No `data-theme` on the wrapper or `<html>`.      | Theme.            |
| Root, dark   | `data-theme="dark"` on the wrapper and `<html>`. | Theme.            |
| Nested       | Own wrapper attributes; `<html>` unchanged.      | Theme, mode.      |

### Transformation and precedence order

- **ORD1 — Nearest provider.** The nearest Theme supplies context; only the
  outermost writes to `<html>`.

### Performance and resources

- Runtime style generation and sharing follow `architecture:theme-application`
  INV4–INV5.

## Accessibility contract

- **AR1 — No semantics.** The wrapper adds no role, name, or focus target.

## Design relationships

| Anatomy or state | Design requirement                                    | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Wrapper          | Carries theme identity and mode without a layout box. | Current source           | Supporting     | FR1, FR2           |

Theme renders no themable part of its own, so no anatomy-theming map applies.

## Family and system relationships

- `architecture:theme-application` owns provider scope, root sync, style
  lifetime, and `system` resolution.
- `architecture:theme-compilation` owns the CSS Theme mounts.

## Verification map

| Contract | Verification                                                                | Representative states                     | Mutation or failure expectation                                    | Audit section          |
| -------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| FR1      | `Theme.test.tsx` "sets data-astryx-theme on wrapper div"                    | any theme                                 | A missing theme attribute fails.                                   | `audit:Theme/behavior` |
| FR2, FR4 | `Theme.test.tsx` root and nested `data-theme` and `data-astryx-theme` tests | root light, dark, system; nested; unmount | Wrong mode attributes, or a nested Theme changing `<html>`, fails. | `audit:Theme/behavior` |

Read from source, with no focused test yet:

- FR1: `display: contents`, the text color, and the body font.
- FR2: the color scheme for each mode, and the wrapper's `data-theme` for a
  value outside the three.
- FR3: descendants reading the nearest Theme's context.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, theme
authoring, token definitions, or compiler output. It links to their owners.
