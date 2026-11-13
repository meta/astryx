---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-118
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
it once, in words they hear and, in a standalone field, see, and keeps what
they typed so they can correct it. An entry the person has not finished is
never flagged, so a lone `-` never flashes an error. Apps change no code: the
committed value, `onChange`, and what a form posts keep working as they do.

## Members

The rule applies to four members of `family:input-fields` that reject typed or
reported entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. `FileInput` also rejects entries, a file of the wrong type or
size, and drops them from its value; those are picked files, not typed or
reported entries, so it is outside this record. Members that reject nothing
themselves, such as `TextInput`, `Selector`, and `DateRangeInput`, are outside
it too.

## Non-goals

- A builder's choice to hold a member's rejections until commit for a form or a
  field, which `spec:AST-117` owns as `entryErrorBehavior`.
- Where a member inside an InputGroup shows status. `component:InputGroup` FR1,
  `component:TextInput` FR1, and `component:TimeInput` FR10 own it; FR5 states
  how a grouped rejection is announced.
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
  isIntegerOnly
  min={1}
  max={40}
  onEntryErrorChange={setSeatsEntryError} // optional
  status={
    seatsEntryError?.kind === 'fractional'
      ? {type: 'error', message: 'Enter a whole number of seats'}
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
- A **standalone field** is a member that is not inside an InputGroup.

### Behavior

- **FR1 — Each kind of entry has its own point of completion.** Typed, pasted,
  and dropped text are judged alike. Under `entryErrorBehavior="complete"`, a
  member reveals its rejections at these points, and under `'blur-or-enter'` at
  commit (`spec:AST-117` FR3, FR4).
  1. A typed date is complete as `spec:AST-111` FR12 defines it: every field is
     present, the year is complete or is an era year with its era, no separator
     trails, and the last field cannot take another digit. Gregorian text that
     only the fallback reader reads (`spec:AST-111` FR9) is complete only at
     commit.
  2. A typed time is complete when its hours, both minute digits, and, when the
     field shows seconds, both second digits are present, and, in twelve-hour
     text, its day period, unless the hour reads as 0 or 13 through 23.
  3. A typed number has no fixed length, so it is complete only at commit.
     While a person types, `NumberInput` marks, shows, and announces nothing,
     whatever the draft. At commit it reveals the draft's rejection: text that
     does not parse, a fraction in an integer-only field, or a number outside
     the range when no number can commit (`min` above `max`); a number outside
     an ordinary range clamps and commits (`component:NumberInput` FR3) and
     reveals none. A number's rejection therefore appears at commit under
     either `entryErrorBehavior` value.
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
- **FR4 — Commit keeps rejected text, and never discards an entry silently.**
  Enter or blur on typed text with a rejection keeps the text in the field and
  shows the rejection. The committed value does not change, and `onChange` does
  not fire. What a form posts does not change. After a blur that keeps a
  rejected `NumberInput` or `TimeInput` draft, and after Enter or blur on
  unreadable `DateInput` or `DateTimeInput` date text, a hidden input carries
  the caller's `name` with the committed value's text, and the typed input
  carries none: for `NumberInput`, the committed number as the field shows it on
  the latest stable release, the plain number (`2.5`) while the field is not
  focused and the plain locale-formatted number (`2,5` in `de-DE`) while it is
  (`component:NumberInput` FR6); and the committed value as the field shows it
  for `TimeInput`,
  `DateInput`, and `DateTimeInput`'s date segment (`component:TimeInput` FR11,
  `component:DateInput` FR25, `component:DateTimeInput` FR8). In every other
  case the input that carries `name` on the latest stable release keeps it,
  and a form posts what it posts there: the typed text of a
  `NumberInput` without `formatValue` or a `TimeInput` draft that Enter submits
  before blur, and incomplete date text or a date the calendar does not have or
  that `min`, `max`, or `dateConstraints` rules out. A `NumberInput` with
  `formatValue` posts the committed number from its hidden input in every case,
  as it does there. The hidden input carries `name` until
  the person edits the kept text, or a new `value` or a pick replaces it; the
  typed input then carries `name` again. Unreadable date text that Enter or blur
  kept is not pending typed text for `component:DateInput` FR16 and
  `component:DateTimeInput` FR10: the next Enter with no edit submits a
  surrounding form, and the hidden input posts the committed date. No member
  reverts rejected text. A native date or time control restores the committed
  value at blur, because its own value is what a form posts: a form that Enter
  submits before blur posts the value the control holds. Its rejection stays
  revealed, with every signal FR5 gives it, as FR6 states, so the restore is
  never silent. An empty entry is not a rejection: a commit clears it or
  restores the committed value, as each member's record states. `NumberInput`
  clamps a number outside its range at commit (`component:NumberInput` FR3), so
  that rejection ends at the commit.
