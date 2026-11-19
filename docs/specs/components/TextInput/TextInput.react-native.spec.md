---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TextInput
platform_of: component:TextInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093, spec:AST-112]
---

# TextInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | React Native exports `TextInput` under its core name, with the core props, meanings and defaults except the web-contract props FR2 names. `onChange` receives the value alone, and `startIcon` takes an icon name. It adds `onFocus`, `onBlur` and `render` (`auto`, `system`, `drawn`), and its `ref` is an `InputHandle` (`focus()`, `blur()`, `isFocused()`). The iOS and Android contracts add the touch-keyboard props each platform's field applies (FR4).                     |
| Behavior                | With `render="auto"`, the default, the field is the system text box wherever a host exists (UITextField on iOS, a Material 3 outlined text field on Android), inside Astryx's label, description and status. Elsewhere, inside an `InputGroup`, with a `tooltip` status placement, and with a start icon the system box cannot draw, it is Astryx's field: React Native's `TextInput` in Astryx's control box, whose placeholder follows the text size and is never cut.             |
| End-user impact         | A person types in the platform's own text field, with its keyboard, selection, input methods and autofill. The keyboard fits the field: a number pad, a phone pad, or a Return key that says Next or Search. VoiceOver and TalkBack read the field once, with its name, any error, its description and its state.                                                                                                                                                                    |
| Builder impact          | The same TextInput code runs on the web, iOS and Android, and a touch-keyboard prop type-checks only where the platform applies it. An app that wants Astryx's field sets `render="drawn"` on a field, or the theme's `render.default` for every field.                                                                                                                                                                                                                              |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Review checks           | Reject a prop a platform accepts and ignores, a `style` or other React Native view prop on `TextInput`, a ref other than `InputHandle`, a system box inside an `InputGroup`, with a `tooltip` status placement, or one that drops a start icon, a placeholder that is cut or sizes a field that has a value, a visible label read twice, an Android field that TalkBack names by its text, a disabled reason only a screen reader can reach, or a status message announced at mount. |
| Governing rules         | `component:TextInput`; `family:input-fields`; `spec:AST-082` FR3, FR4, FR7, FR11, FR17 and DEC-14; `spec:AST-085`; `component:Tooltip` FR5; `spec:AST-093` FR1–FR5; `spec:AST-112` FR21; `spec:AST-126` FR2, FR5 and FR9–FR13; `spec:AST-127` FR4 and FR7; DEC-1 and DEC-2 below.                                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

TextInput on React Native is core's single-line text field on a phone. It
types in the platform's own text field where that field meets the contract,
and in Astryx's field where it does not, with core's props, words, states and
accessibility either way. In this record, "core" is `component:TextInput`, and
the record states only what React Native adds or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component)
- Controlled/uncontrolled behavior: controlled; `value` and `onChange` only
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR6 gap: `TextInput` takes `presentation` (`default`, `native`,
  `adaptive-native`) and the capabilities provider's `nativePresentation` in
  place of `render`, as `spec:AST-112` FR21 records: `native` acts as
  `system`, `adaptive-native` as `auto`, and `default` as `drawn`. With
  neither set, the field is Astryx's field unless the theme's own default asks
  for the system box.
- FR6 gap: a start icon does not keep the field drawn. In the system box,
  Android draws no start icon, and iOS draws none for an icon name that has no
  SF Symbol.
- FR6 gap: `statusVariant="tooltip"` does not keep the field drawn; the
  system box shows the status message below the box.
- FR4 gap: the iOS types accept `enterKeyHint="previous"`, which the iOS
  keyboard has no key for.
- FR4 gap: the Android types accept `hasSpellCheck`, which the Android field
  does not apply.
- FR4 gap: in the system box, `inputMode="none"` still raises the text
  keyboard.
- FR7 gap: in the system box, a status with no message shows only the
  border colour, with no glyph.
- FR10 gap: Astryx's field opens a disabled field's reason on a long press,
  not a tap. In the system box, the reason is only its hint, and no tap shows
  it.

## Ownership boundary

**Owns**

