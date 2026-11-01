---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuRadioGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSelectable.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/Menu.a11y.test.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-020]
---

# DropdownMenuRadioGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One controlled, named single-selection group of `DropdownMenuRadioItem` children with value, change callback, close policy, root inputs, and a ref.      |
| Behavior                | The group supplies selection and close-policy context; radio items emit values; the parent DropdownMenu owns keyboard navigation and menu lifecycle.     |
| End-user impact         | Assistive technology encounters one named group with exactly one current choice when a value matches, while pointer and keyboard selection stay aligned. |
| Builder impact          | Keep the value controlled, provide a stable accessible label, and place only DropdownMenuRadioItem options inside the group.                             |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                |
| Review checks           | Reject unnamed groups, local selection state, dropped root inputs, a second keyboard owner, or a close policy that bypasses the controlled callback.     |
| Governing rules         | `spec:AST-020`; `architecture:public-component-api/INV5–INV9`; `architecture:component-test-sufficiency/INV1–INV7`; `spec:AST-020/FR1,FR2,FR6`.          |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuRadioGroup renders one named `role="group"` wrapper inside the
pointer presentation of DropdownMenu. It owns controlled selection context,
close policy, root composition, and the tokenized gap between children.
DropdownMenuRadioItem owns each `menuitemradio` row and its checked state;
DropdownMenu owns focus movement, typeahead, keyboard activation, presentation,
and menu open/close lifecycle.

## Compatibility and migration

- Released default preserved: yes (`hasCloseOnSelect=true`).
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled behavior: `value` is caller-owned and `onChange` is the only commit path.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One `role="group"` root with an `aria-label` from the required `label` prop.
- Controlled `value`, `onChange`, and `hasCloseOnSelect` context for radio items.
- Composition of `children`, supported host inputs, ref, `className`, `style`, and
  `xstyle` on the group root.
- Column layout and the semantic menu inter-item gap.

**Does not own / non-goals**

- The `menuitemradio` role, `aria-checked`, disabled behavior, indicator paint,
  label, description, icon, or end content — owned by DropdownMenuRadioItem.
- Focus entry, arrow-key navigation, typeahead, Enter/Space synthesis, and menu
  close implementation — owned by DropdownMenu and shared menu hooks.
- Touch and bottom-sheet selectable-row rendering — owned by the parent presentation.
- Uncontrolled selection state or child-value registration.

## Public concepts

