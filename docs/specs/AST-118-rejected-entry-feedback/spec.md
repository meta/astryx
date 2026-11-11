---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-118
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
affects_consumer_docs: [DateInput, DateTimeInput, TimeInput, NumberInput]
---

# Rejected entry feedback system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/DateInput/useTypedDate.ts",
    "packages/core/src/DateInput/DateInput.tsx",
    "packages/core/src/DateInput/NativeDateField.tsx",
    "packages/core/src/DateTimeInput/**",
    "packages/core/src/TimeInput/**",
    "packages/core/src/NumberInput/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

When an input that checks its own entries refuses an entry, the person learns
it once, in words they can see and hear, and keeps what they typed so they can
correct it. An entry the person has not finished is never flagged, so a lone
`-` never flashes an error. Apps change no code: the committed value,
`onChange`, and a caller's own status keep working as they do.

## Members

The rule applies to the four members of `family:input-fields` that reject
entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. Members that reject nothing themselves, such as `TextInput`,
`Selector`, and `DateRangeInput`, are outside it.

## Non-goals

- A builder's choice to hold a member's rejections until commit for a form or a
  field, which `spec:AST-117` owns; FR11 states how it applies here.
- Caller validation. A caller's `status`, `isRequired`, and form-library rules
  keep their meaning; FR7 states which message shows when a caller status and a
  rejection meet.
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

```ts
interface NumberInputEntryError {
  kind: 'unreadable' | 'fractional' | 'outOfRange';
  text: string; // the typed text
  value?: number; // the number the text names, for 'fractional' and 'outOfRange'
}

interface TimeInputEntryError {
  kind: 'unreadable' | 'outOfRange';
  text: string; // the typed text
  value?: ISOTimeString; // the time the text names, for 'outOfRange'
}
```

```tsx
<NumberInput
  label="Seats"
  value={seats}
  onChange={setSeats}
  min={1}
  max={40}
  onEntryErrorChange={setSeatsEntryError} // optional
  status={
    seatsEntryError?.kind === 'outOfRange'
      ? {type: 'error', message: 'Choose 1 to 40 seats'}
      : undefined
  }
/>
```

## Requirements

### Terms

- A **value rejection** refuses an entry that reads as a value the member does
  not accept: a date the calendar does not have; a date, time, or date-time
  outside `min`, `max`, or `dateConstraints`; a number outside `min` or `max`.
- A **text rejection** refuses an entry that does not read as a value:
  unreadable or incomplete date text, time text that does not parse, number
  text that does not parse, and a fractional number in an integer-only field.
- A **commit** is Enter in the field or blur, focus leaving the field.
- An entry is **complete** when FR1 says so.

### Behavior

- **FR1 — Each kind of entry has its own point of completion.** Typed, pasted,
  and dropped text are judged alike.
  1. A typed date is complete as `spec:AST-111` FR12 defines it: every field is
     present, the year is complete or is an era year with its era, no separator
     trails, and the last field cannot take another digit. Gregorian text that
     only the fallback reader reads (`spec:AST-111` FR9) is complete only at
     commit.
  2. A typed time is complete when its hours, both minute digits, and, when the
     field shows seconds, both second digits are present, and, in twelve-hour
     text, its day period, unless the hour reads as 0 or 13 through 23.
  3. A typed number is complete when nothing typed at its end, more digits or a
     decimal part, can bring it into the range `NumberInput` commits to
     (`component:NumberInput` ORD1). `150` with `max={100}` is complete, and so
     is `4` with `min={20}` and `max={30}`; `2` with `min={20}` and `max={30}`
     is not. Any other number is complete only at commit.
  4. A value that a native date control reports is complete only at commit:
     while a person types its year, the control reports each partial year as a
     date, such as `0002-05-10`.
  5. A value that a native time control reports is complete when the control
     reports it.
- **FR2 — A value rejection appears once the entry is complete.** A member
  reveals a value rejection as soon as the entry is complete, while focus stays
  in the field. An entry that is committed before it is complete reveals its
  rejection at commit.
