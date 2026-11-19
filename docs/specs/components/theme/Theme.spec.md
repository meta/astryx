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
verified_by:
  [
    packages/core/src/theme/Theme.test.tsx,
    packages/core/src/theme/__tests__/ThemeColorScheme.a11y.chromium.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:theme-application, architecture:theme-compilation]
contributing: []
system_specs: [spec:AST-108]
---

# Theme component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Theme` with a required `theme` (a defined theme), `mode` (`light`, `dark`, `system`; default `system`), and `children`.                                                                                                                        |
| Behavior                | Applies a theme and color mode to its subtree through a layout-neutral wrapper. The outermost Theme also writes the theme, a forced mode, and the scheme it draws in to `<html>`.                                                               |
| End-user impact         | Everything inside renders in the chosen theme and in light, dark, or the system's mode; browser chrome follows the root Theme.                                                                                                                  |
| Builder impact          | A `system` Theme takes the page root's scheme, so an app or host that sets the root's `color-scheme` decides it.                                                                                                                                |
| Compatibility/readiness | No API change. FR2 is a visible, non-breaking correction, and FR1's body leading a visible, non-breaking change: a `system` Theme follows a host's dark or light root instead of the device, and inherited text takes the theme's body leading. |
| Review checks           | Reject a wrapper that affects layout, a nested Theme that changes `<html>`, or a `system` mode that writes a forced mode.                                                                                                                       |
| Governing rules         | `architecture:theme-application` INV1–INV9; `architecture:theme-compilation`.                                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Theme is the provider that applies one defined theme and a color mode to the
part of the tree it wraps. How providers nest, share runtime styles, and sync
the document is owned by `architecture:theme-application`; this record owns
what the component itself renders. Consumer usage lives in `Theme.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: no API change. FR2 is a visible, non-breaking
  correction: a `system` Theme takes the page root's scheme, so a page whose
  root or host sets `color-scheme` to light or dark gets that scheme inside the
  Theme, and `useTheme()` reports it (`architecture:theme-application` INV7).
  FR1's body leading is a visible, non-breaking change: text inside a
  Theme that sets no line height of its own draws on the theme's body leading
  instead of the reset's 1.5 (`architecture:theme-compilation` INV20)
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

| Concept | Closed values or states   | Meaning                                    | Availability by variant/orientation/state | Default  | Owner             | Stability | Invalid-value behavior                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------- | ------------------------------------------ | ----------------------------------------- | -------- | ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode    | `light`, `dark`, `system` | Forces a color mode or follows the system. | Every Theme.                              | `system` | `component:Theme` | Stable    | TypeScript rejects other values; at runtime any other value is treated as `system` (`architecture:theme-application` INV7).                                                                                                                                                                                                                                                                        |
| Theme   | A defined theme           | The theme the subtree renders in.          | Every Theme.                              | Required | `component:Theme` | Stable    | TypeScript rejects other values. At runtime, any other value (a mode string such as `"light"`, a plain object, `null`) applies no theme of its own: the subtree keeps the theme around it, or Core's default tokens at the root, and no CSS is compiled from it. The server and the browser render the same markup. A development warning names the value and, for a mode string, the `mode` prop. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1 | Theme renders one wrapper with `display: contents`, so it adds no layout box, carrying `data-astryx-theme` with the theme's name and the primary text color, body font, body text size (`--text-body-size`), and body leading (`--text-body-leading`), so text inside that only inherits its size and line height takes the theme's body size and body leading.                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR2 | `mode="light"` or `"dark"` sets that `data-theme` and color scheme on the wrapper. `system` sets no `data-theme` and declares no color scheme, so the wrapper takes the scheme around it: the page root's (`light dark` from `reset.css`, or a scheme the host sets on the root or in a `<meta name="color-scheme">`; with none, the page is light) or a system Theme's above it. Under a Theme that forces `light` or `dark`, a system Theme declares `light dark`, so it follows the reader's preference again. A nested Theme sets its own wrapper's mode. A Theme given any other value still writes it unchanged to its own wrapper's `data-theme`, though nothing reads that attribute, and takes its color scheme as `system` does. | Current source and tests |
| FR3 | Descendants read the theme and mode through Theme context; the nearest Theme wins (`architecture:theme-application` INV1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests |
| FR4 | The outermost Theme writes the theme name, any forced mode, and the scheme it draws in (its forced mode or, in `system`, the one scheme the page draws in as FR2 resolves it; none while the reader's preference decides) to `<html>` and removes them on unmount; a nested Theme never changes `<html>` (`architecture:theme-application` INV2, INV7).                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests |

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

| Contract | Verification                                                                                                                                                                                                        | Representative states                                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                              | Audit section          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR1      | `Theme.test.tsx` "sets data-astryx-theme on wrapper div", "gives text inside that only inherits its size the theme's body size" and "gives text inside that only inherits its line height the theme's body leading" | any theme                                                                                                                                                                       | A missing theme attribute fails.                                                                                                                                                                                                                                             | `audit:Theme/behavior` |
| FR2, FR4 | `Theme.test.tsx` root and nested `data-theme`, `data-astryx-theme` and drawn-scheme tests                                                                                                                           | root light, dark, system; nested; unmount                                                                                                                                       | Wrong mode attributes, or a nested Theme changing `<html>`, fails.                                                                                                                                                                                                           | `audit:Theme/behavior` |
| Theme    | `Theme.test.tsx` "a theme value that is not a defined theme"                                                                                                                                                        | `"light"`, `"default"`, `"system"`, `{}`, `null`, `undefined`; root and nested; server render then hydration; a value that becomes a theme                                      | A throw, a server and browser mismatch, CSS compiled from the value, a missing warning, or a nested Theme that drops the theme around it, fails.                                                                                                                             | `audit:Theme/behavior` |
| FR2      | `ThemeColorScheme.a11y.chromium.spec.ts` with the `Core/Themes/ColorScheme` story                                                                                                                                   | system root under a host's dark root; reader light; reader dark with `reset.css`, and without it on a root that names no scheme; system under forced light; system under system | A system Theme that declares its own scheme under a host's dark root, a root that stops following the reader with `reset.css`, a root without `reset.css` that turns dark for a dark reader, or a system Theme under forced light that stays light for a dark reader, fails. | `audit:Theme/behavior` |

Read from source, with no focused test yet:

- FR1: `display: contents`, the text color, and the body font.
- FR2: the wrapper's `data-theme` for a value outside the three.
- FR3: descendants reading the nearest Theme's context.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, theme
authoring, token definitions, or compiler output. It links to their owners.
