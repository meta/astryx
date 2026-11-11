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
correct it. An entry the person has not finished is never flagged.

## Members

The rule applies to the four members of `family:input-fields` that reject
entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. Members that reject nothing themselves, such as `TextInput`,
`Selector`, and `DateRangeInput`, are outside it.

## Non-goals

- A builder's choice to hold a member's rejections until commit for a form or
  a field. Another record owns that choice; this record states when a member
  reveals a rejection by default.
- Caller validation. A caller's `status`, `isRequired`, and form-library rules
  are unchanged.
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
  value does not change, and `onChange` does not fire. No member drops rejected
  text silently. An empty entry is not a rejection: a commit clears it or
  restores the committed value, as each member's record states. `NumberInput`
  clamps a number outside its range at commit (`component:NumberInput` FR3), so
  that rejection ends at the commit.
- **FR5 — Every rejection is visible, and its signals move together.** A
  rejection that appears shows its message as the field's error status, in the
  field's status placement and in place of a caller `status` while the rejected
  entry stays; sets `aria-invalid="true"` on the control; and is announced once
  (`spec:AST-086` FR1, FR6, FR7): a shown status announces itself, and an alert
  carries only a rejection that no status shows. Any invalid styling of the
  entry's text appears with them. None of these appears before the others, and
  none stays after the others clear.
- **FR6 — A shown rejection clears as soon as the entry is valid.** An edit
  that makes the entry a value the member accepts, or empties it, clears the
  rejection at once, without a commit. An edit that leaves the entry rejected
  or incomplete keeps the shown rejection and does not announce it again. The
  next commit, or the next complete entry, replaces it with the entry's current
  rejection, which announces once. A new `value` from the caller, or a date or
  time picked from a Calendar, sheet, or native picker, replaces the entry and
  clears its rejection.
- **FR7 — Enter commits every typed field.** Enter in the typed field of each
  member is a commit, so it reveals a text rejection there. Whether a
  surrounding form submits on that Enter follows each member's record.

### Accessibility contract

- **AR1 — No false alarms.** An unfinished entry produces no announcement and no
  invalid state (FR1–FR3).
- **AR2 — One announcement per rejection.** Each rejection that appears is
  announced once, at the urgency `spec:AST-086` FR5 gives an error, and its
  announced words match its shown words (`spec:AST-086` FR7).
- **AR3 — Not by color alone.** A rejection is always a visible message tied to
  the control by `aria-describedby`, never only a text color (WCAG 2.2 1.4.1,
  3.3.1).
- **AR4 — Nothing is discarded silently.** A commit keeps rejected text with its
  message (FR4), so a person always learns that an entry was not accepted
  (WCAG 2.2 3.3.1).

### Compatibility

Every change below applies with no prop set. Classified under `spec:AST-017`
against the latest stable release:

- **No flag on an unfinished entry.** `NumberInput`, `TimeInput`, and
  `DateTimeInput`'s time segment mark and announce every draft that is not an
  accepted value on each keystroke, and `DateInput` and `DateTimeInput` do the
  same for unreadable date text and for each partial year a native date control
  reports; under FR1–FR3 they flag none of these before the entry is complete
  or committed. An accessibility behavior fix (`spec:AST-017` FR53): an
  unfinished entry is not an input error (WCAG 2.2 3.3.1), and announcing one
  assertively reports an error that does not exist (`spec:AST-086` FR5).
  Consumer scenario (`spec:AST-017` FR1): a test or script that reads
  `aria-invalid` or the alert text while `-` is typed into a `NumberInput`
  reads neither until the entry is complete or committed; no prop restores the
  released behavior.
- **Rejected text stays at commit.** On the latest stable release, unreadable
  date text reverts on Enter and blur, and a `TimeInput` or `DateTimeInput`
  time draft and a `NumberInput` draft that does not parse revert on blur; under
  FR4 they stay with their message. An accessibility behavior fix
  (`spec:AST-017` FR53; WCAG 2.2 3.3.1): with no keystroke alert, a revert
  would discard the entry with no message. Consumer scenario (`spec:AST-017`
  FR1): a test that expects the committed value in the field right after blur on
  rejected text finds the rejected text and its message; the committed value and
  `onChange` are unchanged.
- **Every rejection is visible.** `NumberInput`, `TimeInput`,
  `DateTimeInput`'s time segment, the native date and time controls, and
  unreadable date text show a rejection only as text color and an alert on the
  latest stable release; under FR5 each shows a message as the field's error
  status. An accessibility behavior fix (`spec:AST-017` FR53; WCAG 2.2 1.4.1,
  3.3.1). Consumer scenario (`spec:AST-017` FR1): a layout gains a status
  message under the field, and a caller `status` gives way while rejected text
  stays, as it does for `DateInput`'s other rejections.
- **A shown rejection stays through an edit that leaves it rejected.** On the
  latest stable release, an edit that leaves date text incomplete hides a shown
  rejection; under FR6 it stays. Not breaking under `spec:AST-017` FR1: no
  consumer changes source or configuration, and the committed value is
  unchanged.
- **Enter commits `TimeInput`'s typed field.** `TimeInput` takes no commit on
  Enter on the latest stable release; under FR7 Enter reveals a rejected
  draft's message. Not breaking under `spec:AST-017` FR1: form submission on
  Enter is unchanged.

### Platform support

- Supported feature/engine floor: every supported browser and renderer. Nothing
  here is behind a capability check.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree assertions for the error status,
  `aria-invalid`, and live-region text at each keystroke and commit; a
  real-browser check of the partial years a native date control reports while
  the year is typed, and that blur and Enter commit on the typed and native
  surfaces.

## Current-state impact

