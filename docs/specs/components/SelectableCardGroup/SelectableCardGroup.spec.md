---
schema_version: 3
template_version: 7
kind: component
id: component:SelectableCardGroup
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/SelectableCardGroup/SelectableCardGroup.test.tsx,
    packages/core/src/SelectableCardGroup/SelectableCardGroup.fr10.test.tsx,
    packages/core/src/Field/fieldInputFamily.test.tsx,
    packages/core/src/SelectableCardGroup/__tests__/SelectableCardGroupRadio.a11y.chromium.spec.ts,
    packages/core/src/SelectableCard/SelectableCardRadio.test.tsx,
    packages/lab/src/SelectableCardGroup/index.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-017, spec:AST-038, spec:AST-085]
---

# SelectableCardGroup component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/SelectableCardGroup/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SelectableCardGroup` and `SelectableCardGroupProps` from `@astryxdesign/core`. Props: `label`, `type` (`single` or `multiple`), a controlled `value` and `onChange`, `isLabelHidden`, `description`, `htmlName`, `isDisabled`, `orientation`, `children`, a `ref`, and the `container*` and `control*` styling props. |
| Behavior                | Its children are SelectableCards, each with a `value`. One choice is a Field-labelled `role="radiogroup"` of native radios: one tab stop, arrow keys that move and select, and a choice that never clears. Several choices are a labelled `role="group"` of checkboxes that toggle.                                    |
| End-user impact         | Keyboard and screen-reader users get the radio-group model for one choice, with its position spoken, and a named group of checkboxes for several. A disabled group's cards stay reachable by Tab and announce as unavailable.                                                                                          |
| Builder impact          | Render SelectableCards with a `value` inside the group, and keep `value` in state. Lab callers change the import.                                                                                                                                                                                                      |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` exports are deprecated re-exports of the Core ones for one release (FR9). INV6 gap: the `selectable-card-group` target does not reflect the disabled state (FR1).                                                                                                        |
| Review checks           | Reject a single choice that is not one tab stop, a single choice that reports `null` or deselects its card, root styling props, a group without a name, or a card in a layer that joins the group.                                                                                                                     |
| Governing rules         | `component:SelectableCard` DEC-1, FR1, FR2; `family:input-fields` FR10; `spec:AST-038` FR7, FR8; `spec:AST-085` FR1; `spec:AST-017` FR29, FR29a (lifecycle); `architecture:public-component-api` INV2, DEC-1 (`type`, the word ToggleButtonGroup uses); WAI-ARIA radio group pattern.                                  |

This table is a review projection; the body below is authoritative.

## Intent

SelectableCardGroup turns a set of SelectableCards into one form choice with
the semantics of its selection: a radio group for one choice and a group of
checkboxes for several. It owns the group's name and description, the
selection, the name the choice submits under, and the cards' layout. Each card
owns its own surface, input, and toggling (`component:SelectableCard`).
Consumer usage lives in `SelectableCardGroup.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the Core
  ones, deprecated, for one release (FR9)
- Controlled/uncontrolled behavior: controlled only; the group holds no
  selection of its own
- Migration decision: `spec:AST-017` FR29 and FR29a; Lab callers import from
  `@astryxdesign/core`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Field label and description, and the group element: its role, name,
  description, `aria-disabled`, layout, and the `selectable-card-group` target
  (FR1, FR6).
- The selection: which members are selected, and the next `value` a member's
  request produces (FR3, FR4).
- What each member reads from it: its selection, input type, input name, and
  disabled default (FR2, FR5).
- The name the group's value submits under (FR3, FR4).

**Does not own / non-goals**

- Each card's surface, hidden input, ring, toggling, and how a member renders
  what the group gives it — owned by `component:SelectableCard`.
- Label and description rendering — owned by `component:Field`.
- Requiring a choice, validation, and error messages — product callsite.
- Roving focus for several choices — not provided; each checkbox is a tab
  stop.

## Public concepts

