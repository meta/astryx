---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/NumberInput
platform_of: component:NumberInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, interaction, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112, spec:AST-118]
---

# NumberInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `NumberInput` under its core name with core's field props, `value` and `onChange` (a number, or `null` for an empty field), `min`, `max`, `step`, `isIntegerOnly`, `formatValue`, `units`, `hasClear`, `size`, `status`, `statusVariant`, `startIcon`, `labelIcon`, `hasNumberSteppers` (OQ1), `width` (a number of dp), `isReadOnly`, `hasAutoFocus`, `onEnter`, `entryErrorBehavior` and `onEntryErrorChange`, and a ref with `focus`, `blur` and `isFocused`. `isWheelEnabled`, DOM events and the web's form and styling props stay in the web contract. |
| Behavior                | A text field with the number keyboard the accepted values need. Typing changes only a draft; the draft commits on blur or the keyboard's Done, read under the locale and clamped to the range. Screen readers adjust it as one adjustable element that steps by `step`.                                                                                                                                                                                                                                                                                                           |
| End-user impact         | A person types a number on the keyboard that fits it, sees it clamp to the range when they finish, never loses an entry without a message, and can step it with VoiceOver or TalkBack.                                                                                                                                                                                                                                                                                                                                                                                            |
| Builder impact          | None beyond core's: the numeric callback and the field props are the same; `width` is a number of dp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Compatibility/readiness | Not yet released; additive. Draft. Where the field differs from this record or `component:NumberInput`, a gap line under Current-state impact says so.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Review checks           | Reject an `onChange` per keystroke, a commit of text that does not parse, a draft discarded without a message, an off-grid or out-of-range step, a stepping route open while read-only or disabled, a draft exposed as the value, a visual value not from the theme, or a prop the field accepts and ignores.                                                                                                                                                                                                                                                                     |
| Governing rules         | `component:NumberInput` FR2–FR4, FR6–FR10, FR12, FR14–FR16 and AR1–AR5; `family:input-fields`; `spec:AST-118`; `spec:AST-082` FR3, FR4, FR7, FR11, FR17; `spec:AST-093` FR2–FR4; DEC-1 below.                                                                                                                                                                                                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

A number field takes a quantity, a measurement or a percentage. NumberInput on
React Native keeps core's draft-and-commit rules, its range and grid, and its
rejection rules, takes entry through the platform's number keyboard, and
exposes the field to screen readers the way the platform exposes a value that
steps. This record states only what React Native adds to
`component:NumberInput` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled, as on the web: the app owns
  `value` and renders what `onChange` reports
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: React Native offers no `entryErrorBehavior`, no
  `onEntryErrorChange`, no `formatValue` and no `hasClear`, and its `onChange`
  never reports `null`.
- FR3 gap: a draft that does not parse, or any draft while `min` is above
  `max`, reverts to the committed value at blur and Done with no message,
  mark or announcement.
- FR3 gap: an integer-only field rounds a fraction at commit instead of
  rejecting it.
- FR4 gap: a step moves by `step` from the current value rather than to the
  next position of the grid that starts at `min` or 0, and from an empty field
  up and down both step from `min` or 0.

- FR5 gap: each stepper's touch target is 44 dp on Android too.

## Ownership boundary

**Owns**

- NumberInput's React Native props and ref (FR1).
- The touch keyboard, the commit and the step routes on React Native (FR2–FR4).
- The steppers a phone field shows (FR5, OQ1).
- How the field reads to VoiceOver and TalkBack (AR1–AR4).

**Does not own / non-goals**

- The meaning of core's props, the parse, clamp and grid rules, and the
  rejection rules — owned by `component:NumberInput` and `spec:AST-118`.
- The label, description, status, the control box and InputGroup joining —
  owned by `family:input-fields` and the field components.
- Keyboard avoidance and the Done bar's placement — owned by the platform
  (`spec:AST-082` FR11).

## Public concepts

