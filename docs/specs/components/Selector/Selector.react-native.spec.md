---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Selector
platform_of: component:Selector
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

# Selector (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Selector` and `SelectorOption` under their core names, with core's field props, `value`, `onChange`, `hasClear`, `hasSearch`, `variant`, `size`, `status`, `isReadOnly`, `isLoading` and `indicatorPosition`. `options` take option records (`value`, `label`, `disabled`); `startIcon` is an icon name; `emptyText` and `emptySearchText` are strings. `presentation`, `placement`, `isDefaultOpen`, `changeAction`, `renderOption`, `renderValue`, `htmlName`, `width`, DOM handlers and styling inputs stay web. Each platform adds `menuStyle`: `popUp` or `pullDown` on iOS, `dropdown` or `bottomSheet` on Android. |
| Behavior                | A tap on the control opens the option list. On iOS, a short plain `pullDown` list opens as the system menu wherever its host exists; every other list opens in Astryx's panel, anchored to the control or in a modal bottom sheet, as FR4 places it. A pick that changes the value calls `onChange` once and plays the `select` haptic.                                                                                                                                                                                                                                                                                                         |
| End-user impact         | A person picks an option from the platform's own menu where it fits, or from a list that searches, clears and scrolls. VoiceOver and TalkBack read the field's name and its value, and each row with its selected state; while a person types a search, the match count is announced.                                                                                                                                                                                                                                                                                                                                                           |
| Builder impact          | The same Selector code runs on the web, iOS and Android. An app chooses the platform's menu form with `menuStyle`, and keeps rows that read the same in the drawn panel and the system menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review checks           | Reject a system menu for a list with search, a clear button or a loading state, a row that renders anything but its option's label, a `menuStyle` value one platform lacks offered on the other, a re-pick that skips `onChange` or plays the haptic, a disabled reason only a screen reader can reach, or a visual prop on the trigger.                                                                                                                                                                                                                                                                                                        |
| Governing rules         | `component:Selector`; `component:SelectorOption`; `family:input-fields`; `spec:AST-082` FR3, FR4, FR7, FR8, FR11 and FR17; `spec:AST-085`; `component:Tooltip` FR5; `spec:AST-093` FR1–FR5.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Selector on React Native is core's single choice from a list on a phone: a
field whose control opens its options, and a pick that becomes its value. It
uses the platform's own menu where a short plain list fits one, and Astryx's
panel where a list needs search, a clear action or room to scroll, with core's
props, words, states and accessibility either way. In this record, "core" is
`component:Selector` and `component:SelectorOption`, and the record states
only what React Native adds or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component)
- Controlled/uncontrolled behavior: controlled; `value` and `onChange`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR4 gap: with `menuStyle` unset, Astryx's panel opens under the control on
  a phone too, not in a modal bottom sheet (`component:Selector` DEC-1), and it
  does not place the selected row over the control (core FR2); with iOS
  `popUp`, it opens over the control without moving the selected row over it.
- FR5 gap: a short plain `popUp` list also opens as the system menu, which
  opens it as a pull-down below the control, not over it.
- FR1 gap: the shared native contract declares no typed slots for `startIcon`,
  `emptyText` or `emptySearchText` (FR3).
- FR7 gap: clearing calls `onChange('')`, where core calls `onChange(null)`.
- FR7 gap: a re-pick of the current value calls no `onChange`.
- `spec:AST-082` FR11 gap: on Android, Astryx's panel draws where Material 3's
  exposed dropdown menu is the platform's own control (OQ2).
- FR9 gap: read-only is not conveyed to screen readers; the control only stops
  opening.
- FR9 gap: a disabled control's reason opens on a long press, not a tap.
- FR11 gap: a hardware keyboard has no type-to-select on the closed control and
  no arrow-key highlight in the open list (core FR8–FR10).
- AR3 gap: on Android, the open anchored list is not a modal for TalkBack; the
  page beside it stays reachable.

## Ownership boundary

**Owns**

- Which props React Native offers on each platform, and the forms it narrows
  (FR1–FR4).
- When the system menu shows the list, and what Astryx's panel does (FR5,
  FR6).
- Selection, clearing, the control, read-only, disabled and the keyboard on
  React Native (FR7–FR11).
