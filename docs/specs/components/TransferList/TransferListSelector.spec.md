---
schema_version: 3
template_version: 7
kind: component
id: component:TransferListSelector
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, accessibility, interaction]
verified_by:
  [
    packages/core/src/TransferList/TransferListSelector.test.tsx,
    packages/core/src/TransferList/TransferListSelector.fr10.test.tsx,
    packages/core/src/TransferList/TransferList.composition.test.tsx,
    packages/core/src/__tests__/hostDataAttributes.test.tsx,
    packages/lab/src/TransferList/index.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-017, spec:AST-085, spec:AST-103]
---

# TransferListSelector component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/TransferList/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `TransferListSelector`, `TransferListSelectorProps`, and `TransferListSelectorCommitBehavior` from `@astryxdesign/core`. Props: the field props `label`, `triggerLabel`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `isLoading`, `status`, `statusVariant`, `labelTooltip`, `size`, `width`, and `placement`; a controlled `value` and `onChange`; `changeAction`; `commitBehavior`, `applyLabel`, and `cancelLabel`; `reorderable`; TransferList's content props; and `ref`, base props, `container*`, and `control*`. |
| Behavior                | A selector field whose popover holds a TransferList. By default each edit commits at once; `commitBehavior="staged"` edits a draft that Apply commits and Cancel or a dismiss discards.                                                                                                                                                                                                                                                                                                                                                                |
| End-user impact         | People choose and order the shown columns or fields from one field; while a change saves, the list stays in the tab order and refuses the next change.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Builder impact          | Keep `value` in state; choose a commit behavior; pass `changeAction` to save. A Lab import reaches the Core component.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` exports re-export the Core ones (FR7); whether they are deprecated is OQ3. `commitBehavior` (OQ1) and `applyLabel` (OQ2) wait on an owner's decision.                                                                                                                                                                                                                                                                                                                                                    |
| Review checks           | Reject a commit while a change is pending, a staged edit that reaches `onChange` before Apply, a draft that outlives a dismiss or a new `value`, root styling props, or a native `disabled` that drops the focus.                                                                                                                                                                                                                                                                                                                                      |
| Governing rules         | `component:ComplexSelector` (the field and popover); `component:TransferList` (the list); `family:input-fields` FR10; `family:overlay-dismissal`; `spec:AST-085` FR1; `spec:AST-103` FR2, FR8.                                                                                                                                                                                                                                                                                                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

TransferListSelector puts a TransferList in a selector field, for a choice
such as which table columns show and in which order. It owns when the list's
edits commit, the staged draft and its footer, and how a pending save reaches
the list. ComplexSelector owns the field, the trigger, and the popover;
TransferList owns the panels and their actions. Consumer usage lives in
`TransferListSelector.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the Core
  ones (FR7)
- Controlled/uncontrolled behavior: the value is controlled; the open state and
  the staged draft are the selector's own
- Migration decision: open (OQ3)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- When an edit commits: at once, or through the staged draft (FR2, FR3).
- The staged draft, its reset, and the Cancel and Apply footer (FR3).
- What a pending change does to the list and the footer (FR4).
- The trigger's default summary and the popover's width (FR1).

**Does not own / non-goals**

- The field chrome, the trigger, the popover, and its dismissal — owned by
  `component:ComplexSelector` and `family:overlay-dismissal`.
- The panels, the row and bulk actions, search, and reorder — owned by
  `component:TransferList`.
- Saving, retrying, and reporting a failed save — product callsite, through
  `changeAction`.
- Saved views and presets — a custom ComplexSelector around a TransferList.

## Public concepts