- **FR3 — A text rejection waits for commit.** Text that does not read as a
  value is never complete. While a person types, the member neither marks it
  invalid nor announces it; its rejection appears at commit.
- **FR4 — Commit keeps rejected text.** Enter or blur on typed text with a
  rejection keeps the text in the field and shows the rejection. The committed
  value does not change, and `onChange` does not fire. No member reverts
  rejected text, silently or otherwise. An empty entry is not a rejection: a
  commit clears it or restores the committed value, as each member's record
  states. `NumberInput` clamps a number outside its range at commit
  (`component:NumberInput` FR3), so that rejection ends at the commit.
- **FR5 — A rejection is a visible message, and its signals move together.** A
  rejection that appears shows its message as the field's error status, in the
  field's status placement and tied to the control by `aria-describedby`;
  sets `aria-invalid="true"` on the control; and is announced once
  (`spec:AST-086` FR1, FR6, FR7): a shown status announces itself, and the
  field's alert carries only a message that no status announces. Any invalid
  styling of the entry's text appears with them. None of these appears before
  the others, and none stays after the others clear. FR7 states which message
  shows when the caller passes a `status`.
- **FR6 — A shown rejection clears as soon as the entry is valid.** An edit
  that makes the entry a value the member accepts, or empties it, clears the
  rejection at once, without a commit. An edit that leaves the entry rejected
  or incomplete keeps the shown rejection and does not announce it again. The
  next commit, or the next complete entry, replaces it with the entry's current
  rejection, which announces once. A new `value` from the caller, or a date or
  time picked from a Calendar, sheet, or native picker, replaces the entry and
  clears its rejection.
- **FR7 — A caller status keeps each member's precedence.** `DateInput` and
  `DateTimeInput`'s date segment show a rejection's message in place of a
  caller `status` while the rejected text stays, as their records state.
  `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment show a
  rejection's message only while the caller passes no `status`. With a caller
  `status`, that status stays shown, `aria-invalid` stays set while the
  rejection stands, and the field's alert announces the rejection's message
  once. With `onEntryErrorChange` (FR8), a caller `error` status with a message
  is the message the field shows and announces in place of its own; an `error`
  status without a message keeps the field's message; a `warning` or `success`
  status never replaces a rejection. A rejection that starts under an unchanged
  caller error message changes no status, so the field's alert announces that
  message once.
- **FR8 — `NumberInput` and `TimeInput` report their rejections.** Each takes an
  optional `onEntryErrorChange`, which receives a `NumberInputEntryError` or a
  `TimeInputEntryError` each time the rejection the field reveals changes, and
  `null` when it ends. `kind` is `unreadable` for text that is not a number or
  a time, `fractional` for a fraction in an integer-only `NumberInput`, and
  `outOfRange` for a value outside `min` or `max`; `text` is the typed text;
  `value` is the number or ISO time the text names, for `fractional` and
  `outOfRange`. Typing, Enter, blur, a new `value`, `min`, `max`, or
  `isIntegerOnly`, and disabling, which hides the rejection, each report a
  changed rejection; an unchanged rejection never reports again; a field that
  unmounts while a reported rejection stands reports `null`. `TimeInput`'s
  native and sheet surfaces take no typed text, so they never report.
- **FR9 — Enter commits every typed field.** Enter in the typed field of each
  member is a commit, so it reveals a text rejection there. In `TimeInput` it is
  not prevented, so a surrounding form submits as it does from any text field:
  a valid draft has already committed while it was typed, and a rejected draft
  changes no value.
- **FR10 — Disabled and busy fields reveal no rejection.** While a member is
  disabled or busy, it reveals no rejection of its own, as its record states
  (`spec:AST-085` FR2), and reports `null` (FR8). Once it is editable, the
  rejection appears and reports again.
- **FR11 — `validationBehavior` follows these points.** Under `spec:AST-117`'s
  `'complete'`, the default, a member reveals each rejection at the point
  FR1–FR3 set. Under `'commit'`, it reveals each at the next Enter or blur.
  Under both values FR4 keeps rejected text, so no member drops a rejected
  entry at commit, and the dropped-entry case of `spec:AST-117` FR4 applies to
  no member.

### Accessibility contract

- **AR1 — No false alarms.** An unfinished entry produces no announcement and no
  invalid state (FR1–FR3).
- **AR2 — One announcement per rejection.** Each rejection that appears is
  announced once, at the urgency `spec:AST-086` FR5 gives an error (FR5, FR7).
- **AR3 — Not by color alone.** A rejection is a visible message tied to the
  control by `aria-describedby`, never only a text color (WCAG 2.2 1.4.1,
  3.3.1). Where FR7 keeps a caller `status` shown, that status is the visible
  message, and the rejection is announced and sets `aria-invalid`.
- **AR4 — Nothing is discarded silently.** A commit keeps rejected text with its
  message (FR4), so a person always learns that an entry was not accepted
  (WCAG 2.2 3.3.1).

### Compatibility

Every change in this record applies with no prop set, and together they are one
accessibility behavior fix under `spec:AST-017` FR53: their purpose is to make
`DateInput`, `DateTimeInput`, `TimeInput`, and `NumberInput` conform to WCAG 2.2
1.4.1 (Use of Color) and 3.3.1 (Error Identification), both Level A.
`spec:AST-017` FR3 sends a change to documented interaction or accessibility
behavior made for accessibility conformance to FR53.

- The fix ships as a patch `[fix]`, with a release-note line, and its Changeset
  names the old and new behavior and the two success criteria.
- It requires no app-layer code change. Existing props, types, exports, tokens,
  and documented usage keep working; the committed value and `onChange` do not
  change; and `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment
  keep a caller `status` shown over their own message (FR7).