- **FR5 — A rejection is a visible message, and its signals move together.** In
  a standalone field, a rejection that appears shows its message as the field's
  error status, in the field's status placement and tied to the control by
  `aria-describedby`, except where FR7 shows a caller status in its place; sets
  `aria-invalid="true"` on the control; and is announced once (`spec:AST-086`
  FR1, FR6, FR7). Any invalid styling of the entry's text appears with them.
  None of these appears before the others, and none stays after the others
  clear. Inside an InputGroup, a member shows no status of its own and the group
  shows only its own `status`, as the InputGroup, TextInput, and TimeInput
  records state; there the rejection sets `aria-invalid` and is announced once
  through the field's alert. A shown status announces itself, and the field's
  alert carries only a message that no shown status announces: inside an
  InputGroup, and where FR7 shows a caller status in place of the field's
  message. When both segments of a `DateTimeInput` hold a rejection, the field's
  status shows the date segment's message, which comes first; the time segment's
  rejection sets `aria-invalid` on its input and is announced once through the
  field's alert.
- **FR6 — A shown rejection clears as soon as the entry is valid.** An edit
  that makes the entry a value the member accepts, or empties it, clears the
  rejection at once, without a commit. An edit that leaves the entry rejected
  or incomplete keeps the shown rejection and does not announce it again. The
  next commit, or the next complete entry, replaces it with the entry's current
  rejection: a changed message, as when one complete wrong entry is edited into
  another, is announced once, and the same message is not announced again. A
  new `value` from the caller, or a date or time the member accepts picked from
  a Calendar, sheet, or native picker, replaces the entry and clears its
  rejection.
- **FR7 — A caller status never hides a rejection behind a warning.** A
  `warning` or `success` caller status never replaces a rejection's message, on
  any member, with or without `onEntryErrorChange`, and a caller `error` status
  without a message keeps the field's message. A caller `error` status with a
  message shows in place of the field's message on `NumberInput`, `TimeInput`,
  and `DateTimeInput`'s time segment, with or without the callback. On
  `DateInput` and `DateTimeInput`'s date segment, it shows in place of the
  field's message only with `onEntryErrorChange`; without the callback, the
  field's message shows in place of any caller `status` while the rejected text
  stays, as their records state. While a caller `error` status shows in place
  of the field's message, `aria-invalid` stays set while the rejection stands.
  Without the callback, the field's alert announces the rejection's own message
  once; with it, the caller's message is the one announced, and a rejection
  that starts under an unchanged caller error message changes no status, so the
  field's alert announces that message once.
- **FR8 — `NumberInput` and `TimeInput` report their rejections.** Each takes an
  optional `onEntryErrorChange`, which receives a `NumberInputEntryError` or a
  `TimeInputEntryError` each time the rejection the field reveals changes, and
  `null` when it ends. `kind` is `unreadable` for text that is not a number or
  a time, `fractional` for a fraction in an integer-only `NumberInput`, and
  `outOfRange` for a time outside `min` or `max`, or a number when `min` is
  above `max` (FR1); `text` is the typed text;
  `value` is the number or ISO time the text names, for `fractional` and
  `outOfRange`. Typing, Enter, blur, a new `value`, `min`, `max`, or
  `isIntegerOnly`, and disabling, which hides the rejection, each report a
  changed rejection; an unchanged rejection never reports again; a field that
  unmounts while a reported rejection stands reports `null`. `TimeInput`'s
  native and sheet surfaces take no typed text, so they never report.