| Concept  | Closed values or states         | Meaning                                                                                                                                  | Availability by variant/orientation/state      | Default                        | Owner                                | Stability    | Invalid-value behavior |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------ | ------------ | ---------------------- |
| keyboard | signed, decimal pad, number pad | the touch keyboard: one with a minus key when `min` is unset or negative, else the number pad for integers and the decimal pad otherwise | editable                                       | from `min` and `isIntegerOnly` | `component:react-native/NumberInput` | experimental | none                   |
| draft    | none, typing, rejected          | text that has not committed                                                                                                              | while focused, and a rejected draft after blur | none                           | `component:NumberInput`              | experimental | none                   |
| steppers | off, on                         | − and + at the field's end (OQ1)                                                                                                         | editable                                       | off                            | `component:react-native/NumberInput` | experimental | none                   |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `NumberInput` (`spec:AST-082` FR3) with core's `label`, `value`, `onChange`, `size` (default `md`), `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `isReadOnly`, `disabledMessage`, `placeholder`, `labelTooltip`, `startIcon`, `labelIcon` (icon names, `spec:AST-082` FR17), `status`, `statusVariant` (default `attached`), `min`, `max`, `step` (default 1), `isIntegerOnly`, `formatValue`, `units`, `hasClear`, `hasNumberSteppers` (FR5), `width`, `hasAutoFocus`, `onEnter`, `entryErrorBehavior` and `onEntryErrorChange`, with core's meanings, and the base props `id` and `isHidden` on the control (`spec:AST-082` FR7). `value` and `onChange` carry a number or `null` for an empty field, as core types them (`spec:AST-082` FR4); `formatValue` shows the formatted committed value at rest and the plain number while focused (`component:NumberInput` FR6); `hasClear` shows core's clear button, which calls `onChange(null)` (`component:NumberInput` FR8); `width` is a number of dp that sizes the whole field. The ref offers `focus`, `blur` and `isFocused`. `isWheelEnabled` (a touch platform has no wheel over a field), `onKeyDown`, `onFocus` and `onBlur` (DOM events), `htmlName`, `autoComplete` and the container and control styling props belong to the web contract (`spec:AST-082` FR3, FR4). | `spec:AST-082` FR3, FR4, FR7, FR17; `component:NumberInput` FR6, FR8 | verify             |
| FR2 | The field MUST be the platform's text field with the touch keyboard its values need: a keyboard with a minus key when `min` is unset or negative (on iOS the numbers-and-punctuation keyboard, on Android the signed number keyboard), else the number pad when `isIntegerOnly` and the decimal pad otherwise, with no autocorrection and a Done key that submits. Typing changes only a draft and never calls `onChange`; the field shows the draft while focused and the committed value at rest, followed by `units` in the field's secondary words.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:NumberInput` FR2, FR7                                     | verify             |
| FR3 | Done ends editing, so blur and Done MUST resolve the draft alike, as `component:NumberInput` FR3 states for blur: a draft that parses under the locale (its digits, grouping and decimal separator, and sign) clamps to the range and commits with `onChange(number)` when it differs from `value`, and an empty draft reverts. A draft that does not parse, a fraction when `isIntegerOnly`, or any number while `min` is above `max` stays in the field with the field's own rejection message, mark and one announcement (`component:NumberInput` FR15, FR16; `spec:AST-118`). Done then calls `onEnter`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:NumberInput` FR3, FR15, FR16; `spec:AST-118`              | verify             |
| FR4 | A screen reader's increment and decrement, and the steppers (FR5), MUST step by one position of the grid that starts at `min` or 0 and commit at once, as `component:NumberInput` FR4 states: from an empty field up goes to `min` or 0 and down to `max` or 0; results stop at the range's ends and keep the precision of the step and the grid's start. A step during a draft also shows the stepped value in the draft. Stepping is off while read-only or disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:NumberInput` FR4, FR9, FR10                               | verify             |
| FR5 | With `hasNumberSteppers`, − and + MUST sit at the field's end after the units (OQ1): 28 dp buttons scaled with the text size on `color.backgroundMuted` with `radius.inner`, each a touch target of the platform minimum (44 points on iOS, 48 dp on Android), the icon in the field's ink. iOS's stepper (`UIStepper`) is a control of its own, beside a field rather than inside it, and Android has no stepper control, so the field draws its own buttons inside its box (`spec:AST-093` FR2). A button turns off, with no fill and the disabled icon colour, at its end of the range, while read-only, and while disabled. The buttons are hidden from screen readers; the field's own increment and decrement are the accessible route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | OQ1; `spec:AST-082` FR11; `spec:AST-093` FR2                         | verify             |
| FR6 | Disabled and read-only MUST follow `component:NumberInput` FR9 and FR10: disabled draws its words in the disabled colour, never with opacity, takes no edits and no steps, gives `disabledMessage` as its hint and on a hold, and an enclosing InputGroup's disabled state disables it; read-only draws at full strength and takes no edits and no steps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:NumberInput` FR9, FR10                                    | verify             |
| FR7 | The label, description, status, optional and required marks, start icon and the control box MUST follow the field family, as `component:NumberInput` FR12 states, and inside an InputGroup the field joins the group's box, size, status and disabled state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:NumberInput` FR12; `family:input-fields`                  | verify             |

