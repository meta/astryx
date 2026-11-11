---
schema_version: 3
template_version: 7
kind: component
id: component:CheckIndicator
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, visual]
verified_by:
  [
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

# CheckIndicator component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `CheckIndicator` is exported from `@astryxdesign/core/Indicator`; `state` is required, `size` defaults to `md`, `isDisabled` defaults to `false`, and `children` may replace the built-in mark.                                                                    |
| Behavior                | The component draws a decorative check glyph only when checked. Shallow-renderable `children` replace that glyph in either state; unchecked without replacement content renders no element.                                                                        |
| End-user impact         | People receive one selection cue from the owning control without a duplicate accessible object or an empty placeholder beside unselected rows.                                                                                                                     |
| Builder impact          | Builders may replace the named `check` indicator or compose host-owned classes and styling without taking over the owning control's semantics.                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The checked glyph path drops the declared `ref`; listed under Current-state impact, with the fix open (OQ1).                                                                                             |
| Review checks           | Reject lost `aria-hidden`, a mark in the unchecked default, a missing checked mark, dropped supported DOM/styling passthrough, changed replacement precedence, a new component-owned theme target, or a checked path that still drops the ref once OQ1 is decided. |
| Governing rules         | `architecture:public-component-api/INV1,INV5,INV6,INV8,INV9`; `architecture:component-theming-surface/INV3–INV6`; `architecture:component-test-sufficiency/INV1–INV7,INV10–INV11`.                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

Render the replaceable, decorative checkmark used by a host to show that one option is chosen, without taking ownership of selection semantics, interaction, or persistent control chrome.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable; `state` is supplied by the owner
- Migration decision: none; the public component and `check` registry name remain unchanged

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The checked glyph, unchecked absence, disabled color, size mapping, replacement-content precedence, and decorative root.
- Supported neutral DOM and styling passthrough on every rendered root. The replacement-content span receives the declared ref; the checked Icon path currently does not.

**Does not own / non-goals**

- Selection role, accessible name, state, focus, keyboard, activation, or busy semantics — owned by the composing control.
- Persistent checkbox or radio chrome — owned by `component:CheckboxIndicator` or `component:Indicator`.
- Row placement and logical-edge layout — owned by the host component.
- The behavior or accessibility of consumer-supplied replacement content.

## Public concepts

| Concept             | Closed values or states     | Meaning                                                                                                                                                                     | Availability by variant/orientation/state             | Default            | Owner                      | Stability                                 | Invalid-value behavior                             |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ | -------------------------- | ----------------------------------------- | -------------------------------------------------- |
| state               | `unchecked`, `checked`      | Selects whether the built-in check glyph is absent or present.                                                                                                              | Every render path.                                    | required           | `component:CheckIndicator` | stable                                    | rejected by the public type                        |
| size                | `sm`, `md`                  | Selects the shared indicator size; both current values use the `sm` Icon glyph.                                                                                             | Checked and replacement-content roots.                | `md`               | `component:CheckIndicator` | stable                                    | rejected by the public type                        |
| disabled appearance | enabled, disabled           | Mirrors the owning control's disabled color without creating semantics.                                                                                                     | Checked and replacement-content roots.                | enabled            | `component:CheckIndicator` | stable                                    | boolean only                                       |
| replacement content | shallow renderable or empty | Replaces the built-in mark in either state when `isRenderable(children)` returns true. React elements and containers take this branch even when descendants render nothing. | Every state; replacement content creates a span root. | built-in mark path | `component:CheckIndicator` | stable; empty-container policy open (OQ2) | unsupported values follow React rendering behavior |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                    | Basis                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| FR1 | The component MUST render one decorative check glyph when `state="checked"` and no replacement content is present, and MUST set its own `aria-hidden="true"` after caller passthrough.                                                                                                                                                                       | shipped source; `architecture:public-component-api/INV5`           |
| FR2 | The default component MUST render no element when `state="unchecked"` and no replacement content is present.                                                                                                                                                                                                                                                 | shipped source, docs, tests, and stories                           |
| FR3 | Replacement uses shallow `isRenderable(children)` precedence in both states: nullish values, booleans, and the empty string keep the built-in state behavior; React elements and containers replace it even when descendants render nothing (OQ2).                                                                                                           | shipped source and regression tests                                |
| FR4 | Every rendered root MUST preserve supported DOM props, `className`, `style`, and `xstyle` while keeping component-owned accessibility precedence, and the declared ref MUST reach the rendered root (`architecture:public-component-api/INV8`). Implementation gap: the replacement-content span receives the ref, but the checked Icon path drops it (OQ1). | `architecture:public-component-api/INV5,INV6,INV8`; current source |
| FR5 | The built-in checked mark MUST remain an Icon-owned painter on the same element as host-supplied classes; CheckIndicator MUST NOT add a wrapper or a distinct public target without an approved contract change.                                                                                                                                             | shipped source; `architecture:component-theming-surface/INV3–INV5` |
| FR6 | Disabled color and replacement-content color MUST continue to use semantic tokens rather than raw color values.                                                                                                                                                                                                                                              | shipped source; current token and theming architecture             |

### Allowed variation

- **AV1 — Theme paint.** The Icon target and host-owned class may change supported paint without changing state or semantic ownership.
- **AV2 — Replacement component.** A theme may replace the named `check` indicator when the replacement preserves this public prop and decorative-ownership contract.

### Representative states

| State               | Required invariant                                                                              | Allowed variation                 |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------- |
| unchecked           | No built-in element is rendered.                                                                | A replacement component may draw. |
| checked             | One decorative check glyph is rendered.                                                         | Icon- and host-owned theme paint. |
| disabled            | Checked or replacement content keeps the requested state and uses the disabled semantic color.  | Theme-owned inactive treatment.   |
| replacement content | Shallow-renderable content replaces the built-in mark in a centered fixed-size decorative root. | Caller-owned decorative content.  |

### Transformation and precedence order

- **ORD1 — Render precedence.** Shallow replacement-content decision → unchecked absence or checked Icon → caller passthrough → component-owned `aria-hidden` → merged theme/style inputs.

### Performance and resources

- **PR1 — Pure render.** The component owns no state, Effect, listener, observer, timer, or external resource.

## Accessibility contract

- **AR1 — Decorative ownership.** Every rendered root remains `aria-hidden`; the composing control owns role, name, state, focus, keyboard, activation, and form semantics.
- **AR2 — Replacement boundary.** Replacement content is decorative within the hidden root and MUST NOT be the only semantic expression of the owning control's selected or busy state.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority                | Hierarchy role       | Component contract |
| ---------------- | ------------------------------------------------------- | --------------------------------------- | -------------------- | ------------------ |
| Chrome           | CheckIndicator intentionally owns no persistent chrome. | observed shipped representation         | not applicable       | FR2, FR5           |
| State mark       | Checked state renders the shared decorative check Icon. | Icon-owned current theming architecture | supporting state cue | FR1, FR5–FR6       |

The shared `Indicator.doc.mjs` lists anatomy and targets for CheckboxIndicator, CheckIndicator, and RadioIndicator together, so this record carries no anatomy-theming map. CheckIndicator owns no persistent chrome and delegates its built-in checked mark to Icon.

## Family and system relationships

- `architecture:component-theming-surface` owns target placement and composed-painter ownership.
- `architecture:public-component-api` owns export, passthrough, styling composition, ref, and compatibility requirements.
- `architecture:component-test-sufficiency` owns the evidence needed for each critical promise and distinct risk partition.

## Verification map

| Contract      | Verification                                                                                           | Representative states                                       | Mutation or failure expectation                                                                                                                                                                                                                                                                                               | Audit section                        |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, FR2, FR3 | `Indicator.test.tsx` CheckIndicator state and replacement cases; falsy-children cases                  | Checked, unchecked, empty scalar, visible child, `0`        | Removing the glyph, adding unchecked chrome, or choosing the wrong children branch fails.                                                                                                                                                                                                                                     | `audit:CheckIndicator/behavior`      |
| FR1, AR1      | `Indicator.test.tsx` decorative-contract cases                                                         | Glyph and replacement roots; a caller `aria-hidden={false}` | A root that a caller can expose fails. Evidence gap: no test asserts that replacement content is not the only state expression (AR2).                                                                                                                                                                                         | `audit:CheckIndicator/accessibility` |
| FR4           | `Indicator.test.tsx` "forwards caller props and styling on both render paths"                          | Both render paths                                           | A caller DOM prop that stops reaching either root, or a `className` that stops reaching the replacement span, fails. Evidence gap: no test asserts `className`, `style`, or `xstyle` on the checked-glyph path, `style` or `xstyle` on the replacement span, or the ref on either path (the checked-path ref is the FR4 gap). | `audit:CheckIndicator/api`           |
| FR5, FR6      | `themingTargets.test.ts`                                                                               | Checked glyph                                               | A rendered class absent from the documented targets fails. Evidence gap: no test asserts that no wrapper separates host classes from the Icon painter, or that disabled and replacement colors use semantic tokens.                                                                                                           | `audit:CheckIndicator/theming`       |
| ORD1, PR1     | Covered by the FR1–FR4 rows. Evidence gap: no test asserts the absence of state, effects, or listeners | —                                                           | —                                                                                                                                                                                                                                                                                                                             | `audit:CheckIndicator/behavior`      |

## Current-state impact

- **Checked-path ref (FR4).** The declared ref is `null` when CheckIndicator
  draws its checked glyph, against `architecture:public-component-api` INV8; the
  fix is OQ1.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Should CheckIndicator preserve its declared `HTMLSpanElement` ref by owning a stable span root in the checked path, or should the public ref contract change to match the Icon-owned painter?** (`human-api`) The current checked path returns `null`; either correction changes a released DOM or ref contract.
- **OQ2 — Should empty React containers continue to suppress the built-in state mark?** (`human-api`) FR3 records that they do today.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results, implementation steps, or family/system rules. It links to their owners.
