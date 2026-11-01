---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuCheckboxItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSelectable.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-020]
---

# DropdownMenuCheckboxItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One pointer-menu row that toggles an independent boolean: `label`, `description`, `icon`, `endContent`, controlled `value` and `onChange`, `isDisabled`, `hasCloseOnSelect` (default `false`), root inputs, and a ref. |
| Behavior                | The row is one `menuitemcheckbox` whose `aria-checked` is its `value`; an enabled activation reports `!value` and keeps the menu open unless asked to close; a disabled row is inert.                                  |
| End-user impact         | People toggle options without the menu closing on each change, and screen-reader users hear one checkbox per row.                                                                                                      |
| Builder impact          | Builders own the value; the row composes their click and pointer-move handlers with its own activation and hover focus.                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Enter keeping the menu open is listed under Current-state impact (OQ1).                                                                                      |
| Review checks           | Reject a nested announced checkbox, a row that closes by default, a dropped caller handler, or an activation while disabled.                                                                                           |
| Governing rules         | `spec:AST-020` FR15; `architecture:public-component-api` INV5–INV8; `architecture:interaction-modality`.                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuCheckboxItem renders one compound-mode row that toggles an
independent boolean inside the pointer presentation of DropdownMenu.
DropdownMenu owns focus movement, typeahead, keyboard click synthesis, and the
close lifecycle.

## Compatibility and migration

- Released default preserved: yes (`hasCloseOnSelect=false`).
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled/uncontrolled behavior: controlled; `value` is caller-owned.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One `role="menuitemcheckbox"` root, its `aria-checked`, label, description,
  icon, end content, disabled state, ref, supported host inputs, and styling
  inputs.
- Activation: reporting `!value`, the close policy, and composing the caller's
  click and pointer-move handlers.
- The decorative checkbox marker and the row's `dropdown-menu-item` target.

**Does not own / non-goals**

- Focus entry, roving focus, typeahead, and Enter/Space click synthesis — owned
  by `component:DropdownMenu`.
- Checkbox chrome — delegated to `component:Indicator`.
- Whether disabled rows stay keyboard-discoverable — `component:DropdownMenu`
  OQ1.

## Public concepts