- **FR9 — Enter commits every typed field.** Enter in the typed field of each
  member is a commit, so it reveals a text rejection there. In `TimeInput` and
  `DateTimeInput`'s time segment it is not prevented beyond that commit, so a
  surrounding form submits as it does from any text field: a valid draft has
  already committed while it was typed, and a rejected draft changes no value.
  While the time segment's preset-time list is open, Enter picks the typed or
  highlighted time from it and does not submit.
- **FR10 — Disabled and busy fields reveal no rejection.** While a member is
  disabled or busy, it reveals no rejection of its own, as its record states
  (`spec:AST-085` FR2), and reports `null` (FR8). A member that keeps typed
  text through a lock, as `DateInput` and `DateTimeInput`'s date segment do
  (`component:DateInput` FR12), reveals and reports that text's rejection again
  once it is editable. `NumberInput` and `TimeInput` drop a draft when they
  become disabled (`component:NumberInput` FR9, `component:TimeInput` FR9), so
  no rejection returns.

### Accessibility contract

- **AR1 — No false alarms.** An unfinished entry produces no announcement and no
  invalid state (FR1–FR3).
- **AR2 — One announcement per rejection.** Each rejection that appears is
  announced once, at the urgency `spec:AST-086` FR5 gives an error (FR5, FR7).
- **AR3 — Not by color alone.** In a standalone field, a rejection is a visible
  message tied to the control by `aria-describedby`, never only a text color
  (WCAG 2.2 1.4.1, 3.3.1). Where FR7 shows a caller `error` status in its
  place, that status is the visible message, and the rejection is announced and
  sets `aria-invalid`. Inside an InputGroup, the rejection is announced and sets
  `aria-invalid`, and a visible message of the member's own is a gap the
  InputGroup records own.
- **AR4 — Nothing is discarded silently.** A commit keeps rejected text with its
  message, and a native control that restores its committed value keeps the
  rejection revealed (FR4), so a person always learns that an entry was not
  accepted (WCAG 2.2 3.3.1).

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
  change; what a form posts does not change, because a hidden input carries the
  committed value's text wherever the latest stable release reverts rejected
  text, and elsewhere the input that carries `name` on the release keeps it
  (FR4); and `NumberInput`,
  `TimeInput`, and `DateTimeInput`'s time segment keep a caller `error` status
  with a message shown over their own message (FR7).
- `onEntryErrorChange` and its `NumberInputEntryError` and `TimeInputEntryError`
  types are optional public surface that FR53 admits under the rules for public
  additions (`spec:AST-017` FR5). Nothing is removed, renamed, or narrowed.
- Behavior it replaces, on the latest stable release:
  - A rejected `NumberInput` or `TimeInput` draft shows only as secondary-color
    text, its message reaches only an assertive visually hidden region, and
    blur reverts it with no message. `component:NumberInput` AR2 relies on that
    hidden alert for WCAG 3.3.1.
  - Unreadable `DateInput` and `DateTimeInput` date text, and an out-of-range
    edit in a native date or time control, do the same; the native control
    restores its committed value at blur and drops the rejection.
  - Each of them also marks and announces an unfinished entry, such as a lone
    `-`, on each keystroke.
- Behavior it ships, in all four members: in a standalone field, a visible
  message tied to the field by `aria-describedby` (FR5, FR7); rejected text
  kept in the field at commit and never reverted, and a native restore that
  keeps its rejection revealed (FR4); and no invalid state or alert while an
  entry is unfinished, with unreadable text revealed at commit (FR1–FR3).
  `NumberInput` reveals every rejection at commit and nothing while the person
  types.