- `family:input-fields` adds FR15, a projection of this record.
- `component:DateInput` FR25, `component:DateTimeInput` FR16,
  `component:TimeInput` FR14, and `component:NumberInput` FR15 project FR1–FR7,
  and the rows that describe a revert, a keystroke alert, or a rejection shown
  only by color point to them.
- The `.doc.mjs` files of the four components describe when a rejection shows,
  and that rejected text stays at commit.

Requirement gaps:

- FR1–FR3 gap: `NumberInput`, `TimeInput`, and `DateTimeInput`'s time segment
  mark every draft that is not an accepted value invalid and announce it on
  each keystroke, unfinished drafts included, such as `-`, or `1` with
  `min={10}`. `DateInput` and `DateTimeInput` do the same for unreadable date
  text and for each partial year a native date control reports.
- FR4 gap: unreadable date text reverts on Enter and blur; a `TimeInput` or
  `DateTimeInput` time draft that does not parse, or is out of range, reverts on
  blur; a `NumberInput` draft that does not parse reverts on blur.
- FR5 gap: `NumberInput`, `TimeInput`, `DateTimeInput`'s time segment, the
  native date and time controls, and unreadable date text set `aria-invalid` and
  announce with no visible message; the text only turns secondary.
- FR6 gap: an edit that leaves date text incomplete hides a shown rejection.
- FR7 gap: `TimeInput` takes no commit on Enter.

## Verification

| Contract | Verification                                  | Representative states                                                                                                                                               | Mutation or failure expectation                                                                                                         |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Completeness unit cases per kind of entry     | Dates per `spec:AST-111` FR12; `1:3`, `1:30`, `1:30 PM`, `13:30` in 12- and 24-hour fields; `-`, `2` and `4` in a 20–30 field, `150` with `max={100}`; `0002-05-10` | An unfinished entry counts as complete, or a complete one waits                                                                         |
| FR2, FR3 | Keystroke-by-keystroke suites                 | Each value and text rejection of each member; native date year typing; pasted text                                                                                  | A rejection appears before the entry is complete, a text rejection appears while typing, or a complete value rejection waits            |
| FR4      | Enter and blur suites                         | Each rejection kind; empty entry; `NumberInput` past a bound                                                                                                        | Rejected text reverts or commits, `onChange` fires, or a clamp is reported as a rejection                                               |
| FR5      | Accessibility-tree and live-region assertions | Standalone, horizontal-labels, InputGroup; each status placement; with a caller `status`                                                                            | The message, `aria-invalid`, styling, and announcement appear or clear apart, the caller status shows with rejected text, or it repeats |
| FR6      | Edit suites after a shown rejection           | Edit to valid; to empty; to incomplete; to another rejection; caller `value` change; calendar pick                                                                  | A fixed entry keeps its rejection, an incomplete edit clears it or announces it again, or a pick leaves it                              |
| FR7      | `TimeInput` Enter suites                      | Rejected draft; valid draft; inside a form                                                                                                                          | Enter reveals nothing for a rejected draft, or changes form submission                                                                  |
| AR1–AR4  | Screen-reader evidence under `spec:AST-009`   | Each member, typed and native                                                                                                                                       | An unfinished entry is announced, a rejection is heard twice, or a commit discards text with no message                                 |

## Decision log

### DEC-1 — An entry is complete when more typing cannot make it acceptable

**Reference:** `spec:AST-118/DEC-1`
**Decider:** pending

Form guidance advises against flagging an entry a person has not finished, and
allows checking a fixed-length entry once it is fully typed. Typed dates and
times have a fixed set of fields, so they are complete when every field is
present. A number has no fixed length, so it is complete only when nothing
typed at its end can bring it into range. A native date control reports
partial years while its year is typed, so its value is complete only at commit
(FR1).

Rejected: a pause in typing as completion, because its timing differs between
people and assistive technologies.

### DEC-2 — Text that is not a value waits for commit and then stays

**Reference:** `spec:AST-118/DEC-2`
**Decider:** pending

Unreadable text is never complete, so it waits for commit. A commit that
dropped it would discard the person's entry with no message, so the commit
keeps it and shows why (FR3, FR4).

### DEC-3 — Every rejection is a visible message

**Reference:** `spec:AST-118/DEC-3`
**Decider:** pending

A rejection that is only announced, or only colors the text, leaves a sighted
person without the reason and a screen-reader user with words no one else
sees. The field's error status carries the reason for everyone, and its
announcement is the one announcement (FR5).

### DEC-4 — A shown rejection stays until the entry is valid

**Reference:** `spec:AST-118/DEC-4`
**Decider:** pending

A rejection clears the moment the entry is fixed, so a correction gets
immediate credit. An edit that leaves the entry wrong does not make the
rejection untrue, so the rejection stays without a new announcement (FR6).

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
- **OQ2 — What happens to text that is not a value?** (`human-api`) FR3 and FR4
  state option (a).
  - (a) It waits for commit, and the commit keeps it with its message.
  - (b) It waits for commit, and the commit reverts it and announces that the
    entry was discarded.
  - (c) It shows as soon as no more typing can make it readable.
- **OQ3 — Does a shown rejection stay while an edit leaves the entry rejected
  or incomplete?** (`human-design`) FR6 states option (a).
  - (a) It stays, without a new announcement, until the entry is valid or
    empty, or a commit or complete entry shows its current rejection.
  - (b) Any edit hides it, and it appears again when the entry is complete or
    committed.
- **OQ4 — Does Enter on a rejected `TimeInput` draft hold back form
  submission?** (`human-api`) FR7 states option (a).
  - (a) No. Enter reveals the rejection, and form submission is unchanged.
  - (b) Yes, as `component:DateInput` FR16 holds back Enter on uncommitted
    text, so a form does not submit while the field shows a rejection.