| Concept         | Closed values or states | Meaning                                                             | Availability by variant/orientation/state | Default     | Owner                            | Stability                      | Invalid-value behavior           |
| --------------- | ----------------------- | ------------------------------------------------------------------- | ----------------------------------------- | ----------- | -------------------------------- | ------------------------------ | -------------------------------- |
| Commit behavior | `immediate`, `staged`   | Each edit commits at once, or a draft waits for Apply.              | Always.                                   | `immediate` | `component:TransferListSelector` | Awaits an owner decision (OQ1) | TypeScript rejects other values. |
| Pending change  | idle, busy              | A `changeAction` is pending or `isLoading` is set; no edit commits. | Always.                                   | idle        | `component:TransferListSelector` | Stable                         | Not applicable.                  |
| Value           | `ReadonlyArray<T>`      | The applied values, in their order.                                 | Always; required.                         | required    | `component:TransferListSelector` | Stable                         | As `component:TransferList`.     |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------ |
| FR1 | The selector renders `component:ComplexSelector` with the field props, whose popover holds one TransferList with the same options and a hidden label. The trigger shows `triggerLabel`, else "{count} selected" for the applied value. The field and its popover share one width: `width`, else `min(41rem, calc(100vw - 32px))`.                                                                                                                      | Documented promise; current source and tests         | settled            |
| FR2 | With `commitBehavior="immediate"`, the default, each add, remove, and bulk edit calls `onChange` with the next value and then `changeAction`; each move goes to the `reorderable` object's `onReorder`. Closing the popover keeps every committed edit, and no footer renders.                                                                                                                                                                         | Documented promise; current source and tests         | human decision     |
| FR3 | With `commitBehavior="staged"`, edits and moves change a draft copied from `value`. A footer holds Cancel (`cancelLabel`, else "Cancel") and Apply (`applyLabel`, else "Apply"). Apply commits a changed draft once, through `onChange` and then `changeAction`, and closes; an unchanged draft closes without either. Cancel, Escape, and a light dismiss discard the draft. A new `value` or `commitBehavior` discards the draft in the same render. | Documented promise; current source and tests         | human decision     |
| FR4 | While a `changeAction` is pending or `isLoading` is set, the popover's content carries `aria-busy`, the list's actions are busy (`component:TransferList` FR9), the selector commits no edit or move, and Apply shows its spinner and is `aria-disabled`. No control takes native `disabled`, so the focus stays where it is.                                                                                                                          | Documented promise; current source and tests         | settled            |
| FR5 | `isDisabled` disables the trigger, the list (`component:TransferList` FR8), and Apply, each focusable (`spec:AST-085` FR1); Cancel stays available; the list's fieldset carries `aria-disabled`.                                                                                                                                                                                                                                                       | `spec:AST-085` FR1; current source and tests         | settled            |
| FR6 | The props type takes no root `xstyle`, `className`, or `style`; an untyped one is dropped with a development warning that names the selector. `ref`, DOM, and ARIA props reach the trigger; `containerXstyle`, `containerClassName`, and `containerStyle` reach the Field box; `controlXstyle`, `controlClassName`, and `controlStyle` reach the control box around the trigger (`family:input-fields` FR10).                                          | `family:input-fields` FR10; current source and tests | settled            |
| FR7 | The `@astryxdesign/lab` `TransferListSelector`, `TransferListSelectorProps`, and `TransferListSelectorCommitBehavior` exports re-export the Core ones, so a Lab import renders the Core component and takes the Core props.                                                                                                                                                                                                                            | Current source and tests                             | settled            |

### Representative states

| State           | Required invariant                                                               | Allowed variation |
| --------------- | -------------------------------------------------------------------------------- | ----------------- |
| Immediate       | Each edit commits once; no footer.                                               | —                 |
| Staged, dirty   | Edits stay in the draft; Apply commits once; Cancel and dismiss discard.         | —                 |
| Pending change  | The content is busy; the list's actions are busy and focusable; nothing commits. | —                 |
| Disabled        | Trigger, list, and Apply focusable and disabled; Cancel available.               | —                 |
| Narrow viewport | The popover is never wider than the viewport less 32px.                          | —                 |

