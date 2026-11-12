---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-120
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

# Rejected entry submission and message precedence system spec

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

When an input that checks its own entries holds an entry it rejects, its form
does not submit through the browser: the submission stops, focus moves to the
field, and the field's own message says why, with no browser bubble beside it.
A caller `error` status with a message is the message each of these inputs
shows for a rejection, so an app words its errors one way across all four.

## Members

The rule applies to the four members of `family:input-fields` that reject typed
or reported entries themselves: `DateInput`, `DateTimeInput`, `TimeInput`, and
`NumberInput`. `FileInput` drops the picked files it rejects and keeps no
rejected entry, so it is outside this record, as are members that reject
nothing themselves, such as `TextInput`, `Selector`, and `DateRangeInput`.

## Non-goals

- When a rejection appears, what a commit keeps, and what a form posts when it
  submits. `spec:AST-118` and `spec:AST-117` own them.
- Caller validation. A caller `error` status is not a rejection and does not
  stop a submission; an app decides whether its own errors stop its submit.
- The browser's own constraints, such as `required` and `pattern`, on members
  and on other controls, which keep their meaning.
- Where focus goes when a control that is not a member is invalid; the browser
  handles that control.
- Rejection wording. Each member's record and `spec:AST-111` AR3 own the
  messages; `spec:AST-086` owns their delivery.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Public contract

No prop, type, or export changes. Constraint validation is the public surface:
a form's `checkValidity()`, `reportValidity()`, and `requestSubmit()`, a
control's `validity` and `validationMessage`, and the `:invalid` and
`:user-invalid` selectors read a member's rejected entry.

```tsx
<form onSubmit={save}>
  <DateInput label="Start" name="start" value={start} onChange={setStart} />
  <button type="submit">Save</button>
</form>
// While Start keeps `02/31/2026` with its message, Save does not call `save`,
// and focus moves to Start.

<form noValidate onSubmit={saveDraft}>…</form>
// Submits; the form posts what spec:AST-118 FR4 states.
```

```tsx
<DateInput
  label="Start"
  value={start}
  onChange={setStart}
  status={startError ? {type: 'error', message: startError} : undefined}
/>
// A caller error message shows in place of the field's own message, with or
// without onEntryErrorChange.
```

## Requirements

### Terms

- A **rejected entry** is an entry whose rejection a member reveals
  (`spec:AST-118` FR2–FR5) while the entry stays in the control: typed text, or
  a value a native control holds. A native control whose value blur restored
  holds no rejected entry, though its message stays (`spec:AST-118` FR4, FR6).
- A **native submission** is a form submission that runs constraint
  validation: a submit button, implicit submission by Enter, or
  `requestSubmit()`, on a form without `noValidate`, from a submitter without
  `formNoValidate`.
- **Constraint validation**, `validationMessage`, and the `invalid` event are
  as the HTML standard defines them.
- A **member's control** is the control the person edits: its typed input or
  its native control. A hidden input never takes part in constraint validation.

### Behavior

- **FR1 — A rejected entry fails constraint validation.** While a member holds a
  rejected entry, its control fails constraint validation: `validity.valid` is
  false, `validity.customError` is true, and `validationMessage` is the message
  the field shows for the rejection (FR5; `spec:AST-118` FR5). The control is
  valid again the moment the member holds no rejected entry. A member holds no
  rejected entry while it reveals no rejection: while an entry is unfinished or
  waits for commit, or while the member is disabled or busy (`spec:AST-118`
  FR1–FR3, FR10). Each segment of `DateTimeInput` is judged on its own entry.
- **FR2 — A rejected entry stops a native submission.** Every native submission
  first commits each member's entry that is not committed, as blur does, and is
  judged on the result; Enter in a member's field is that commit (`spec:AST-118`
  FR9). When a member of the form then holds a rejected entry, the submission
  does not run: no `submit` event fires, `onSubmit` does not run, and the form
  posts nothing. `reportValidity()` judges members the same way.
- **FR3 — Focus moves to the first rejected field, with no bubble.** When a
  native submission or `reportValidity()` stops and every invalid control of the
  form is a member's control, focus moves to the first of them in tree order.
  The browser shows no validation bubble for a member's control, because the
  field already shows its message. Focus moving there reads the field's message
  through `aria-describedby` (`spec:AST-118` FR5), so a standalone field makes
  no new announcement; inside an InputGroup, where the member shows no message,
  its alert announces the rejection's message once. A control that is not a
  member keeps the browser's own handling, which can take focus.
- **FR4 — `noValidate`, `formNoValidate`, and `form.submit()` still submit.** A
  form with `noValidate`, a submitter with `formNoValidate`, and `form.submit()`
  skip constraint validation, so a member's rejected entry does not stop them,
  and the form posts what `spec:AST-118` FR4 states. The member's control still
  fails constraint validation (FR1), so an app can read each field's validity in
  its own submit code.
