---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TextArea
platform_of: component:TextArea
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
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093]
---

# TextArea (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Web's `TextArea` props with web's names and defaults, and the touch-keyboard props `enterKeyHint`, `inputMode`, `autoCapitalize`, `hasAutoCorrect` and `hasSpellCheck`, without `htmlName`, `htmlMaxLength`, `autoComplete`, `onPaste`, `width` and the `container*` and `control*` styling props. `onFocus` and `onBlur` take no event. The ref is an `InputHandle` on the control. |
| Behavior                | A multi-line platform text view in the field's box, at least `rows` lines tall at the person's text size; Return inserts a line break. `maxLength` adds a counter that counts what a person sees as characters, warns past the limit and never blocks typing.                                                                                                                        |
| End-user impact         | A person writes longer text with the platform's own text editing, selection and keyboard, sees a live count, and hears it when they near or pass the limit.                                                                                                                                                                                                                          |
| Builder impact          | Web code that renders a `TextArea` ports unchanged unless it passes one of the HTML or styling props React Native does not offer, reads the event in `onChange`, `changeAction`, `onFocus` or `onBlur`, calls `preventDefault()` to skip `changeAction`, or holds an `HTMLTextAreaElement` ref (the ref is an `InputHandle`).                                                        |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR1, FR2 and FR3.                                                                                                                                                                                                                                                                                                |
| Review checks           | Reject a counter that truncates input or counts code units, an announcement on every keystroke within the limit, text that runs under the icons or counter, a disabled field that a screen reader cannot reach, or a prop accepted and ignored.                                                                                                                                      |
| Governing rules         | `component:TextArea`; `family:input-fields`; `spec:AST-085` FR1–FR3; `spec:AST-082` FR3, FR5, FR7, FR11; `spec:AST-093` FR1–FR5.                                                                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

TextArea on React Native is web's multi-line field: the same props, counter,
statuses and disabled and read-only states, drawn around the platform's own
multi-line text view, so typing, selection, the keyboard and the screen
readers work as they do in every other app.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: `value` is required
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `TextArea`: its props, its platform text view
  and its height (FR1, FR2).
- The counter, its counting and its announcements (FR3).
- Disabled, read-only and busy behaviour on the platform text view (FR4).

**Does not own / non-goals**

- The meaning of the web props — owned by `component:TextArea`.
- The label, description, status message and required words — owned by
  `family:input-fields` and `component:Field`.
- The touch-keyboard props' meaning — owned by `component:TextInput` FR16.
- The start icon and the spinner — owned by `component:Icon` and
  `component:Spinner`.

## Public concepts

