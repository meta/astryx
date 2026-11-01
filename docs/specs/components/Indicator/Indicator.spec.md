---
schema_version: 3
template_version: 7
kind: component
id: component:Indicator
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Indicator/Indicator.test.tsx,
    packages/core/src/Indicator/indicatorRegistry.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:theme-authoring-contract,
  ]
contributing: []
system_specs: []
---

# Indicator component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. `@astryxdesign/core/Indicator` exports the three built-in indicators (`CheckboxIndicator`, `CheckIndicator`, `RadioIndicator`), the shared indicator props and types, the default registry, and name-based resolution.                                       |
| Behavior                | Hosts draw a decorative control visual by name (`check`, `checkbox`, `radio`). A theme's `indicators` entry for that name replaces it in every host that resolves indicators by name; otherwise the built-in renders. Every indicator is hidden from assistive technology. |
| End-user impact         | People see one consistent mark for a chosen option, a checkbox, or a radio across the components that resolve indicators by name, and screen-reader users hear the host control's semantics, never a duplicate.                                                            |
| Builder impact          | None.                                                                                                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Three hosts render the built-ins directly instead of resolving by name; listed under Current-state impact.                                                                                                       |
| Review checks           | Reject an indicator that is exposed to assistive technology, a theme override that a host resolving by name ignores, a falsy `children` that suppresses the built-in mark, or a role or tab stop on an indicator.                                                          |
| Governing rules         | `architecture:component-theming-surface`; `architecture:public-component-api` INV5; `architecture:theme-authoring-contract`.                                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

