---
schema_version: 3
template_version: 7
kind: component
id: component:Spinner
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Spinner/Spinner.test.tsx,
    packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Spinner.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-017, spec:AST-020, spec:AST-086]
---

# Spinner component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | An animated ring with `size` (`sm`–`xl`), `shade`, an optional visible `label`, and five public theme variables for geometry and color.                                                                                                                                                                                                         |
| Behavior                | The ring sits in a named indicator; a visible label renders below it, and a non-empty string label names the indicator through `aria-labelledby` instead of repeating it. A standalone Spinner announces through the shared channel (AR1).                                                                                                      |
| End-user impact         | Sighted users see ongoing work; screen-reader users find a named indicator, defaulting to a translated "Loading"; readers who reduce motion see a slowed ring rather than a frozen one.                                                                                                                                                         |
| Builder impact          | Every Spinner's indicator changes from `status` to `progressbar`, including the hidden rings inside composing components, so a consumer test that queries the indicator by role changes; no prop, default or styling changes.                                                                                                                   |
| Compatibility/readiness | An accessibility fix: the role becomes `progressbar` and a standalone Spinner announces through the channel; no public prop or default changes, and app code needs no change (`spec:AST-017` FR53): a caller `role` other than `progressbar` keeps the Spinner silent, as it shipped. The remaining gaps are listed under Current-state impact. |
| Review checks           | Reject an indicator without an accessible name, a duplicated string-label name, a live role mounted already holding its text, a box that a flex host can compress, a caller `style` that overrides the box size, or a ring that stops under reduced motion.                                                                                     |
| Governing rules         | `spec:AST-086/FR2,FR8,FR11`; `spec:AST-020/FR15`; `spec:AST-017/FR53`; `architecture:component-theming-surface/INV6`; `architecture:internationalization/INV1a`; `architecture:public-component-api/INV5,INV6,INV8`.                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Spinner shows that work of unknown duration is in progress. It owns the ring's
geometry, motion, and shades, the optional visible label beneath it, and the
indicator's accessible name.

## Compatibility and migration

- Released default preserved: `yes` for every prop; the indicator's role and
  announcement change as an accessibility fix (AR1)
- Compatibility class: accessibility fix with no public prop, default, or
  styling output change; app code needs no change (`spec:AST-017` FR53)
- Shipped compatibility under FR53: a caller `role` other than `progressbar`
  keeps the Spinner silent, as it shipped, so app code that silenced a
  composed ring that way keeps working. It is not a recommended mode; new code
  hides a composed Spinner with `aria-hidden`
- Controlled/uncontrolled behavior: not applicable; Spinner holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Empty or lost name (AR1).** `aria-label=""` is used as the name, and
  `label=""` renders an empty visible Text and names the indicator from it; either
  leaves the indicator with an empty accessible name (WCAG 2.2 4.1.2). With a
  `label`, a caller `aria-labelledby` reaches the role-less wrapper instead of
  the indicator.

## Ownership boundary

**Owns**

- The indicator, the ring drawn inside it, and the optional label below
  it.
- Ring geometry per `size`, ring and track color per `shade`, the dash motion,
  and the reduced-motion rate.
- The five public theme variables and where they are declared.
- The indicator's accessible name, including the translated default.

**Does not own / non-goals**

- Whether a composing component's busy indicator is silent — owned by that
  component under `spec:AST-086` FR8. Core composers and app code hide it
  with `aria-hidden`; Typeahead, BaseTypeahead and Tokenizer, which keep
  their search indicator named, silence it through an internal,
  non-exported path.
- Content-shaped loading placeholders — owned by `component:Skeleton`.
- Determinate progress — owned by `component:ProgressBar`.
- Rich label content, when `label` is a node — owned by the caller.

## Public concepts

