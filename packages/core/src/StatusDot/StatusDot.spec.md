---
schema_version: 3
template_version: 7
kind: component
id: component:StatusDot
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/StatusDot/StatusDot.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/StatusDot.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:theme-tokens,
  ]
contributing: []
system_specs: [spec:AST-009]
---

# StatusDot component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A fixed 8px status dot with a required theme-extensible `variant` and a required `label`, plus optional `isPulsing`, `tooltip`, and `icon`.                                                          |
| Behavior                | The dot is an image named by `label`; a renderable `icon` paints inside it in the variant's ink and is hidden from assistive technology; a tooltip is reachable by hover, touch, and keyboard (FR5). |
| End-user impact         | Screen-reader users hear the status without hover; sighted users see a color signal, optionally pulsing and optionally carrying a non-color mark.                                                    |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                         |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Three gaps are listed under Current-state impact.                                                                         |
| Review checks           | Reject a dot without an accessible name, a dot without a tooltip that adds its own tab stop, an icon exposed to assistive technology, a pulse that ignores reduced motion, or a second target.       |
| Governing rules         | `architecture:component-theming-surface/INV2,INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:theme-tokens/INV11`; WCAG 2.2 2.1.1.                                     |

This table is a review projection; the body below is authoritative.

## Intent

StatusDot renders a compact painted status signal — presence, health, or
severity — beside content that explains it. It owns the dot's size, tones,
optional pulse, optional inner mark, and its accessible name.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes. The dot emits only the canonical `status-dot`
  target; the `statusdot` alias is not emitted
- Controlled/uncontrolled behavior: not applicable; StatusDot holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Theme-added variant without paint (FR2).** `StatusDotVariantMap` admits
  theme-added values, but a value the active theme does not paint renders a
  transparent dot with no visible signal. The accessible name still carries
  the status. `architecture:component-theming-surface` INV14 requires an
  extensible visual axis to have a safe theme-independent baseline.
- **Tooltip not reachable by keyboard (FR5).** The dot has no tab stop, so
  Tooltip attaches no focus trigger and sighted keyboard users cannot reveal
  the tooltip text, where WCAG 2.2 2.1.1 expects functionality to be keyboard
  operable. The accessible name still carries the status.
- **Accent and neutral dots in forced colors (FR2).** The `accent` and
  `neutral` dots draw no border, so in forced-colors mode they lose their plate
  and disappear; no current record sets their treatment (OQ1). The accessible
  name still carries the status.

## Ownership boundary

**Owns**

- The painted dot, its `status-dot` theming target, and its fixed size.
- The variant's plate and ink pairing.
- The pulse and its reduced-motion suppression.
- The assistive-technology-hidden wrapper that places optional icon content
  inside the dot.
- The dot's image role and accessible name.

**Does not own / non-goals**

- The artwork supplied through `icon` — owned by the caller.
- The tooltip surface and its open triggers when `tooltip` is supplied — owned
  by Tooltip.
- A built-in icon per variant — the default dot stays childless.
- The visible label or surrounding text that explains the status — owned by
  the product callsite.
- The status dot overlaid on an avatar — owned by `component:AvatarStatusDot`.

## Public concepts

