---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/RadioList
platform_of: component:RadioList
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, interaction, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093, spec:AST-112]
---

# RadioList (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `RadioList` (`label`, `value`, `onChange`, `children`, `isLabelHidden`, `description`, `orientation`, `isDisabled`, `disabledMessage`, `isRequired`, `isOptional`, `status`, `size`, `labelTooltip`) and `RadioListItem` (`label`, `value`, `description`, `align`, `isDisabled`, `startContent`, `endContent`), with the shared base props. `htmlName`, `width`, the `container*` and `control*` styling props, and `RadioListItem`'s `aria-label` stay on the web (DEC-2). |
| Behavior                | RadioList is the field around a group of options, each a row that reads as one radio: its mark, its label, its description and its own content. On Android the mark is Material's radio button; on iOS, which has no radio control, it is core's radio drawn from the theme (DEC-1). A tap anywhere on a row chooses it, and choosing a new option calls `onChange` once with its value.                                                                                           |
| End-user impact         | A person picks one option from a short list with a tap on any part of its row, sees Material's radio buttons on Android, and hears each option with VoiceOver or TalkBack as a radio with its label, its state and the group's name.                                                                                                                                                                                                                                               |
| Builder impact          | Web code that drives a RadioList from app state ports unchanged, apart from the web's form name, width and styling props. A form posts the value from app state, since React Native has no HTML form.                                                                                                                                                                                                                                                                              |
| Compatibility/readiness | Not yet released; additive. Draft. Gap lines under the requirements describe the implementing package's differences.                                                                                                                                                                                                                                                                                                                                                               |
| Review checks           | Reject a drawn mark on Android where Material's radio button is present, a visual prop on RadioList or RadioListItem, a web prop accepted and ignored, a change reported when the chosen option is chosen again, a disabled option that a screen reader cannot reach or that does not report its disabled state, or a third-party native library RadioList needs.                                                                                                                  |
| Governing rules         | `component:RadioList` FR1, FR3, FR5, FR7, AR1–AR3; `component:RadioListItem` FR1, FR3–FR6, FR13, AR1–AR3; `family:input-fields`; `spec:AST-082` FR3–FR5, FR7, FR11 and DEC-2; `spec:AST-085` FR1–FR3 and FR5; `component:Tooltip` FR5; `spec:AST-093` FR2–FR4; `spec:AST-112` FR16 and FR19; `component:react-native/Item` AR7 and AV2; DEC-1 to DEC-3 below.                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

RadioList on React Native is web's labelled group of mutually exclusive
options, shown with each platform's radio where it has one, so a short choice
in a form or a settings screen looks and responds the way the rest of the
phone does while its API, its words and its accessibility follow the core
`RadioList` and `RadioListItem` contracts. This record states only what React
Native adds to those components or does differently; it covers
`RadioListItem` as RadioList's option.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which props React Native's `RadioList` and `RadioListItem` offer (FR1,
  DEC-2).
- What draws an option's mark on each platform (FR2, DEC-1).
- What a tap on an option row does, and how the options are laid out in the group (FR3, FR4).
- How a choice is reported and how the disabled states behave (FR5, FR6).
- RadioList's VoiceOver, TalkBack and hardware-keyboard behaviour (AR1–AR4).

**Does not own / non-goals**

- The meaning of RadioList's and RadioListItem's props, the disabled rules and
  the words — owned by `component:RadioList`, `component:RadioListItem` and
  `spec:AST-085`.
- The field's label, description, markers and status — owned by
  `family:input-fields`.
- The option row's layout — owned by `component:Item`; its touch area and press feedback on React Native — owned by `component:react-native/Item`.
- The native piece that draws Material's radio button — owned by
  `spec:AST-126` (OQ1).

## Public concepts