Indicator is the shared, replaceable set of decorative control visuals: the
mark on a chosen option, the box a checkbox draws, and the circle a radio
draws. It owns the indicator names, theme replacement by name, the shared
decorative prop contract, and RadioIndicator. Consumer usage lives in
`Indicator.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; with no theme override, `check`,
  `checkbox`, and `radio` resolve to the built-ins
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable; hosts supply `state`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The core indicator names and the default registry that maps them to the
  built-ins.
- Theme replacement by name and the shared indicator prop contract.
- RadioIndicator, documented as an inline component of `Indicator.doc.mjs`,
  with the `radio-indicator` and `radio-indicator-dot` targets.
- The `indicatorScope` marker hosts put on the element whose hover drives the
  indicator's hover tint.

**Does not own / non-goals**

- CheckboxIndicator — owned by `component:CheckboxIndicator`.
- CheckIndicator — owned by `component:CheckIndicator`.
- Role, name, state, focus, keyboard, and activation of the host control —
  owned by each host (CheckboxInput, RadioList, Selector, menu rows).
- `useIndicator` and `getIndicator` as API — a public hook and function without
  their own module records; uncontracted beyond the resolution FR2 states.

## Public concepts

| Concept             | Closed values or states                                | Meaning                                           | Availability by variant/orientation/state | Default  | Owner                 | Stability | Invalid-value behavior                                              |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------- | -------- | --------------------- | --------- | ------------------------------------------------------------------- |
| Indicator name      | `check`, `checkbox`, `radio`, plus augmented names     | Which visual a host draws.                        | Always.                                   | —        | `component:Indicator` | Stable    | An augmented name no theme supplies resolves to nothing.            |
| State               | `unchecked`, `checked`, and `indeterminate` (checkbox) | The host's selection state.                       | Per indicator family.                     | required | `component:Indicator` | Stable    | TypeScript rejects values outside the family.                       |
| Size                | `sm`, `md`                                             | Indicator box size.                               | Always.                                   | `md`     | `component:Indicator` | Stable    | TypeScript rejects other values.                                    |
| Replacement content | renderable `children`                                  | Content drawn instead of the built-in state mark. | Always.                                   | none     | `component:Indicator` | Stable    | Nullish, boolean, and empty-string children keep the built-in mark. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| FR1 | The default registry maps exactly `check` → CheckIndicator, `checkbox` → CheckboxIndicator, and `radio` → RadioIndicator.                                                                                                                                                                                                                                                                                                                                                                | Current tests                                           |
| FR2 | A host resolves an indicator by name from the nearest theme: the theme's `indicators` entry for that name wins, otherwise the built-in. One override reaches every host that resolves that name. The Tokenizer bottom sheet and the Lab MobileTokenizer and MobilePowerSearch value editor render CheckboxIndicator and RadioIndicator directly, so a theme's `checkbox` or `radio` entry does not reach them. An augmented name resolves only when a theme supplies it.                 | `architecture:theme-authoring-contract`; current tests  |
| FR3 | Every built-in indicator root sets `aria-hidden="true"` after caller props, so a caller cannot expose it; the public props type rejects `role` and `tabIndex`. Indicators receive `state`, `size`, `isDisabled`, and `children` and nothing that would give them semantics.                                                                                                                                                                                                              | `architecture:public-component-api` INV5; current tests |
| FR4 | Renderable `children` replace the built-in state mark inside the indicator; nullish, boolean, and empty-string children keep it, and `0` counts as content.                                                                                                                                                                                                                                                                                                                              | Current tests                                           |
| FR5 | RadioIndicator renders one circular span (20 or 24 CSS px) whose border and fill follow the state: an emphasized border on the surface when unchecked, an accent fill when checked with an on-accent dot (8 or 10 CSS px) inside. Disabled halves the opacity and mutes the border (and the fill when unchecked). Under a hover-capable pointer, hovering the host's `indicatorScope` tints it. The dot stays visible under forced colors. Transitions are instant under reduced motion. | Current source and tests                                |
| FR6 | RadioIndicator's root carries `astryx-radio-indicator` with `data-size`, `data-checked`, and `data-disabled`; the dot carries `astryx-radio-indicator-dot` with `data-size`. No alias target is emitted. Caller props, `ref`, `className`, `style`, and `xstyle` reach the root.                                                                                                                                                                                                         | `architecture:component-theming-surface`; current tests |

### Allowed variation

- **AV1 — Replacement.** A theme may replace any named indicator with a
  component that honors FR3.
- **AV2 — Theme paint.** Themes may restyle the built-ins through their
  targets without replacing them.

### Representative states

| State             | Required invariant                                    | Allowed variation |
| ----------------- | ----------------------------------------------------- | ----------------- |
| No theme override | Built-ins render for each name.                       | —                 |
| Theme override    | Every host that resolves the name draws the override. | Override design.  |
| Radio checked     | Accent circle with dot; `data-checked`.               | Size.             |
| Falsy children    | Built-in mark still renders.                          | —                 |

### Transformation and precedence order

- **ORD1 — Resolution.** Nearest theme's `indicators[name]`, then the built-in,
  then nothing for an unsupplied augmented name.
- **ORD2 — Attributes.** Caller props, then the indicator's own `aria-hidden`.

### Performance and resources

- **PR1 — Pure render.** Indicators own no state, effect, listener, or
  observer.

## Accessibility contract

- **AR1 — Decorative.** Indicators are hidden from assistive technology; the
  host owns all semantics (FR3).
- **AR2 — Forced colors.** The radio dot stays visible under forced colors.

## Design relationships

| Anatomy or state | Design requirement                                | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Radio circle     | Emphasized border unchecked; accent fill checked. | Current source           | Supporting     | FR5, FR6           |
| Radio dot        | On-accent dot when checked.                       | Current source           | Supporting     | FR5, FR6           |

No design record governs Indicator. The checkbox and check visuals are owned by
their own records.

## Family and system relationships

- `architecture:theme-authoring-contract` owns how a theme supplies
  `indicators`.
- `component:CheckboxIndicator` and `component:CheckIndicator` own the other two
  built-ins.
- CheckboxInput, RadioListItem, Selector, and menu selection rows host
  indicators.

## Verification map

| Contract        | Verification                                                                                               | Representative states                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Audit section                   |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| FR1, FR2        | `indicatorRegistry.test.tsx`; `Indicator.test.tsx` useIndicator suite                                      | No theme; theme override; augmented names                                                                  | A wrong default, an ignored override, or a resolved unsupplied name fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `audit:Indicator/behavior`      |
| FR3             | `Indicator.test.tsx` decorative-contract suite                                                             | Each built-in in the checked state; a caller `aria-hidden={false}`; `role` and `tabIndex` as literal props | An indicator a caller can expose, a dropped ordinary prop, or an accepted literal `role` or `tabIndex` fails. Evidence gap: no test checks `aria-hidden` on the unchecked states.                                                                                                                                                                                                                                                                                                                                                                | `audit:Indicator/accessibility` |
| FR4             | `Indicator.test.tsx` falsy-children suite                                                                  | `null`, `false`, `''`, `0`, real children                                                                  | A falsy child (`false`, `null`, `undefined`, or `''`) that suppresses any built-in's mark fails, and CheckIndicator treating `0` as empty fails. Evidence gap: no test renders `0` as children of CheckboxIndicator or RadioIndicator.                                                                                                                                                                                                                                                                                                           | `audit:Indicator/behavior`      |
| FR5, FR6, AR2   | `Indicator.test.tsx` radio-dot, disabled, and target-name cases                                            | Checked and unchecked; disabled; canonical targets                                                         | A dot when unchecked, no dot when checked, a missing checked `data-checked` or disabled `data-disabled`, or an alias target fails. Evidence gap: no test asserts the radio sizes, the state colors (emphasized border, accent fill, on-accent dot), the instant transitions under reduced motion, the disabled opacity and border, the hover tint, the forced-colors dot (the RadioList forced-colors case passes on any matching rule), radio `data-size` on the root and dot, `ref`, or caller `className`, `style`, and `xstyle` on the root. | `audit:Indicator/theming`       |
| ORD1, ORD2, PR1 | Covered by the FR2 and FR3 rows. Evidence gap: no test asserts the absence of state, effects, or listeners | —                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `audit:Indicator/behavior`      |

## Current-state impact

- **Direct indicator imports (FR2).** The Tokenizer bottom sheet and the Lab
  MobileTokenizer and MobilePowerSearch value editor render CheckboxIndicator
  and RadioIndicator directly, so a theme's `checkbox` or `radio` override does
  not reach them.

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
