---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-117
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [nynexman4464]
affects_architecture: []
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs:
  [DateInput, DateTimeInput, TimeInput, NumberInput, FormLayout]
---

# Validation timing system spec

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
    "packages/core/src/FormLayout/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An input that checks its own entries tells a person about a rejected entry at
one moment, and the builder chooses that moment for the whole form: as soon as
the entry is complete, or when the person commits it with Enter or by leaving
the field. An entry the person has not finished is never flagged. The message,
the invalid state, and the screen-reader announcement appear together and clear
together.

## Members

The rule applies to the four members of `family:input-fields` that reject
entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. `FormLayout` sets a form-wide default for them. Members that
reject nothing themselves, such as `TextInput`, `Selector`, and
`DateRangeInput`, whose dates come only from a Calendar that disables
unreachable days, take no timing.

## Non-goals

- Caller validation. A caller's `status`, `isRequired`, and form-library rules
  keep their own timing; this record governs only the rejections a member makes
  itself.
- Native constraint validation in the browser, such as `required` and
  `:invalid`.
- Rejection wording. Each member's record and `spec:AST-111` AR3 own the
  messages; `spec:AST-086` owns their delivery.
- What a commit does with an entry the member accepts: commit, clamp, or clear
  stays with each member's record.
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
<FormLayout defaultValidationTiming="commit">
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
    validationTiming="complete" // this field's own prop wins
  />