- Which props React Native offers on each platform (FR1–FR5).
- Which text box draws the field, and what each box draws (FR6–FR9).
- How availability, change, clear, status, busy, Return and focus behave on
  React Native (FR10–FR14).
- Base props, the handle and the grouped field (FR3, FR15, FR16).
- How VoiceOver and TalkBack read the field (AR1–AR6).

**Does not own / non-goals**

- The meaning of TextInput's props, states and words — owned by
  `component:TextInput`.
- The label, description, markers, label tooltip and status message — owned
  by `family:input-fields`.
- `render` and the theme's `render.default` — owned by `spec:AST-112` FR21.
- The system text box's native contract — owned by `spec:AST-126` FR5.
- Icon resolution and drawn glyphs — owned by `spec:AST-127`.
- Keeping a focused field clear of the keyboard — owned by the screen's layout
  and `spec:AST-129`.
- Multiline text — owned by TextArea.

## Public concepts

| Concept          | Closed values or states                                                             | Meaning                                                                                                                                            | Availability by variant/orientation/state                                                                                    | Default                                                          | Owner                              | Stability    | Invalid-value behavior           |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- | ------------ | -------------------------------- |
| rendering        | `auto`; `system`; `drawn`                                                           | who draws the text box: `system`, the system text box; `drawn`, Astryx's field; `auto`, the system box wherever a host exists, else Astryx's field | always; drawn inside an `InputGroup`, with `statusVariant="tooltip"`, and with a start icon the system box cannot draw (FR6) | `auto`, unless the theme's `render.default` overrides it         | `component:react-native/TextInput` | experimental | an unknown value is a type error |
| type             | `text`; `password`; `email`                                                         | the core types React Native applies (FR5)                                                                                                          | always                                                                                                                       | `text`                                                           | `component:TextInput`              | experimental | another value is a type error    |
| Return key label | iOS: `enter`, `done`, `go`, `next`, `search`, `send`; Android: those and `previous` | `enterKeyHint`: what the keyboard's Return key says (FR4)                                                                                          | iOS and Android contracts                                                                                                    | unset: the platform's Return key                                 | `component:TextInput`              | experimental | another value is a type error    |
| touch keyboard   | `none`, `text`, `tel`, `url`, `email`, `numeric`, `decimal`, `search`               | `inputMode`: which keyboard opens (FR4)                                                                                                            | iOS and Android contracts                                                                                                    | unset: the keyboard `type` asks for                              | `component:TextInput`              | experimental | another value is a type error    |
| capitalization   | `none`, `sentences`, `words`, `characters`                                          | `autoCapitalize` (FR4)                                                                                                                             | iOS and Android contracts                                                                                                    | unset: `sentences` for `text`, `none` for `password` and `email` | `component:TextInput`              | experimental | another value is a type error    |
| autocorrect      | `true`, `false`                                                                     | `hasAutoCorrect` (FR4)                                                                                                                             | iOS and Android contracts                                                                                                    | unset: on for `text`, off for `password` and `email`             | `component:TextInput`              | experimental | another type is a type error     |
| spell check      | `true`, `false`                                                                     | `hasSpellCheck` (FR4)                                                                                                                              | iOS contract                                                                                                                 | unset: follows autocorrect                                       | `component:TextInput`              | experimental | another type is a type error     |
| availability     | editable; read-only; disabled                                                       | whether the value can change (FR10)                                                                                                                | always; disabled wins over read-only                                                                                         | editable                                                         | `component:TextInput`              | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                             | Draft review state |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native MUST export the component as `TextInput`, its name on every platform, and keep the core contract's props, meanings, defaults, states and words, except the props FR2 names (`spec:AST-082` FR3). `onChange` receives the value alone, since core's second argument is a DOM event (`spec:AST-082` FR4). `startIcon` takes a shared icon name, which resolves through `Icon` (`spec:AST-082` FR17, `spec:AST-127` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:TextInput`; `spec:AST-082` FR3, FR4, FR17                              | settled            |
| FR2  | The props React Native cannot honor as core defines them MUST stay in the web contract, and React Native's types refuse them (`spec:AST-082` FR3, DEC-14): `changeAction` (its callback returns a promise the field waits on, which no portable callback form carries, `spec:AST-082` FR4), `onKeyDown` (its argument is a DOM key event), `htmlName` and `autoComplete` (HTML attributes), `width` (a CSS length), and the `container*` and `control*` styling inputs. Without `changeAction`, the field is busy only through `isLoading` (FR13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-082` FR3, FR4, DEC-14                                                   | settled            |
| FR3  | React Native MUST add three props on iOS and Android, and one ref. `onFocus` and `onBlur` take no argument and run when the field gains or loses focus, however it came: a touch, a screen reader's activation, a hardware keyboard, `hasAutoFocus` or the handle's `focus()`. `render` chooses the text box (FR6). The `ref` is an `InputHandle` on the control: `focus()`, `blur()` and `isFocused()`, answered by whichever box is mounted, never the native view itself (DEC-1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-1; `spec:AST-082` FR7                                                         | verify             |
| FR4  | The iOS and Android contracts MUST carry the touch-keyboard props of core FR16 that each platform's field applies, with core's meaning, and no others (`spec:AST-082` FR3). Both carry `enterKeyHint`, `inputMode`, `autoCapitalize` (`none`, `sentences`, `words`, `characters`; the web's `off` and `on` are its other names for `none` and `sentences`) and `hasAutoCorrect`. `enterKeyHint` takes `previous` only on Android, since the iOS keyboard has no Previous key. `hasSpellCheck` is iOS only, since Android marks misspellings with its suggestions, which follow `hasAutoCorrect` (`spec:AST-126` FR5). On Android, `inputMode="search"` opens the text keyboard, and `enterKeyHint="search"` gives it a Search key; `inputMode="none"` opens no keyboard when the field takes focus. Unset, `autoCapitalize` is `sentences` and `hasAutoCorrect` is on for `text`, and both are off for `password` and `email`, which are left as typed. The props never change what Return does (FR14).                                                                     | `component:TextInput` FR16, DEC-1; `spec:AST-082` FR3, DEC-14; `spec:AST-126` FR5 | verify             |
| FR5  | `type` MUST take `text`, `password` and `email`: `password` is secure entry, and `email` brings up the email keyboard; in the system box they also set the field's content type, so the platform's autofill offers saved passwords and email addresses. `search`, `tel` and `url` stay in the web contract (OQ1); on React Native, `inputMode` brings up the search, phone and URL keyboards (FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-082` FR3; `spec:AST-126` FR5                                            | verify             |
| FR6  | `render` MUST choose who draws the text box (`spec:AST-112` FR21). `system` is the system text box (`spec:AST-126` FR5): a UITextField in the system's rounded style on iOS, a Material 3 outlined text field on Android. `drawn` is Astryx's field (FR8). `auto`, the default, is the system box wherever a host exists and Astryx's field elsewhere, silently; the theme's `render.default` overrides it (`spec:AST-126` FR2). `system` with no host draws Astryx's field with one development warning. The field is Astryx's field, whatever `render` says: inside an `InputGroup`, whose shell and border the system box cannot share (FR16); with a start icon the system box cannot draw (any start icon on Android; on iOS, an icon name with no SF Symbol), so the icon stays visible; and with `statusVariant="tooltip"`, since the system box has no status icon to carry the message (`family:input-fields` FR8). Switching `render` keeps the value; a field focused when it switches loses focus, and `onBlur` runs.                                           | `spec:AST-112` FR21; `spec:AST-126` FR2, FR5; `spec:AST-082` FR11                 | human decision     |
| FR7  | In the system box, the label MUST stay above the box, and the description and status message below it, in Astryx's type (`family:input-fields`). The system box has no status icon, so every status carries its glyph below the box, its cue other than colour (core AR4): `attached` and `detached` both show the message box as core's `detached` placement does, with the status glyph beside the message (AV3), and a status with no message shows its glyph alone there; a `tooltip` placement keeps Astryx's field (FR6). `status` colours the box's border, and for `error` its caret. The box draws the value, the placeholder, the keyboard, its clear button (on iOS while the field has focus; on Android Material's clear-text icon) and its loading indicator its own way. On iOS, a theme whose native `textField` is `filled` draws the box with the theme's fill (`neutral`, or the system's own fill when `textFieldFill` is `system`), element radius and inset, at the drawn box's height (`spec:AST-126` FR5); Android keeps Material's outlined field. | `spec:AST-126` FR5, FR11; `spec:AST-093` FR4                                      | verify             |
| FR8  | Astryx's field MUST be React Native's `TextInput` in the field family's control box: a border, an opaque fill, and on focus the accent border (unless a status holds its colour) and the inset ring; the theme's outer focus ring shows only for a focus that did not come from a touch. The start icon, the Spinner, the status icon and the clear button are in-flow items around the input and never cover its text. A tap on the box outside the input focuses it while the field is enabled, and the box's touch area reaches the platform minimum. The box's height is the element size for the resolved size as a minimum, and it grows with the text size (core FR11). The text is the body size at every size, with no focus-zoom floor: a native field does not zoom on focus.                                                                                                                                                                                                                                                                                    | `family:input-fields` FR1, FR2, FR9; `component:TextInput` FR11, FR12, FR15       | verify             |
| FR9  | Astryx's field MUST draw its placeholder as library text, at the body size in the secondary text colour, that follows the text size and wraps, and is never cut. While it shows, it sets the box's height, and typing starts on its first line. Once the field has a value, the box holds one line, so a hidden placeholder never sizes the field. React Native's own placeholder stays, transparent, so screen readers still read it as the field's placeholder (DEC-2). In the system box, the placeholder is the box's own (FR7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-2; `component:TextInput` FR2                                                  | verify             |
| FR10 | A disabled field (its own `isDisabled` or its `InputGroup`'s, `spec:AST-085` FR7) MUST NOT be editable or show the clear button. It is dimmed by colour, carries the disabled state, and stays an element VoiceOver and TalkBack reach (`spec:AST-085`). Its `disabledMessage` is its hint, and a tap on the box shows it in a tooltip, as a disabled control's reason opens under touch (`component:Tooltip` FR5). A read-only field is not editable, keeps full colour, carries no disabled state, never calls `onChange`, and shows no clear button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:TextInput` FR6–FR8; `component:Tooltip` FR5; `spec:AST-085`            | verify             |
| FR11 | Typing MUST call `onChange` with the new value while the field is editable. With `hasClear`, the clear button shows while the value is not empty and the field is editable; it is named "Clear" with the field's label and hinted "Clear", and pressing it calls `onChange('')` and keeps focus in the field. In the system box, the clear button is the box's own (FR7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:TextInput` FR3, FR5; `family:input-fields` FR11                        | verify             |
| FR12 | A status MUST paint the status border and, in Astryx's field, the status icon at the box's end for `attached` and `tooltip`. `attached` joins the message box to the control, `detached` floats it below, and `tooltip` draws no message box: a tap on the status icon shows the message. An `error` adds its message and the "invalid" word to the field's name (AR1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:TextInput` FR9; `family:input-fields` FR8                              | verify             |
| FR13 | `isLoading` MUST give the field the busy state and show a decorative small Spinner in the box (in the system box, the box's loading indicator).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `component:TextInput` FR4; `spec:AST-126` FR5                                     | verify             |
| FR14 | The keyboard's Return key MUST call `onEnter`, under every `enterKeyHint`, unless it commits an input method's conversion (core FR10). `hasAutoFocus` focuses the field on mount; in a modal sheet still sliding in on Android, the field asks for the keyboard again once the entrance ends, so it opens with its keyboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:TextInput` FR2, FR10                                                   | verify             |
| FR15 | The shared base props MUST attach to the control (`spec:AST-082` FR7, `family:input-fields` FR10): `id` is the test and native identifier of the text box, and `isHidden` removes the whole field, label and status included, from layout and the accessibility tree. `TextInput` takes no `style` or other React Native view prop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-082` FR7; `family:input-fields` FR10                                    | verify             |
| FR16 | Inside an `InputGroup`, the field MUST draw no shell or border of its own: the group's label names it first, its size, disabled state, description and status apply (`attached`, with no message box of its own), and the field takes the group's free space. It is always Astryx's field (FR6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `family:input-fields` FR3; `component:TextInput` FR1                              | verify             |
| FR17 | In the system box, the theme MUST reach the box only through the values `spec:AST-126` FR11 lists for the text field. A development build names, once, each theme override that does not reach it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-126` FR11; `spec:AST-093` FR4                                           | verify             |

### Allowed variation

- **AV1 — The system box.** In the system box, the box's look, placeholder,
  clear button, caret, loading indicator and motion are the platform's own and
  may change with each OS release.
- **AV2 — Theme paint.** Themes may restyle Astryx's field through the field
  family's box and its states without changing behavior.
- **AV3 — Message under the system box.** In the system box, an `attached`
  status shows as `detached`: its message box sits below the box with its
  glyph, instead of joining under the box's lower edge with the glyph on the
  control.

### Representative states

| State                                            | Required invariant                                                      | Allowed variation |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ----------------- |
| `render` unset, a host present                   | the system box inside Astryx's label and status                         | the system's look |
| `render="drawn"`                                 | Astryx's field                                                          | theme paint       |
| inside an `InputGroup`                           | Astryx's field; no shell or border of its own; the group's label first  | group geometry    |
| start icon on Android                            | Astryx's field with the icon                                            | none              |
| empty with a long placeholder, largest text size | the placeholder wraps, never cut; the box grows to it                   | none              |
| a value in a narrow row, largest text size       | one line; the hidden placeholder does not size the box                  | none              |
| disabled with a reason                           | not editable; dimmed; the reason is the hint and shows on a tap         | none              |
| read-only                                        | not editable; full colour; no clear button                              | none              |
| error with a message                             | error border; message and "invalid" in the name; message announced once | placement         |
| `statusVariant="tooltip"`, a host present        | Astryx's field; a tap on the status icon shows the message              | none              |
| autofocus in an entering sheet (Android)         | the keyboard opens when the entrance ends                               | none              |

### Transformation and precedence order

- **ORD1 — Rendering.** Inside an `InputGroup`, with `statusVariant="tooltip"`,
  or with a start icon the system box cannot draw, Astryx's field; else `render`; `auto` then resolves
  to the theme's `render.default`, else to the system box where a host exists,
  else to Astryx's field.
- **ORD2 — Availability.** Disabled (own or the group's), then read-only,
  then editable, as in core.
- **ORD3 — Keyboard.** `inputMode`, else the keyboard `type` asks for; a set
  `autoCapitalize` or `hasAutoCorrect`, else the type's default (FR4).
- **ORD4 — Size.** Explicit `size`, then the group's or the nearest size
  provider's, then `md`.

### Performance and resources

- **PR1 — Editing stays native.** Typing, selection and input methods run in
  the platform's text field; JavaScript hears only a change, a focus change and
  a Return (`spec:AST-126` FR13).
- **PR2 — No measurement.** The placeholder and the line box size the field
  through layout alone; the field adds no observer or measurement pass.

## Accessibility contract

- **AR1 — One element, named once.** The text box is the field's one element:
  React Native's `TextInput` in Astryx's field, the system field in the system
  box (`spec:AST-126` FR12). Its name is the group's label (in an
  `InputGroup`), the label, the required word, and for an error the message
  and the "invalid" word. Its hint is the description, a warning or success
  message, and the disabled reason. On iOS the visible label and description
  are hidden from VoiceOver, so nothing is read twice. On Android, Astryx's
  field is labelled by its visible label, which stays in the accessibility
  tree carrying the composed name, because TalkBack reads an edit field's text
  before its other names; with the label hidden or in an `InputGroup`, a
  one-point text beside the input carries the name.
- **AR2 — State.** The field carries the disabled and busy states; the
  required word and an error are in its name (AR1).
- **AR3 — Status announcements.** A status message is announced once when it
  appears or its words change, an error interrupting; it is not announced at
  mount or again for the same words.
- **AR4 — The disabled reason reaches everyone.** A screen reader reads it as
  the hint, and a tap shows it (FR10, `component:Tooltip` FR5).
- **AR5 — Text size.** The label, value, placeholder, description and status
  message scale with Dynamic Type and Android's font scale; Astryx's box grows
  with them (FR8, FR9), and the system box scales its own text.
- **AR6 — Targets.** The box, the clear button and the status icon's tooltip
  target reach the platform minimum touch target.

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority   | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Text box         | the platform's text field, or Astryx's control box | prescribed by the platform | primary        | FR6–FR8            |
| Placeholder      | secondary text that wraps and is never cut         | human-selected             | supporting     | FR9                |
| Start icon       | small secondary icon before the input              | current source             | supporting     | FR6, FR8           |
| Clear button     | trailing clear control while a value is editable   | current source             | supporting     | FR11               |
| Status           | border, icon and message in core's placements      | current source             | supporting     | FR7, FR12          |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UITextField in the rounded style on
iOS and a Material 3 outlined text field on Android, in the system box; React
Native's `TextInput`, the platform's own text editing, in Astryx's field.
Guideline pages: Text fields, Keyboards and Accessibility (Dynamic Type) in the
Apple Human Interface Guidelines; Text fields in Material 3 (`spec:AST-093`
FR3).

Theme values read (`spec:AST-093` FR4): in Astryx's field, the field family's
box: `color.textPrimary`, `color.textSecondary`, `color.textDisabled`,
`color.borderEmphasized`, `color.accent`, `color.accentMuted`,
`color.backgroundSurface`, `color.backgroundMuted`, `color.iconSecondary`, `color.iconDisabled`, the
status border and icon roles (`color.borderError`, `color.borderWarning`,
`color.borderSuccess`, `color.iconError`, `color.iconWarning`,
`color.iconSuccess`), `size.elementSm`, `size.elementMd`, `size.elementLg`,
`size.borderWidth`, `radius.element`, the focus outline, `space` steps, the
`body`, `label` and `supporting` type, and the text-size scale. In the system
box, the values `spec:AST-126` FR11 lists for the text field (the mode, the
accent and the status colours; on iOS with `filled`, the neutral fill, the
element radius and the horizontal inset) and the native theme's `textField`
and `textFieldFill`.

### Native pieces

| Native piece            | Record                       | What this record uses it for                                                                           |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AstryxNativeTextField` | `spec:AST-126` FR5, FR9–FR13 | the system box, its controlled text, focus commands, status colours and accessibility (FR6, FR7, FR17) |
| `Icon` resolution       | `spec:AST-127` FR4           | the start icon, and its SF Symbol in the iOS system box (FR1, FR6)                                     |
| `NativeVectorView`      | `spec:AST-127` FR7           | the drawn start, status and clear glyphs in Astryx's field (FR8)                                       |

## Family and system relationships

- `component:TextInput` owns the props, states and words; this record states
  only what React Native adds or does differently.
- `family:input-fields` owns the labelled field, its status placements, the
  clear control and grouped admission; Astryx's field and the system box both
  sit inside it.
- `spec:AST-112` FR21 owns `render`; `spec:AST-126` owns the system text box
  and when a host exists; `spec:AST-127` owns icons.
- `spec:AST-085` owns disabled reachability.

## Verification map

| Contract      | Verification                                                                                           | Representative states                                                                                                                                                                        | Mutation or failure expectation                                                                                                                                                                           | Audit section                             |
| ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1–FR5       | Type tests of the shared, iOS and Android views against the generated contracts; a contract drift test | each core prop; each web-contract prop; each touch-keyboard prop per platform; each `type`                                                                                                   | a web-contract prop accepted, a touch-keyboard prop accepted where its platform ignores it, `style` accepted, or a renamed prop fails                                                                     | `audit:react-native/TextInput/api`        |
| FR3, FR14     | Unit tests through the package's testing doubles                                                       | focus by touch, by the handle and by `hasAutoFocus`; Return under each `enterKeyHint`; autofocus in an entering sheet on Android; a Return that commits a Japanese input method's conversion | a focus callback with an argument, a missed focus source, a handle that exposes the view, a Return that skips `onEnter`, an `onEnter` on a conversion commit, or a sheet field without its keyboard fails | `audit:react-native/TextInput/behavior`   |
| FR4, FR5      | Unit tests of the keyboard props reaching each box; Simulator and emulator keyboard checks             | each `inputMode`; each `enterKeyHint`; `password` and `email` unset and set                                                                                                                  | a wrong keyboard, or a capitalized or corrected email, fails                                                                                                                                              | `audit:react-native/TextInput/keyboard`   |
| FR6, ORD1     | Unit tests of the rendering choice through the doubles                                                 | each `render`; a theme `render.default`; no host; an `InputGroup`; a start icon on each platform; `statusVariant="tooltip"`; a focused field switching                                       | a system box in a group, for a `tooltip` placement, or one that drops an icon, a missing or repeated development warning, a lost value, or focus left on after a switch fails                             | `audit:react-native/TextInput/render`     |
| FR7, FR17     | Simulator and emulator captures in light and dark; unit tests of the forwarded theme values            | bordered and filled; each status, with and without a message; loading; a theme override the box cannot take                                                                                  | a status without its glyph below the system box, a filled box on Android, a value sent that `spec:AST-126` FR11 does not list, or no development notice fails                                             | `audit:react-native/TextInput/system-box` |
| FR8, FR9, AR5 | Layout tests at the default and largest text sizes; Simulator and emulator captures                    | each size; a long placeholder in a narrow row; typing over a wrapped placeholder; a value in a narrow row                                                                                    | a cut placeholder, a caret off the placeholder's first line, a box sized by a hidden placeholder, or a box that does not grow with text fails                                                             | `audit:react-native/TextInput/layout`     |
| FR10, AR4     | Unit tests; VoiceOver and TalkBack checks                                                              | disabled with and without a reason; disabled by the group; read-only                                                                                                                         | an edit, a clear button, a reason only in the hint or one a tap does not open, or a field a screen reader cannot reach fails                                                                              | `audit:react-native/TextInput/states`     |
| FR11–FR13     | Unit tests through the doubles                                                                         | typing; clear; each status and placement; loading                                                                                                                                            | an `onChange` while not editable, lost focus after clear, an error missing from the name, or a busy field without the busy state fails                                                                    | `audit:react-native/TextInput/behavior`   |
| FR15, FR16    | Unit tests of base props and the grouped field                                                         | `id`; `isHidden`; a field in an `InputGroup`                                                                                                                                                 | an identifier off the text box, a hidden field still in the tree, or a grouped field with its own border fails                                                                                            | `audit:react-native/TextInput/base`       |
| AR1–AR3, AR6  | VoiceOver and TalkBack checks on the Simulator, the emulator and a device; target audits               | standalone; hidden label; in a group; an error appearing                                                                                                                                     | a label read twice, an Android field named by its text, a status announced at mount, or a target below the platform minimum fails                                                                         | `audit:react-native/TextInput/a11y`       |

## Decision log

### DEC-1 — Focus is component API on React Native

**Reference:** `component:react-native/TextInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-04

On the web, focus callbacks and the element ref are base props of the input.
React Native's base props are only `id` and `isHidden` (`spec:AST-082` FR7),
so the field offers focus itself: `onFocus` and `onBlur` with no argument, and
an `InputHandle` with `focus()`, `blur()` and `isFocused()`. That is the
smallest surface that lets an app move focus between fields, and it holds
whichever box draws the field.

### DEC-2 — Astryx's field draws a placeholder that is never cut

**Reference:** `component:react-native/TextInput/DEC-2`
**Decider:** imdreamrunner, 2026-11-13

A single-line native field draws its placeholder on its one line and cuts it
at the field's width, so at large text sizes a narrow field shows only the
start of its hint. Astryx's field draws the placeholder as text that follows
the text size and wraps, and sizes the box to it only while it shows.

## Open questions

- **OQ1 — Does React Native's `type` take `search`, `tel` and `url`?**
  (`human-api`) `type` takes `text`, `password` and `email`, and `inputMode`
  brings up the search, phone and URL keyboards (FR4, FR5).

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
