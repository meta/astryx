---
schema_version: 3
template_version: 7
kind: component
id: component:ToggleButtonGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility]
verified_by:
  [
    packages/core/src/ToggleButton/ToggleButton.test.tsx,
    packages/core/src/ToggleButton/__tests__/ToggleButton.a11y.test.tsx,
    packages/core/src/ToggleButton/__tests__/ToggleButton.a11y.chromium.spec.ts,
    packages/core/src/Layer/layerScopedContext.test.tsx,
  ]
modules: []
families: [family:buttons]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-085, spec:AST-038]
---

# ToggleButtonGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. ToggleButtonGroup takes `label`, `type` (`single` or `multiple`), a controlled `value` and `onChange`, `orientation`, `size`, `isDisabled`, `xstyle`, and `data-testid`.     |
| Behavior                | A labelled `role="group"` of separate ToggleButtons. Valued members show the group's selection and ask the group to toggle; the group reports the next selection through `onChange`.       |
| End-user impact         | People pick one or several options with plain toggle buttons. Each member is its own Tab stop. A disabled group's members leave the tab order.                                             |
| Builder impact          | None.                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Disabled members use native `disabled` without a tooltip, against `spec:AST-085` FR1 and FR7; listed under Current-state impact. |
| Review checks           | Reject a group without a name, a member whose pressed state disagrees with `value`, a member Action started by group activation, a wrapper shadow, or connected surfaces.                  |
| Governing rules         | `family:buttons` FR8, FR11, FR12, AV5; `spec:AST-085` FR1, FR7.                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