- **FR5 — A caller `error` status with a message wins on every member.** On
  every member, with or without `onEntryErrorChange`, a caller `error` status
  with a message shows in place of the field's message while a rejection
  stands; a `warning` or `success` status, or an `error` status without a
  message, never replaces it (`spec:AST-118` FR7). While the caller's message
  shows, `aria-invalid` stays set. Without the callback, the field's alert
  announces the rejection's own message once, so the person still hears what
  was rejected; with it, the caller's message is the one announced
  (`spec:AST-118` FR7).

### Accessibility contract

- **AR1 — A stopped submission says why.** Focus lands on the rejected field,
  whose visible message is its accessible description, or inside an InputGroup
  its alert says it (FR3), so a person who presses Save learns what to fix
  (WCAG 2.2 3.3.1).
- **AR2 — No false alarms.** A control fails constraint validation only while
  its member reveals a rejection (FR1), so `:invalid` and any invalid state an
  assistive technology reads from constraint validation never mark an
  unfinished entry (`spec:AST-118` AR1).
- **AR3 — One message.** The message a person hears for a stopped submission is
  the one the field shows, the caller's when FR5 shows it; the browser's bubble
  never adds a second one.

### Compatibility

Both changes are breaking under `spec:AST-017` FR1, and each ships only in a
minor.

- Classification:
  - Each change is one `[breaking]` Changeset, admitted only while `main`
    declares a minor (`spec:AST-017` FR31). In a declared minor it needs no
    deprecation path; its Changeset names the change, the scenario, and the
    migration (`spec:AST-017` FR28).
  - Neither is a breaking correction under `spec:AST-017` FR32: no current
    authority proves the released behavior wrong, so each is a new contract
    decision for the direct owner (`spec:AST-017` FR33).
  - Neither is an accessibility behavior fix under `spec:AST-017` FR53:
    `spec:AST-118` already makes each member meet WCAG 2.2 1.4.1 and 3.3.1.
- Consumer scenarios that break:
  - An app's `onSubmit` that runs on a native submission while a member holds a
    rejected entry, to save a draft, show its own error summary, or post the
    form with `fetch`, no longer runs: no `submit` event fires (FR2). A form's
    `checkValidity()` that an app reads returns false, and `:invalid` and
    `:user-invalid` rules start to match a member's control (FR1).
  - An app that passes `DateInput` or `DateTimeInput` a caller `error` status
    with a message, without `onEntryErrorChange`, shows its own message in place
    of the field's rejection message while the rejected text stays; the latest
    stable release shows the field's message there (FR5).
- Migration:
  - For a stopped submission: the person fixes the entry, which the field
    focuses and explains; or the app sets `noValidate` on the form or
    `formNoValidate` on a submitter, or calls `form.submit()`, and reads each
    member's validity or `onEntryErrorChange` report in its own submit code
    (FR4).
  - For the message: the app passes `onEntryErrorChange` and words its `error`
    status for the rejection's `kind`, or clears its `error` status while a
    rejection stands so the field's message shows (FR5).
- Unchanged: props, types, exports, the committed value, `onChange`,
  `onEntryErrorChange` reports, and what a form posts when it submits
  (`spec:AST-118` FR4).

### Platform support

- Supported feature/engine floor: every supported browser and renderer.
  Constraint validation and the cancelable `invalid` event are part of each,
  and `requestSubmit()` is judged wherever the browser has it; nothing here is
  behind a capability check.
- Unsupported behavior: none.
- Browser evidence: real-browser checks in Chromium, Firefox, and WebKit that a
  submit button, Enter, `requestSubmit()`, and `reportValidity()` stop while a
  member holds a rejected entry, including an entry not yet committed; that
  focus moves to the first rejected field with no bubble; that `noValidate`,
  `formNoValidate`, and `form.submit()` submit; and that the accessibility
  tree's invalid state follows `aria-invalid` while a person types.

## Current-state impact

- `family:input-fields` adds FR16, a projection of this record, and FR15 names
  every member for the caller `error` status.
- `component:NumberInput` FR17, `component:TimeInput` FR16,
  `component:DateInput` FR26, and `component:DateTimeInput` FR17 project
  FR1–FR4. `component:DateInput` FR25 and AR3 and `component:DateTimeInput` AR5
  project FR5. `spec:AST-118` FR7 names every member for the caller `error`
  status, and `spec:AST-118` DEC-5 is superseded in part by DEC-5 here.
- The `.doc.mjs` files of the four components describe a stopped submission,
  `noValidate` and `form.submit()`, and the caller `error` status on every
  member.

Requirement gaps:

- FR1–FR3 gap: no member's control fails constraint validation, so a native
  submission runs while a member holds a rejected entry, and nothing moves
  focus.