### Transformation and precedence order

- **ORD1 — What the list shows.** The draft when staged, else the applied
  value.
- **ORD2 — Whether an edit commits.** `isDisabled`, then a pending change, then
  the commit behavior.

## Accessibility contract

- **AR1 — One field.** The trigger is the field's combobox and opens a dialog
  popover (`component:ComplexSelector`); the list inside keeps its own names
  (`component:TransferList` AR1).
- **AR2 — Busy is not disabled.** A pending change marks the content busy and
  the actions unavailable without native `disabled`, so the control a person
  just used keeps the focus (FR4).

## Design relationships

| Anatomy or state        | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ----------------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Field and trigger       | The field chrome and trigger of `component:ComplexSelector`. | Prescribed               | Prominent      | FR1                |
| Apply and Cancel footer | A ghost Cancel and a primary Apply at the popover's end.     | Current source and docs  | Supporting     | FR3                |

## Family and system relationships

- `component:ComplexSelector` owns the field, the trigger, the popover, and its
  dismissal; `family:input-fields` FR10 sets the prop targets the selector
  forwards to it.
- `component:TransferList` owns the panels; the selector tells it when a change
  is pending.
- `spec:AST-103` FR2 and FR8 make `reorderable` the selector's reorder prop.

## Verification map

| Contract | Verification                                                                                            | Representative states                                            | Mutation or failure expectation                                                                                     | Audit section                         |
| -------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1      | `TransferListSelector.test.tsx` default-label, width, and forwarding cases                              | Default; custom trigger label                                    | A wrong summary, or a field and popover of different widths, fails.                                                 | `audit:TransferListSelector/behavior` |
| FR2      | `TransferListSelector.test.tsx` immediate cases                                                         | Add; dismiss                                                     | A second commit, a missing `changeAction`, or a footer fails.                                                       | `audit:TransferListSelector/behavior` |
| FR3      | `TransferListSelector.test.tsx` staged, dismiss, and reset cases; `TransferList.composition.test.tsx`   | Apply; unchanged Apply; Cancel; Escape; light dismiss; new value | A staged edit that reaches `onChange`, a draft that survives a dismiss, or a draft painted after a new value fails. | `audit:TransferListSelector/behavior` |
| FR4, AR2 | `TransferListSelector.test.tsx` pending-change and busy cases                                           | A pending `changeAction`; `isLoading`                            | A commit while busy, an announced dropped edit, or a focus drop fails.                                              | `audit:TransferListSelector/a11y`     |
| FR5      | `TransferListSelector.test.tsx` disabled case                                                           | Disabled; disabled and staged                                    | A native `disabled`, or a commit while disabled, fails.                                                             | `audit:TransferListSelector/a11y`     |
| FR6      | `TransferListSelector.fr10.test.tsx`, the shared input-fields FR10 suite; `hostDataAttributes.test.tsx` | Base props; `container*` and `control*`; untyped root styling    | A base prop off the trigger, a part prop on the wrong element, or a missing warning fails.                          | `audit:TransferListSelector/api`      |
| FR7      | Lab `index.test.ts` identity and props-type cases                                                       | Lab imports                                                      | A Lab export that is not the Core one, or Lab props that differ from Core's, fail.                                  | `audit:TransferListSelector/api`      |

## Decision log

None recorded.

## Open questions

- **OQ1 — Is `commitBehavior`, `immediate` or `staged`, the selector's API for
  when an edit commits?** (`human-api`)
- **OQ2 — Is `applyLabel` the prop that labels the staged commit action?**
  (`human-api`)
- **OQ3 — Do the `@astryxdesign/lab` re-exports of `TransferListSelector`,
  `TransferListSelectorProps`, and `TransferListSelectorCommitBehavior` carry
  `@deprecated`, and in which release are they removed?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables or examples, ComplexSelector's
field and popover rules, or TransferList's panel rules. It links to their
owners.