- Two submissions post rejected text, as they do on the latest stable release:
  incomplete date text or a date the calendar does not have or that its bounds
  rule out, which `DateInput` and `DateTimeInput` keep after blur, and a
  `NumberInput` without `formatValue` or a `TimeInput` draft that Enter submits
  before blur (FR4, DEC-13).
- Two screens an app chose change, as part of the same fix:
  - A `NumberInput`, `TimeInput`, or time segment with a caller `warning` or
    `success` status shows the rejection's message in place of that status
    while a rejection stands, because a field marked invalid must say why
    (WCAG 2.2 3.3.1), as `DateInput` already does (FR7).
  - Unreadable `DateInput` and `DateTimeInput` date text stays at commit, and
    its message replaces a caller `status` while it stays, following the
    shipped `DateInput` rule that the field's own message wins; on the latest
    stable release the text reverts and the caller's status stays shown (FR4,
    FR7).

### Platform support

- Supported feature/engine floor: every supported browser and renderer. Nothing
  here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree assertions for the error status,
  `aria-invalid`, `aria-describedby`, and live-region text at each keystroke
  and commit, standalone and inside an InputGroup, with and without a caller
  `status`; a real-browser check of the partial years a native date control
  reports while the year is typed, of the native restore at blur, and that blur
  and Enter commit on the typed surfaces, Enter in `TimeInput` and the
  `DateTimeInput` time segment still submitting its form.

## Current-state impact

- `family:input-fields` adds FR15, a projection of this record.
- `component:DateInput` FR25, `component:DateTimeInput` FR16,
  `component:TimeInput` FR14 and FR15, and `component:NumberInput` FR15 and FR16
  project FR1–FR10, and the rows that describe a revert, a keystroke alert, or a
  rejection shown only by color point to them. `component:NumberInput` FR6,
  `component:TimeInput` FR11, `component:DateInput` FR25, and
  `component:DateTimeInput` FR8 post the committed value's text from a hidden
  input after blur keeps a rejected draft, or Enter or blur keeps unreadable
  date text. `component:DateTimeInput` FR16 shows the date segment's
  message when both segments hold a rejection. `component:NumberInput` and
  `component:TimeInput` add `onEntryErrorChange` and their entry-error types.
  The `spec:AST-117` projections, `component:NumberInput` FR14,
  `component:TimeInput` FR13, `component:DateInput` FR24, and
  `component:DateTimeInput` FR15, reveal rejections under `'complete'` when
  these projections state, and keep rejected text under `'blur-or-enter'`.
- The `.doc.mjs` files of the four components describe when a rejection shows,
  that rejected text stays at commit, and which message wins over a caller
  `status`; the `NumberInput` and `TimeInput` docs describe
  `onEntryErrorChange`.

Requirement gaps, each a WCAG 2.2 Level A mismatch that FR53 fixes unless it
says otherwise:

