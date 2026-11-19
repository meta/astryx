---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/ContextMenu
platform_of: component:ContextMenu
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, layout, accessibility, platform]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# ContextMenu (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `ContextMenu` under core's name, with core's `children` (the trigger area), `items` or `menuContent`, `size`, `label`, `onOpenChange`, `presentation` and `isDisabled`. The web contract's props (`menuWidth`, `triggerXstyle`, `triggerAs`) are not offered. It takes `render` (`auto`, `system`, `drawn`) for who draws the menu. A row record adds `layout`, `glyph`, `isChecked` and `selection`, and the iOS contract adds `preview`, the card the system menu lifts. |
| Behavior                | A long press on the trigger area opens the menu. With `render="auto"` (the default), iOS shows the system context menu where the platform's menu host is present and every row can be described as data: the area lifts above a dimmed background with the system's haptic. Otherwise Astryx draws the menu at the touch point, or in a bottom sheet per `presentation`. The release of the hold that opened the menu presses nothing; a short tap still reaches the children.                  |
| End-user impact         | A person long-presses a card or a row to get its actions in the platform's own context menu where it can show them. VoiceOver and TalkBack users open the same menu from a "Show menu" action, or a More button named by the menu's label.                                                                                                                                                                                                                                                      |
| Builder impact          | An app wraps a card, a row or a canvas object in `ContextMenu` as on the web and describes its rows as data where it wants the system menu. A pressable deep inside an app's own cell guards its handler with `useContextMenuPressScope`.                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review checks           | Reject a web contract prop offered on React Native, a default other than core's `popover` for `presentation`, a hold whose release also presses a child, a short tap that no longer reaches a child, a menu that only a long press opens under a screen reader, a system menu drawn with rows it cannot carry, `preview` offered on Android, or a drawn menu that a tap outside closes while also acting under it.                                                                              |
| Governing rules         | `component:ContextMenu` FR1, FR3, FR4, FR7 and FR9; `family:overlay-dismissal`; `spec:AST-082` FR3–FR5, FR7, FR11 and FR17; `spec:AST-093` FR2–FR4; DEC-1–DEC-4 below.                                                                                                                                                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

ContextMenu on React Native is core's menu of actions for a card, a row or an
object, opened by a long press. On iOS it is the system's context menu wherever
the system can show its rows, so it lifts and dims as the platform's own do;
elsewhere Astryx draws DropdownMenu's rows at the touch point or in a bottom
sheet. This record states only what React Native adds to
`component:ContextMenu` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable; `onOpenChange` reports
  each open and close
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: the package spells `render` as two more `presentation` values,
  `auto` (its default) and `native`, so an unset `presentation` is `auto`
  where core's is `popover`.
- FR1 gap: the package also takes `onPress` on a row record, a second input
  for the press that `onClick` owns; with both set, `onClick` does not run.

## Ownership boundary

**Owns**

- ContextMenu's React Native contract, the row record's additions and the iOS
  contract's `preview` (FR1, FR6).
- Who draws the menu on React Native (FR2) and the system menu's behavior
  (FR3).
- The long press, the swallowed release and the press scope (FR4).
- The drawn menu's place and its screen-reader way in (FR5, FR7).

**Does not own / non-goals**

- The meaning of ContextMenu's props and its rows — owned by
  `component:ContextMenu`.
- The drawn rows, their press model and the compound parts — owned by
  `component:react-native/DropdownMenu`.
- The sheet form's container — owned by `component:react-native/BottomSheet`.
- The system menu host and its menu description — owned by `spec:AST-128`.
- Which touches dismiss an overlay — owned by `family:overlay-dismissal`.

## Public concepts