- `onEntryErrorChange` and its `NumberInputEntryError` and `TimeInputEntryError`
  types are optional public surface that FR53 admits under the rules for public
  additions (`spec:AST-017` FR5). Nothing is removed, renamed, or narrowed.
- Behavior it replaces, on the latest stable release:
  - A rejected `NumberInput` or `TimeInput` draft shows only as secondary-color
    text, its message reaches only an assertive visually hidden region, and
    blur reverts it with no message. `component:NumberInput` AR2 relies on that
    hidden alert for WCAG 3.3.1.
  - Unreadable `DateInput` and `DateTimeInput` date text, and an out-of-range
    edit in a native date or time control, do the same.
  - Each of them also marks and announces an unfinished entry, such as a lone
    `-`, on each keystroke.
- Behavior it ships, in all four members: a visible message tied to the field
  by `aria-describedby` (FR5, FR7); rejected text kept in the field at commit
  and never reverted (FR4); and no invalid state or alert while an entry is
  unfinished, with unreadable text revealed at commit (FR1–FR3).

### Platform support

- Supported feature/engine floor: every supported browser and renderer. Nothing
  here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree assertions for the error status,
  `aria-invalid`, `aria-describedby`, and live-region text at each keystroke
  and commit, with and without a caller `status`; a real-browser check of the
  partial years a native date control reports while the year is typed, and
  that blur and Enter commit on the typed and native surfaces, Enter in
  `TimeInput` still submitting its form.

## Current-state impact

- `family:input-fields` adds FR15, a projection of this record.
- `component:DateInput` FR25, `component:DateTimeInput` FR16,
  `component:TimeInput` FR14, and `component:NumberInput` FR15 project FR1–FR11,
  and the rows that describe a revert, a keystroke alert, or a rejection shown
  only by color point to them. `component:NumberInput` and
  `component:TimeInput` add `onEntryErrorChange` and their entry-error types.
- The `.doc.mjs` files of the four components describe when a rejection shows,
  that rejected text stays at commit, and which message wins over a caller
  `status`; the `NumberInput` and `TimeInput` docs describe
  `onEntryErrorChange`.

Requirement gaps, each a WCAG 2.2 Level A mismatch that FR53 fixes:

