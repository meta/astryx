---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-117
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-11-12
phase: accepted
owners: [nynexman4464]
affects_architecture: []
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs:
  [DateInput, DateTimeInput, TimeInput, NumberInput, FormLayout]
---

# Entry error behavior system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/DateInput/useTypedDate.ts",
    "packages/core/src/DateInput/DateInput.tsx",
    "packages/core/src/DateInput/NativeDateField.tsx",
    "packages/core/src/DateTimeInput/**",
    "packages/core/src/TimeInput/**",
    "packages/core/src/NumberInput/**",
    "packages/core/src/FormLayout/**",
    "packages/core/src/Field/useEntryErrorBehavior.ts",
    "packages/core/src/PowerSearch/PowerSearchValueEditor.tsx",
    "packages/core/src/Table/plugins/filtering/useTableFiltering.tsx",
    "packages/core/src/Pagination/Pagination.tsx"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An input that checks its own entries reveals a rejected entry at a moment the
builder chooses, for a whole form or for one field: when the input reveals it
by default, or only when the person commits the entry with Enter or by leaving
the field. A form that checks its fields on blur can then hold an input's own
rejections to the same moment. Under the commit choice, the visible message,
the invalid state, and the screen-reader announcement appear together and
clear together.

## Members

The rule applies to the four members of `family:input-fields` that reject
entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. `FormLayout` sets a form-wide default for them. Members that
reject nothing themselves, such as `TextInput`, `Selector`, and
`DateRangeInput`, whose dates come only from a Calendar that disables
unreachable days, take no entry error behavior.

## Non-goals

- Which entries a member rejects, when it reveals a rejection under
  `'complete'`, which signals a rejection has, and what a commit does with a
  rejected entry. Each member's record owns them.
- Caller validation. A caller's `status`, `isRequired`, and form-library rules
  keep their own timing; this record governs only the rejections a member makes
  itself.
- Native constraint validation in the browser, such as `required` and
  `:invalid`.
- Rejection wording. Each member's record and `spec:AST-111` AR3 own the
  messages; `spec:AST-086` owns their delivery.
- The `onChange` timing of typed entry, which each member's record owns
  (`spec:AST-111` FR12 for dates).
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
<FormLayout defaultEntryErrorBehavior="blur-or-enter">
  <DateInput label="Start" value={start} onChange={setStart} max="2026-12-31" />
  <NumberInput
    label="Seats"
    value={seats}
    onChange={setSeats}
    min={1}
    max={40}
  />
  <TimeInput
    label="Arrival"
    value={arrival}
    onChange={setArrival}
    entryErrorBehavior="complete" // this field's own prop wins
  />