### Allowed variation

- **AV1 — The platform's keyboard.** The number keyboards, their Done bar and
  their keys are the platform's own and differ between iOS and Android.
- **AV2 — Line metrics.** A line's height comes from the theme's leading over
  the platform's own text metrics, so a face can differ by a point.

### Representative states

| State                        | Required invariant                               | Allowed variation |
| ---------------------------- | ------------------------------------------------ | ----------------- |
| typing                       | the draft shows; no `onChange`                   | AV1               |
| Done with `150` in 10–100    | commits 100                                      | none              |
| blur with `1a`               | the draft stays with its message, announced once | none              |
| integer-only `1.5` at commit | rejected with its message                        | none              |
| empty field, increment       | goes to `min` or 0                               | none              |
| at `max`, increment          | nothing; + off                                   | none              |
| read-only                    | full strength; no edits, no steps                | none              |
| disabled with a reason       | disabled colour; the reason as hint              | none              |
| in an InputGroup             | joins the group's box                            | none              |
| `min` unset                  | a keyboard with a minus key                      | AV1               |

### Transformation and precedence order

- **ORD1 — Commit.** A draft that parses: integer check, then clamp, then
  `onChange` when it differs; otherwise the rejection (FR3).
- **ORD2 — Disabled and read-only.** Disabled wins over read-only.
- **ORD3 — Status message.** A caller `error` status with a message, then
  the field's own rejection message (`component:NumberInput` FR16).

### Performance and resources

- **PR1 — One render per commit.** Typing renders the field for its draft
  only; the owner renders once per commit or step.

## Accessibility contract

- **AR1 — One adjustable element.** The field is one adjustable element
  named by its label and the field's words, with the minimum, maximum and the
  committed value, with `units`, as its value; the draft is never the value
  (`component:NumberInput` AR1).
- **AR2 — Steps.** VoiceOver's swipe up and down and TalkBack's adjustment
  step the value as FR4 says; they are absent while read-only or disabled.
- **AR3 — Rejection.** A rejected draft shows its message, marks the field
  invalid and is announced once, as `component:NumberInput` AR2 states.
- **AR4 — Disabled and text size.** A disabled field stays in the reading
  order and reads as disabled with its reason as the hint
  (`component:NumberInput` AR3); the words scale with Dynamic Type and
  Android's font scale.

## Design relationships

| Anatomy or state | Design requirement               | Representation authority   | Hierarchy role | Component contract |
| ---------------- | -------------------------------- | -------------------------- | -------------- | ------------------ |
| Field            | the field family's control box   | prescribed by core         | prominent      | FR2, FR7           |
| Keyboard         | the platform's number keyboard   | prescribed by the platform | supporting     | FR2                |
| Units            | secondary words after the number | prescribed by core         | supporting     | FR2                |
| Steppers         | − and + at the end (OQ1)         | owner decision pending     | supporting     | FR5                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): the platform's text field, through
React Native's `TextInput`, with the platform's number keyboards. Neither
platform has a number field of its own outside a text field. Guideline pages
(`spec:AST-093` FR3): Text fields, Virtual keyboards and Accessibility in the
Apple Human Interface Guidelines; Text fields in Material 3.