- FR1–FR3 gap: `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment
  mark every draft that is not an accepted value invalid and announce it on
  each keystroke, unfinished drafts included, such as `-`, or `1` with
  `min={10}`. `DateInput` and `DateTimeInput` do the same for unreadable date
  text and for each partial year a native date control reports.
- FR4 gap (WCAG 2.2 3.3.1): unreadable date text reverts on Enter and blur; a
  `TimeInput` or `DateTimeInput` time draft that does not parse, or is out of
  range, reverts on blur; a `NumberInput` draft that does not parse reverts on
  blur. None of these reverts says so on screen.
- FR5 gap (WCAG 2.2 1.4.1, 3.3.1): `NumberInput`, `TimeInput`,
  `DateTimeInput`'s time segment, the native date and time controls, and
  unreadable date text set `aria-invalid` and announce through a visually
  hidden region with no visible message; the text only turns secondary.
- FR6 gap: an edit that leaves date text incomplete hides a shown rejection.
- FR7 gap: with a caller `status`, `NumberInput` and `TimeInput` announce the
  rejection on every keystroke rather than once.
- FR8 gap: `NumberInput` and `TimeInput` have no `onEntryErrorChange`.
- FR9 gap: `TimeInput` takes no commit on Enter.

## Verification

| Contract | Verification                                     | Representative states                                                                                                                                               | Mutation or failure expectation                                                                                                                       |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Completeness unit cases per kind of entry        | Dates per `spec:AST-111` FR12; `1:3`, `1:30`, `1:30 PM`, `13:30` in 12- and 24-hour fields; `-`, `2` and `4` in a 20–30 field, `150` with `max={100}`; `0002-05-10` | An unfinished entry counts as complete, or a complete one waits                                                                                       |
| FR2, FR3 | Keystroke-by-keystroke suites                    | Each value and text rejection of each member; native date year typing; pasted text                                                                                  | A rejection appears before the entry is complete, a text rejection appears while typing, or a complete value rejection waits                          |
| FR4      | Enter and blur suites                            | Each rejection kind; empty entry; `NumberInput` past a bound                                                                                                        | Rejected text reverts or commits, `onChange` fires, or a clamp is reported as a rejection                                                             |
| FR5, FR7 | Accessibility-tree and live-region assertions    | Standalone, horizontal-labels, InputGroup; each status placement; no caller `status`; an `error`, `warning`, and `success` status; with and without the callback    | The message, `aria-invalid`, styling, and announcement appear or clear apart, the wrong message wins over a caller status, or an announcement repeats |
| FR6      | Edit suites after a shown rejection              | Edit to valid; to empty; to incomplete; to another rejection; caller `value` change; calendar pick                                                                  | A fixed entry keeps its rejection, an incomplete edit clears it or announces it again, or a pick leaves it                                            |
| FR8      | `NumberInput` and `TimeInput` callback suites    | Each kind; the rejection ending by typing, a new `value`, or a new bound; disabling; unmount; an unchanged rejection; native and sheet surfaces                     | A report is missing, repeats an unchanged rejection, carries the wrong `kind` or `value`, or comes from a surface with no typed text                  |
| FR9      | Enter suites in a form                           | `TimeInput` with a rejected draft, a valid draft, and no draft                                                                                                      | Enter reveals nothing for a rejected draft, or `TimeInput` prevents the form's submission                                                             |
| FR10     | Disabled and busy suites                         | Rejection shown, then disabled; draft kept while busy                                                                                                               | A locked field reveals or reports a rejection, or the rejection does not return once editable                                                         |
| FR11     | Suites run under each `validationBehavior` value | Each member under `'complete'` and `'commit'`                                                                                                                       | A rejection appears at a point FR1–FR3 do not set under `'complete'`, before a commit under `'commit'`, or a commit drops rejected text               |
| AR1–AR4  | Screen-reader evidence under `spec:AST-009`      | Each member, typed and native, with and without a caller `status`                                                                                                   | An unfinished entry is announced, a rejection is heard twice, or a commit discards text with no message                                               |

## Decision log

### DEC-1 — An unfinished entry is never flagged

**Reference:** `spec:AST-118/DEC-1`
**Decider:** `nynexman4464`, `2026-11-11`

Form guidance advises against flagging an entry a person has not finished, and
allows checking a fixed-length entry once it is fully typed. A field marks and
announces nothing while an entry is unfinished, so a lone `-` never flashes an
error (FR1–FR3).

Rejected: a pause in typing as completion, because its timing differs between
people and assistive technologies.

### DEC-2 — An entry completes when more typing cannot make it acceptable

**Reference:** `spec:AST-118/DEC-2`
**Decider:** pending

Typed dates and times have a fixed set of fields, so they are complete when
every field is present. A number has no fixed length, so it is complete only
when nothing typed at its end can bring it into range. A native date control
reports partial years while its year is typed, so its value is complete only at
commit (FR1).

### DEC-3 — Text that is not a value waits for commit and then stays

**Reference:** `spec:AST-118/DEC-3`
**Decider:** `nynexman4464`, `2026-11-11`

Unreadable text is never complete, so it waits for commit. A commit that
dropped it would discard the person's entry with no message, so the commit
keeps it and shows why (FR3, FR4).

### DEC-4 — Every rejection is a visible message

**Reference:** `spec:AST-118/DEC-4`
**Decider:** `nynexman4464`, `2026-11-11`

A rejection that is only announced, or only colors the text, leaves a sighted
person without the reason and a screen-reader user with words no one else
sees. The field's error status carries the reason for everyone, and its
announcement is the one announcement (FR5).

### DEC-5 — A caller status keeps each member's precedence

**Reference:** `spec:AST-118/DEC-5`
**Decider:** `nynexman4464`, `2026-11-11`

`NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment show a caller
`status` over their own message, and `DateInput` shows its message over the
caller's, so an app that passes a `status` sees the screen it sees on the
latest stable release. `onEntryErrorChange` gives `NumberInput` and `TimeInput`
the rejection, so an app that wants its own wording passes it as an `error`
status (FR7, FR8).