| Concept         | Closed values or states                                                                                              | Meaning                                                                                      | Availability by variant/orientation/state                  | Default            | Owner               | Stability | Invalid-value behavior                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ | ------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Size            | `sm`, `md`, `lg`, `xl`                                                                                               | Ring diameter 10, 14, 18, or 28px with stroke 2, 3, 3, or 4px.                               | All spinners                                               | `md`               | `component:Spinner` | Stable    | TypeScript rejects other values.                                                                        |
| Shade           | `default`, `subtle`, `onMedia`, `inherit`                                                                            | Arc and track colors for light, inline, dark-media, or inherited contexts.                   | All spinners                                               | `default`          | `component:Spinner` | Stable    | TypeScript rejects other values.                                                                        |
| Label           | absent; string; rich node                                                                                            | Visible content below the ring.                                                              | All spinners                                               | absent             | `component:Spinner` | Stable    | `null` and `undefined` mean absent.                                                                     |
| Theme variables | `--spinner-diameter`, `--spinner-stroke-width`, `--spinner-arc-fraction`, `--spinner-color`, `--spinner-track-color` | Public geometry and color seams a theme sets per `size`, per `shade`, or on the base target. | Declared on whichever element carries the `spinner` target | Per size and shade | `component:Spinner` | Stable    | A themed stroke width of `0` paints no stroke; the arc fraction applies only once the stylesheet loads. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Without a label, Spinner renders one inline-grid `span` indicator that carries the `spinner` target, ref, `data-testid`, and passthrough props. With a label, a column `div` wrapper with `--spacing-2` gap carries the target, ref, `data-testid`, passthrough props, and styling inputs; the indicator `span` and then the label render inside it.                                                                                                                              | Current source and tests |
| FR2 | The indicator's box is the ring diameter plus one stroke width on each side, set inline after the caller's `style`, so a caller `width` or `height` never resizes it while other caller styles still apply. The box does not shrink in a flex host. With no stylesheet, the box and ring draw at the size's default geometry.                                                                                                                                                     | Current source and tests |
| FR3 | The ring is an `aria-hidden` SVG of two concentric circles: a full track and an arc covering `--spinner-arc-fraction` of the circumference (0.375 by default), starting at twelve o'clock with round caps. The arc's dash moves around the stationary circle at `--duration-slow-min` per cycle, as the theme sets it before `tempo` scales it (`spec:AST-108` FR4), linear, indefinitely; under `prefers-reduced-motion: reduce` the cycle slows to 3 seconds and does not stop. | Current source and tests |
| FR4 | All mounted rings turn in the same phase, whenever each mounted. Where the browser cannot report running animations, Spinner does no phase work.                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR5 | `default` paints `--color-accent` on `--color-track`; `subtle` paints `--color-text-secondary` on `--color-track`; `onMedia` paints `--color-on-dark` on itself at track opacity 77/255; `inherit` paints `currentColor` on itself at track opacity 0.3.                                                                                                                                                                                                                          | Current source and tests |
| FR6 | The five public variables are declared only on the element carrying the `spinner` target, per `size` and `shade`, so a theme rule on that target and its `size:` or `shade:` variants overrides them; the inner indicator inherits them when a label moves the target to the wrapper.                                                                                                                                                                                             | Current source and tests |
| FR7 | A string label renders as bold body Text; a rich-node label renders as supplied.                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR8 | `xstyle` and `className` reach the element carrying the target and merge after component styles; `style` merges after them except for the indicator box's `width` and `height` (FR2).                                                                                                                                                                                                                                                                                             | Current source and tests |

### Allowed variation

- **AV1 — Theme geometry and color.** A theme may change the five public
  variables per size, per shade, or globally; the box follows the themed
  diameter and stroke.
- **AV2 — Label content.** Label text and rich content may vary.

### Representative states