| Concept       | Closed values or states                     | Meaning                                                                                   | Availability by variant/orientation/state                                       | Default      | Owner                              | Stability    | Invalid-value behavior                      |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------ | ---------------------------------- | ------------ | ------------------------------------------- |
| mark          | Material's radio button; core's drawn radio | what draws an option's mark                                                               | Material's on Android; core's on iOS, and on Android where Material's is absent | per platform | `component:react-native/RadioList` | experimental | none                                        |
| `orientation` | `vertical`; `horizontal`                    | the options in a column, or in a row that wraps to the next line when it runs out of room | always                                                                          | `vertical`   | `component:react-native/RadioList` | experimental | an unknown value is a type error            |
| `size`        | `sm`; `md`                                  | the mark's side, 20 or 24 points or dp, and the rows' rhythm                              | always                                                                          | `md`         | `component:RadioList`              | experimental | an unknown value is a type error            |
| disabled      | off; on; on with reason                     | blocks choosing; a reason applies to the whole group                                      | `isDisabled` on the group or an option                                          | off          | `component:RadioList`              | experimental | a reason without `isDisabled` shows nothing |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                                                                                             | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | The React Native `RadioList` MUST take web's `label`, `value`, `onChange`, `children`, `isLabelHidden`, `description`, `orientation`, `isDisabled`, `disabledMessage`, `isRequired`, `isOptional`, `status`, `size` and `labelTooltip`, and `RadioListItem` web's `label`, `value`, `description`, `align`, `isDisabled`, `startContent` and `endContent`, with web's names, defaults and meaning, and the shared base props on RadioList's radio group and on RadioListItem's row, the parts `family:input-fields` FR10 and `component:RadioListItem` FR12 give them (`spec:AST-082` FR7). `children` holds `RadioListItem`s; `startContent` and `endContent` take React Native content. Both components' `label` and `description` take plain text: an option's `label` text names its radio, so every option has a name (`component:RadioListItem` AR1), and its `description` is the radio's hint; core's rich `label` content, and the `aria-label` that names an option whose label has no text, stay on the web. `htmlName`, `width`, the `container*` and `control*` styling props, and `RadioListItem`'s `aria-label` are not offered (DEC-2). Neither takes a visual prop. | `component:RadioList`; `component:RadioListItem` FR12; `family:input-fields` FR10; `spec:AST-082` FR3–FR5, FR7, DEC-2; `spec:AST-112` FR16; DEC-2 | settled            |
| FR2 | On Android, an option's mark MUST be Material's radio button at `size`'s side (20 or 24 dp), tinted by the theme: the accent when chosen and the theme's emphasized border colour when not, with Material's own disabled dimming. On iOS, which has no radio control, and on Android where Material's radio button is absent, the mark is core's radio indicator drawn from the theme at `size`, as `component:Indicator` FR5 states (DEC-1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-082` FR11; `spec:AST-093` FR2–FR4; `component:Indicator`; DEC-1                                                                         | verify             |
| FR3 | Each option MUST be one row, laid out by `component:Item`: the mark followed by its start content (`component:RadioListItem` FR2), its label, its description and its end content, aligned by `align`. A tap anywhere on the row that is not a control inside it chooses the option; links and buttons in the row keep their own behaviour. The row's touch area and press feedback are those of an interactive Item row, as `component:react-native/Item` AR7 and AV2 state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:RadioListItem` FR4, FR13; `component:Item`; `component:react-native/Item` AR7, AV2                                                     | verify             |
| FR4 | The options MUST sit in a column with a small gap, or with `horizontal` in a row with a wider gap, as core lays them; on React Native that row wraps to the next line when it runs out of room (DEC-3). `size` reaches every option. The field around them draws the label, description, markers, label tooltip and status as `family:input-fields` states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:RadioList` FR1, FR7; `family:input-fields`; DEC-3                                                                                      | verify             |
| FR5 | Choosing an enabled option that is not chosen MUST call `onChange` once with its value; choosing the chosen option reports nothing. RadioList holds no selection of its own. Outside a RadioList, a RadioListItem throws with a message that names it, in every build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `component:RadioList` FR3; `component:RadioListItem` FR1, FR5                                                                                     | verify             |
| FR6 | A disabled group or option MUST refuse choosing and stay reachable by screen readers, reporting its disabled state. With `disabledMessage` on a disabled group, each option's hint carries the reason, and a tap on a disabled option shows it in the library's tooltip, as `component:Tooltip` FR5 opens a disabled control's reason on a tap for touch input; a long press opens nothing. Keyboard focus on a disabled option also shows the reason (`component:RadioList` AR3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:RadioList` FR5; `component:RadioListItem` FR6; `component:Tooltip` FR5; `spec:AST-085` FR1–FR3, FR5                                    | verify             |