</FormLayout>
```

```ts
type ValidationTiming = 'complete' | 'commit';
```

## Requirements

### Terms

- A **rejection** is a member's own refusal of an entry. A **value rejection**
  refuses an entry that reads as a value the member does not accept: a date the
  calendar does not have; a date, time, or date-time outside `min`, `max`, or
  `dateConstraints`; a number outside `min` or `max`. A **text rejection**
  refuses an entry that does not read as a value: unreadable or incomplete date
  text, time text that does not parse, number text that does not parse, and a
  fractional number in an integer-only field.
- A **commit** is Enter in the field or blur, focus leaving the field.
- An entry is **complete** when FR3 says so.

### Behavior

- **FR1 — Each member takes `validationTiming`.** `DateInput`,
  `DateTimeInput`, `TimeInput`, and `NumberInput` accept an optional
  `validationTiming` of `'complete'` or `'commit'`. One value governs every
  surface and segment of the field: typed text, the native control, and
  `DateTimeInput`'s date and time segments. The type of the value is exported as
  `ValidationTiming`.
- **FR2 — The form sets a default and the field wins.** `FormLayout` accepts an
  optional `defaultValidationTiming` of the same type. A member resolves its
  timing from its own `validationTiming`, else the nearest `FormLayout`'s
  `defaultValidationTiming`, else `'complete'`. `FormLayout` provides the
  default as it provides `defaultOptionality` (`component:FormLayout` FR4): a
  nested `FormLayout` replaces it for its own descendants, an unset nested value
  included, and content in a layer opened inside a `FormLayout` starts without
  it (`spec:AST-038` FR7, FR8).
- **FR3 — Each kind of entry has its own point of completion.** Typed, pasted,
  and dropped text are judged alike.
  1. A date is complete as `spec:AST-111` FR12 defines it: every field is
     present, the year is complete or is an era year with its era, no separator
     trails, and the last field cannot take another digit. Gregorian text that
     only the fallback reader reads (`spec:AST-111` FR9) is complete only at
     commit.
  2. A time is complete when its hours, both minute digits, and, when the field
     shows seconds, both second digits are present, and, in twelve-hour text,
     its day period, unless the hour reads as 0 or 13 through 23.
     `DateTimeInput` checks a complete time against the bounds of its committed
     date (`component:DateTimeInput` FR6).
  3. A number is complete when no digit added to its end can bring it into the
     range `NumberInput` commits to (`component:NumberInput` ORD1): it is zero
     or more and greater than `max`, or less than zero and less than `min`. Any
     other number is complete only at commit.
  4. A value that a native date or time control reports is complete.
- **FR4 — Timing decides when a value rejection appears.** Under `'complete'`,
  a value rejection appears as soon as the entry is complete, while focus stays
  in the field; an entry that is committed before it is complete shows its
  rejection at commit. Under `'commit'`, a value rejection appears only at
  commit.
- **FR5 — A text rejection waits for commit under both timings.** Text that
  does not read as a value is never complete. While a person types, the member
  neither marks it invalid nor announces it, under either timing; its rejection
  appears at commit.
- **FR6 — Commit keeps rejected text.** Enter or blur on an entry with a
  rejection keeps the text in the field and shows the rejection. The committed
  value does not change, and `onChange` does not fire. No member drops rejected
  text silently. An empty entry is not a rejection: a commit clears it or
  restores the committed value, as each member's record states. `NumberInput`
  clamps a number outside its range at commit (`component:NumberInput` FR3), so
  a number's range rejection ends at its commit and never appears under
  `'commit'`.
- **FR7 — The message, the invalid state, and the announcement move
  together.** A rejection that appears shows its message as the field's error
  status, in the field's status placement and in place of a caller `status`
  while the rejected text stays; sets `aria-invalid="true"` on the control; and
  is announced once (`spec:AST-086` FR1, FR6, FR7): a shown status announces
  itself, and an alert carries only a rejection that no status shows. Any
  invalid styling of the entry's text follows the same timing. None of these
  appears before the others, and none stays after the others clear.
- **FR8 — A shown rejection clears as soon as the entry is valid.** Under both
  timings, an edit that makes the entry a value the member accepts, or empties
  it, clears the rejection at once, without a commit. An edit that leaves the
  entry rejected or incomplete keeps the shown rejection and does not announce
  it again. The next commit, or under `'complete'` the next complete entry,
  replaces it with the entry's current rejection, which announces once. A new
  `value` from the caller, or a date or time picked from a Calendar, sheet, or
  native picker, replaces the text and clears its rejection.
- **FR9 — Disabled and busy fields show no rejection of their own.** While a
  member is disabled or busy, it shows no rejection of its own, as its record
  states (`spec:AST-085` FR2). Once it is editable, its timing applies again.
- **FR10 — Compositions keep the default.** `PowerSearch`'s value editors and
  Table's filter editors render members with `'complete'` and expose no timing
  prop. A `FormLayout` around them does not change their timing.

### Accessibility contract

- **AR1 — No false alarms.** An unfinished entry produces no announcement and no
  invalid state (FR3–FR5).
- **AR2 — One announcement per rejection.** Each rejection that appears is
  announced once, at the urgency `spec:AST-086` FR5 gives an error, and its
  announced words match its shown words (`spec:AST-086` FR7).
- **AR3 — Not by color alone.** A rejection is always a visible message tied to
  the control by `aria-describedby`, never only a text color (WCAG 2.2 1.4.1,
  3.3.1).
- **AR4 — Nothing is discarded silently.** A commit keeps rejected text with its
  message (FR6), so a person always learns that an entry was not accepted
  (WCAG 2.2 3.3.1).

### Compatibility

Classified under `spec:AST-017` against the latest stable release:

- `validationTiming` and `defaultValidationTiming` are new optional props:
  additive (`spec:AST-017` FR5).
- `'complete'` keeps the released timing of a date the calendar does not have
  and of an out-of-range typed date: shown as soon as the date is complete.
- `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment stop marking
  unfinished drafts invalid and announcing them on each keystroke, and
  unreadable date text waits for commit:
  a nonbreaking interaction change (`spec:AST-017` FR5). No value, callback, or
  prop changes.
- Rejected text stays at commit where the release reverts it: unreadable date
  text, a time draft, and a number draft that does not parse on blur. The
  committed value does not change in either case: a nonbreaking interaction
  change (`spec:AST-017` FR5).
- A shown rejection stays while an edit leaves the entry rejected or
  incomplete, where the release hides it once date text is incomplete: a
  nonbreaking interaction change (`spec:AST-017` FR5).
- A rejection shows a visible message where the release shows only text color
  and an alert: an accessibility behavior fix (`spec:AST-017` FR53; WCAG 2.2
  1.4.1, 3.3.1).

### Platform support

- Supported feature/engine floor: every supported browser and renderer. Nothing
  here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree assertions for the error status,
  `aria-invalid`, and live-region text at each keystroke and commit; a
  real-browser check that blur and Enter commit on the typed and native
  surfaces.

## Current-state impact