</FormLayout>
```

```ts
type EntryErrorBehavior = 'complete' | 'blur-or-enter';
```

## Requirements

### Terms

- A **rejection** is a member's own refusal of an entry, as its record defines
  it: a date the calendar does not have, unreadable or incomplete date text, a
  time or number that does not parse, a fractional number in an integer-only
  field, or a value outside `min`, `max`, or `dateConstraints`.
- The **signals** of a rejection are the ones its member's record gives it: a
  visible message, `aria-invalid`, invalid styling of the entry's text, and an
  announcement.
- A **commit** is Enter in the field or blur, focus leaving the field.

### Behavior

- **FR1 — Each member takes `entryErrorBehavior`.** `DateInput`,
  `DateTimeInput`, `TimeInput`, and `NumberInput` accept an optional
  `entryErrorBehavior` of `'complete'` or `'blur-or-enter'`. One value governs every
  surface and segment of the field: typed text, the native control, and
  `DateTimeInput`'s date and time segments. The type of the value is exported as
  `EntryErrorBehavior`. The prop sets when a member reveals its own entry
  errors, the rejections that `onEntryErrorChange` reports where a member has
  it; validation itself runs on every edit under both values.
- **FR2 — The form sets a default and the field wins.** `FormLayout` accepts an
  optional `defaultEntryErrorBehavior` of the same type. A member resolves its
  behavior from its own `entryErrorBehavior`, else the nearest `FormLayout`'s
  `defaultEntryErrorBehavior`, else `'complete'`. `FormLayout` provides the
  default as it provides `defaultOptionality` (`component:FormLayout` FR4): a
  nested `FormLayout` replaces it for its own descendants, an unset nested value
  included, and content in a layer opened inside a `FormLayout` starts without
  it (`spec:AST-038` FR7, FR8).
- **FR3 — `'complete'` is each member's shipped behavior.** Under
  `'complete'`, a member reveals each rejection when, and with the signals,
  its own record states, and nothing in this record changes that. A field
  with no `entryErrorBehavior` and no `FormLayout` default behaves the same
  way.
- **FR4 — `'blur-or-enter'` holds every signal until commit.** Under `'blur-or-enter'`, while
  a person types or edits, a member shows, marks, styles, and announces no
  rejection of its own. At Enter or blur, it reveals the rejection that the
  entry has at that moment, with every signal its record gives that rejection
  appearing together and the announcement made once. A value that a native date
  or time control reports is held to the next Enter or blur in the same way. A
  member that reports its rejections to the caller, as DateInput and
  DateTimeInput do through `onEntryErrorChange`, reports a rejection when it
  reveals it, so a caller `error` status that the report drives appears at the
  same commit; it reports a cleared rejection at once (FR5).
  When the member's record drops the rejected entry at that commit, the member
  announces the rejection once at that commit and then drops the entry as its
  record states.
- **FR5 — A rejection clears as soon as the entry is valid.** Under both
  values, an edit that makes the entry a value the member accepts, or empties
  it, clears the rejection's signals at once, without a commit. Under
  `'blur-or-enter'`, an edit that leaves the entry rejected keeps the revealed
  rejection and does not announce it again; the next commit reveals the entry's
  current rejection. A new `value` or a pick that replaces the entry, as the
  member's record states, clears its rejection.
- **FR6 — Locked fields reveal no rejection.** While a member is disabled, or
  busy where its record blocks edits (`component:DateInput` FR12,
  `component:DateTimeInput` FR9 and FR13), it reveals no rejection of its own
  (`spec:AST-085` FR2). Once it is editable, its entry error behavior applies
  again. A busy member whose record keeps it editable keeps revealing
  rejections under its entry error behavior.
- **FR7 — Compositions keep the default.** `PowerSearch`'s value editors,
  Table's filter editors, and `Pagination`'s page input render members with
  `'complete'` and expose no entry error behavior prop. A `FormLayout` around
  them does not change it.

### Accessibility contract

- **AR1 — Nothing before commit under `'blur-or-enter'`.** Under `'blur-or-enter'`, no
  rejection is marked or announced before Enter or blur (FR4).
- **AR2 — One announcement per revealed rejection.** Each rejection that a
  commit reveals is announced once, at the urgency `spec:AST-086` FR5 gives an
  error, and where a message shows, the announced words match the shown words
  (`spec:AST-086` FR7).
- **AR3 — A dropped entry is still explained.** Under `'blur-or-enter'`, a member that
  drops a rejected entry at commit still announces why (FR4), so a person
  learns that the entry was not accepted (WCAG 2.2 3.3.1).

### Compatibility

Classified under `spec:AST-017` against the latest stable release:

- `entryErrorBehavior` and `defaultEntryErrorBehavior` are new optional props,
  and their default, `'complete'`, is each member's shipped behavior (FR3), so
  usage that sets neither is unchanged: additive (`spec:AST-017` FR5;
  `architecture:public-component-api` INV3).
- `'blur-or-enter'` applies only where a caller sets it. It makes Enter reveal
  a held native time rejection in `TimeInput` and in `DateTimeInput`'s time
  segment, which reveal it at once by default: additive (`spec:AST-017` FR5).

### Platform support

- Supported feature/engine floor: every supported browser and renderer. Nothing
  here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree assertions for each signal at
  each keystroke and commit under both values; a real-browser check that blur
  and Enter commit on the typed and native surfaces.

## Current-state impact

- `family:input-fields` names entry error behavior as a canonical concept and adds
  FR14, a projection of this record; its shared-owner section gives `FormLayout`
  the form-level default.
- `component:DateInput`, `component:DateTimeInput`, `component:TimeInput`, and
  `component:NumberInput` add `entryErrorBehavior` and project FR1–FR6.
- `component:FormLayout` adds `defaultEntryErrorBehavior` to its props and its
  layout context.
- The `.doc.mjs` files of the five components document the props, the default,
  and precedence, and say that the prop sets when an entry error shows, not
  when validation runs.

Requirement gaps:

- FR1, FR2 gap: `NumberInput` takes no `entryErrorBehavior` and reads no
  `FormLayout` default. It reveals each rejection only at commit under both
  values, as FR4 states.
- FR6 gap: a busy `TimeInput` (`isLoading` or a pending `changeAction`) stays
  editable but reveals no rejection of its own until it is idle.

## Verification

| Contract | Verification                                                                                 | Representative states                                                                                                                  | Mutation or failure expectation                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Member and `FormLayout` render suites; type tests                                            | No prop; field prop; form default; both, disagreeing; nested layout with and without a value; a field in a Dialog opened inside a form | A field ignores its prop, a form default outranks the field, a nested or layered field keeps the outer default, or the type widens    |
| FR3      | Each member's existing rejection suites, run with no prop and with `'complete'`              | Every rejection each member's record names                                                                                             | Any signal appears at a different moment, or with a different signal set, than with no prop                                           |
| FR4      | Keystroke-by-keystroke and commit suites under `'blur-or-enter'`                             | Each rejection of each member; native edits; Enter and blur; an entry the member drops at blur                                         | A signal appears before Enter or blur, the signals appear apart, the announcement repeats, or a dropped entry is not announced        |
| FR5      | Edit suites after a revealed rejection                                                       | Edit to valid; to empty; to still rejected; caller `value` change; calendar pick                                                       | A fixed entry keeps its rejection, a still-rejected edit clears it or announces it again under `'blur-or-enter'`, or a pick leaves it |
| FR6      | Disabled suites, and busy suites for the records that block edits while busy                 | Rejection revealed, then disabled; draft kept while busy; a busy TimeInput that stays editable                                         | A locked field reveals a rejection, a busy editable field stops revealing, or its behavior does not apply again once editable         |
| FR7      | `PowerSearch`, Table filter editor, and `Pagination` page input suites inside a `FormLayout` | `defaultEntryErrorBehavior="blur-or-enter"` around the composition                                                                     | An editor follows the form default                                                                                                    |
| AR1–AR3  | Screen-reader evidence under `spec:AST-009`                                                  | Each member, typed and native, under `'blur-or-enter'`                                                                                 | A rejection is heard before commit, heard twice, or a dropped entry is not explained                                                  |

## Decision log

### DEC-1 — One option for every input that checks its own entries

**Reference:** `spec:AST-117/DEC-1`
**Decider:** `nynexman4464`, `2026-11-11`

Forms that check fields on blur need an input's own rejections to wait for the
commit, while other forms keep the input's own timing. One option, with the
same two values on every member that rejects entries, serves both. Its default
is the shipped behavior, as a new behavior prop's default is
(`architecture:public-component-api` INV3). Under `'blur-or-enter'` the option holds
the message, the invalid state, and the announcement together, and under both
values a rejection clears as soon as the entry is valid.

Rejected: commit timing as the only behavior, because forms that rely on an
input's own early feedback would lose it.

### DEC-2 — The form sets the default, and the field wins

**Reference:** `spec:AST-117/DEC-2`
**Decider:** `nynexman4464`, `2026-11-11`

A form follows one convention for all its fields, so `FormLayout` carries it
through the context that already carries `defaultOptionality`. A field that
needs another behavior sets its own prop. Form libraries set validation timing
on the form, and those that also take it per field let the field win.

### DEC-3 — The name follows the behavior-prop rule

**Reference:** `spec:AST-117/DEC-3`
**Decider:** `nynexman4464`, `2026-11-11`

A prop that chooses how a component responds to input is named
`<thing>Behavior` (`architecture:public-component-api` INV2). The thing is the
member's entry error, the rejection that `onEntryErrorChange` already reports,
so the option is `entryErrorBehavior`, the form default
`defaultEntryErrorBehavior`, and the type `EntryErrorBehavior`. Its values name
when an entry error appears:
`'complete'`, the member's shipped moment (FR3), and
`'blur-or-enter'`, when the person leaves the field or presses Enter. The
second value names both triggers, because Enter commits an entry without
moving focus.

Rejected:

- `validationBehavior`, because React Aria uses that name for native versus
  ARIA validation, and because it suggests when validation runs.
- `validateOn`, `validateTrigger`, and `validationTiming`, because they suggest
  when validation runs and break the `<thing>Behavior` rule.
- `errorBehavior` and `errorTiming`, because they also suggest control over a
  caller's errors; `errorTiming` also breaks the rule.
- Separate `'blur'` and `'enter'` values. With Enter alone, a person who tabs
  away from a rejected entry is never told, and phone number pads have no
  Enter key. With blur alone, Enter commits a rejected entry with no sign.
- `'commit'`, because developers read it as saving or submitting.
- `'eager'` and `'lazy'`, because neither names its trigger and form libraries
  already use them with other meanings.

### DEC-4 — Under `'blur-or-enter'`, a dropped entry is announced at its commit

**Reference:** `spec:AST-117/DEC-4`
**Decider:** `nynexman4464`, `2026-11-11`

Some members drop a rejected entry at blur, and by default they announce the
rejection while the person types. Under `'blur-or-enter'` that announcement waits, so
the commit that drops the entry announces it; otherwise the entry would vanish
with no word (FR4).

### DEC-5 — Compositions keep the default

**Reference:** `spec:AST-117/DEC-5`
**Decider:** `nynexman4464`, `2026-11-11`

`PowerSearch` and Table filtering compose members as filter editors, and
`Pagination` composes one as its page input, not as fields of a form, so a
form's convention does not apply to them. They keep `'complete'` and take no
prop (FR7). `DateRangeInput` has no typed entry to reject.

### DEC-6 — A revealed entry error stays while the entry stays wrong

**Reference:** `spec:AST-117/DEC-6`
**Decider:** `nynexman4464`, `2026-11-11`

Under `'blur-or-enter'`, once an entry error shows, an edit that leaves the
entry wrong keeps it, without a new announcement, until the entry is valid or
empty or the next commit reveals its current error (FR5). Hiding it on every
edit would make the error flicker while the person corrects it.

## Open questions

None.