| Concept      | Closed values or states               | Meaning                                                             | Availability by variant/orientation/state | Default   | Owner                                | Stability    | Invalid-value behavior           |
| ------------ | ------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | --------- | ------------------------------------ | ------------ | -------------------------------- |
| rendering    | `auto`; `system`; `drawn`             | who draws the menu: the system context menu, or Astryx's menu (FR2) | always                                    | `auto`    | `component:react-native/ContextMenu` | experimental | an unknown value is a type error |
| presentation | `popover`; `bottom-sheet`; `adaptive` | where the drawn menu shows, as core defines it                      | drawn menu                                | `popover` | `component:ContextMenu`              | experimental | an unknown value is a type error |
| entry        | action; divider; section              | core's three entry kinds as one row record keyed by `type` (FR6)    | `items`                                   | action    | `component:react-native/ContextMenu` | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                       | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `ContextMenu` (`spec:AST-082` FR3) and take core's `children`, `items` or `menuContent` (exactly one), `size` (default `md`), `label` (core's "Context menu"), `onOpenChange`, `presentation` (default `popover`) and `isDisabled`, with core's meaning. The web contract's props (`menuWidth`, `triggerXstyle`, `triggerAs`) are not offered, and using one is a type error. The base props `id` and `isHidden` reach the trigger area; `isHidden` keeps the menu closed. A row's press is its `onClick` alone (`spec:AST-082` FR7). The compound parts are DropdownMenu's own, re-exported under ContextMenu's names.                                                                                                                                                                                                   | `component:ContextMenu`; `spec:AST-082` FR3, FR4, FR7                       | verify             |
| FR2 | `render` MUST say who draws the menu (`spec:AST-112` FR21): `system` asks for the system context menu, `drawn` always draws Astryx's menu, and `auto`, the default, is the system menu where the platform's menu host is present and every row can be described as data, else the drawn menu. Rows with React content (`menuContent`, a row with custom content) keep the drawn menu. `system` that cannot show the system menu draws and warns once in development with the reason. Android has no system menu host, so it always draws. `presentation` keeps core's values and default and applies to the drawn menu.                                                                                                                                                                                                                                             | DEC-1; `spec:AST-112` FR21; `spec:AST-082` FR11                             | verify             |
| FR3 | The system menu MUST behave as the system's context menu: a long press lifts the trigger area above a dimmed background with the system's haptic, and the children's touches are cancelled once the system recognises the hold. Rows that are unavailable (`isDisabled`) are left out of the system menu (DEC-2). A row's icon resolves as `Icon` resolves the name (`spec:AST-082` FR17), and a glyph stands in for an icon. Under a screen reader, the "Show menu" action and the More button ask the host to present the menu.                                                                                                                                                                                                                                                                                                                                   | DEC-2; `spec:AST-082` FR11, FR17; `spec:AST-093` FR2, FR3                   | verify             |
| FR4 | The drawn menu MUST open on a still long press of 500 ms on the trigger area; a short or moving touch opens nothing and reaches the children as a tap. Once the hold opens the menu, the release of that touch presses nothing under the area: the library's press controls cancel their press, and a pressable deeper in an app's own cell skips it through `useContextMenuPressScope`. A later activation that is not that touch (a keyboard, a screen reader, a programmatic press) runs.                                                                                                                                                                                                                                                                                                                                                                        | DEC-3                                                                       | verify             |
| FR5 | The drawn menu MUST open at the touch point in the app's layer, flipped and clamped inside the safe bounds, with DropdownMenu's rows (`component:react-native/DropdownMenu`); `size` sets the rows' density. `presentation="bottom-sheet"`, and `adaptive` on a compact touch screen, hold the rows in a bottom sheet with spacious touch rows, sub-menus drilling in (`component:ContextMenu` FR7). A tap outside the open menu closes it and reaches nothing under it, and Android's back and the VoiceOver escape close it (`family:overlay-dismissal`, `component:ContextMenu` FR9). The menu mounts on its first open.                                                                                                                                                                                                                                         | `component:ContextMenu` FR1, FR3, FR4, FR7, FR9; `family:overlay-dismissal` | verify             |
| FR6 | The row record MUST hold core's three entry kinds in one record keyed by `type`: an action row (`label`, `onClick`, `icon`, `isDisabled`, `variant`, nested `items` for a sub-menu), a `divider`, and a `section` (`title`, `items`). The React Native contract adds `layout` (`row` draws a section's items side by side as icon-only actions), `glyph` (an emoji or short text in a row's icon place), `isChecked` (a checkable row and its state) and `selection` (`single` or `multiple` for a section's rows), with DropdownMenu's meaning; the system menu carries each of them. The iOS contract adds `preview`: the card the system menu lifts above its rows in place of the trigger area, drawn in the theme's light or dark mode, at most the window's width less 32 pt and 0.6 of its height; it is absent from the Android types (`spec:AST-082` FR5). | DEC-4; `spec:AST-082` FR4, FR5                                              | verify             |
| FR7 | Because a screen-reader user cannot aim a long press, the menu MUST open without one under a screen reader: the first press element inside the area carries a "Show menu" accessibility action; on iOS a claimed action stands in for the More button, and on Android, and wherever no element claims the action, a More button named by `label` follows the children. Focus returns to where it was when the menu closes. With `isDisabled`, the area takes no touches and offers neither the action nor the button.                                                                                                                                                                                                                                                                                                                                               | `component:ContextMenu` AR1; `spec:AST-082` FR3                             | verify             |

