---
schema_version: 3
template_version: 7
kind: component
id: component:CheckboxIndicator
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, visual]
verified_by:
  [
    packages/core/src/CheckboxInput/CheckboxInput.test.tsx,
    packages/core/src/Indicator/Indicator.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: []
---

# CheckboxIndicator component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CheckboxIndicator` is exported from `@astryxdesign/core/Indicator`; `state` is required, `size` defaults to `md`, `isDisabled` defaults to `false`, and `children` may replace the built-in mark. |
| Behavior                | A decorative checkbox chrome is always rendered. Checked and indeterminate states draw their matching mark unless the shallow `isRenderable()` predicate treats `children` as replacement content. |
| End-user impact         | People receive one visible checkbox-state cue while the owning control retains all semantics, focus, keyboard, and activation behavior.                                                            |
| Builder impact          | Builders may restyle the canonical targets or replace the named indicator without taking over the owning control's semantics.                                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Only the canonical `checkbox-indicator` target is emitted.                                                                               |
| Review checks           | Reject lost `aria-hidden`, missing state marks, dropped passthrough/ref/styling, changed replacement precedence, or a second target alias on the root.                                             |
| Governing rules         | `architecture:public-component-api/INV1,INV5,INV6,INV8,INV9`; `architecture:component-theming-surface/INV3–INV8,INV12`; `architecture:component-test-sufficiency/INV1–INV7,INV10–INV11`.           |

This table is a review projection; the body below is authoritative.

## Intent

Render the replaceable, decorative visual that communicates a checkbox owner's unchecked, checked, or indeterminate state without taking ownership of checkbox semantics or interaction.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable; `state` is supplied by the owner
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Decorative checkbox chrome, state mark, disabled appearance, size, replacement-content precedence, and component theming targets.
- A root DOM ref plus supported neutral DOM and styling passthrough.

**Does not own / non-goals**

- Checkbox role, accessible name, focus, keyboard, activation, form participation, or busy semantics — owned by the composing control.
- Row placement and logical-edge layout — owned by the host component.
- The behavior or accessibility of consumer-supplied replacement content.

## Public concepts

| Concept             | Closed values or states                 | Meaning                                                                                                                                                       | Availability by variant/orientation/state | Default            | Owner                         | Stability                                 | Invalid-value behavior                             |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------ | ----------------------------- | ----------------------------------------- | -------------------------------------------------- |
| state               | `unchecked`, `checked`, `indeterminate` | Chooses the built-in visual state.                                                                                                                            | All render paths.                         | required           | `component:CheckboxIndicator` | stable                                    | rejected by the public type                        |
| size                | `sm`, `md`                              | Selects the 20px or 24px visual box and matching mark geometry.                                                                                               | All states.                               | `md`               | `component:CheckboxIndicator` | stable                                    | rejected by the public type                        |
| disabled appearance | enabled, disabled                       | Mirrors the owning control's disabled presentation without creating semantics.                                                                                | All states.                               | enabled            | `component:CheckboxIndicator` | stable                                    | boolean only                                       |
| replacement content | shallow renderable or empty             | Replaces both built-in marks when `isRenderable(children)` returns true. React elements and containers take this branch even when descendants render nothing. | All states.                               | built-in mark path | `component:CheckboxIndicator` | stable; empty-container policy open (OQ1) | unsupported values follow React rendering behavior |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                           | Basis                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| FR1 | The component MUST render one decorative span chrome in every state and MUST set its own `aria-hidden="true"` after caller passthrough.                                                                                             | shipped source; `architecture:public-component-api/INV5`           |
| FR2 | `unchecked` MUST show no built-in mark, `checked` MUST show the checkmark, and `indeterminate` MUST show the dash.                                                                                                                  | shipped source, docs, tests, and stories                           |
| FR3 | Replacement uses shallow `isRenderable(children)` precedence: nullish values, booleans, and the empty string keep the state mark; React elements and containers replace it even when descendants render nothing (OQ1).              | shipped source and regression tests                                |
| FR4 | The root MUST preserve supported DOM props, `ref`, `className`, `style`, and `xstyle` while keeping component-owned accessibility precedence.                                                                                       | `architecture:public-component-api/INV5,INV6,INV8`                 |
| FR5 | The root target MUST be `checkbox-indicator`, the only target on that element; no alias target is emitted.                                                                                                                          | `architecture:component-theming-surface/INV4,INV6`; current tests  |
| FR6 | Size, checked or indeterminate (`data-checked`), and disabled state MUST be reflected on the root target; the check and dash MUST retain their dedicated `checkbox-indicator-check` and `checkbox-indicator-dash` painting targets. | shipped source; `architecture:component-theming-surface/INV4,INV6` |
| FR7 | State transitions MUST honor reduced motion, and checked/indeterminate marks MUST remain perceivable in forced-colors mode.                                                                                                         | shipped source and WCAG 2.2 1.4.11                                 |

### Allowed variation

- **AV1 — Theme paint.** Tokens and canonical component targets may change color, border, radius, opacity, and other admitted visual properties without changing state or semantic ownership.
- **AV2 — Replacement component.** A theme may replace the named checkbox indicator when the replacement preserves this public prop and decorative-ownership contract.

### Representative states

| State               | Required invariant                                                                          | Allowed variation                |
| ------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| unchecked           | Chrome remains visible with no built-in mark.                                               | Theme-owned paint and shape.     |
| checked             | Chrome and checkmark remain visible.                                                        | Theme-owned paint and shape.     |
| indeterminate       | Chrome and dash remain visible.                                                             | Theme-owned paint and shape.     |
| disabled            | The requested state remains legible with muted treatment and no host-driven hover response. | Theme-owned inactive treatment.  |
| replacement content | Shallow-renderable content replaces both built-in marks inside the same chrome.             | Caller-owned decorative content. |

### Transformation and precedence order

- **ORD1 — Render precedence.** Caller passthrough → component-owned `aria-hidden` → merged theme/style inputs → shallow replacement-content decision → built-in state mark.

### Performance and resources

- **PR1 — Pure render.** The component owns no state, Effect, listener, observer, timer, or external resource.

## Accessibility contract

- **AR1 — Decorative ownership.** The root remains `aria-hidden`; the composing control owns role, name, state, focus, keyboard, activation, and form semantics.
- **AR2 — Forced colors.** Checked and indeterminate marks remain distinguishable when author colors are forced.
- **AR3 — Replacement boundary.** Replacement content is decorative within the hidden root and MUST NOT be the only semantic expression of the owning control's state.

## Design relationships

| Anatomy or state   | Design requirement                                  | Representation authority                   | Hierarchy role            | Component contract |
| ------------------ | --------------------------------------------------- | ------------------------------------------ | ------------------------- | ------------------ |
| Chrome             | Semantic theme tokens and canonical painting target | prescribed by current theming architecture | supporting control visual | FR1, FR5–FR7       |
| Checkmark          | Visible checked-state mark                          | observed shipped representation            | supporting state cue      | FR2, FR6–FR7       |
| Indeterminate mark | Visible partial-state mark                          | observed shipped representation            | supporting state cue      | FR2, FR6–FR7       |

The shared `Indicator.doc.mjs` lists anatomy and targets for CheckboxIndicator, CheckIndicator, and RadioIndicator together, so this record carries no anatomy-theming map.

## Family and system relationships

- `architecture:component-theming-surface` owns target placement and reflected state.
- `component:Indicator` owns the registry name `checkbox` and theme replacement.
- `architecture:public-component-api` owns export, passthrough, styling composition, ref, and compatibility requirements.
- `architecture:component-test-sufficiency` owns the evidence needed for each critical promise and distinct risk partition.

## Verification map

| Contract  | Verification                                                                                                                                                                                                              | Representative states                                                  | Mutation or failure expectation                                                                                                                                                                                                                                                                                                             | Audit section                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, AR1  | `Indicator.test.tsx` decorative-contract cases                                                                                                                                                                            | Checked state; a caller `aria-hidden={false}`                          | A checked indicator that a caller can expose fails. Evidence gap: no test checks `aria-hidden` in the unchecked or indeterminate state, or that replacement content is not the only state expression (AR3).                                                                                                                                 | `audit:CheckboxIndicator/accessibility` |
| FR2, FR3  | `Indicator.test.tsx` default-indicator, replacement, and falsy-children cases                                                                                                                                             | Checked with falsy and real children; checked with a replacement child | A removed checkmark element, a falsy child that suppresses it, or real children that do not replace it fails. Evidence gap: no test looks for the dash element, and since both marks render in every state with their display toggled, no test asserts which mark is visible in each state.                                                 | `audit:CheckboxIndicator/behavior`      |
| FR4       | `Indicator.test.tsx` decorative-contract "still forwards ordinary props" cases                                                                                                                                            | Neutral DOM props                                                      | A dropped `data-testid`, `id`, or `dir` fails. Evidence gap: no test asserts `ref`, `className`, `style`, or `xstyle` on the root.                                                                                                                                                                                                          | `audit:CheckboxIndicator/api`           |
| FR5, FR6  | `Indicator.test.tsx` checkbox-target and canonical-target cases; `themingTargets.test.ts`                                                                                                                                 | Indeterminate at `sm`; canonical target                                | A missing or aliased `checkbox-indicator` target, or a missing `data-checked="indeterminate"` or `data-size`, fails. Evidence gap: no test asserts `data-checked` in the checked state, checkbox `data-disabled` (the disabled-state case renders RadioIndicator), or the `checkbox-indicator-check` and `checkbox-indicator-dash` targets. | `audit:CheckboxIndicator/theming`       |
| FR7, AR2  | `CheckboxInput.test.tsx` forced-colors cases ("compiles a forced-colors fill so the indeterminate mark survives Windows High Contrast", "compiles a forced-colors color so the checkmark survives Windows High Contrast") | Checked and indeterminate under forced colors                          | Evidence gap: the forced-colors cases pass on any matching injected rule, so removing the checkmark and dash `CanvasText` rules still passes; no test asserts the reduced-motion transition.                                                                                                                                                | `audit:CheckboxIndicator/visual`        |
| ORD1, PR1 | Covered by the FR1–FR4 rows. Evidence gap: no test asserts the absence of state, effects, or listeners                                                                                                                    | —                                                                      | —                                                                                                                                                                                                                                                                                                                                           | `audit:CheckboxIndicator/behavior`      |

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Should an empty React container in `children` keep suppressing the
  built-in state mark?** (`human-api`) FR3 records that it does today.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results, implementation steps, or family/system rules. It links to their owners.