- `family:input-fields` names validation timing as a canonical concept and adds
  FR14, a projection of this record; its shared-owner section gives `FormLayout`
  form-level validation timing.
- `component:DateInput`, `component:DateTimeInput`, `component:TimeInput`, and
  `component:NumberInput` add `validationTiming` and project FR1–FR9.
- `component:FormLayout` adds `defaultValidationTiming` to its props and its
  layout context.
- The `.doc.mjs` files of the five components document the props, the default,
  and precedence.

Requirement gaps:

- FR1, FR2 gap: no member accepts `validationTiming`, and `FormLayout` has no
  `defaultValidationTiming`.
- FR5 gap: `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment mark
  every draft that is not an accepted value invalid and announce it on each
  keystroke, unfinished drafts included, such as `-`, or `1` with `min={10}`.
  `DateInput` and `DateTimeInput` do the same for unreadable date text.
- FR6 gap: unreadable date text reverts on Enter and blur; a `TimeInput` or
  `DateTimeInput` time draft that does not parse, or is out of range, reverts on
  blur; a `NumberInput` draft that does not parse reverts on blur.
  `TimeInput` takes no commit on Enter.
- FR7 gap: `NumberInput`, `TimeInput`, `DateTimeInput`'s time segment, the
  native date and time controls, and unreadable date text set `aria-invalid` and
  announce with no visible message; the text only turns secondary.
- FR8 gap: an edit that leaves date text incomplete hides a shown rejection.

## Verification

| Contract | Verification                                                       | Representative states                                                                                                                        | Mutation or failure expectation                                                                                                         |
| -------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Member and `FormLayout` render suites; type tests                  | No prop; field prop; form default; both, disagreeing; nested layout with and without a value; a field in a Dialog opened inside a form       | A field ignores its prop, a form default outranks the field, a nested or layered field keeps the outer default, or the type widens      |
| FR3      | Completeness unit cases per kind of entry                          | Dates per `spec:AST-111` FR12; `1:3`, `1:30`, `1:30 PM`, `13:30` in 12- and 24-hour fields; `-`, `1` with `min={10}`, `150` with `max={100}` | An unfinished entry counts as complete, or a complete one waits                                                                         |
| FR4, FR5 | Keystroke-by-keystroke suites under each timing                    | Each value and text rejection of each member; native edits; pasted text                                                                      | A rejection appears before its timing allows, a text rejection appears while typing, or a value rejection under `'complete'` waits      |
| FR6      | Enter and blur suites                                              | Each rejection kind; empty entry; `NumberInput` past a bound                                                                                 | Rejected text reverts or commits, `onChange` fires, or a clamp is reported as a rejection                                               |
| FR7      | Accessibility-tree and live-region assertions                      | Standalone, horizontal-labels, InputGroup; each status placement; with a caller `status`                                                     | The message, `aria-invalid`, styling, and announcement appear or clear apart, the caller status shows with rejected text, or it repeats |
| FR8      | Edit suites after a shown rejection                                | Edit to valid; to empty; to incomplete; to another rejection; caller `value` change; calendar pick                                           | A fixed entry keeps its rejection, an incomplete edit clears it or re-announces it, or a pick leaves it                                 |
| FR9      | Disabled and busy suites                                           | Rejection shown, then disabled; draft kept while busy                                                                                        | A locked field shows a rejection, or its timing does not apply again once editable                                                      |
| FR10     | `PowerSearch` and Table filter editor suites inside a `FormLayout` | `defaultValidationTiming="commit"` around the composition                                                                                    | An editor follows the form default                                                                                                      |
| AR1–AR4  | Screen-reader evidence under `spec:AST-009`                        | Each member, typed and native                                                                                                                | An unfinished entry is announced, a rejection is heard twice, or a commit discards text with no message                                 |

Known verification gap: none of these suites exist on `main`.

## Decision log

### DEC-1 — One timing option for every input that checks its own entries

**Reference:** `spec:AST-117/DEC-1`
**Decider:** `nynexman4464`, `2026-11-11`

Forms that check fields on blur need an input's own rejections to wait for the
commit, while other forms want a fixed-length entry checked as soon as it is
typed. One option, with the same two values on every member that rejects
entries, serves both. `'complete'` is the default because it keeps the released
timing of date rejections. The option moves the message, the invalid state, and
the announcement together, and a rejection clears as soon as the entry is valid
under both timings.

Rejected: commit timing as the only behavior, because forms that check a
complete entry at once would lose that feedback.

### DEC-2 — The form sets the default, and the field wins

**Reference:** `spec:AST-117/DEC-2`
**Decider:** `nynexman4464`, `2026-11-11`

A form follows one convention for all its fields, so `FormLayout` carries it
through the context that already carries `defaultOptionality`. A field that
needs another timing sets its own prop. Form libraries set validation timing on
the form, and those that also take it per field let the field win.

### DEC-3 — The name says timing

**Reference:** `spec:AST-117/DEC-3`
**Decider:** pending

`validationTiming` names when a rejection appears. Its values name the moment,
`'complete'` and `'commit'`, not an event, because a commit is Enter or blur.
`defaultValidationTiming` follows `defaultOptionality`.

Rejected: `validationBehavior`, because React Aria uses that name for native
versus ARIA validation.

### DEC-4 — An entry is complete when more typing cannot make it acceptable

**Reference:** `spec:AST-117/DEC-4`
**Decider:** pending

Form guidance advises against flagging an entry a person has not finished, and
allows checking a fixed-length entry once it is fully typed. Dates and times
have a fixed set of fields, so they are complete when every field is present. A
number has no fixed length, so it is complete only when no digit added to its
end can bring it into range (FR3).

Rejected: a pause in typing as completion, because its timing differs between
people and assistive technologies.

### DEC-5 — Text that is not a value waits for commit and then stays

**Reference:** `spec:AST-117/DEC-5`
**Decider:** pending

Unreadable text is never complete, so it waits for commit under both timings.
A commit that dropped it would discard the person's entry with no message, so
the commit keeps it and shows why (FR5, FR6).

### DEC-6 — Compositions keep the default

**Reference:** `spec:AST-117/DEC-6`
**Decider:** pending

`PowerSearch` and Table filtering compose members as filter editors, not as
fields of a form, so a form's convention does not apply to them. Their editors
keep `'complete'` and take no prop (FR10).

## Open questions

- **OQ1 — When is a typed number complete?** (`human-api`) FR3 states option
  (a).
  - (a) When no digit added to its end can bring it into range. Typing past a
    bound shows at once under `'complete'`; everything else waits for commit.
  - (b) Never before commit. `NumberInput`'s two timings then behave alike for
    typed text, and a form default changes nothing for it.
  - (c) When it has as many integer digits as the wider bound. Fields with
    bounds of different lengths complete at different points, and fields
    without bounds never complete.
- **OQ2 — What do the timings and a commit do with text that is not a value?**
  (`human-api`) FR5 and FR6 state option (a).
  - (a) It waits for commit under both timings, and the commit keeps it with
    its message.
  - (b) It waits for commit, and the commit reverts it and announces that the
    entry was discarded.
  - (c) Under `'complete'` it shows as soon as no more typing can make it
    readable; under `'commit'` it waits.
- **OQ3 — Do `PowerSearch`'s editors, Table's filter editors, and
  `DateRangeInput` take the option?** (`human-api`) FR10 and Members state
  option (a).
  - (a) No. The editors keep `'complete'`, and `DateRangeInput` has no typed
    entry to reject.
  - (b) `PowerSearch` and Table filtering take a timing prop and pass it to
    their editors.
  - (c) The editors follow a `FormLayout` around the composition.
- **OQ4 — Are `validationTiming`, `defaultValidationTiming`, the values
  `'complete'` and `'commit'`, and the exported type `ValidationTiming` the
  names?** (`human-api`) This record uses option (a).
  - (a) Yes. `defaultValidationTiming` pairs with `defaultOptionality`.
  - (b) `validateOn` and `defaultValidateOn`, with the same values. The name
    reads as an event, while `'complete'` is a state of the entry.
- **OQ5 — Does a shown rejection stay while an edit leaves the entry rejected
  or incomplete?** (`human-design`) FR8 states option (a).
  - (a) It stays, without a new announcement, until the entry is valid or
    empty, or the timing shows the entry's current rejection.
  - (b) Any edit hides it, and it appears again when the timing allows.
