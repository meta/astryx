---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-109
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: [Selector]
---

# Clear value system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/Selector/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

Clearing a `Selector` returns it to its starting point, and the caller says
what that point is. A filter whose starting point is "Everyone" clears to
"Everyone", not to a blank field. The row that stands for the starting point
stays in the list while a search narrows it, so a person can always get back
from the list itself.

## Members

This rule applies to `Selector` only. Its value type is `string`, its clear
option (FR4) is the option whose `value` is `clearValue`, and equality is
string equality. Every other member of `family:input-fields`, including
`Typeahead`, `Tokenizer`, `MultiSelector`, and `ComplexSelector`, keeps a plain
boolean `hasClear` with no `clearValue`.

## Non-goals

- A reset concept separate from clear. There is one clear job, one prop for
  it, and `hasClear`'s `clearValue` names where it lands.
- A default value or uncontrolled mode. `Selector` is controlled and has no
  `defaultValue`.
- Search matching and query normalization. `spec:AST-056` FR4 owns the matching
  floor.
- `hasClear`'s object form on any input other than `Selector`: `Typeahead`,
  `Tokenizer`, `MultiSelector`, `ComplexSelector`, `PowerSearch`, and text,
  number, date, time, and file inputs.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Public contract

```tsx
<Selector
  label="Owner"
  hasClear={{clearValue: 'all'}}
  hasSearch
  value={owner} // string, never null
  onChange={setOwner} // (value: string) => void
  options={[
    {value: 'all', label: 'Everyone', icon: UsersIcon},
    {type: 'divider'},
    ...owners,
  ]}
/>
```

## Requirements

- **FR1 — `hasClear={{clearValue}}` is where clear lands.** `Selector`'s
  `hasClear` accepts `boolean | {clearValue: string}`. `true` behaves as it
  does today: clear reports `null`. The object form turns clear on and makes
  every clear path report `clearValue` through `onChange` and `changeAction`:
  the trigger's clear button, Delete and Backspace on the trigger, and choosing
  the clear option (FR4). `false` and absent keep their current meaning.
- **FR2 — Types follow the object form, and existing callers are unchanged.**
  With `hasClear={{clearValue}}`, `value`, `onChange`, and `changeAction` take
  `string` without `null`. With `true`, `false`, or no `hasClear`, the types
  stay exactly as shipped, including `null` under `hasClear`.
- **FR3 — At the clear value there is nothing to clear.** While the value
  equals `clearValue`, the trigger's clear button is hidden, as it is hidden
  while the value is empty today. The trigger shows the value as it shows any
  value: that option's label and icon, and `placeholder` is not shown.
- **FR4 — The clear option stays in the list.** The option whose `value`
  equals `clearValue` is the clear option. Search never hides it, including a
  query that matches nothing, where the empty-search message renders after it.
  It is not a result: result-count announcements and the empty-search state
  count matching items only. While a query is active, the default highlight
  lands on the first matching item, never on the clear option, so Enter never
  chooses it by accident; arrow keys reach it. It keeps the caller's position
  among top-level entries. A `clearValue` that matches no option pins nothing
  and warns in development.
- **FR5 — Choosing the clear option is choosing a value.** It uses the option
  row's anatomy, size, press model, touch target, theme target, and
  presentations, and closed-trigger type-to-find matches its label. Choosing it
  closes the surface and returns focus to the trigger (`component:Selector`
  FR1). The clear button returns focus as it does today.
- **FR6 — Disabled, read-only, required, and forms keep their meaning.** Clear
  stays unavailable while `Selector` is disabled or read-only
  (`component:Selector` FR6). An empty `clearValue` fails `isRequired`
  validation as an empty value does today; a non-empty one does not. With
  `htmlName`, the submitted value after clear is `clearValue`.

### Accessibility contract

- **AR1 — Name and state.** The clear option's accessible name is its label,
  and its selected state is exposed while the value equals `clearValue`. The
  clear button's accessible name and tooltip are unchanged (`family:input-fields`
  FR11).
- **AR2 — Focus.** As FR5: choosing the clear option returns focus to the
  trigger, and the clear button keeps its existing focus return.
- **AR3 — Announcement.** Clear announces nothing extra: the trigger reads the
  new value, as for any choice.
- **AR4 — Motion.** Nothing here adds motion. Each surface's own motion and
  reduced-motion behavior apply.