| Concept         | Closed values or states                       | Meaning                                                              | Default  | Owner                    | Stability | Invalid-value behavior                                |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------- | -------- | ------------------------ | --------- | ----------------------------------------------------- |
| Selection       | matching value; no matching value             | Controls which child reports checked.                                | none     | caller and radio item    | stable    | No match leaves every child unchecked.                |
| Commit          | child value                                   | Emits the selected child value through `onChange`.                   | required | group context            | stable    | Children outside the group throw from the item owner. |
| Close policy    | close; remain open                            | Controls whether an item asks DropdownMenu to close after selection. | close    | group context and parent | stable    | Omission closes.                                      |
| Accessible name | required label; optional labelledby           | Names the group; `aria-labelledby` may point at visible text.        | label    | group root               | stable    | `label` remains required by the public type.          |
| Root surface    | ref; DOM/data/ARIA; class/style/xstyle/events | Extends the group root while preserving its role and name.           | omitted  | public component API     | stable    | Accepted inputs compose; owned role and label win.    |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                              | Basis                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| FR1 | The root exposes `role="group"` and a non-empty accessible name. The required `label` supplies `aria-label`; a caller `aria-labelledby` may reference visible text.                    | `spec:AST-020`; current source and tests                     |
| FR2 | The group is controlled. It compares each radio item's value with caller `value` and emits a selected child value only through caller `onChange`; a radio item outside a group throws. | Current public API and tests                                 |
| FR3 | `hasCloseOnSelect` defaults to true. When false, a selection updates through `onChange` while the parent menu stays open.                                                              | Current behavior and tests                                   |
| FR4 | DropdownMenu is the only keyboard owner. The group adds no tab stop, key handler, typeahead, or click synthesis; it only provides context to child rows.                               | `architecture:interaction-modality`; parent tests            |
| FR5 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` reach or compose on the group root without replacing the owned role or `aria-label`.                   | `architecture:public-component-api` INV5–INV9; current tests |
| FR6 | The wrapper is a logical column whose tokenized gap matches the surrounding menu's item rhythm; it adds no component-specific directional paint or navigation.                         | Current source                                               |

### Allowed variation

- **AV1 — Children.** The number, labels, descriptions, icons, and supporting
  content of DropdownMenuRadioItem children may vary.
- **AV2 — Selection.** Any string value, including no matching value, may be
  caller-controlled without adding local group state.
- **AV3 — Root styling.** Caller style inputs may extend the wrapper while the
  role, accessible label, column flow, and child semantics remain intact.

### Representative states

| State             | Required invariant                                                         | Allowed variation                    |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| Matching value    | Exactly the matching child reports `aria-checked=true`.                    | Child content and menu size.         |
| No matching value | Every child reports `aria-checked=false`.                                  | Empty or unmatched caller value.     |
| Default close     | Selection emits the value and closes through the parent.                   | Pointer or synthesized keyboard act. |
| Retained open     | Selection emits the value, updates controlled state, and leaves menu open. | Result copy and selected child.      |
| RTL / narrow      | Column order and tokenized gap hold with no horizontal overflow.           | Parent menu placement.               |

### Transformation and precedence order

- **ORD1 — Selection.** Child activation → disabled guard in the item owner →
  group `onChange(value)` → optional parent close.
- **ORD2 — Root composition.** Base column/gap → caller `xstyle`; supported host
  inputs and class/style compose while owned role and label remain fixed.

### Performance and resources

- **PR1 — Context only.** The group memoizes a small context value and owns no
  Effect, listener, observer, timer, request, DOM read, or resource lifecycle.

## Accessibility contract

- **AR1 — Named group.** The wrapper is one named `group` inside the parent menu.
- **AR2 — Radio rows.** Child items own `menuitemradio` and `aria-checked`; the
  group does not add nested native inputs or duplicate row semantics.
- **AR3 — Keyboard ownership.** DropdownMenu owns focus collection and activation;
  the group itself never enters the tab or arrow-key sequence.

## Design relationships

| Anatomy or state | Design requirement                                               | Representation authority           | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------- | -------------- | ------------------ |
| Group wrapper    | Logical column with the menu's semantic inter-item gap.          | Current source and spacing tokens  | structural     | FR1, FR5, FR6      |
| Selected child   | One child reflects caller value through `aria-checked`.          | DropdownMenuRadioItem              | prominent      | FR2, AR2           |
| Direction/narrow | Child order and gap hold without physical-direction assumptions. | Bidirectionality and parent layout | structural     | FR6                |

No component-local visual decision is recorded.

## Family and system relationships

- `architecture:public-component-api` owns root input composition and released compatibility.
- `architecture:component-test-sufficiency` owns proportionate observable evidence.
- `architecture:interaction-modality` and DropdownMenu own keyboard behavior.
- `spec:AST-020` supplies WCAG/APG adoption and evidence-layer boundaries.

## Verification map

| Contract      | Verification                                                                                                                                                                                                    | Representative states                                | Mutation or failure expectation                                                                                                              | Audit section                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| FR1, AR1      | `DropdownMenuSelectable.test.tsx` "names and composes the group root when no value matches"                                                                                                                     | Label and caller `aria-labelledby`                   | A missing group role, `aria-label`, or caller `aria-labelledby` fails.                                                                       | `audit:DropdownMenuRadioGroup/semantics`     |
| FR2           | `DropdownMenuSelectable.test.tsx` "calls onChange with the selected value", "names and composes the group root when no value matches" (no item checked), and "throws when a radio item is used outside a group" | Matching and no matching value; item outside a group | A wrong checked row, a selection that skips `onChange`, or an item that works outside a group fails.                                         | `audit:DropdownMenuRadioGroup/behavior`      |
| FR3           | `DropdownMenuSelectable.test.tsx` "keeps the menu open while controlled selection updates when requested"                                                                                                       | `hasCloseOnSelect={false}`                           | A close despite the opt-out fails. Evidence gap: no test here asserts the default close after a selection.                                   | `audit:DropdownMenuRadioGroup/behavior`      |
| FR4, AR2, AR3 | `DropdownMenu.test.tsx` "arrow navigation reaches consumer-rendered menuitemradio and menuitemcheckbox items" and "activates a focused menuitemradio with Enter and a menuitemcheckbox with Space"              | Arrow keys and Enter on radio rows                   | A radio row the arrows skip or Enter does not activate fails. Evidence gap: no test asserts that the group adds no tab stop or key handler.  | `audit:DropdownMenuRadioGroup/accessibility` |
| FR5           | `DropdownMenuSelectable.test.tsx` "names and composes the group root when no value matches"                                                                                                                     | Ref, host attribute, class, style, handler           | A dropped ref, attribute, class, style, or handler, or a replaced role or label, fails. Evidence gap: no test asserts `xstyle` on the group. | `audit:DropdownMenuRadioGroup/api`           |
| FR6, PR1      | `apps/storybook/rtl-audit/verified-not-applicable.json` DropdownMenuRadioGroup entry. Evidence gap: no test asserts the column gap or the absence of lifecycle resources                                        | LTR and RTL                                          | A changed source hash fails the receipt.                                                                                                     | `audit:DropdownMenuRadioGroup/layout`        |

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or parent/item contracts. It links to their owners.