### Allowed variation

- **AV1 — The system menu.** Its lift, dimming, haptic, layout and motion are
  the system's and may change with each OS release.
- **AV2 — Fit.** Where the drawn menu flips and how far it is clamped follow the
  screen and the text size.

### Representative states

| State                                  | Required invariant                                       | Allowed variation  |
| -------------------------------------- | -------------------------------------------------------- | ------------------ |
| iOS, data rows, no `render`            | the system context menu                                  | the system's look  |
| iOS, `menuContent`                     | the drawn menu at the touch point                        | the fit            |
| Android, long press                    | the drawn menu at the touch point                        | the fit            |
| long press on a button inside the area | the menu opens; the button does not press                | none               |
| short tap on a button inside the area  | the button presses; no menu                              | none               |
| screen reader on a row                 | "Show menu" opens the menu; on Android a More button too | none               |
| `presentation="adaptive"` on a phone   | drawn rows in a bottom sheet                             | the sheet's motion |
| a disabled row, system menu            | left out                                                 | none               |
| `isDisabled`                           | no touches; no action; no More button                    | none               |

### Transformation and precedence order

- **ORD1 — Rendering.** `render`, then the menu host's presence, then whether
  every row can be described as data; the drawn menu then follows
  `presentation`.
- **ORD2 — The hold.** The long press opens the menu, then the release of that
  touch is swallowed, then later activations run.

### Performance and resources

- **PR1 — A closed menu costs almost nothing.** A closed drawn menu mounts no
  surface and no back handler; a closed system menu is its host alone, and a
  re-render with the same rows hands it the same description.

## Accessibility contract

- **AR1 — A way in without a long press.** The "Show menu" action, or the More
  button named by `label`, opens the menu under a screen reader (FR7).
- **AR2 — Named menu.** `label` names the menu and the More button.
- **AR3 — Rows.** Rows keep their names, checked state, disabled state and
  destructive meaning in the drawn menu (`component:react-native/DropdownMenu`)
  and in the system menu, where unavailable rows are left out (DEC-2).
- **AR4 — Focus.** Focus returns to where it was when the menu closes.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority   | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| System menu      | the platform's context menu with its lift and dim        | prescribed by the platform | prominent      | FR2, FR3           |
| Drawn menu       | DropdownMenu's surface and rows at the touch point       | theme intent               | prominent      | FR5                |
| Touch sheet      | the rows in a bottom sheet                               | `component:BottomSheet`    | prominent      | FR5                |
| Preview card     | the app's card lifted above the system menu's rows (iOS) | caller content             | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): iOS's context menu
(UIContextMenuInteraction) through the platform's menu host. React Native's
core bridges no context menu, and Android's context menu cannot carry the
theme or a sheet presentation, so Android draws DropdownMenu's menu. Guideline
pages: Context menus and Accessibility (VoiceOver) in the Apple Human
Interface Guidelines (`spec:AST-093` FR3); on Android, this record follows
Material 3's Menus page.

Theme values read (`spec:AST-093` FR4): the drawn menu's values, read through
DropdownMenu and BottomSheet, and the theme's light or dark mode for the
preview card.

### Native pieces

| Native piece       | Record                  | What this record uses it for                                               |
| ------------------ | ----------------------- | -------------------------------------------------------------------------- |
| `AstryxSystemMenu` | `spec:AST-128` FR2, FR3 | the iOS context menu, its description and its preview card (FR2, FR3, FR6) |

