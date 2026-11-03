---
schema_version: 3
template_version: 7
kind: component
id: component:IconButton
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility]
verified_by:
  [
    packages/core/src/IconButton/IconButton.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:buttons]
design_specs: [design:reduced-motion]
architecture:
  [architecture:component-size-cascade, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-085]
---

# IconButton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. IconButton takes Button's props without `isIconOnly`, `children`, and `endContent`, and requires `icon`.                                                                                    |
| Behavior                | IconButton always renders Button's icon-only mode: a button, square by default, named by `label` through `aria-label`, with no visible text. Every other behavior is Button's.                            |
| End-user impact         | People see a compact, square-by-default action with the same feedback as any Button. Screen-reader users hear `label`. Sighted users get a visible hint only when the caller adds one.                    |
| Builder impact          | None.                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Button's disabled-focusability, reduced-motion, and self-colored-content gaps apply unchanged; all three are listed under Current-state impact. |
| Review checks           | Reject an IconButton that renders visible label text or end content, is not square with the default aspect and no `width`, loses its `aria-label`, or behaves differently from Button's icon-only mode.   |
| Governing rules         | `family:buttons` FR1, FR7, AV2, AV6; `component:Button`; `spec:AST-085` FR1, FR4; `design:reduced-motion` DR1, DR3; `architecture:component-size-cascade`; `architecture:public-component-api`.           |

This table is a review projection; the body below is authoritative.

## Intent