The gap lines below describe `@astryxdesign/react-native`, the package that
implements this record.

- FR1 gap: RadioList's `id` and `isHidden` reach the field around the group, not the radio group.
- FR2 gap: on Android, the package draws core's radio indicator, not Material's radio button.
- FR5 gap: outside a RadioList, a RadioListItem draws unchosen and does nothing, and throws nothing.
- FR6 gap: a disabled option reports its disabled state only when it has no reason; a group disabled with a reason reads as enabled.
- FR6 gap: a disabled option shows the group's reason only on a long press, not on a tap or on keyboard focus.
- AR2 gap: with a hardware keyboard, each option is its own focus stop, and the
  arrow keys do not move the choice.

### Allowed variation

- **AV1 — Material's radio button.** On Android the mark's ripple and its motion are Material's own and may change with each OS release.

### Representative states

| State                                                 | Required invariant                                                                            | Allowed variation |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- |
| Android, Material's radio button present, each `size` | Material's radio buttons at the size's side, tinted by the theme                              | Material's look   |
| iOS; Android without Material's radio button          | core's drawn radio                                                                            | none              |
| a tap on an option's label, description or empty area | the option is chosen                                                                          | none              |
| a tap on a link in an option's description            | the link opens; the choice stays                                                              | none              |
| the chosen option tapped again                        | nothing reported                                                                              | none              |
| `horizontal` with more options than fit               | the row wraps                                                                                 | none              |
| group disabled with a reason                          | reachable, reported disabled, the reason in the hint and on a tap; a long press opens nothing | none              |
| largest text size                                     | labels wrap; rows grow                                                                        | none              |

### Transformation and precedence order

- **ORD1 — Mark.** Material's radio button on Android where it is present;
  otherwise core's drawn radio.
- **ORD2 — Disabled.** The group's `isDisabled` disables every option; an
  option's own `isDisabled` disables that option; the group's reason applies
  only to the group's disabled state.

### Performance and resources

- **PR1 — No work of its own.** RadioList holds no listeners or timers; a
  choice re-renders the options from the app's new `value`.

## Accessibility contract

- **AR1 — A radio group of radios.** The options sit in a radio group named by
  the group's label and described by its description, which are read before
  the options. Each option is one radio element named by its label, hinted by
  its description and the group's disabled reason, with its checked and
  disabled states (`component:RadioList` AR1; `component:RadioListItem` AR1;
  `spec:AST-112` FR19). On Android, Material's radio button is that element's
  mark, not an element of its own.
- **AR2 — Keyboard.** With a hardware keyboard, the group is one focus stop, the chosen option when there is one, and the arrow keys move between its options and choose them; they stop on a disabled option, which refuses the choice (FR6), as `component:RadioList` FR4 and AR2 state.
- **AR3 — Disabled reason.** A group's reason stays reachable, in each option's hint, on a tap and on keyboard focus; a long press opens nothing (FR6; `component:RadioList` AR3; `component:Tooltip` FR5).
- **AR4 — Text size.** Labels and descriptions follow the text size and wrap;
  the rows grow with them.

## Design relationships

| Anatomy or state | Design requirement                            | Representation authority   | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Mark, Android    | Material 3's radio button                     | prescribed by the platform | primary        | FR2                |
| Mark, iOS        | core's radio indicator                        | prescribed by the theme    | primary        | FR2                |
| Option row       | core's Item row                               | prescribed by the theme    | primary        | FR3                |
| Field            | the input-field label, description and status | prescribed by the theme    | supporting     | FR4                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): Material's radio button on Android;
iOS has no radio control (DEC-1). Guideline pages: Accessibility in the Apple
Human Interface Guidelines; Radio button, Lists and Accessibility in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, the emphasized border
colour, the disabled pair, the text colours for labels and descriptions, the
spacing steps for the gaps, and the field's tokens (`family:input-fields`).

### Native pieces

| Native piece            | Record               | What this record uses it for |
| ----------------------- | -------------------- | ---------------------------- |
| Material's radio button | `spec:AST-126` (OQ1) | the mark on Android (FR2)    |