ToggleButtonGroup owns single or multiple selection across a set of
ToggleButtons and lays them out as separate surfaces, as `family:buttons`
assigns. Consumer usage lives in `ToggleButtonGroup.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `type="single"`,
  `orientation="horizontal"`, `isDisabled={false}`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled only; the group holds no
  selection of its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The group root: role, accessible name, layout, and the
  `toggle-button-group` target.
- Selection: which valued members are pressed, and the next selection a member
  activation requests.
- The default size and disabled state valued and unvalued members read.

**Does not own / non-goals**

- Each member's surface, `aria-pressed`, paint, and disabled rendering — owned
  by `component:ToggleButton` and `component:Button`.
- Connected geometry and a shared elevation — not provided; members are
  separate surfaces (`family:buttons` FR12).
- Roving focus — not provided; each member is a Tab stop (`family:buttons`
  AV5).
- Requiring a selection in single mode — not provided; the active member
  deselects.

## Public concepts

| Concept     | Closed values or states      | Meaning                          | Availability by variant/orientation/state | Default       | Owner                         | Stability | Invalid-value behavior                                                   |
| ----------- | ---------------------------- | -------------------------------- | ----------------------------------------- | ------------- | ----------------------------- | --------- | ------------------------------------------------------------------------ |
| Type        | `single`, `multiple`         | How many members may be pressed. | Always; fixes the `value` shape.          | `single`      | `component:ToggleButtonGroup` | Stable    | TypeScript rejects a `value` or `onChange` that does not match the type. |
| Value       | `string \| null`, `string[]` | The selected member values.      | Always; required.                         | required      | `component:ToggleButtonGroup` | Stable    | A value no member carries selects nothing visible.                       |
| Orientation | `horizontal`, `vertical`     | Row or column layout.            | Always.                                   | `horizontal`  | `component:ToggleButtonGroup` | Stable    | TypeScript rejects other values.                                         |
| Size        | `sm`, `md`, `lg`             | Default member size.             | Always; a member's own `size` wins.       | members' `md` | `family:buttons`              | Stable    | TypeScript rejects other values.                                         |
| Disabled    | off, on                      | Every member is disabled.        | Always.                                   | off           | `component:ToggleButtonGroup` | Stable    | Not applicable.                                                          |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| FR1 | The root is one element with `role="group"` and `aria-label` set to `label`, carrying `astryx-toggle-button-group`, `data-testid`, and `xstyle`. It exposes no orientation or disabled attribute of its own.                                                                                                                                                              | `family:buttons` FR11; current source and tests      |
| FR2 | Members sit in a row (or a column when vertical) separated by the `--spacing-1` gap. The wrapper paints no surface and no shadow; each member keeps its own surface and elevation.                                                                                                                                                                                        | `family:buttons` FR8, FR12; current source and tests |
| FR3 | A member whose `value` is in the selection renders pressed; every other valued member renders unpressed.                                                                                                                                                                                                                                                                  | `family:buttons` FR11; current tests                 |
| FR4 | Single mode: activating an unpressed member calls `onChange` with its value; activating the pressed member calls `onChange(null)`.                                                                                                                                                                                                                                        | Current tests                                        |
| FR5 | Multiple mode: activating an unpressed member calls `onChange` with the current values plus its value appended; activating a pressed member calls it with that value removed.                                                                                                                                                                                             | Current tests                                        |
| FR6 | Member activation only requests a selection. The pressed state changes when the caller passes the new `value`, never earlier, and no member Action or Action-pending state runs (`component:ToggleButton` FR6).                                                                                                                                                           | `family:buttons` FR11; current tests                 |
| FR7 | Members read the group's `size` as their default and its disabled state. While disabled, every member MUST be disabled under `component:ToggleButton` FR7: focusable with `aria-disabled` and inert (`spec:AST-085` FR1, FR7); an enabled group does not re-enable a member that disables itself. Implementation gap: members without a tooltip render native `disabled`. | `family:buttons` FR3, FR11; current tests            |
| FR8 | Each member is its own Tab stop in DOM order; the group adds no arrow-key handling.                                                                                                                                                                                                                                                                                       | `family:buttons` AV5; current source                 |
| FR9 | The group's selection, size, and disabled context does not reach ToggleButtons rendered inside a layer opened from a member (`spec:AST-038` FR7, FR8).                                                                                                                                                                                                                    | Current source                                       |

### Allowed variation

- **AV1 — Members.** Members are ToggleButtons; a member without `value` reads
  only the group's size and disabled state and otherwise behaves standalone.

### Representative states

| State                   | Required invariant                                            | Allowed variation       |
| ----------------------- | ------------------------------------------------------------- | ----------------------- |
| Single, none selected   | Every member unpressed; activating one requests its value.    | Orientation.            |
| Single, one selected    | That member pressed; activating it requests `null`.           | —                       |
| Multiple, some selected | Each selected member pressed; activation adds or removes one. | —                       |
| Member disabled         | That member inert; others selectable.                         | Tooltip present or not. |
| Group disabled          | Every member inert (FR7 gap for members without a tooltip).   | —                       |

### Transformation and precedence order

- **ORD1 — Member pressed state.** For a valued member, the group's selection;
  the member's own `isPressed` is ignored.
- **ORD2 — Member size.** Member `size`, then group `size`, then `md`.
- **ORD3 — Member disabled.** Group disabled or member disabled.

### Performance and resources

- **PR1 — No group listeners.** The group adds no event listener, observer, or
  measurement.

## Accessibility contract

- **AR1 — Group name.** The group exposes `role="group"` with `label` as its
  name; members keep their own names and `aria-pressed`.
- **AR2 — Keyboard.** Tab moves through members in order (FR8); each member
  activates with Enter and Space as a Button does.
- **AR3 — Disabled.** Members expose disabled per `component:Button` AR5 (FR7
  gap); the group root carries no disabled state.

## Design relationships

| Anatomy or state | Design requirement                               | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Members          | Separate ToggleButton surfaces with a small gap. | Current source           | Prominent      | FR2                |
| Group wrapper    | Layout only; no paint or shadow.                 | Current source           | Supporting     | FR2                |

No design record governs ToggleButtonGroup. Its root carries the
`toggle-button-group` target with no reflected visual props.

## Family and system relationships

- `family:buttons` assigns selection ownership, spaced layout, no wrapper
  elevation, and the toggle group's own keyboard model (FR11, FR12, AV5);
  ToggleButtonGroup adopts them.
- `component:ToggleButton` defers its pressed state and requests to the group
  for valued members (`component:ToggleButton` FR6).
- `spec:AST-085` FR7 applies to group disablement; the gap is FR7 here.

## Verification map

| Contract                     | Verification                                                                                                                                 | Representative states                                   | Mutation or failure expectation                                                                                                                                                  | Audit section                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, AR1                     | `ToggleButton.test.tsx` group role and label cases                                                                                           | Single and multiple                                     | A missing name or role fails. Evidence gap: no test asserts the root target, `data-testid`, or `xstyle`.                                                                         | `audit:ToggleButtonGroup/accessibility` |
| FR3–FR5, ORD1                | `ToggleButton.test.tsx` single and multiple suites                                                                                           | Select, switch, deselect, add, remove                   | A wrong pressed member or a wrong `onChange` payload fails.                                                                                                                      | `audit:ToggleButtonGroup/behavior`      |
| FR6                          | `ToggleButton.test.tsx` group-ownership cases                                                                                                | Members with standalone handlers and `onClick`          | A member Action runs, or pressed state moves before `value`, fails.                                                                                                              | `audit:ToggleButtonGroup/behavior`      |
| FR7, ORD3, AR3               | `ToggleButton.test.tsx` disabled suite; `ToggleButton.a11y.test.tsx`                                                                         | Member disabled; group disabled; tooltip-bearing member | A disabled member that toggles, or a re-enabled member, fails. The shared disabled states expect native `disabled`, matching the FR7 gap.                                        | `audit:ToggleButtonGroup/accessibility` |
| FR2                          | `ToggleButton.test.tsx` grouped elevation case                                                                                               | Member with its own elevation                           | A member losing its elevation inside the group fails. Evidence gap: no test asserts the spacing or the unpainted wrapper. Evidence gap: no test reads a member's painted shadow. | `audit:ToggleButtonGroup/layout`        |
| FR9 (selection)              | `layerScopedContext.test.tsx` "ends ancestor selection and callbacks while honoring explicit toggle props"                                   | Member inside a fixed Layer and an inline Dialog        | A member inside a layer that follows the outer group's selection or callbacks fails.                                                                                             | `audit:ToggleButtonGroup/behavior`      |
| FR8, FR9 (size and disabled) | Evidence gap: no test of member Tab order, or of size and disabled scoping at a layer                                                        | —                                                       | —                                                                                                                                                                                | `audit:ToggleButtonGroup/accessibility` |
| FR7 (size), ORD2, PR1        | Evidence gap: no test asserts the group size default, member size precedence, or the absence of group listeners                              | —                                                       | —                                                                                                                                                                                | `audit:ToggleButtonGroup/behavior`      |
| AR2                          | `ToggleButton.a11y.test.tsx` and `ToggleButton.a11y.chromium.spec.ts` operable and focusable facts for the single- and multiple-group states | Group members                                           | A group member that is not operable or that Tab does not reach fails.                                                                                                            | `audit:ToggleButtonGroup/accessibility` |

## Current-state impact

- **Disabled focusability (FR7).** A disabled group renders members without a
  tooltip with native `disabled`, against `spec:AST-085` FR1 and FR7 and
  `family:buttons` FR3.

## Decision log

No component-local decision. ToggleButtonGroup applies `family:buttons`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