- FR5 gap: without `onEntryErrorChange`, `DateInput` and `DateTimeInput`'s date
  segment show their own message in place of a caller `error` status while the
  rejected text stays.

## Verification

| Contract | Verification                                           | Representative states                                                                                                                             | Failure signal                                                                                                                               |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | TBD (gap): validity unit cases per member              | Each rejection kind; unfinished entry; an entry that waits for commit; a restored native control; disabled and busy; each `DateTimeInput` segment | `validity.valid` true while a rejected entry stays, false without one, or a `validationMessage` other than the shown message                 |
| FR2      | TBD (gap): form submission suites per member           | Submit button, Enter, `requestSubmit()`, `reportValidity()`; an entry not yet committed; a valid draft; `NumberInput` past a bound                | A `submit` event or `onSubmit` call while a rejected entry stays, or a submission stopped without one                                        |
| FR3      | TBD (gap): real-browser focus and bubble checks        | First, second, and only rejected field; a non-member invalid control before and after; standalone and in an InputGroup                            | Focus that does not move to the first rejected field, a browser bubble on a member, a missing grouped announcement, or a repeated one        |
| FR4      | TBD (gap): form submission suites                      | `noValidate`; `formNoValidate`; `form.submit()`; each member with a rejected entry                                                                | A stopped submission, or a posted value other than `spec:AST-118` FR4 states                                                                 |
| FR5      | TBD (gap): caller-status suites for each member        | No, `error` with and without a message, `warning`, `success` status; callback or none                                                             | A field message shown over a caller `error` message, a caller `warning` or `success` over a rejection, or a missing or repeated announcement |
| AR1–AR3  | TBD (gap): screen-reader evidence under `spec:AST-009` | Stopped submission in each member, standalone and grouped, with and without a caller `status`                                                     | A stopped submission that says nothing, a browser bubble, or two messages                                                                    |

## Decision log

### DEC-1 — A rejected entry stops a native submission

**Reference:** `spec:AST-120/DEC-1`
**Decider:** pending

A field that shows an error while its form submits tells the person one thing
and the server another: the form posts text the field rejects, or the value the
person tried to change (`spec:AST-118` DEC-13). Constraint validation is how
the platform stops a submission on an invalid control, and React Aria's form
components use it to stop a submission with errors and focus the first invalid
field (FR1, FR2).

Rejected: stopping the `submit` event without constraint validation, because
`checkValidity()`, `:invalid`, and `formNoValidate` would not see the rejection.

### DEC-2 — Constraint validation follows the revealed rejection

**Reference:** `spec:AST-120/DEC-2`
**Decider:** pending

An unfinished entry is never flagged (`spec:AST-118` DEC-1), and constraint
validation drives `:invalid` and an invalid state assistive technologies can
read, so a control fails it only while its member reveals a rejection. A native
submission commits the entry first, so a rejection that waits for commit still
stops it (FR1, FR2).

Rejected: validity that follows each keystroke, because it flags unfinished
entries.

### DEC-3 — The field's message stands alone

**Reference:** `spec:AST-120/DEC-3`
**Decider:** pending

The field already shows its message and describes the control with it. The
browser's bubble would repeat it in a second place and style, so a member's
control shows no bubble, and the member moves focus itself (FR3).

### DEC-4 — `noValidate` and `form.submit()` are the way past the block

**Reference:** `spec:AST-120/DEC-4`
**Decider:** `nynexman4464`, `2026-11-12`

An app that validates in its own code sets `noValidate` or calls
`form.submit()`, and both skip constraint validation by definition. There a
member keeps posting what `spec:AST-118` FR4 states, and its control still
reports its validity for the app to read (FR4). No member has its own way
past the block.

Rejected: a prop that keeps one member out of constraint validation. A form
that validates in its own code already has `noValidate`, and a member-level
option can be added later without a breaking change.

### DEC-5 — A caller error status with a message wins on every member

**Reference:** `spec:AST-120/DEC-5`
**Decider:** pending

The app owns its wording, and `onEntryErrorChange` gives it each rejection's
kind, so a caller `error` message is the message all four members show. The
field's alert still announces the rejection's own message once without the
callback, so the person hears what was rejected (FR5).

Rejected: the field's own message winning on every member, because an app could
then never word a `NumberInput` or `TimeInput` rejection.

### DEC-6 — Both changes are breaking and ship in a minor

**Reference:** `spec:AST-120/DEC-6`
**Decider:** pending

Each change makes a valid released scenario change its code (`spec:AST-017`
FR1), and neither is needed for conformance (`spec:AST-017` FR53), so each ships
as one `[breaking]` Changeset in a declared minor (`spec:AST-017` FR28, FR31).

## Open questions

None.