## Family and system relationships

- `component:RadioList` and `component:RadioListItem` own the props, the
  choice rules, the disabled rules and the words; this record states only what
  React Native adds or does differently. Their DOM-facing claims (the shared
  `name` and form participation, `aria-*` reflection, theming data
  attributes, hover tint, forced colours and the coarse-pointer hit band)
  belong to the web contract.
- `family:input-fields` owns the field around the options; `component:Item`
  owns the row layout; `component:Indicator` owns the drawn radio.
- `spec:AST-126` owns the platform control group; which native piece draws
  Material's radio button is OQ1.

## Verification map

| Contract      | Verification                                                                                 | Representative states                                                                                                      | Mutation or failure expectation                                                                                                                                                                      | Audit section                           |
| ------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1           | Type tests of the exports against core's contracts; a contract drift test                    | each prop; each web-only prop refused                                                                                      | a missing core prop, a different default, or an accepted web-only prop fails                                                                                                                         | `audit:react-native/RadioList/api`      |
| FR2           | Simulator and emulator captures in two themes, light and dark; unit tests of the mark choice | Android with and without Material's radio button; iOS; chosen and not; disabled                                            | a drawn mark where Material's radio button is present, an untinted Material mark, a mark off `size`'s side, or a Material mark on iOS fails                                                          | `audit:react-native/RadioList/mark`     |
| FR3, FR4      | Touch checks on the Simulator and the emulator; captures                                     | a tap on the label, the description and the empty area; a link inside; `horizontal` wrapping; each `align`                 | a tap that does not choose, a link that also chooses, or a row that does not wrap fails                                                                                                              | `audit:react-native/RadioList/row`      |
| FR5, PR1      | Unit tests of choice reporting through the package's testing doubles                         | a new option; the chosen option; an item outside a RadioList                                                               | two calls for one choice, a call for the chosen option, or an item outside a RadioList that does not throw fails                                                                                     | `audit:react-native/RadioList/choice`   |
| FR6, AR3      | Unit tests and screen-reader checks of the disabled states                                   | a disabled option; a disabled group with and without a reason; a tap, a long press and keyboard focus on a disabled option | a choice while disabled, an unreachable option, a disabled state not reported, a reason missing from the hint, a tap on a disabled option that shows no reason, or a long press that opens it, fails | `audit:react-native/RadioList/disabled` |
| AR1, AR2, AR4 | VoiceOver and TalkBack checks on devices; hardware-keyboard checks; the largest text sizes   | the group; each option; arrow keys onto a disabled option                                                                  | a group read without its name, an option without its role or state, a mark read as its own element, arrow keys that skip a disabled option, or a disabled option that takes the choice fails         | `audit:react-native/RadioList/a11y`     |

## Decision log

### DEC-1 — Material's radio button on Android; core's radio on iOS

**Reference:** `component:react-native/RadioList/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Android has a radio button, so an option's mark there is Material's, tinted
by the theme. iOS has no radio control: its own single choices are checkmark
rows in a list, a picker or a segmented control, which are other Astryx
components. RadioList is a radio group, so on iOS it draws core's radio from
the theme, and an app that wants iOS's checkmark rows uses the list or picker
component instead.

### DEC-2 — The web's form, width and styling props stay on the web

**Reference:** `component:react-native/RadioList/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

`htmlName` names the radios for an HTML form, which React Native does not
have; `width` is a CSS length; the `container*` and `control*` props style DOM
elements. `RadioListItem`'s `aria-label` overrides a name the required
`label` already gives. None of these has a meaning on a phone, so they are not
offered.

### DEC-3 — A horizontal row of options wraps

**Reference:** `component:react-native/RadioList/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A phone's width holds few options side by side, and a row cut off at the
screen's edge hides choices a person cannot scroll to. A horizontal RadioList
therefore wraps its options onto the next line when they run out of room; a
row that fits looks as core's does.

## Open questions

- **OQ1 — Which native piece draws Material's radio button?** (`human-design`)
  The platform control group (`spec:AST-126`) has no radio. Options: an Astryx
  radio contract in that group over Material's radio button, with its
  appearance mapping and named features; or a React Native view the library
  tints.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