## Family and system relationships

- `component:ContextMenu` owns the props, the rows and the words; this record
  states who draws the menu on React Native and how a long press opens it.
- `component:react-native/DropdownMenu` owns the drawn rows and parts, and
  `component:react-native/BottomSheet` owns the sheet form.
- `spec:AST-128` owns the system menu host and its description.
- `family:overlay-dismissal` owns which touches dismiss the drawn menu.

## Verification map

| Contract     | Verification                                                                                   | Representative states                                                                                           | Mutation or failure expectation                                                                                                                  | Audit section                             |
| ------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| FR1, FR6     | Type tests per platform; a contract drift test against core's ContextMenu contract             | each core prop and default; each web contract prop; each row field; `preview` on iOS and Android                | an offered web prop, a changed default, a second press input, or `preview` accepted on Android fails                                             | `audit:react-native/ContextMenu/api`      |
| FR2, ORD1    | Unit tests of the rendering choice through the package's testing doubles (`spec:AST-112` FR15) | each `render`; no host; `menuContent`; a row with custom content; Android                                       | a system menu with rows it cannot carry, a drawn menu where the host can carry every row under `auto`, or a silent fallback under `system` fails | `audit:react-native/ContextMenu/render`   |
| FR3          | Simulator checks of the system menu                                                            | a long press; a disabled row; icons and glyphs; "Show menu"                                                     | a disabled row shown, a child pressed after the lift, or a screen-reader action that does not present fails                                      | `audit:react-native/ContextMenu/system`   |
| FR4, ORD2    | Unit tests of the hold                                                                         | a plain pressable child; a library button; a pressable deep in a cell; a short tap; a later keyboard activation | a release that presses, a tap that no longer presses, or a later activation that is swallowed fails                                              | `audit:react-native/ContextMenu/hold`     |
| FR5          | Unit tests of the drawn menu; Simulator and emulator captures                                  | at the touch point near each edge; `bottom-sheet`; `adaptive` on a phone; outside tap; back                     | a menu outside the bounds, an outside tap that acts below, or a sub-menu that does not drill in the sheet fails                                  | `audit:react-native/ContextMenu/drawn`    |
| FR7, AR1–AR4 | VoiceOver and TalkBack checks; unit tests of the action and the More button                    | iOS with and without a claiming element; Android; disabled                                                      | a menu a screen reader cannot open, a missing More button on Android, or focus that does not return fails                                        | `audit:react-native/ContextMenu/a11y`     |
| PR1          | Unit tests of what a closed menu mounts                                                        | closed drawn; closed system; the same rows re-rendered                                                          | a mounted surface or back handler while closed, or a new description for the same rows, fails                                                    | `audit:react-native/ContextMenu/behavior` |

## Decision log

### DEC-1 — iOS shows the system context menu wherever it can carry the rows

**Reference:** `component:react-native/ContextMenu/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

On iOS a long press on content opens the system's context menu, with its lift,
dim and haptic, in every app people use. ContextMenu shows that menu wherever
the platform's host is present and every row can be described as data, and
draws Astryx's menu for rows the system cannot carry, so an app gets the
platform's menu without losing custom rows.

### DEC-2 — The system menu leaves unavailable rows out

**Reference:** `component:react-native/ContextMenu/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

The Apple Human Interface Guidelines ask a context menu to show only the
actions that apply, so the system menu leaves a disabled row out; the drawn
menu keeps it, dimmed, as DropdownMenu does.

### DEC-3 — The hold that opens the menu consumes its touch

**Reference:** `component:react-native/ContextMenu/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A long press that opens a menu must not also press the button or row under
the finger when it lifts, as the system's own context menus cancel the
touches under them. The library's press controls skip that release, and an
app's own pressable uses the press scope for the same rule.

### DEC-4 — Rows carry what the system menu can show

**Reference:** `component:react-native/ContextMenu/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

The row record adds DropdownMenu's row layout, glyph, checked state and
selection, which the system menu shows too, so one description serves the
system menu and the drawn one. On iOS, a preview card shows what the menu acts
on, as the system's context menus do.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