### DEC-6 — Enter commits `TimeInput` and still submits the form

**Reference:** `spec:AST-118/DEC-6`
**Decider:** `nynexman4464`, `2026-11-11`

Enter reveals a rejected draft's message, and the field does not prevent it
beyond that commit, so a form submits from `TimeInput` as it does from any text
field. The submitted value is the committed one, since a valid draft commits
while it is typed (FR9).

### DEC-7 — A shown rejection stays until the entry is valid

**Reference:** `spec:AST-118/DEC-7`
**Decider:** pending

A rejection clears the moment the entry is fixed, so a correction gets
immediate credit. An edit that leaves the entry wrong does not make the
rejection untrue, so the rejection stays without a new announcement (FR6).

### DEC-8 — These changes are one accessibility behavior fix

**Reference:** `spec:AST-118/DEC-8`
**Decider:** `nynexman4464`, `2026-11-11`

Each change makes the four members meet WCAG 2.2 1.4.1 and 3.3.1, and none
needs an app to change code, so they ship together as a patch under
`spec:AST-017` FR53. The app-status precedence of `NumberInput` and
`TimeInput` stays (DEC-5) so that the fix replaces no screen an app chose.

### DEC-9 — Kept text closes the dropped-entry case of `validationBehavior`

**Reference:** `spec:AST-118/DEC-9`
**Decider:** `nynexman4464`, `2026-11-11`

With rejected text kept at every commit (DEC-3), no member drops a rejected
entry, so `spec:AST-117`'s rule for an entry dropped under `'commit'` has no
case, and its open question about that entry closes (FR11).

## Open questions

- **OQ1 — When is a typed number complete?** (`human-api`) FR1 states option
  (a).
  - (a) When nothing typed at its end can bring it into range. `150` with
    `max={100}` and `4` with `min={20}` and `max={30}` show at once; `2` in the
    same field waits.
  - (b) Never before commit. Every number rejection then waits for Enter or
    blur.
  - (c) When it has as many integer digits as the wider bound. Fields with
    bounds of different lengths complete at different points, and fields
    without bounds never complete.
- **OQ2 — Does a shown rejection stay while an edit leaves the entry rejected
  or incomplete?** (`human-design`) FR6 states option (a).
  - (a) It stays, without a new announcement, until the entry is valid or
    empty, or a commit or complete entry shows its current rejection.
  - (b) Any edit hides it, and it appears again when the entry is complete or
    committed.