| Concept     | Closed values or states                   | Meaning                                              | Availability by variant/orientation/state       | Default          | Owner                           | Stability | Invalid-value behavior                                                   |
| ----------- | ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ---------------- | ------------------------------- | --------- | ------------------------------------------------------------------------ |
| Type        | `single`, `multiple`                      | One choice is a radio group; several are checkboxes. | Always; fixes the `value` and `onChange` shape. | `single`         | `component:SelectableCardGroup` | Stable    | TypeScript rejects a `value` or `onChange` that does not match the type. |
| Value       | `string \| null`; `ReadonlyArray<string>` | The selected members' values.                        | Always; required.                               | required         | `component:SelectableCardGroup` | Stable    | A value no member carries selects nothing visible.                       |
| Orientation | `horizontal`, `vertical`                  | Wrapping rows of cards, or one column.               | Always.                                         | `horizontal`     | `component:SelectableCardGroup` | Stable    | TypeScript rejects other values.                                         |
| Disabled    | off, on                                   | Every member is disabled.                            | Always.                                         | off              | `component:SelectableCardGroup` | Stable    | Not applicable.                                                          |
| Form name   | a string                                  | The name the group's value submits under in a form.  | Always.                                         | a generated name | `component:SelectableCardGroup` | Stable    | Not applicable.                                                          |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                         | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| FR1 | The group renders `component:Field` with `label`, `description`, and `isLabelHidden` around one element with `role="radiogroup"` for `type="single"` and `role="group"` for `type="multiple"`. The label names the element and the description describes it, each joined with a caller's `aria-labelledby` and `aria-describedby`. The element carries the `selectable-card-group` target reflecting `orientation` and `type`. `architecture:component-theming-surface` INV6 gap: the target does not reflect the disabled state, so a theme cannot style a disabled group there. | Documented promise; WAI-ARIA radio group pattern; current source and tests    | settled            |
| FR2 | The members are the SelectableCards inside the group that carry a `value` (`component:SelectableCard` DEC-1). Each member reads from the group its selection, its input type (`radio` for `single`, `checkbox` for `multiple`), its input name, and its disabled default, and asks the group to change its selection. A card without a `value` is not a member.                                                                                                                                                                                                                   | `component:SelectableCard` DEC-1; current source and tests                    | settled            |
| FR3 | Single: every member's radio carries one page-unique generated name and leaves the form, so the set is one tab stop where the arrow keys move and select, and two groups with the same `htmlName` stay apart. Activating an unselected member calls `onChange` with its value; activating the selected member changes nothing, so the group never reports `null`. The selected, enabled member submits its value under `htmlName`, else under a generated name.                                                                                                                   | Documented promise; current source, tests, and real-browser keyboard evidence | settled            |
| FR4 | Multiple: activating an unselected member calls `onChange` with the current values and its value last; activating a selected member calls it with that value removed. Each checked, enabled member submits its value under `htmlName`, else under a generated name, and each member is its own tab stop.                                                                                                                                                                                                                                                                          | Documented promise; current source and tests                                  | settled            |
| FR5 | `isDisabled` disables every member, which stays focusable with `aria-disabled="true"` (`spec:AST-085` FR1), and sets `aria-disabled="true"` on the group element. An enabled group does not enable a member that disables itself. A disabled member selects nothing and submits nothing.                                                                                                                                                                                                                                                                                          | `spec:AST-085` FR1; documented promise; current source and tests              | settled            |
| FR6 | The members sit in wrapping rows with the `--spacing-3` gap, or in one column when `orientation="vertical"`, in DOM order.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Documented promise; current source                                            | settled            |
| FR7 | The props type takes no root `xstyle`, `className`, or `style`; an untyped one is ignored and warns in development. `containerXstyle`, `containerClassName`, and `containerStyle` reach the Field box; `controlXstyle`, `controlClassName`, and `controlStyle` reach the group element after the group's own layout styles; and `ref`, DOM, and ARIA props reach the group element (`family:input-fields` FR10).                                                                                                                                                                  | `family:input-fields` FR10; current source and tests                          | settled            |
| FR8 | Membership stops at a layer boundary: a card with a `value` in a layer opened inside the group is not a member (`spec:AST-038` FR7, FR8).                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-038` FR7, FR8; current source and tests                             | settled            |
| FR9 | The `@astryxdesign/lab` `SelectableCardGroup` and `SelectableCardGroupProps` exports re-export the Core ones, marked deprecated with static metadata, for one release, and are then removed.                                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-017` FR29, FR29a                                                    | settled            |

### Allowed variation

- **AV1 — Card content.** Each member's content and its Card props vary; the
  group places the cards and never inspects their content.

### Representative states

| State                      | Required invariant                                                            | Allowed variation |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| Single, none chosen        | Every radio unchecked; Tab lands on the first card.                           | Orientation.      |
| Single, one chosen         | That radio checked and the one tab stop; activating it again changes nothing. | —                 |
| Multiple, some chosen      | Each chosen checkbox checked; activation adds or removes one value.           | —                 |
| Member disabled            | That card focusable and inert; it submits nothing; others selectable.         | —                 |
| Group disabled             | Every card focusable and inert; the group element has `aria-disabled="true"`. | —                 |
| Two groups, one `htmlName` | Each form submits its own choice; the arrow keys stay inside each group.      | —                 |

### Transformation and precedence order

- **ORD1 — Member selection.** For a member, the group's `value`; a card's own
  `isSelected` and `onChange` are a type error beside `value`.
- **ORD2 — Member disabled.** The group disabled or the member disabled.
- **ORD3 — Submitted name.** `htmlName`, then a generated name.

### Performance and resources