- Base props (FR12), the `SelectorOption` export (FR13), and how VoiceOver and
  TalkBack read the field and its list (AR1–AR5).

**Does not own / non-goals**

- The meaning of Selector's props, states and words — owned by
  `component:Selector` and `component:SelectorOption`.
- The label, description, markers and status message — owned by
  `family:input-fields`.
- The system menu's native contract — owned by `spec:AST-128`.
- The bottom sheet a `bottomSheet` list opens in — owned by
  `component:react-native/BottomSheet`.
- Icon resolution — owned by `spec:AST-127`.

## Public concepts

| Concept       | Closed values or states                                      | Meaning                                                                    | Availability by variant/orientation/state                                 | Default                                  | Owner                             | Stability    | Invalid-value behavior                   |
| ------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------- | ------------ | ---------------------------------------- |
| menu style    | iOS: `popUp`, `pullDown`; Android: `dropdown`, `bottomSheet` | how the list opens: over the control, below it, or in a bottom sheet (FR4) | the iOS and Android contracts                                             | unset: core's default presentation (FR4) | `component:react-native/Selector` | experimental | another platform's value is a type error |
| list form     | system menu; Astryx's panel                                  | who draws the open list (FR5)                                              | the system menu only with iOS `pullDown`, its host and a short plain list | Astryx's panel                           | `component:react-native/Selector` | experimental | none                                     |
| option record | `value`; `label`; `disabled`                                 | one option (FR3)                                                           | always                                                                    | —                                        | `component:react-native/Selector` | experimental | another option form is a type error      |
| availability  | editable; read-only; disabled                                | whether the list opens and the value changes                               | always; disabled wins over read-only                                      | editable                                 | `component:Selector`              | experimental | none                                     |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                        | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native MUST export `Selector` under its name on every platform, and keep the core props, meanings, defaults and states except the props FR2 and FR3 narrow or leave out (`spec:AST-082` FR3). `startIcon` takes a shared icon name (`spec:AST-082` FR4, FR17). Base props attach to the trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `component:Selector`; `spec:AST-082` FR3, FR4, FR7, FR17                     | settled            |
| FR2  | These props MUST stay in the web contract, and React Native's types refuse them (`spec:AST-082` FR3): `htmlName` (an HTML form name), `width` (a CSS length), `onClick`, `onFocus` and `onKeyDown` (their argument is a DOM event), the `container*` and `control*` styling inputs, `changeAction` (its callback returns a promise the control waits on, which no portable callback form carries, `spec:AST-082` FR4), `presentation` and `placement` (the web's surface and layer position; React Native's list form and place are `menuStyle`, FR4), `isDefaultOpen` (a list open on mount, for web demonstrations; a native list opens from the person's tap), and `renderOption` and `renderValue`. `spec:AST-082` FR4 lets a platform whose implementation runs React take render functions; React Native leaves these two out, so every row and the control show the option's label and a row reads the same in Astryx's panel and in the system menu, which draws only its own rows (`spec:AST-128` FR2). | `spec:AST-082` FR3, FR4; `spec:AST-128` FR2                                  | human decision     |
| FR3  | `options` MUST take option records: `value`, an optional `label` (else the value is shown) and an optional `disabled`. Core's plain strings, dividers and sections, and an option's description, icon and secondary control, are not offered (OQ1). `emptyText` and `emptySearchText` are strings: React Native draws and announces those words, where core takes content and reads its text (`spec:AST-082` FR4 text slot).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-082` FR3, FR4; `component:Selector`                                | human decision     |
| FR4  | Each platform's contract MUST add `menuStyle`, naming that platform's own menu forms, so its values differ by platform and each is a type error on the other (`spec:AST-082` FR3, FR8). On iOS, `popUp` opens the list over the control with the selected row over it, as UIKit's pop-up button does, and `pullDown` opens it below the control. On Android, `dropdown` opens it below the control, and `bottomSheet` opens it in a modal bottom sheet (`component:react-native/BottomSheet`). Unset, the list opens as core's default presentation decides (`component:Selector` DEC-1): in a modal bottom sheet on a compact coarse-pointer window (`spec:AST-012` FR9), and otherwise anchored to the control, with the selected row over it for a list without search (core FR2).                                                                                                                                                                                                                            | `spec:AST-082` FR3, FR8; `spec:AST-093` FR3; `component:Selector` FR2, DEC-1 | human decision     |
| FR5  | On iOS, a `pullDown` list MUST open as the system menu, a pull-down menu below the control with the selected option checked (`spec:AST-128` FR2, FR3), wherever the system menu host exists and the list is short and plain: at most eight options, no search, no `hasClear` and not loading. A system menu has no search field, a loading list's options are not yet final, a longer list reads as a list, and a `hasClear` list keeps one form whether or not its clear button shows (the button appears only once there is a value). The system menu opens only as a pull-down (`spec:AST-128` FR3), so a `popUp` list, whose selected row sits over the control (FR4), opens in Astryx's panel too, as does every other list; a development build says once why a list asked for the system menu and kept the panel.                                                                                                                                                                                         | `spec:AST-128` FR2, FR3, FR14; `spec:AST-082` FR11                           | human decision     |
| FR6  | Astryx's panel MUST be at least as wide as the control and show one row per option, at least the platform's minimum touch target tall, with the selection mark at `indicatorPosition`; a disabled row keeps its place in the order and does not pick. With `hasSearch`, a search row with a leading magnifier and, once typed, a clear button filters the rows by label in the person's locale; with nothing to show it shows `emptyText`, and with no match `emptySearchText`, except while loading. While the software keyboard is up, the panel fits in the room above it. A touch outside, Android back and the VoiceOver escape close the panel.                                                                                                                                                                                                                                                                                                                                                            | `component:Selector` FR3, FR5; `spec:AST-128` FR12                           | verify             |
| FR7  | A pick on an enabled option MUST close the list and call `onChange` with the option's value once, a re-pick of the current value included, as core's does (core FR1); a pick that changes the value also plays the library's `select` haptic, and a re-pick plays none. With `hasClear` and a value, the clear button calls `onChange(null)`, as core's does, and is not shown while the control is read-only or disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:Selector` FR1, FR6                                                | verify             |
| FR8  | The control MUST draw core's `input`, `secondary` and `ghost` variants: the start icon, the value or the placeholder, a spinner while loading, and the chevron, or the status icon where the status placement puts it on the control. A tap anywhere on the control opens and closes the list, and its touch target reaches the platform minimum. A `secondary` or `ghost` control shrinks while pressed; an `input`, read-only or disabled control does not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Selector`; `family:input-fields`; `spec:AST-093` FR3              | verify             |
| FR9  | A read-only control MUST keep its value visible at full colour, not open, and show no clear button or chevron, and screen readers read it as read-only (core FR6). A disabled control is dimmed, does not open, and carries the disabled state; its `disabledMessage` is its hint, and a tap on it shows the reason in a tooltip, as a disabled control's reason opens under touch (`component:Tooltip` FR5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Selector` FR6; `spec:AST-085`; `component:Tooltip` FR5            | verify             |
| FR10 | The field MUST follow `family:input-fields`: the label, description, markers and status around the control, with `attached` only for the `input` variant (a `secondary` or `ghost` control shows its message detached), and inside an `InputGroup` the control joins the group's row with no shell of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `family:input-fields`; `component:Selector`                                  | verify             |
| FR11 | With a hardware keyboard, the closed control MUST select by typed letters, and the open list MUST move a highlight with the arrow keys and select with Enter, as core states (core AR3, FR8–FR10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `component:Selector` AR3, FR8–FR10                                           | verify             |
| FR12 | The shared base props MUST attach to the trigger (`spec:AST-082` FR7): `id` is its test and native identifier, and `isHidden` removes the field from layout and the accessibility tree. The control takes no visual prop; its look comes from the theme (`spec:AST-082` DEC-2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-082` FR7, DEC-2                                                    | verify             |
| FR13 | React Native MUST export `SelectorOption`, the content of an option row (icon, label, description, `layout`, `endContent`), for a caller to place on its own, such as a row of a list of choices outside a Selector. No Selector row renders it, since `renderOption` and `renderValue` stay web (FR2); richer rows in the panel are OQ1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:SelectorOption`; `spec:AST-082` FR3                               | human decision     |

### Allowed variation

- **AV1 — The system menu.** The system menu's look, motion and row layout are
  the platform's own and may change with each OS release.
- **AV2 — Theme paint.** Themes may restyle the control and Astryx's panel
  without changing behavior.

### Representative states

| State                                            | Required invariant                                               | Allowed variation |
| ------------------------------------------------ | ---------------------------------------------------------------- | ----------------- |
| iOS `pullDown`, five plain options, host present | the system menu below the control; the selected option checked   | the system's menu |
| iOS `pullDown`, `hasSearch`                      | Astryx's panel with a search row                                 | theme paint       |
| Android `bottomSheet`                            | the list in a modal bottom sheet                                 | the sheet's look  |
| a search with no match                           | `emptySearchText` shown and announced                            | none              |
| a pick of the current value                      | `onChange` with the same value; no haptic                        | none              |
| clear                                            | `onChange(null)`                                                 | none              |
| read-only                                        | value at full colour; does not open; read as read-only           | none              |
| disabled with a reason                           | dimmed; does not open; the reason is the hint and shows on a tap | none              |

### Transformation and precedence order

- **ORD1 — List form.** iOS `pullDown`, the system menu host and a short plain
  list, the system menu; else Astryx's panel, placed by `menuStyle`, else by
  core's default presentation (FR4).
- **ORD2 — Availability.** Disabled, then read-only, then editable, as in
  core.
- **ORD3 — Empty words.** While loading, none; with a query and options, the
  no-match words; else, with no options, the empty words.

### Performance and resources

- **PR1 — A closed list costs nothing.** The panel and its rows mount only
  while the list is open, and a closed system menu costs nothing when the
  control mounts (`spec:AST-128` FR3).
- **PR2 — One call per pick.** A pick calls `onChange` once; only a pick that
  changes the value plays the haptic.

## Accessibility contract

- **AR1 — The control.** The trigger is one element, named by the field's
  name (the label, the required word and an error, `family:input-fields`),
  with the shown value, and the expanded, disabled and busy states; a screen
  reader's activation opens the list. It is a button on iOS, as UIKit's
  pop-up button is, and a combo box on Android. The clear button is its own
  element.
- **AR2 — Rows.** Each row is one element named by its option's label, a
  button carrying the selected state for the selected option, since React
  Native has no option role; a disabled row reads as dimmed.
- **AR3 — The open list is modal.** While the list is open, VoiceOver and
  TalkBack stay inside it, as they do in the system menu, and opening moves
  their focus to the selected row, else the first.
- **AR4 — Announcements.** While a person types a search, the match count is
  announced politely, or `emptySearchText` when nothing matches; a list that
  opens with no options announces `emptyText`; nothing is announced while
  loading.
- **AR5 — Text size and targets.** The control and the rows scale with Dynamic
  Type and Android's font scale, and each row and the control reach the
  platform's minimum touch target.

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | -------------------------- | -------------- | ------------------ |
| Control          | core's variants, with start icon, value, spinner and chevron | current source             | prominent      | FR8                |
| Option list      | the platform's menu, or Astryx's panel of list rows          | prescribed by the platform | prominent      | FR4–FR6            |
| Search row       | a magnifier, the query and a clear button                    | current source             | supporting     | FR6                |
| Selection mark   | a check at `indicatorPosition`                               | current source             | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): the system pull-down menu (UIMenu) on
iOS for a short plain `pullDown` list; Astryx's panel, anchored or in a
bottom sheet, for every other list. On Android, the platform's control is
Material 3's exposed dropdown menu, which the package has no host for, so
Astryx's panel draws there (the `spec:AST-082` FR11 gap under Current-state
impact; OQ2). Guideline pages: Pop-up
buttons, Pull-down buttons, Menus and Accessibility in the Apple Human
Interface Guidelines; Menus and Bottom sheets in Material 3 (`spec:AST-093`
FR3).