- FR1–FR3 gap: `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment
  mark every draft that is not an accepted value invalid and announce it on
  each keystroke, unfinished drafts included, such as `-`, or `1` with
  `min={10}`.
- FR4 gap (WCAG 2.2 3.3.1): a `TimeInput` or `DateTimeInput` time draft that
  does not parse, or is out of range, reverts on blur; a `NumberInput` draft
  that does not parse reverts on blur. Neither says so on screen.
- FR5 gap (WCAG 2.2 1.4.1, 3.3.1): in a standalone field, `NumberInput`,
  `TimeInput`, `DateTimeInput`'s time segment, and the native time controls
  set `aria-invalid` and announce through a visually hidden region with no
  visible message; the text only turns secondary.
- FR7 gap: with a caller `status`, `NumberInput` and `TimeInput` announce the
  rejection on every keystroke rather than once, and a `warning` or `success`
  status stays shown over a rejection.
- FR8 gap: `NumberInput` and `TimeInput` have no `onEntryErrorChange`.
- FR9 gap: `TimeInput` takes no commit on Enter, and `DateTimeInput`'s time
  segment commits on Enter only while its preset-time list is open.
- AR3 gap (WCAG 2.2 3.3.1), outside this fix: inside an InputGroup, a member's
  own rejection is announced and sets `aria-invalid` but shows no visible
  message.

## Verification

| Contract | Verification                                  | Representative states                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                              |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Completeness unit cases per kind of entry     | Dates per `spec:AST-111` FR12; `1:3`, `1:30`, `1:30 PM`, `13:30` in 12- and 24-hour fields; `-`, `1a`, `150` with `max={100}` while typed and at commit; `0002-05-10`                                                               | An unfinished entry counts as complete, or a complete one waits                                                                              |
| FR2, FR3 | Keystroke-by-keystroke suites                 | Each value and text rejection of each member; native date year typing; pasted text                                                                                                                                                  | A rejection appears before the entry is complete, a text rejection appears while typing, or a complete value rejection waits                 |
| FR4      | Enter and blur suites; native form submission | Each rejection kind; empty entry; `NumberInput` past a bound; a kept `NumberInput` draft in a decimal-comma locale, posted focused and unfocused; a native restore; a form posted after Enter and after blur on each kept rejection | Text reverts or commits, `onChange` fires, a form posts other than FR4 says, a native restore drops its rejection, or a clamp is reported    |
| FR5, FR7 | Accessibility-tree and live-region assertions | Standalone, horizontal-labels; InputGroup (alert only); each status placement; no caller `status`; an `error`, `warning`, and `success` status; callback or none                                                                    | The signals appear or clear apart, a `warning` or `success` status hides a rejection, the wrong message wins, or an announcement repeats     |
| FR6      | Edit suites after a shown rejection           | Edit to valid; to empty; to incomplete; to another rejection; caller `value` change; calendar pick                                                                                                                                  | A fixed entry keeps its rejection, an incomplete edit clears it or announces it again, or a pick leaves it                                   |
| FR8      | `NumberInput` and `TimeInput` callback suites | Each kind; the rejection ending by typing, a new `value`, or a new bound; disabling; unmount; an unchanged rejection; native and sheet surfaces                                                                                     | A report is missing, repeats an unchanged rejection, carries the wrong `kind` or `value`, or comes from a surface with no typed text         |
| FR9      | Enter suites in a form                        | `TimeInput` and the `DateTimeInput` time segment with a rejected draft, a valid draft, and no draft; the preset-time list open                                                                                                      | Enter reveals nothing for a rejected draft, a closed time field prevents the form's submission, or Enter in the open list submits            |
| FR10     | Disabled and busy suites                      | Rejection shown, then disabled; DateInput text kept while busy; a `NumberInput` draft when disabled                                                                                                                                 | A locked field reveals or reports a rejection, kept DateInput text loses its rejection once editable, or a dropped draft's rejection returns |
| AR1–AR4  | Screen-reader evidence under `spec:AST-009`   | Each member, typed and native, standalone and grouped, with and without a caller `status`                                                                                                                                           | An unfinished entry is announced, a rejection is heard twice, or a commit discards an entry with no message                                  |

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

### DEC-2 — A date or time completes when every field is present

**Reference:** `spec:AST-118/DEC-2`
**Decider:** `nynexman4464`, `2026-11-11`

Typed dates and times have a fixed set of fields, so they are complete when
every field is present. A native date control reports partial years while its
year is typed, so its value is complete only at commit (FR1). DEC-12 covers
numbers.

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
sees. In a standalone field, the field's error status carries the reason for
everyone, and its announcement is the one announcement (FR5). DEC-10 covers a
member inside an InputGroup.

### DEC-5 — A caller error status keeps each member's precedence

**Reference:** `spec:AST-118/DEC-5`
**Decider:** `nynexman4464`, `2026-11-11`

`NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment show a caller
`error` status over their own message, and `DateInput` shows its message over
the caller's, as each does on the latest stable release. `onEntryErrorChange`
gives `NumberInput` and `TimeInput` the rejection, so an app that wants its own
wording passes it as an `error` status (FR7, FR8). DEC-8 names the two screens
that change.

