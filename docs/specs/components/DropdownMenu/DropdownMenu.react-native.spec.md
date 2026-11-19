---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/DropdownMenu
platform_of: component:DropdownMenu
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    interaction,
    layering,
    navigation,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: [family:overlay-dismissal, family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# DropdownMenu (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `DropdownMenu` props with web's names and defaults, without `menuWidth`; data entries without `target` and `rel`. React Native adds `render` (`auto`, `system` or `drawn`), `isDisabled`, `title` and `triggerLook`, and the entry fields `glyph`, `isChecked`, and a section's `layout` and `selection`.                                                                                                   |
| Behavior                | `render` says who draws the menu. `system` is the platform's menu, a pull-down that opens as the finger lands and picks as it lifts. `drawn` is Astryx's popover or bottom sheet, as `presentation` chooses. `auto`, the default, is the system menu on iOS where its native piece is present and every row can be carried as data, and the drawn menu otherwise; whether Android shows its platform menu is OQ1. |
| End-user impact         | On iPhone and iPad a person gets the system's own pull-down menu, with its haptics, sizing and VoiceOver behaviour; where the system menu cannot carry the rows, and on Android, an Astryx menu drawn in the platform's look opens instead.                                                                                                                                                                       |
| Builder impact          | Web code that renders a `DropdownMenu` ports unchanged unless it passes `menuWidth` or a link row's `target` or `rel`. A menu whose rows are only the menu parts goes native by itself; a React `header`, `footer` or `endContent` keeps it drawn.                                                                                                                                                                |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR1, FR2, FR3 and FR6.                                                                                                                                                                                                                                                                                                                        |
| Review checks           | Reject a default rendering a navigation library or a host decides, a system menu that drops a row, a state or a disabled flag, a drawn menu whose dismiss tap reaches the screen under it, a lost focus return, or a prop accepted and ignored.                                                                                                                                                                   |
| Governing rules         | `component:DropdownMenu`; `family:overlay-dismissal`; `family:navigation-destinations`; `spec:AST-012` FR9; `spec:AST-082` FR3, FR5, FR7, FR11; `spec:AST-093` FR1–FR5.                                                                                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenu on React Native is web's action menu hanging off a trigger, shown
as the platform's own pull-down menu wherever the system can carry its rows,
and as an Astryx menu in the platform's look wherever it cannot, so the same
rows behave the way the rest of the phone behaves.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: as on the web: `isMenuOpen` with `onOpenChange` controls the open state; without it the menu keeps its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `DropdownMenu`: its props, data entries and
  trigger (FR1, FR2, FR6).
- Who draws the menu on each platform, when the system menu cannot, and how
  the system menu behaves (FR3).
- How the rows map onto the system menu (FR4).
- The drawn menu's surfaces, dismissal and focus (FR5).

**Does not own / non-goals**

- The meaning of the web props, the parts and their rows — owned by
  `component:DropdownMenu` and its part records.
- The trigger Button's look and its tooltip — owned by `component:Button`.
- Dismissal rules shared by overlays — owned by `family:overlay-dismissal`;
  link destinations — owned by `family:navigation-destinations`.

## Public concepts

| Concept        | Closed values or states               | Meaning                                                           | Availability by variant/orientation/state             | Default   | Owner                                 | Stability    | Invalid-value behavior           |
| -------------- | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | --------- | ------------------------------------- | ------------ | -------------------------------- |
| `render`       | `auto`; `system`; `drawn`             | who draws the menu: the platform's menu, or Astryx's (FR3)        | always; `system` shows only where its host is present | `auto`    | `component:react-native/DropdownMenu` | experimental | an unknown value is a type error |
| `presentation` | `popover`; `bottom-sheet`; `adaptive` | which Astryx surface draws the menu (FR5)                         | the drawn menu                                        | `popover` | `component:DropdownMenu`              | experimental | an unknown value is a type error |
| `triggerLook`  | `button`; `title`; `large-title`      | the trigger as a button, or as a screen title with a chevron      | always                                                | `button`  | `component:react-native/DropdownMenu` | experimental | an unknown value is a type error |
| describable    | describable; not describable          | whether every row can be carried to the system menu as data (FR3) | always                                                | —         | `component:react-native/DropdownMenu` | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                                        | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native's `DropdownMenu` MUST take web's `button`, `renderTrigger`, `items`, compound children, `presentation`, `isMenuOpen`, `onOpenChange`, `menuMaxHeight`, `header`, `footer`, `placement`, `alignment`, `onClick` and `hasChevron` with web's names, defaults (the catalog's "Menu" label, `below`, `start`, a chevron) and meaning, and the additions of FR2, and no other props. Data entries take web's action, divider and section fields and the entry fields of FR2. `renderTrigger` returns React Native content and receives `onClick`, `isExpanded`, `isDisabled` and `accessibilityState`, and the control's own label names the trigger. Base props follow `spec:AST-082` FR7 on the trigger. It MUST NOT offer a prop it does not honor: `menuWidth` mixes a number with CSS lengths, and a link row's `target` and `rel` are HTML link attributes, while a link row here opens through the app's link opener.                                                                                                                                                                                                          | `component:DropdownMenu`; `spec:AST-082` FR3, FR5, FR7                                       | verify             |
| FR2 | React Native MUST add, each for a platform reason: `render` (FR3), because a phone has a system menu; `isDisabled`, which disables a `renderTrigger` control, which has no `button` to carry the disabled state (the built-in Button takes `button.isDisabled`); `title`, a visible title above the rows, as the system menu's title is, drawn as a heading line in the drawn menu; `triggerLook`, which draws the trigger as a screen title with a chevron, as the platform's navigation-bar title menu does; and, on data entries, `glyph` (an emoji or a few characters in an action row's icon place), `isChecked` (a checkable action row and its state), a section's `selection` (`single` makes its rows one choice, `multiple` independent checks) and a section's `layout` (`row` draws its actions side by side as icons), because the system menu shows each of them as a data row (FR4). An unset addition changes nothing.                                                                                                                                                                                                       | `spec:AST-082` FR5; `architecture:public-component-api` INV3                                 | verify             |
| FR3 | `render` MUST say who draws the menu. `system` is the platform's menu: on iOS the trigger sits inside the system menu's native view and acts as a pull-down button, so a touch down opens the system menu and a finger that slides to a row and lifts chooses it, and the menu's look, haptics and sizing are the system's; whether Android's `system` shows the platform's menu is OQ1. `drawn` is Astryx's menu on the surface `presentation` chooses (FR5). `auto`, the default, is the system menu where its native piece is present and the menu is describable, and the drawn menu otherwise, silently; `system` that cannot show draws and warns once in development with the reason. A menu is describable when its rows are only the menu parts, with no `endContent`, no sub-menu inside a sub-menu, no sub-menu `header`, `footer` or `onOpenChange`, and no React `header` or `footer`; a plain-text `header` becomes the system menu's title, unless the menu also has a `title`. `presentation="bottom-sheet"` always draws. A closed system menu builds nothing.                                                               | `spec:AST-082` FR11; `spec:AST-093` FR2; OQ1                                                 | verify             |
| FR4 | Under the system menu every row MUST keep its meaning: an action row's label, description, icon or `glyph`, destructive and disabled flags, and `hasCloseOnSelect`; a checkable row's on or off state; a single-selection section or radio group as one choice; a section or group as an inline group under its title, and `layout="row"` as a row of icons; a divider as the boundary between inline groups; a sub-menu one level deep, with a loading row while it waits. A hidden row is left out. Choosing an action runs its `onClick` and then opens an accepted `href` through the app's link opener; choosing the checked row of a single choice again closes the menu without calling `onClick`.                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:DropdownMenu`                                                                     | verify             |
| FR5 | The drawn menu MUST open on the surface `presentation` chooses: `popover` an anchored panel in the platform's menu look, placed by `placement` and `alignment` (logical, so they mirror in right-to-left) and capped by `menuMaxHeight`; `bottom-sheet` a modal bottom sheet of touch rows on every screen; `adaptive` that sheet on a compact screen (`spec:AST-012` FR9), sampled as the menu opens, and the panel elsewhere. The sheet holds the `header` above the rows and the `footer` below them. A touch outside the drawn menu closes it and reaches nothing under it. Android's back and the VoiceOver escape gesture leave a drilled-in sub-menu first, then close the menu. Every open request goes through `onOpenChange`, and a controlled `isMenuOpen` stays the truth; a trigger press runs `onClick` and then asks to open. When the menu closes, focus follows `component:DropdownMenu` FR6: where the close would strand focus that entered the menu, focus returns to the trigger, and a touch outside that landed on a focusable control keeps focus there; a layer the menu opened inherits that return when it closes. | `component:DropdownMenu` FR1, FR6, FR7, FR11; `family:overlay-dismissal`; `spec:AST-012` FR9 | verify             |
| FR6 | The built-in trigger MUST be the Button `button` describes, `secondary` and `md` by default, with a trailing chevron unless `hasChevron` is false and the expanded state while the menu is open. With `isIconOnly` and an `icon` it is an icon-only control named by its label, with no chevron, as on the web. With `triggerLook` `title` or `large-title` it is drawn as an inline or large screen title with a chevron. Under the system menu, a `renderTrigger` control stays inside the menu host, so the system menu opens from it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:DropdownMenu` FR3, FR9; `component:Button`                                        | verify             |

The gap lines below describe `@astryxdesign/react-native`, the library that
implements this record.

- FR1 gap: the library's DropdownMenu and its data entries also take
  `onPress`, a second name for `onClick`; when both are given, only `onPress`
  runs.
- FR1 gap: the library's `button` also takes `accessibilityLabel` and
  `accessibilityHint`, which `label` and `tooltip` own, and `surface`
  (`default` or `glass`), which draws an icon-only trigger on the platform's
  glass.
- FR2 gap: the library's `isDisabled` also disables the built-in Button, ahead
  of `button.isDisabled`.
- FR3 gap: the library has no `render` prop; it spells `auto` and `system` as
  `presentation="auto"`, its default, and `presentation="native"`.

### Allowed variation

- **AV1 — The system's menu.** Under the system menu, the menu's look,
  motion, haptics and sizing are the system's own and may change with each OS
  release.
- **AV2 — The platform's look.** The drawn panel follows the platform's menu
  look: the system menu's panel on iOS and Material 3's menu on Android.

### Representative states

| State                                            | Required invariant                                      | Allowed variation     |
| ------------------------------------------------ | ------------------------------------------------------- | --------------------- |
| iPhone, `render` `auto`, plain rows              | the system pull-down menu from the trigger              | AV1                   |
| iPhone, `render` `auto`, a React `footer`        | the drawn panel; no warning                             | AV2                   |
| iPhone, `render` `system`, `endContent` on a row | the drawn panel; one development warning naming the row | AV2                   |
| Android, `render` `auto`                         | the drawn panel                                         | AV2                   |
| `presentation` `adaptive` on a phone             | the drawn bottom sheet                                  | none                  |
| a checked row of a single choice chosen again    | the menu closes; no `onClick`                           | none                  |
| a link row chosen                                | `onClick`, then the destination opens                   | the app's link opener |
| a touch outside the drawn menu                   | the menu closes; nothing under it is pressed            | none                  |
| Android back in a drilled-in sub-menu            | the parent rows return; the menu stays open             | none                  |
| `renderTrigger` under the system menu            | the system menu opens from the caller's control         | none                  |

### Transformation and precedence order

- **ORD1 — Rendering.** `render`; for `auto`, the system menu where its
  native piece is present, the menu is describable and `presentation` is not
  `bottom-sheet`; otherwise the drawn menu.
- **ORD2 — Drawn surface.** `bottom-sheet` → the sheet; `adaptive` → the
  sheet on a compact screen, else the panel; `popover` → the panel.
- **ORD3 — Open state.** A controlled `isMenuOpen` → the menu's own state;
  every request through `onOpenChange`.

### Performance and resources

- **PR1 — A closed menu costs nothing.** A closed system menu builds no menu,
  and the drawn menu mounts its surface only while open,
  so a list of rows with menus scrolls as one without them.

## Accessibility contract

- **AR1 — The trigger.** The trigger is a button named by its label, or by a
  `renderTrigger` control's own label, with the expanded state while the menu
  is open; a disabled trigger reads as disabled and never opens.
- **AR2 — The system menu.** Under the system menu, VoiceOver's behaviour is
  the system's: rows read with their states, and the menu closes with the
  escape gesture.
- **AR3 — The drawn menu.** The drawn menu is a menu of rows, each read with
  its label, state and disabled flag as its part record states. In the sheet,
  VoiceOver starts on the menu's title as a heading and then moves into the
  rows.
- **AR4 — Focus returns.** Closing the drawn menu, by a choice, a touch
  outside, Android's back or the escape gesture, returns focus to the trigger
  where it would otherwise be stranded in the closed menu (FR5).

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | -------------------------- | -------------- | ------------------ |
| System menu      | the platform's pull-down menu                                | prescribed by the platform | primary        | FR3, FR4           |
| Drawn panel      | the system menu's panel on iOS; Material 3's menu on Android | prescribed by the platform | primary        | FR5                |
| Drawn sheet      | core's bottom-sheet action list                              | prescribed by core         | primary        | FR5                |
| Trigger          | core's Menu Button                                           | prescribed by core         | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): on iOS the system's pull-down menu
(UIMenu), which fits a describable menu; it carries rows as data only, so a
menu with React content in a row, a header or a footer is drawn. On Android
the platform's menu is PopupMenu; whether `system` shows it is OQ1, so the
menu is drawn there. Guideline pages (`spec:AST-093` FR3): Menus, Pull-down buttons and
Accessibility in the Apple Human Interface Guidelines.

Theme values read (`spec:AST-093` FR4): the trigger's Button values, the menu
surface, text, divider and destructive colours, the radius and shadow of the
drawn panel, the sheet's values from BottomSheet, and the theme's motion.

### Native pieces

| Native piece       | Record   | What this record uses it for                             |
| ------------------ | -------- | -------------------------------------------------------- |
| `AstryxSystemMenu` | FR3, FR4 | the system pull-down menu and its rows on iOS (FR3, FR4) |

## Family and system relationships

- `component:DropdownMenu` and its part records own the props, the rows and
  their meaning; this record states only what React Native adds or does
  differently.
- `component:Button` owns the trigger's look and tooltip;
  `component:BottomSheet` owns the sheet.
- `family:overlay-dismissal` owns light dismissal; `family:navigation-destinations`
  owns which destinations a link row opens.

## Verification map

| Contract | Verification                                                                               | Representative states                                                                                                                                 | Mutation or failure expectation                                                                                                                                                         | Audit section                             |
| -------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1, FR2 | Type tests of the exports against web's types; a contract drift test                       | each prop and entry field; `menuWidth`, `target` and `rel` absent; each addition unset                                                                | a missing web prop, a different default, an accepted and ignored prop, or an addition that changes an unset menu fails                                                                  | `audit:react-native/DropdownMenu/api`     |
| FR3      | Unit tests of the rendering choice through the package's testing doubles; Simulator checks | each `render` value with the host present and absent; each describable and not-describable row shape; a plain-text and a React header; `bottom-sheet` | a system menu for a menu that is not describable, a drawn menu where the system menu can show under `auto`, a missing or repeated warning, or a theme default that `auto` ignores fails | `audit:react-native/DropdownMenu/render`  |
| FR4      | Unit tests of the menu description; Simulator checks of the system menu                    | every row kind and flag; a single choice chosen again; a link row; a sub-menu that loads                                                              | a dropped row, state or flag, a second sub-menu level, an `onClick` on a re-chosen checked row, or a link that opens before `onClick` fails                                             | `audit:react-native/DropdownMenu/system`  |
| FR5, AR4 | Unit tests of the drawn surfaces, dismissal and focus; Simulator and emulator checks       | each `presentation` on a phone and a tablet; a touch outside; Android back in a sub-menu; the escape gesture; controlled and uncontrolled             | a dismiss tap that presses what lies under it, a back press that closes past a drilled-in level, a lost focus return, or an open state that ignores `isMenuOpen` fails                  | `audit:react-native/DropdownMenu/drawn`   |
| FR6, AR1 | Unit tests of the trigger; captures of each look                                           | `button` variants; icon-only; `title` and `large-title`; `renderTrigger` under the system and drawn menus; disabled                                   | a trigger without the expanded state, a disabled trigger that opens, or a `renderTrigger` control outside the menu host fails                                                           | `audit:react-native/DropdownMenu/trigger` |
| AR2, AR3 | VoiceOver and TalkBack checks on the Simulator, the emulator and devices                   | the system menu; the drawn panel; the sheet                                                                                                           | a row read without its state, or a sheet that opens on a row instead of its title, fails                                                                                                | `audit:react-native/DropdownMenu/a11y`    |

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Does `system` show Android's PopupMenu?** (`human-design`)
  Options: a describable menu shows PopupMenu under `system` and `auto`, in
  the platform's theme, without descriptions; or Android always draws the
  menu in Material 3's look, and `system` there draws and warns as where the
  native piece is absent.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