Theme values read (`spec:AST-093` FR4): the field family's control box (the
border, fill, focus and status colours, `radius.element`, the element sizes and
type), the secondary and ghost button colours for those variants, and the
popover surface, shadow and list row values for Astryx's panel. The system
menu takes the theme's light or dark mode only.

### Native pieces

| Native piece       | Record                        | What this record uses it for                                             |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------ |
| `AstryxSystemMenu` | `spec:AST-128` FR2, FR3, FR14 | the system pull-down menu for a short plain `pullDown` list on iOS (FR5) |
| `Icon` resolution  | `spec:AST-127` FR4            | the control's start icon (FR1)                                           |

## Family and system relationships

- `component:Selector` and `component:SelectorOption` own the props, states
  and words; this record states only what React Native adds or does
  differently.
- `family:input-fields` owns the labelled field, its status placements and
  grouped admission.
- `spec:AST-128` owns the system menu; `component:react-native/BottomSheet`
  owns the sheet a `bottomSheet` list opens in.

## Verification map

| Contract        | Verification                                                                                           | Representative states                                                                                                                                                               | Mutation or failure expectation                                                                                                                           | Audit section                             |
| --------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1–FR4         | Type tests of the shared, iOS and Android views against the generated contracts; a contract drift test | each core prop; each web-contract prop, `isDefaultOpen`, `placement` and `changeAction` included; a string option, a divider and a section; each `menuStyle` value on each platform | a web-contract prop or another option form accepted, or a `menuStyle` value accepted on the other platform, fails                                         | `audit:react-native/Selector/api`         |
| FR5, ORD1       | Unit tests of the list form through the package's testing doubles; Simulator checks of the system menu | eight and nine options; search; clear; loading; no host; `pullDown` and `popUp` on iOS                                                                                              | a system menu for a `popUp` list or another list FR5 keeps in the panel, the panel where the system menu applies, or a missing development note fails     | `audit:react-native/Selector/system-menu` |
| FR6, ORD3, AR4  | Unit tests of the panel; Simulator and emulator checks with the software keyboard                      | search with matches and none; no options; loading; a disabled row; the keyboard up; a touch outside; Android back; the escape                                                       | a row below the minimum target, a disabled row that picks, the panel under the keyboard, empty words while loading, or a missing announcement fails       | `audit:react-native/Selector/panel`       |
| FR7             | Unit tests through the doubles                                                                         | a pick; a pick of the current value; clear                                                                                                                                          | a second `onChange`, a re-pick without `onChange` or with the haptic, or a clear that reports anything but `null` fails                                   | `audit:react-native/Selector/selection`   |
| FR8, FR10, FR12 | Unit tests of the control and field; Simulator and emulator captures in each fixture theme             | each variant and size; loading; each status placement; in an `InputGroup`; `id`; `isHidden`                                                                                         | a pressed `input` control that shrinks, an attached message on a `secondary` control, or an identifier off the trigger fails                              | `audit:react-native/Selector/control`     |
| FR9             | Unit tests; VoiceOver and TalkBack checks                                                              | read-only; disabled with and without a reason                                                                                                                                       | a read-only control that opens or is not read as read-only, or a reason a tap does not open, fails                                                        | `audit:react-native/Selector/states`      |
| FR11            | Hardware-keyboard checks on the Simulator and the emulator                                             | type a letter on the closed control; arrows and Enter in the open list                                                                                                              | no type-to-select, or arrows that do not move the highlight, fails                                                                                        | `audit:react-native/Selector/keyboard`    |
| AR1–AR3, AR5    | VoiceOver and TalkBack checks on the Simulator, the emulator and a device; largest text size           | the control closed and open; rows; the open list beside other content                                                                                                               | a control without its value or expanded state, a row without its selected state, focus that leaves the open list, or a row below the minimum target fails | `audit:react-native/Selector/a11y`        |

## Decision log

No component-local decision is recorded. FR2, FR3, FR4 and FR5 state the
reason for each prop React Native narrows, adds or leaves out.

## Open questions

- **OQ1 — Which richer option forms does React Native offer?** (`human-api`)
  `options` take option records with `value`, `label` and `disabled`; core
  also takes plain strings, dividers, sections, and an option's description,
  icon and secondary control (FR3).
- **OQ2 — Does Android open a Selector's list in Material 3's exposed dropdown
  menu?** (`human-design`) `spec:AST-128` OQ5 holds the question for Android
  menus. Android draws Astryx's panel (ORD1), and the `spec:AST-082` FR11 gap
  line records it.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