### DEC-6 — Enter commits `TimeInput` and still submits the form

**Reference:** `spec:AST-118/DEC-6`
**Decider:** `nynexman4464`, `2026-11-11`

Enter reveals a rejected draft's message, and the field does not prevent it
beyond that commit, so a form submits from `TimeInput` as it does from any text
field. A valid draft has already committed while it was typed, and a rejected
draft posts its typed text, as on the latest stable release (FR4, FR9). `DateTimeInput`'s time segment follows the same rule
outside its preset-time list.

### DEC-7 — A shown rejection stays until the entry is valid

**Reference:** `spec:AST-118/DEC-7`
**Decider:** `nynexman4464`, `2026-11-11`

A rejection clears the moment the entry is fixed, so a correction gets
immediate credit. An edit that leaves the entry wrong does not make the
rejection untrue, so the rejection stays without a new announcement. A changed
message is new information, so it is announced once (FR6).

### DEC-8 — These changes are one accessibility behavior fix

**Reference:** `spec:AST-118/DEC-8`
**Decider:** `nynexman4464`, `2026-11-11`

Each change makes the four members meet WCAG 2.2 1.4.1 and 3.3.1 in a
standalone field, and none needs an app to change code, so they ship together
as a patch under `spec:AST-017` FR53. A caller `error` status keeps its place
on `NumberInput` and `TimeInput` (DEC-5), and what a form posts does not change
(DEC-13). Two screens an app chose change as part of
the fix: a `warning` or `success` status gives way to a rejection's message
(DEC-11), and unreadable `DateInput` text stays at commit with its message in
place of a caller status, as the field's message already wins there.

### DEC-9 — A native control restores its value and keeps the rejection

**Reference:** `spec:AST-118/DEC-9`
**Decider:** `nynexman4464`, `2026-11-11`

A native date or time control's own value is what a form posts, so a refused
date or time cannot stay in it. The control restores the committed value at
blur and keeps the rejection's message, `aria-invalid`, and announcement, so
the restore says why (FR4).

### DEC-10 — A grouped member announces its rejection

**Reference:** `spec:AST-118/DEC-10`
**Decider:** `nynexman4464`, `2026-11-11`

Inside an InputGroup, the group owns the only visible status, and its records
give a member no message box of its own. A grouped member's rejection is
announced and sets `aria-invalid`; a visible message there belongs to the
InputGroup records (FR5, AR3).

### DEC-11 — A warning or success status never hides a rejection

**Reference:** `spec:AST-118/DEC-11`
**Decider:** `nynexman4464`, `2026-11-11`

A field marked invalid that reads "Looks good" names no error, against WCAG 2.2
3.3.1, so a `warning` or `success` caller status never replaces a rejection's
message on any member, with or without `onEntryErrorChange`, as `DateInput`
already does (FR7).

### DEC-12 — A typed number is complete only at commit

**Reference:** `spec:AST-118/DEC-12`
**Decider:** `nynexman4464`, `2026-11-11`

A number has no fixed length, so no point before Enter or blur says it is
finished. `NumberInput` reveals a typed number's rejection at commit and
nothing while the person types, as React Aria's NumberField shows validation
when the person commits the value, typically on blur (FR1).

Rejected: a number that no digit typed at its end can bring into range counting
as complete, because the test is complex and easy to get wrong with negative
numbers and decimals.

### DEC-13 — What a form posts does not change

**Reference:** `spec:AST-118/DEC-13`
**Decider:** `nynexman4464`, `2026-11-12`

A form posts what it posts on the latest stable release. Where that release
reverts rejected text at a commit, the member keeps the text, and a hidden
input carries the caller's `name` with the committed value's text, which the
release posts once the text reverts. Elsewhere, the input that carries `name`
on the release keeps it and posts what it posts there. No posted value changes, so the change
stays an accessibility behavior fix under `spec:AST-017` FR53 (FR4).

Rejected: the committed value's text in every case, because it changes what a
released form posts, which `spec:AST-017` FR1 classes as breaking.

## Open questions

None.