| Concept          | Closed values or states                                             | Meaning                                                             | Availability by variant/orientation/state | Default  | Owner                 | Stability | Invalid-value behavior                                                                                                                      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | -------- | --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Tone (`variant`) | `success`, `warning`, `error`, `accent`, `neutral`; theme additions | Selects the plate color and the ink an icon paints with.            | All dots                                  | Required | `component:StatusDot` | Stable    | A theme-added value is reflected on `status-dot` and keeps a safe theme-independent baseline (FR2); TypeScript rejects unregistered values. |
| Pulse            | resting; pulsing                                                    | Signals ongoing activity by fading the dot in and out.              | All tones                                 | resting  | `component:StatusDot` | Stable    | —                                                                                                                                           |
| Status icon      | present when `icon` is renderable; absent                           | Adds a non-color mark inside the dot.                               | All tones                                 | absent   | `component:StatusDot` | Stable    | `false`, `true`, `null`, `undefined`, and `''` render no icon wrapper.                                                                      |
| Tooltip          | present when `tooltip` is a non-empty string; absent                | Explains the status; reachable by hover, touch, and keyboard (FR5). | All tones                                 | absent   | `component:StatusDot` | Stable    | An empty string renders no tooltip.                                                                                                         |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | StatusDot always renders one inline-flex `span` dot, 8 by 8 CSS pixels, fully rounded, that does not shrink in a flex row, carrying the `status-dot` target and only that target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests |
| FR2 | `success`, `warning`, and `error` are strong status fills: under `architecture:theme-tokens` INV11 each paints `--color-<status>` with `--color-on-<status>` ink and keeps a visible `CanvasText` border in forced-colors mode. `accent` paints `--color-accent` with `--color-on-accent` ink, and `neutral` paints `--color-icon-secondary` with the surface color as ink; these two are not INV11 status roles, and no current record sets their forced-colors treatment (OQ1). The target reflects `variant` for every value, and an extensible tone has a safe theme-independent baseline (`architecture:component-theming-surface` INV14). Implementation gap: a theme-added value the active theme does not paint receives no component plate or ink, leaving a transparent 8px box (Current-state impact). | Current source and tests |
| FR3 | `isPulsing` animates the dot's opacity from 1 to 0.5 and back over 2 seconds, ease-in-out, indefinitely; under `prefers-reduced-motion: reduce` the animation is removed and the dot rests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR4 | A renderable `icon` renders in a wrapper centered inside the dot and filling its 8px field; it paints from `currentColor`, the variant's ink. A non-renderable value leaves the dot childless.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR5 | A non-empty `tooltip` wraps the dot in Tooltip with that text; otherwise no tooltip renders. A tooltip opens from the keyboard as well as on hover and touch (WCAG 2.2 2.1.1). Implementation gap: the dot has no tab stop, so the tooltip opens on hover and touch only (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR6 | `ref` reaches the dot. Supported DOM, ARIA, data, and event props reach the dot after its role and name; `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may change the dot's visual properties per
  `variant` through `status-dot` without changing its size, name, or anatomy.
- **AV2 — Icon artwork.** Caller-supplied artwork may vary without creating a
  separate target.

### Representative states

| State        | Required invariant                                                     | Allowed variation |
| ------------ | ---------------------------------------------------------------------- | ----------------- |
| Plain dot    | Childless image named by `label`; not focusable.                       | Tone.             |
| With icon    | Icon inside an `aria-hidden` wrapper; the dot keeps its role and name. | Artwork.          |
| Pulsing      | Opacity pulse runs; with reduced motion requested, it does not.        | Tone.             |
| With tooltip | Dot keeps its role and name; Tooltip owns the surface.                 | Tooltip text.     |

### Transformation and precedence order

- **ORD1 — Dot attributes.** `role="img"` and `aria-label` → component class and
  `data-variant` → component styles → `xstyle` → `className` → `style` →
  caller props.

### Performance and resources

- **PR1 — CSS-only motion.** The pulse is a CSS animation; StatusDot registers
  no listener, observer, or timer of its own.

## Accessibility contract

- **AR1 — Name without hover.** The dot exposes `role="img"` with `label` as its
  accessible name for every variant, with or without a tooltip or icon; a caller
  `role` or `aria-label` replaces them (FR6).
- **AR2 — Tab stop.** A dot without a tooltip is a static image and adds no
  tab stop of its own. For a dot with a tooltip, FR5 governs: the tooltip is
  reachable from the keyboard, and today the dot adds no tab stop, which is the
  FR5 gap. A caller `tabIndex` passes through (FR6).
- **AR3 — Decorative icon.** The icon wrapper is `aria-hidden`, so the label
  alone names the status.
- **AR4 — Color is not the only carrier.** The accessible name carries the
  status for assistive technology. Visually, the default dot is a color-only
  signal; a non-color mark comes from a per-status `icon` or from the
  surrounding UI, which the callsite owns.
- **AR5 — Reduced motion.** The pulse stops when the reader asks for reduced
  motion (FR3).

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority       | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Dot              | Presents the painted semantic-status signal.              | Current source and public docs | Supporting     | FR1–FR3, AR1, AR2  |
| Status icon      | Presents optional caller-supplied artwork inside the dot. | Current source and tests       | Supporting     | FR4, AR3           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Dot": {"target": "status-dot"},
  "Status icon": {"inherits": "status-dot"}
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification,
  inheritance, canonical target naming, and the extensible `variant` axis; FR2
  records the unthemed fallback.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR6 applies them to the dot.
- `architecture:theme-tokens` INV11 owns the status color roles and their
  forced-colors border, which FR2's status plates follow.

## Verification map

| Contract            | Verification                                                          | Representative states                | Mutation or failure expectation                                                                                                                                                                                                                                            | Audit section             |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1, FR6            | `StatusDot.test.tsx` render, ref, test-id, and target suites          | Every tone                           | Removing the dot, a lost ref or test id, or a second target fails. Gap: the 8px size test asserts presence only, and no test fails if the styling order (ORD1) changes; size is visible in `StatusDot.stories.tsx`.                                                        | `audit:StatusDot/anatomy` |
| FR2                 | `StatusDot.test.tsx` variant-ink suite; `extensibleAxes.test.ts`      | Warning plate and ink; map wiring    | Dropping `variant` reflection fails. The warning-ink test pins the `--color-warning` plate with `--color-on-warning` ink, and the forced-colors test asserts the compiled `CanvasText` outline. Gap: other tones' paint and the unthemed fallback have no automated check. | `audit:StatusDot/theming` |
| FR3, AR5            | `StatusDot.stories.tsx` in a browser, with and without reduced motion | Resting and pulsing                  | Gap: the pulsing unit tests assert presence only; a missing pulse or reduced-motion rule is visible only in the rendered fixture.                                                                                                                                          | `audit:StatusDot/motion`  |
| FR4, AR3            | `StatusDot.test.tsx` custom-icon suite                                | Icon, falsy values                   | Exposing the icon or rendering a wrapper for a falsy value fails.                                                                                                                                                                                                          | `audit:StatusDot/anatomy` |
| FR5, AR1, AR2       | `StatusDot.test.tsx` focusability and accessible-name suites          | Every tone, with and without tooltip | A missing name, a tab stop on a dot without a tooltip, or a name that depends on the tooltip fails. Gap: the tooltip test asserts only that the dot renders, so dropping the Tooltip wrap passes, and no test covers a caller `role` or `aria-label` override.             | `audit:StatusDot/a11y`    |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                         | Canonical anatomy and current target | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation.                                                                                                                                                                                      | `audit:StatusDot/theming` |
| AR4, PR1            | Source review; `StatusDot.stories.tsx`                                | Plain dot, dot with icon             | Gap: no automated check covers the non-color mark guidance or fails if StatusDot adds its own listener, observer, or timer.                                                                                                                                                | `audit:StatusDot/a11y`    |
| AR1, AR3            | Accessibility-tree evidence (`spec:AST-009` FR3)                      | Every tone, with icon and tooltip    | Gap: no accessibility-tree check proves the image role and name or the hidden icon; the unit tests query the DOM.                                                                                                                                                          | `audit:StatusDot/a11y`    |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — What forced-colors treatment should the `accent` and `neutral` dots
  have?** (`human-design`) They are not status roles under
  `architecture:theme-tokens` INV11, and today they render with no visible plate
  in forced-colors mode.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