Theme values read (`spec:AST-093` FR4): the field family's tokens, `space.s0_5`
before the units, `color.backgroundMuted` and `radius.inner` for the steppers,
the primary and disabled icon colours, and the text scale.

## Family and system relationships

- `component:NumberInput` owns the props, the parse, clamp and grid rules and
  the rejection rules; this record states how React Native takes entry and
  exposes the field.
- `family:input-fields` owns the label block, the control box, status and
  InputGroup joining.
- `spec:AST-118` owns how a field shows a rejected entry.

## Verification map

| Contract       | Verification                                                                                                     | Representative states                                                                                         | Mutation or failure expectation                                                                                                                        | Audit section                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| FR1            | Type tests of NumberInput's props and ref against the core contract; a contract drift test                       | each core prop, `formatValue` and `hasClear` included; `null` through `onChange`; each web-only prop; the ref | a renamed prop, an offered web-only prop, or an accepted and ignored prop fails                                                                        | `audit:react-native/NumberInput/api`      |
| FR2, FR3, ORD1 | Unit tests of the keyboard, the draft and the commit through the package's testing doubles (`spec:AST-112` FR15) | each keyboard case; typing; Done and blur; locale input; clamp; `1a`; integer-only `1.5`; inverted range      | an `onChange` while typing, a commit of text that does not parse, a draft dropped without a message, or a wrong keyboard fails                         | `audit:react-native/NumberInput/behavior` |
| FR4, AR2       | Unit tests of the accessibility actions and the steppers                                                         | from empty; at each end; an off-grid value; read-only; disabled                                               | a step off the grid, past an end, or while read-only or disabled fails                                                                                 | `audit:react-native/NumberInput/behavior` |
| FR5            | Unit tests and captures of the steppers on iOS and Android                                                       | each end; read-only; disabled; a large text size; the touch target on each platform                           | a stepper shown without the prop, an enabled stepper at its end, a stepper a screen reader reaches, or a touch target under the platform minimum fails | `audit:react-native/NumberInput/steppers` |
| FR6, FR7       | Unit tests with two themes; InputGroup cases                                                                     | disabled with a reason; read-only; grouped                                                                    | opacity on a disabled field, an edit while read-only, or a grouped field outside the group's box fails                                                 | `audit:react-native/NumberInput/field`    |
| AR1–AR4        | VoiceOver and TalkBack checks; unit tests of the element's name, value and actions                               | units; a draft; a rejection; disabled                                                                         | a draft read as the value, a second element, or a rejection not announced fails                                                                        | `audit:react-native/NumberInput/a11y`     |

## Decision log

### DEC-1 — The keyboard follows the accepted values

**Reference:** `component:react-native/NumberInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

A phone has no physical keys for a number field, so the field opens the touch
keyboard that can type every value it accepts and no more: one with a minus
key when negatives are allowed, the number pad for whole numbers and the
decimal pad otherwise. On iOS the number and decimal pads have no minus key,
so a field that allows negatives takes the numbers-and-punctuation keyboard
there.

## Open questions

- **OQ1 — Does a phone number field show − and +?** (`human-design`) Core
  hides its compact steppers on a coarse primary pointer, with no opt-out
  (`component:NumberInput` FR5, DEC-1), so under core's rule a phone never
  shows them and `hasNumberSteppers` would be accepted and ignored there.
  Options: show touch-sized − and + on a phone with `hasNumberSteppers`, as FR5
  states, which amends core's FR5 and DEC-1 for touch-sized buttons; or move
  `hasNumberSteppers` to the web contract and keep a phone field to the
  keyboard and the screen reader's steps.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