### Platform support

- Supported feature/engine floor: every supported browser and renderer.
  Nothing here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: type tests for FR2; DOM and accessibility-tree assertions
  for names, selected state, focus, and announcements; real-Chromium
  interaction for the press model in the popover and the bottom sheet.

## Current-state impact

- `family:input-fields` names the `{clearValue}` form of `hasClear` in its
  adoption table for `Selector` only, and cites this record. Every other
  member's `hasClear` stays a boolean.
- `component:Selector` names the clear option and FR3's clear-button rule.
- `Selector`'s `.doc.mjs` documents `hasClear`'s object form and its type
  narrowing.
- `Selector` keeps one internal clear path; its current internal name does not
  constrain the public prop.

## Verification

| Contract | Verification                                                  | Representative states                                                                 | Mutation or failure expectation                                                                                     |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR1      | `Selector` callback and Action suites                         | Clear button, Delete/Backspace, clear option; `hasClear` `true` and `{clearValue}`    | Any clear path reports something other than `clearValue` under the object form, or anything but `null` under `true` |
| FR2      | `Selector` type tests                                         | No `hasClear`; `true`; `{clearValue}`                                                 | `null` is accepted with the object form, or any shipped signature changes without it                                |
| FR3      | Trigger rendering suites                                      | Value equals `clearValue`; differs; empty                                             | The clear button shows at `clearValue`, or the trigger shows `placeholder` there                                    |
| FR4      | Search suites with live-region assertions                     | No query; matches; no match; Enter in the search input; a `clearValue` with no option | The row is filtered, counted, highlighted by default under a query, or chosen by Enter                              |
| FR5      | Interaction suites in popover and bottom sheet; real-Chromium | Pointer, touch, keyboard; type-to-find                                                | The row diverges from option-row behavior, or focus lands elsewhere                                                 |
| FR6      | Disabled, read-only, required, and form suites                | Disabled; read-only; required with empty and non-empty `clearValue`; `htmlName`       | Clear is reachable, required validation is wrong, or the submitted value differs                                    |
| AR1–AR4  | Accessibility-tree, focus, and announcement assertions        | `Selector` at and away from `clearValue`                                              | The name or state is missing, focus moves elsewhere, or an extra announcement fires                                 |

Known verification gap: none of these suites exist on `main`.

## Decision log

### DEC-1 — Going back is clear, to a value the caller names on `hasClear`

**Reference:** `spec:AST-109/DEC-1`
**Decider:** `cixzhang`, `2026-10-28`

Clear already means "go back to the starting point"; the object form of
`hasClear` lets the caller say where that is, so one job keeps one prop
(`architecture:public-component-api` INV21). The object is plain configuration
on the existing switch, not an anatomy setting (INV18), it adds no visual
boolean (INV20), and it costs nothing at runtime (INV19).

Rejected: a separate reset value or row, because it shares clear's job.
Rejected: a separate `clearValue` prop, because two props would switch one job.

### DEC-2 — The clear option is the option that holds the clear value

**Reference:** `spec:AST-109/DEC-2`
**Decider:** pending

The option already carries the clear value's label and icon, so it is the row
that stays in the list. No new entry kind or label prop exists.

Rejected: a dedicated clear entry in `options`, because it names the clear
state a second time beside the option that holds the value.

### DEC-3 — Types narrow only with the object form

**Reference:** `spec:AST-109/DEC-3`
**Decider:** `cixzhang`, `2026-10-28`

With `hasClear={{clearValue}}` `Selector` never reports `null`, so its types
say so. With any other `hasClear` value nothing changes, so the object form is
additive.

### DEC-4 — The clear value is `Selector`'s alone

**Reference:** `spec:AST-109/DEC-4`
**Decider:** `cixzhang`, `2026-10-29`

`hasClear`'s object form and the clear option belong to `Selector`, whose
filters start at a real value such as "Everyone". `Typeahead`, `Tokenizer`, and
every other input keep a plain boolean `hasClear`. `PowerSearch` is not a
selector.

Rejected: the object form across the selector family, because only `Selector`
needs clear to land on a real value.

## Open questions

- **OQ1 — Does `hasClear`'s object form extend to `MultiSelector` or
  `ComplexSelector`?** (`human-api`) Until ruled, both keep a plain boolean
  `hasClear`.