| State                 | Required invariant                                                                    | Allowed variation |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| Unlabelled            | Progressbar `span` carries the target and the translated "Loading" name.              | Size, shade.      |
| String label          | Wrapper carries the target; indicator named by `aria-labelledby` to the visible Text. | Label text.       |
| Rich label            | Indicator named by `aria-label` (caller's, else "Loading"); node renders as supplied. | Node content.     |
| Explicit `aria-label` | Indicator named by that value, with or without a label.                               | —                 |
| Reduced motion        | Arc keeps moving at a 3-second cycle.                                                 | —                 |
| Narrow flex host      | Indicator box keeps its full size and overflows rather than compressing.              | —                 |

### Transformation and precedence order

- **ORD1 — Accessible name.** Without a `label`, a caller `aria-labelledby`
  reaches the indicator and names it from the referenced element. Then:
  non-empty caller `aria-label` → non-empty string `label` (by
  `aria-labelledby` when no `aria-label` is set) → translated
  `@astryx.spinner.loading` ("Loading"). An empty `aria-label` or `label`, and
  a caller `aria-labelledby` beside a `label`, are AR1 gaps.
- **ORD2 — Variable values.** Theme rule on a `size:` or `shade:` variant →
  theme rule on the base target → the component's per-size and per-shade
  defaults.
- **ORD3 — Box size.** Composed box size from the resolved diameter and stroke
  → the size's default frame when no stylesheet declares it; neither yields to
  caller `style`.

### Performance and resources

- **PR1 — Mount cost.** Mounting a Spinner causes no document-wide style
  recalculation, repeated module evaluation does not fail, and a server render
  does no browser-only work.
- **PR2 — Bounded phase work.** Rings mounted together cost one round of phase
  work, and an unmounted ring is never touched.

## Accessibility contract

- **AR1 — Announced, named indicator.** A standalone Spinner that appears after
  page load announces through the shared channel, and its element carries no
  live role or `aria-live` (`spec:AST-086` FR2, FR11); a Spinner inside a busy
  owner is silent (`spec:AST-086` FR8). The indicator has an accessible name by
  ORD1, and a visible string label is never repeated as `aria-label`. The
  indicator is an indeterminate progress indicator: `role="progressbar"` with no
  `aria-valuenow`, named as ORD1 orders it (a visible
  string label through `aria-labelledby`, never repeated as `aria-label`) (`spec:AST-020` FR15;
  OQ1, decided). A composed Spinner is silenced by hiding it with
  `aria-hidden`, as CheckboxInput, Switch, Button and most Core composers
  and app code do; Typeahead, BaseTypeahead and Tokenizer, which keep their
  search indicator named, silence it through an internal, non-exported path. A caller `role` other than
  `progressbar` also keeps it silent, as shipped compatibility under
  `spec:AST-017` FR53 (see Compatibility and migration). No public prop
  silences it. Implementation gaps: `aria-label=""` or `label=""` leaves it with an
  empty name; and with a `label`, a caller `aria-labelledby` lands on the
  role-less wrapper and names nothing.

- **AR2 — Decorative ring.** The SVG is `aria-hidden`.
- **AR3 — Translated default.** The default name comes from the translation
  catalog and follows the active locale.
- **AR4 — Reduced motion.** Motion slows under `prefers-reduced-motion:
reduce` and keeps moving, so the ring still reads as working.

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Ring             | A moving arc on a track signals indeterminate work.       | Current source           | Prominent      | FR2–FR6, AR2, AR4  |
| Label            | Optional bold text or caller content describing the work. | Current source and docs  | Supporting     | FR1, FR7, AR1      |

Theming: the element carrying the `spinner` target reflects `size` and `shade`
and declares the five public variables; the ring circles read them. The
consumer anatomy names no parts, so no anatomy-theming block is declared.

## Family and system relationships

- `spec:AST-086` owns status-announcement delivery; AR1 records how Spinner
  meets FR2 and FR11, and composing busy owners are silent under FR8.
- `architecture:component-theming-surface` owns target and variable
  qualification; FR6 records where Spinner declares its variables.
- `architecture:internationalization` owns the catalog the default name uses.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR2 and FR8 record the box-size exception to `style` precedence.

## Verification map

| Contract      | Verification                                                              | Representative states                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                      | Audit section            |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1, FR7, FR8 | `Spinner.test.tsx` render, label, and data-testid tests                   | Unlabelled, string label, rich label                           | A lost label or test id fails. Gap: in both forms no test asserts which element carries the ref, `xstyle`, and `className`, or where the target lands in the labelled form.                                                                                                                                                                                                          | `audit:Spinner/behavior` |
| FR2           | `Spinner.test.tsx` box-sizing suite; `Spinner.stories.tsx` NarrowFlexHost | Every size; caller `style` width; narrow flex host             | A caller width winning, or a lost fallback frame, fails. Gap: no automated check fails if the box shrinks in a flex host; it is visible in the story.                                                                                                                                                                                                                                | `audit:Spinner/layout`   |
| FR3, FR4, PR2 | `Spinner.test.tsx` ring suite, including the 135-degree sweep test        | SVG structure, default dash and arc fraction, frame scheduling | A lost circle, a changed default dash or arc fraction, an extra frame, or unbatched pinning fails. Gap: the start-angle test checks only for no SVG `transform` attribute, so removing the CSS start rotation passes; the cycle duration, the 3-second reduced-motion rate, the themed arc fraction, and dropping an unmounted ring from pending phase work have no automated check. | `audit:Spinner/motion`   |
| FR5, FR6      | `Spinner.test.tsx` theme-variable suite                                   | Size-, shade-, and base-scoped overrides                       | A themed variable emitted on the wrong selector fails. Gap: no test fails if the component declares its defaults on the inner span of a labelled Spinner, and the shade tests assert presence and reflection only, so the default colors and track opacities have no automated check.                                                                                                | `audit:Spinner/theming`  |
| PR1           | `Spinner.test.tsx` registration suite                                     | Import, repeated evaluation                                    | Doing the work on mount or throwing on a second evaluation fails. Gap: the suite runs only with a DOM, so server-side safety has no automated check.                                                                                                                                                                                                                                 | `audit:Spinner/behavior` |
| AR1, AR3      | `Spinner.test.tsx` naming and localization tests                          | Default, explicit, string, and rich labels                     | A missing name, a string label repeated as `aria-label`, or an untranslated default fails. The announcement suite covers once-per-appearance delivery, page-load silence, silence inside a Core owner and a caller `aria-labelledby` name. Gap: no test covers an empty `aria-label` or `label`.                                                                                     | `audit:Spinner/a11y`     |
| AR4           | `Spinner.stories.tsx` with reduced motion emulated in a browser           | Reduced motion                                                 | Gap: no automated check; a stopped ring is visible only in a rendered fixture.                                                                                                                                                                                                                                                                                                       | `audit:Spinner/motion`   |
| AR2           | Source review                                                             | Every state                                                    | Gap: no automated check fails if the ring SVG loses `aria-hidden`.                                                                                                                                                                                                                                                                                                                   | `audit:Spinner/a11y`     |
| AR1, AR2      | `StatusMessage.a11y.chromium.spec.ts` Spinner states                      | Default label and visible string label, mounted                | A changed role or name fails the accessibility-tree assertions. Gap: rich labels, empty names and the hidden ring have no accessibility-tree check; channel delivery is checked by `Spinner.test.tsx`'s announcement suite.                                                                                                                                                          | `audit:Spinner/a11y`     |

## Decision log

- **OQ1 — the role and name of a standalone Spinner without a live role.**
  Decided by `spec:AST-020` FR15: an indeterminate progress indicator,
  `role="progressbar"` with no `aria-valuenow`, named as ORD1 orders it. A composed
  indicator is silent (`spec:AST-086` FR8): hidden with `aria-hidden` by most
  Core composers and by app code, silenced through an internal path by the
  three search composers, and a caller `role` other than
  `progressbar` stays silent as shipped compatibility (`spec:AST-017` FR53);
  Spinner admits no announcement prop.

## Open questions

None open. OQ1 is decided (see the decision log).

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