- **PR1 — No resource of its own.** The group adds no listener, observer, or
  timer; the native radio group provides the keyboard model.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — One choice is a native radio group.** The members' radios share one
  name, so the set is one tab stop on the checked radio, or on the first when
  none is checked; the arrow keys move and select with wrapping, and screen
  readers speak each card's position (WAI-ARIA radio group pattern).
- **AR2 — The group is named and described.** The Field label names the group
  element and the description describes it, also when the label is visually
  hidden (FR1).
- **AR3 — Disabled stays discoverable.** A disabled group or member keeps every
  tab stop and announces as unavailable (`spec:AST-085` FR1).

## Design relationships

| Anatomy or state            | Design requirement                              | Representation authority | Hierarchy role | Component contract |
| --------------------------- | ----------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Group label and description | Field's label and helper text above the cards.  | `component:Field`        | Supporting     | FR1                |
| Cards                       | SelectableCards in wrapping rows or one column. | Current source and docs  | Prominent      | FR2, FR6           |

## Family and system relationships

- `component:SelectableCard` owns each card's surface, input, and toggling, and
  how a member renders what the group gives it (DEC-1, FR1, FR2, FR5).
- `family:input-fields` FR10 sets how a component that composes Field takes
  base props and styling; the group follows it as RadioList and CheckboxList
  do.
- `spec:AST-038` FR7 and FR8 stop the group's membership at a layer boundary.
- `spec:AST-085` FR1 keeps disabled cards focusable.
- `spec:AST-017` FR29 and FR29a set the Lab re-export's lifecycle.

## Verification map

| Contract | Verification                                                                                                                                                                   | Representative states                                                                                                                       | Mutation or failure expectation                                                                                                                                                                     | Audit section                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, AR2 | `SelectableCardGroup.test.tsx` role, name, description, caller ARIA, and `data-type` cases                                                                                     | Single and multiple; with a description; a caller's `aria-labelledby`                                                                       | A group without its role or name, a lost caller id, or a target that stops reflecting `type` fails.                                                                                                 | `audit:SelectableCardGroup/a11y`     |
| FR2, FR8 | `SelectableCardRadio.test.tsx` membership, standalone-card, and layer cases                                                                                                    | A member; a card without a `value`; a card with a `value` in a layer inside a group                                                         | A card without a `value` that joins, or a card in a layer that joins, fails.                                                                                                                        | `audit:SelectableCardGroup/behavior` |
| FR3, AR1 | `SelectableCardGroup.test.tsx` single-choice and form cases; `SelectableCardGroupRadio.a11y.chromium.spec.ts` keyboard cases                                                   | None and one chosen; Tab, Shift+Tab, arrows, Space, a click on the chosen card; two forms                                                   | A second tab stop, an arrow that does not select or wrap, a `null` report, or a form that submits another group's choice fails.                                                                     | `audit:SelectableCardGroup/a11y`     |
| FR4      | `SelectableCardGroup.test.tsx` multiple-choice case; `SelectableCardRadio.test.tsx` checkbox-member case                                                                       | Some chosen; add and remove                                                                                                                 | A wrong next list, or a checked member that does not submit its value, fails.                                                                                                                       | `audit:SelectableCardGroup/behavior` |
| FR5, AR3 | `SelectableCardGroup.test.tsx` disabled-group, member-disabled, and form cases; `SelectableCardRadio.test.tsx` disabled cases                                                  | Group disabled; one member disabled                                                                                                         | A selection while disabled, a disabled card that submits or leaves the tab order, or a group that enables a disabled member fails.                                                                  | `audit:SelectableCardGroup/a11y`     |
| FR6      | `SelectableCardGroup.stories.tsx` horizontal and vertical stories; real-browser evidence                                                                                       | Horizontal and vertical                                                                                                                     | Gap: no automated check of the gap or the wrapping.                                                                                                                                                 | `audit:SelectableCardGroup/design`   |
| FR7      | `SelectableCardGroup.test.tsx` root-styling and container cases; `SelectableCardGroup.fr10.test.tsx`, the shared input-fields FR10 suite; `fieldInputFamily.test.tsx` coverage | An untyped `className`; `container*` and `control*`; a caller `ref`, `id`, `data-*`, and `aria-describedby`; a horizontal-labels FormLayout | A root styling prop that reaches the group element, a `container*` prop that misses the Field box, a `control*` prop that misses the group element, or base props that miss the group element fail. | `audit:SelectableCardGroup/api`      |
| FR9      | Lab `index.test.ts` identity and deprecation cases                                                                                                                             | Lab imports                                                                                                                                 | A Lab export that is not the Core export, or one without the deprecation metadata, fails.                                                                                                           | `audit:SelectableCardGroup/api`      |

## Decision log

None recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, SelectableCard's
card rules, Field's label rules, or family and system rules. It links to their
owners.