| Concept      | Closed values or states       | Meaning                                                           | Availability by variant/orientation/state         | Default  | Owner                 | Stability    | Invalid-value behavior         |
| ------------ | ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | -------- | --------------------- | ------------ | ------------------------------ |
| `rows`       | a positive integer            | the field's least height, in body lines at the person's text size | always                                            | `3`      | `component:TextArea`  | experimental | a value under 1 shows one line |
| counter      | under; near; over             | the character count against `maxLength`                           | with `maxLength`                                  | none     | `component:TextArea`  | experimental | none                           |
| availability | editable; read-only; disabled | whether the value can change                                      | always; disabled wins                             | editable | `component:TextArea`  | experimental | none                           |
| busy         | idle; busy                    | the value is loading or being saved                               | `isLoading`, or while a `changeAction` is pending | idle     | `family:input-fields` | experimental | none                           |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                                              | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native's `TextArea` MUST take web's `label`, `value`, `onChange`, `changeAction`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `isReadOnly`, `disabledMessage`, `isLoading`, `placeholder`, `rows`, `maxLength`, `status`, `statusVariant`, `labelTooltip`, `startIcon`, `hasAutoFocus`, `size`, `onFocus`, `onBlur`, `enterKeyHint`, `inputMode`, `autoCapitalize`, `hasAutoCorrect` and `hasSpellCheck` with web's names, defaults (three rows, `md`, `attached`, spellcheck on) and meaning, and no other props. `onChange` and `changeAction` receive the value, and `onFocus` and `onBlur` take no argument and follow the field's own focus however it came: a touch, a screen reader, a hardware keyboard, `hasAutoFocus` or the ref. The touch-keyboard props follow `component:TextInput` FR16, `autoCapitalize`'s `off` meaning `none` and `on` meaning `sentences`, as on the web. Base props follow `spec:AST-082` FR7 on the control, and the ref is an `InputHandle` on it with `focus()`, `blur()` and `isFocused()`. `onChange` receives only the value, so it cannot stop `changeAction` as the web's `preventDefault()` does; `changeAction` runs after every edit. It MUST NOT offer a prop it does not honor: `htmlName`, `htmlMaxLength` and `autoComplete` are HTML attributes and `onPaste` a DOM clipboard event, while a platform text view has no form, attribute or DOM event; `width` is a CSS length; and the `container*` and `control*` props are web styling. Inside an InputGroup it keeps its own field, as on the web. | `component:TextArea` FR1, FR4, FR11–FR13; `component:TextInput` FR16; `spec:AST-082` FR3, FR5, FR7 | verify             |
| FR2 | The field MUST be the platform's multi-line text view inside the field's box, at least `rows` body lines tall at the person's text size, its text in the body type growing with Dynamic Type on iOS and the font scale on Android. Return inserts a line break whatever `enterKeyHint` says. The start icon sits at the top start, the spinner and the on-field status icon at the top end, and the counter at the bottom end, and the text never runs under them. A tap on the box outside the text view focuses it, except while disabled or busy. The status border and the status message follow `family:input-fields`; an attached status meets the box's lower edge without sliding under it, as `component:TextArea` FR8 places it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:TextArea` FR3, FR7, FR8, FR11; `family:input-fields`; `spec:AST-082` FR11               | verify             |
| FR3 | With `maxLength`, a counter MUST show the count and the limit (`12/200`) in the locale's digits, counting what a person sees as one character, so a joined emoji counts once. It never sets a limit on the text view and never blocks typing. Over the limit its words take the error colour beside a warning icon. The counter is its own element, read as the characters left or over ("12 characters remaining", "3 characters over the limit"). An edit that lands in a different zone than the previous edit announces it: entering the last 20% of the limit announces the characters left politely, passing the limit announces the overage at once, and moving back under announces nothing; the first edit after mount announces the zone it lands in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:TextArea` FR5, FR6                                                                      | verify             |
| FR4 | A disabled field (`isDisabled`) MUST take no edits, read as disabled and stay reachable by VoiceOver and TalkBack, with `disabledMessage` read as its disabled reason; its box takes the disabled paint. A read-only field (`isReadOnly`) takes no edits, keeps full paint and stays reachable; disabled wins when both are set. While `isLoading`, or while a `changeAction` is pending, the field reads as busy and shows the spinner, and the field shows the proposed value until the action settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:TextArea` FR4, FR9, FR10; `spec:AST-085` FR1–FR3; `family:input-fields`                 | verify             |

The gap lines below describe `@astryxdesign/react-native`, the library that
implements this record.

- FR1 gap: the library does not offer `changeAction`.
- FR2 gap: `statusVariant` defaults to `attached`, which `family:input-fields`
  FR8 and AV6 allow only on a fixed-height control, while this field grows past
  `rows`; the same conflict as `component:TextArea` FR8 records on the web.
- FR2 gap: the library focuses the field on a box tap while it is busy.
- FR1 gap: the library's `autoCapitalize` does not take `off` and `on`.
- FR3 gap: the library announces the overage politely on every edit past the
  limit and announces nothing as the count nears it.

### Allowed variation

- **AV1 — Platform text.** Text editing, selection, the caret, the keyboard
  and how the text view grows and scrolls past `rows` are the platform's own.

### Representative states

| State                             | Required invariant                                        | Allowed variation |
| --------------------------------- | --------------------------------------------------------- | ----------------- |
| default                           | three body lines tall; spellcheck on                      | AV1               |
| largest text size                 | `rows` lines at that size                                 | AV1               |
| `maxLength={200}`, 150 characters | `150/200`; no announcement                                | none              |
| an edit that reaches 170 of 200   | the characters left announced once, politely              | none              |
| an edit past 200                  | error colour and warning icon; the overage announced once | none              |
| a joined emoji typed              | counted as one character                                  | none              |
| disabled with a reason            | no edits; read as disabled with its reason                | none              |
| read-only                         | no edits; full paint                                      | none              |
| `isLoading`                       | read as busy; the spinner at the top end                  | none              |

### Transformation and precedence order

- **ORD1 — Availability.** Disabled, then read-only, then editable.
- **ORD2 — Change.** An edit calls `onChange`, then `changeAction` (no veto,
  FR1); the field
  shows the proposed value while the action is pending, then `value`.
- **ORD3 — Counter zone.** Under, near (the last 20% of the limit), over;
  only a change of zone announces.

### Performance and resources

- **PR1 — Count on edit.** The counter counts once per render of the value,
  and a field without `maxLength` counts nothing.

## Accessibility contract

- **AR1 — One field.** The text view is the field's element, named by the
  label with the required mark, status and description as `family:input-fields`
  states, and read with its disabled and busy states.
- **AR2 — The counter.** The counter is its own element after the field,
  read as the characters left or over (FR3).
- **AR3 — Announcements.** Only a change of counter zone announces (FR3); the
  busy start is announced once (`family:input-fields`).
- **AR4 — Text size.** The text and the field's least height grow with the
  person's text size (FR2).

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Text view        | the platform's multi-line text view in core's field box | prescribed by core       | primary        | FR2                |
| Counter          | core's count with its over-limit cue                    | prescribed by core       | supporting     | FR3                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): the platform's multi-line text view
through React Native's `TextInput`. Guideline pages (`spec:AST-093` FR3): Text
fields and Accessibility in the Apple Human Interface Guidelines.

Theme values read (`spec:AST-093` FR4): the field box's sizes, border, fill,
status and disabled colours from the input field family, the body type and its
line height, the supporting type and the error colour for the counter, and the
warning icon.

## Family and system relationships

- `component:TextArea` owns the props and their meaning; this record states
  only what React Native adds or does differently.
- `family:input-fields` and `component:Field` own the label, description,
  status, required words and busy announcement.
- `component:TextInput` FR16 owns the touch-keyboard props.

## Verification map

| Contract                 | Verification                                                                                          | Representative states                                                                                                                         | Mutation or failure expectation                                                                                                | Audit section                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| FR1                      | Type tests of the exports against web's types; a contract drift test                                  | each prop; the HTML and styling props absent; `autoCapitalize` `off` and `on`; focus by touch, screen reader and ref                          | a missing web prop, a different default, an accepted and ignored prop, or a focus callback that misses a focus path fails      | `audit:react-native/TextArea/api`     |
| FR2                      | Unit tests of height and placement; captures at the default and largest text sizes                    | each `rows`; each size; a start icon, a status icon, the spinner and the counter together; a tap on the box while editable, disabled and busy | a field shorter than `rows` lines, text under an icon or the counter, or a box tap that focuses a disabled or busy field fails | `audit:react-native/TextArea/layout`  |
| FR3, AR2, AR3, ORD3, PR1 | Unit tests of counting, announcements and when the count runs; VoiceOver and TalkBack checks          | under, near and over; a joined emoji; another locale's digits; moving back under; a first edit already near                                   | a counter that blocks typing or counts code units, an announcement within a zone, or none on a change of zone fails            | `audit:react-native/TextArea/counter` |
| FR4, AR1, ORD1, ORD2     | Unit tests of disabled, read-only and busy states and the change order; VoiceOver and TalkBack checks | disabled with a reason; read-only; both; `isLoading`; a pending `changeAction`                                                                | an edit while disabled or read-only, a disabled field a screen reader cannot reach, or a busy state that is not read fails     | `audit:react-native/TextArea/states`  |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