| Concept       | Closed values or states | Meaning                                    | Availability      | Default     | Owner     | Stability | Invalid-value behavior        |
| ------------- | ----------------------- | ------------------------------------------ | ----------------- | ----------- | --------- | --------- | ----------------------------- |
| Checked state | `true`, `false`         | The boolean the row shows and toggles.     | Every row         | required    | caller    | stable    | Required by the public type.  |
| Close policy  | close; remain open      | Whether an enabled toggle closes the menu. | Every enabled row | remain open | component | stable    | Omission keeps the menu open. |
| Availability  | enabled; disabled       | Whether the row can activate.              | Every row         | enabled     | component | stable    | Disabled blocks activation.   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR1 | The row renders one element with `role="menuitemcheckbox"` whose `aria-checked` equals `value`; the checkbox marker is decorative (`aria-hidden`), so the row is the only announced control.                                                                                                                                                                                                                                                                                             | `spec:AST-020` FR15; current source and tests                                |
| FR2 | An enabled activation, by pointer or by the parent's synthesized Enter/Space click, calls `onChange(!value)`, then closes the menu when `hasCloseOnSelect` is set, then calls the caller's `onClick`; without `hasCloseOnSelect` the menu stays open. The APG Menu pattern's Enter closes the menu, and `spec:AST-020` FR15 requires this record to name any required part it does not adopt. Implementation gap: Enter keeps the menu open by default, and no exception is named (OQ1). | `spec:AST-020` FR15; `architecture:public-component-api` INV7; current tests |
| FR3 | A disabled row exposes `aria-disabled="true"`, renders no `tabindex`, and on activation calls neither `onChange` nor the caller's activation handlers.                                                                                                                                                                                                                                                                                                                                   | Current source and tests                                                     |
| FR4 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` reach or compose on the row root; caller `onPointerMove` composes with the row's hover focus.                                                                                                                                                                                                                                                                                                            | `architecture:public-component-api` INV5–INV8; current tests                 |
| FR5 | The marker is the shared checkbox Indicator, `sm` in a small menu; the row carries the `dropdown-menu-item` target with the menu size.                                                                                                                                                                                                                                                                                                                                                   | `architecture:component-theming-surface`; current source and tests           |
| FR6 | The row adds no key handler or tab stop of its own: enabled rows are `tabindex="-1"` for the parent's roving focus, and the parent's arrow keys skip a disabled row (`component:DropdownMenu` FR17).                                                                                                                                                                                                                                                                                     | `architecture:interaction-modality`; parent tests                            |

### Allowed variation

- **AV1 — Content.** Label, description, icon, and end content are caller
  content.
- **AV2 — Theme paint.** Themes may restyle the row and marker targets.

### Representative states

| State           | Required invariant                     | Allowed variation      |
| --------------- | -------------------------------------- | ---------------------- |
| Unchecked       | `aria-checked="false"`; marker empty.  | Content.               |
| Checked         | `aria-checked="true"`; marker checked. | Content.               |
| Close on select | An enabled toggle closes the menu.     | —                      |
| Disabled        | `aria-disabled="true"`; no activation. | Content stays visible. |

### Transformation and precedence order

- **ORD1 — Activation.** Disabled guard → `onChange(!value)` → close when
  `hasCloseOnSelect` → caller `onClick`.

### Performance and resources

- **PR1 — Shared press listeners.** The row shares the press controller's
  window and document listeners; it adds no per-row listener, observer, timer,
  or request.

## Accessibility contract

- **AR1 — One checkbox control.** The row owns `menuitemcheckbox`, its
  accessible name, checked state, focus, and activation; the marker is
  decorative.
- **AR2 — Disabled state.** A disabled row is inert.
- **AR3 — Focus visibility.** Keyboard focus paints only the menu overlay
  tint, about 1.1:1 against the menu surface in the default themes, with no
  outline, and nothing under forced colors. The shared row treatment is
  `component:DropdownMenuItem` OQ2.

## Design relationships

| Anatomy or state | Design requirement         | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------- | ------------------------ | -------------- | ------------------ |
| Row              | One full-width toggle row. | Current source           | Prominent      | FR1, FR5           |
| Marker           | Shows the checked state.   | `component:Indicator`    | Supporting     | FR1, FR5           |

The shared `DropdownMenu.doc.mjs` anatomy and `component:DropdownMenu` theming
anatomy map the row and checkbox indicator, so this record carries no
anatomy-theming map.

## Family and system relationships

- `component:DropdownMenu` owns the keyboard model and close lifecycle.
- `component:Indicator` owns the checkbox chrome.
- `architecture:public-component-api` owns root composition and handler order.

## Verification map

| Contract  | Verification                                                                                                                                                                                                                                                                                                                                                                        | Representative states                  | Mutation or failure expectation                                                                                                                       | Audit section                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR1, AR1  | `DropdownMenuSelectable.test.tsx` "keeps the checkbox indicator decorative (row is the only announced control)"; "a ref reaches the menuitemcheckbox element"                                                                                                                                                                                                                       | Checked and unchecked                  | An announced marker or a row that is not `menuitemcheckbox` fails.                                                                                    | `audit:DropdownMenuCheckboxItem/semantics`     |
| FR2, ORD1 | `DropdownMenuSelectable.test.tsx` "calls onChange with the toggled value on click", "composes the caller click handler with the checked-state change", "composes the caller click handler on keyboard activation", "closes after a successful toggle only when requested"; `DropdownMenu.test.tsx` "activates a focused menuitemradio with Enter and a menuitemcheckbox with Space" | Pointer and keyboard; close on and off | A wrong value, a dropped caller `onClick`, or a close without the opt-in fails. Evidence gap: no test asserts the `onChange`, close, `onClick` order. | `audit:DropdownMenuCheckboxItem/behavior`      |
| FR3, AR2  | `DropdownMenuSelectable.test.tsx` "does not call consumer activation handlers when disabled" and "does not toggle when disabled"                                                                                                                                                                                                                                                    | Disabled                               | A toggle or caller handler while disabled fails. Evidence gap: no test asserts the absent `tabindex`.                                                 | `audit:DropdownMenuCheckboxItem/behavior`      |
| FR4       | `DropdownMenuSelectable.test.tsx` "composes the caller pointer-move handler with menu hover focus" and "a ref reaches the menuitemcheckbox element"                                                                                                                                                                                                                                 | Ref; pointer move                      | A dropped ref or handler fails. Evidence gap: no test asserts host attributes, `className`, `style`, or `xstyle` on the row.                          | `audit:DropdownMenuCheckboxItem/api`           |
| FR5       | `DropdownMenuSelectable.test.tsx` "maps a small menu to the small shared checkbox marker"                                                                                                                                                                                                                                                                                           | Small menu                             | A marker that ignores the menu size fails. Evidence gap: no test asserts the `dropdown-menu-item` target on this row.                                 | `audit:DropdownMenuCheckboxItem/theming`       |
| FR6       | `DropdownMenu.test.tsx` "arrow navigation reaches consumer-rendered menuitemradio and menuitemcheckbox items" and "skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation"                                                                                                                                                                            | Enabled and disabled rows              | A row the arrows miss, or a disabled row they land on, fails.                                                                                         | `audit:DropdownMenuCheckboxItem/accessibility` |
| AR3, PR1  | Evidence gap: no test asserts the focus paint or the listener bound                                                                                                                                                                                                                                                                                                                 | —                                      | —                                                                                                                                                     | `audit:DropdownMenuCheckboxItem/behavior`      |

## Current-state impact

- **Focus visibility (AR3).** Keyboard focus on a checkbox row shows only an
  overlay tint about 1.1:1 against the menu surface, and no indicator in
  forced-colors mode; the shared row treatment is `component:DropdownMenuItem`
  OQ2.
- **Enter keeps the menu open (FR2).** Enter on a checkbox row toggles it and
  leaves the menu open by default, against the Menu pattern's Enter that
  `spec:AST-020` FR15 adopts, with no named exception (OQ1).

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Does a checkbox row keep the menu open on Enter as a named
  exception to the Menu pattern, or close like other rows?** (`human-api`)
  Keeping it open lets a person toggle several options in one visit; closing
  matches the pattern's Enter and the other row types.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or parent contracts. It links to their owners.