IconButton is the explicit icon-only projection of Button that
`family:buttons` names. It gives callers one greppable component for a compact
action that shows only an icon, without creating a second action model.
Consumer usage lives in `IconButton.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; defaults are Button's
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Fixing Button's content mode to icon-only.
- The prop surface: a required `icon`, and no `isIconOnly`, `children`, or
  `endContent`.

**Does not own / non-goals**

- Every rendered behavior: element, naming rules, size, default square geometry,
  click and `clickAction` handling, pending, disabled, link mode, tooltip,
  elevation, feedback, and the `button` theme target — owned by
  `component:Button`.
- An automatic tooltip from `label` — not provided; a caller adds `tooltip`
  (`family:buttons` AV6).
- Icon rendering — owned by `component:Icon`.

## Public concepts

| Concept        | Closed values or states | Meaning                               | Availability by variant/orientation/state                                                                           | Default  | Owner                  | Stability | Invalid-value behavior                                         |
| -------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- | --------- | -------------------------------------------------------------- |
| Icon-only mode | always on               | The icon is the only visible content. | Every variant, size, and state.                                                                                     | on       | `component:IconButton` | Stable    | TypeScript rejects `isIconOnly`, `children`, and `endContent`. |
| Icon           | caller node             | The visible glyph; required.          | Every state; hidden behind the Spinner while pending, unless it paints its own colors (`component:Button` FR8 gap). | required | `component:IconButton` | Stable    | TypeScript rejects a missing `icon`.                           |

Every other concept (variant, size, elevation, pending, availability, link
mode, width, tooltip) is Button's, with Button's defaults.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FR1 | IconButton renders exactly one Button in icon-only mode with the caller's `icon` and every other supplied prop, including `ref`. It adds no element, state, or behavior of its own.                                                                                                                                                                                                                                                                   | `family:buttons` AV2; current source                       |
| FR2 | The accessible name is `label` through `aria-label` whenever `label` is non-empty; no label text is rendered visibly.                                                                                                                                                                                                                                                                                                                                 | `family:buttons` FR1; current source and tests             |
| FR3 | With the default icon-only aspect and no caller `width`, the control is square at the resolved size with no padding. An Astryx Icon without an explicit size renders `sm` in `sm` and `md` IconButtons and `md` in `lg` ones; an explicit Icon size wins.                                                                                                                                                                                             | `family:buttons` FR7; current tests                        |
| FR4 | Variant, size, elevation, `onClick`, `clickAction`, loading, disabled, and press feedback follow `component:Button`, including its implementation gaps: disabled follows `component:Button` FR10 and, with `href`, FR11, loading follows FR8, whose Spinner MUST appear at once under reduced motion with a fine pointer (`design:reduced-motion` DR3), and press feedback follows FR15, whose press scale MUST NOT apply under reduced motion (DR1). | `component:Button`; `design:reduced-motion`; current tests |

### Allowed variation

- **AV1 — Icon content.** Any caller node may fill the icon slot; IconButton
  does not inspect it.

### Representative states

| State                | Required invariant                                             | Allowed variation           |
| -------------------- | -------------------------------------------------------------- | --------------------------- |
| At rest              | Square by default, named by `label`; icon only.                | Variant, size, theme paint. |
| Floating (elevation) | Shadow for the chosen tier on the surface.                     | Tier.                       |
| Loading              | Button's pending state: Spinner, `aria-busy`, still focusable. | Spinner delay.              |
| Disabled             | Button's disabled state (`component:Button` FR10).             | Tooltip present or not.     |

### Transformation and precedence order

- **ORD1 — Content mode.** Icon-only always; no caller prop overrides it.

### Performance and resources

- **PR1 — No added work.** IconButton adds no state, effect, listener, or
  element beyond Button's.

## Accessibility contract

- **AR1 — Name.** `label` is the only accessible name; the icon never
  substitutes for it (`family:buttons` FR1).
- **AR2 — Visible hint.** IconButton shows no visible text. A visible hint
  exists only when the caller sets `tooltip`, which also describes the button
  (`component:Button` FR12).
- **AR3 — Target size.** With the default square aspect, the smallest
  IconButton with no `width` is 28 by 28 CSS pixels, above the WCAG 2.5.8 24 by
  24 minimum. A caller `width` or theme icon-only aspect that narrows it below
  24 CSS pixels leaves target size to that caller or theme.
- **AR4 — Everything else.** Keyboard, focus indicator, loading announcement,
  and busy or disabled exposure follow `component:Button` AR2–AR5.

## Design relationships

| Anatomy or state | Design requirement                                                                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Square surface   | Button's surface at the default 1 / 1 aspect ratio, unless a caller `width` or theme aspect changes it. | Current source           | Prominent      | FR3                |
| Icon             | The only visible content, sized from the button.                                                        | Current source and tests | Prominent      | FR3                |

`design:reduced-motion` governs the press scale IconButton inherits (FR4). No
other design record governs IconButton. IconButton has no theme target of its own;
it renders Button's `button` target.

## Family and system relationships

- `family:buttons` names IconButton the explicit icon-only projection of
  Button; IconButton adopts FR1, FR7, AV2, and AV6 through Button.
- `component:Button` owns every rendered behavior IconButton shows.
- `spec:AST-085` applies through Button; the gap is recorded there.

## Verification map

| Contract             | Verification                                                                                                                                     | Representative states                                                                     | Mutation or failure expectation                                                                                                                                           | Audit section                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR2             | `IconButton.test.tsx` label, visible-text, ref, and displayName cases                                                                            | At rest                                                                                   | Visible label text, a lost `aria-label`, or a dropped ref fails.                                                                                                          | `audit:IconButton/anatomy`       |
| FR3                  | `IconButton.test.tsx` icon size cases                                                                                                            | `sm`, `md`, `lg`; explicit Icon size                                                      | A wrong default Icon size or an overridden explicit size fails.                                                                                                           | `audit:IconButton/layout`        |
| FR3 (square)         | Evidence gap: no IconButton test asserts the default square shape or zero padding                                                                | `sm`, `md`, `lg`                                                                          | —                                                                                                                                                                         | `audit:IconButton/layout`        |
| FR4                  | `IconButton.test.tsx` click, disabled, loading, and elevation cases                                                                              | Click; disabled; loading; `none` and `med` elevation                                      | A click that does not reach `onClick`, a disabled click that does, a busy IconButton without `aria-disabled`, or identical classes for two elevations fails.              | `audit:IconButton/behavior`      |
| FR4 (variant, size)  | Evidence gap: the variant and size cases assert only that a button renders                                                                       | `destructive`; `sm`                                                                       | —                                                                                                                                                                         | `audit:IconButton/behavior`      |
| FR4 (reduced motion) | Evidence gap: no test presses or loads an IconButton under `prefers-reduced-motion: reduce`; the shipped scale and Spinner fade fail this clause | Mouse and touch press; pending `clickAction` or interruptible loading with a fine pointer | A computed transform other than `none` or `scale(1)` during the press, or a Spinner opacity below 1 after loading starts.                                                 | `audit:IconButton/behavior`      |
| AR1, AR4             | `Button.a11y.test.tsx` and `Button.a11y.chromium.spec.ts` IconButton states                                                                      | IconButton at rest, disabled, loading                                                     | A missing name or a wrong focusable, operable, or unavailable state fails. The shared disabled state expects native `disabled`, matching the `component:Button` FR10 gap. | `audit:IconButton/accessibility` |
| AR2, AR3             | Evidence gap: no IconButton test asserts the tooltip hint or the 28 by 28 target                                                                 | —                                                                                         | —                                                                                                                                                                         | `audit:IconButton/accessibility` |
| ORD1, PR1            | Evidence gap: no test passes a caller `isIconOnly` or asserts that IconButton adds no work                                                       | —                                                                                         | —                                                                                                                                                                         | `audit:IconButton/behavior`      |

## Current-state impact

- **Disabled focusability (FR4).** A disabled IconButton without a tooltip
  renders native `disabled`, as `component:Button` FR10 records, against
  `spec:AST-085` FR1 and FR4. Its unit test and the shared button-pattern
  suite's disabled state both expect native `disabled`. A focused link-mode
  IconButton that becomes disabled loses focus with or without a `tooltip`,
  because its anchor is replaced by a `<button>`, as `component:Button` FR11
  records.
- **Reduced motion (FR4).** A standalone IconButton scales to 0.98 on a press,
  and the Spinner of a pending `clickAction` or an interruptible IconButton
  fades in, when the person prefers reduced motion, as
  `component:Button` FR8 and FR15 record, against `design:reduced-motion` DR1
  and DR3.
- **Self-colored icon while loading (FR4).** An icon that paints its own
  colors, such as an image or a multicolor SVG, stays visible under the
  Spinner, as `component:Button` FR8 records.

## Decision log

No component-local decision. IconButton applies `family:buttons` and
`component:Button`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
