---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-128
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [imdreamrunner]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# React Native platform: Menus and presentation system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an app built with Astryx on iOS gets the system's own menus,
action sheets, and sheets: a pull-down menu that opens on touch-down and
follows the finger, a context menu that raises the held item above a dimmed
background, an action sheet with Cancel set apart, and a sheet with the
system's detents, grabber, material, spring, and swipe to dismiss. Sheets,
dialogs, and full-screen routes opened from anywhere in the tree stack in the
order they were asked for, follow the app's light or dark mode, set the
status bar they cover, and move VoiceOver focus in and back out. On Android
and wherever a native piece is absent, the same components draw their own
surfaces with the same choices and events. The developer gets this from four
native pieces: the system menu, the action sheet, the presentation host, and
the modal host, each with a JavaScript wrapper in the platform layer.

This record details the platform layer of `spec:AST-112` for this group and
follows the shared platform rules of `spec:AST-140`: registration
(`spec:AST-140/FR1`), missing pieces (`spec:AST-140/FR2`), the result
vocabulary (`spec:AST-140/FR3`), additive evolution (`spec:AST-140/FR5`),
threading (`spec:AST-140/FR6`), and coexistence (`spec:AST-140/FR9`). It uses
the capability shape of `spec:AST-112/FR7` and the host wiring of
`spec:AST-112/FR9`. It applies `spec:AST-082/FR11`, `spec:AST-093/FR2`
(native-first sheets and menus), and `spec:AST-093/FR3` (the Apple Human
Interface Guidelines pages Menus, Pull-down buttons, Context menus, Action
sheets, Sheets, and Modality) to React Native on iOS.
The menu, action sheet, presentation, and modal hosts belong to the platform's
core (`spec:AST-112/FR1`) and link in every app. Each component's own record
states its rows, sheet heights, dismissal rules, and `auto` default for
`render`, and the navigation record states the router's route options; this
record states the native pieces they present through.

## Why this exists

- **System menu.** The library's menu components own their rows as compound
  parts; the platform takes those rows as data, uses the library's icon
  resolution, hands the menu back to the drawn surface when the system cannot
  show it, and adds no third-party native dependency (`spec:AST-112/FR2`).
  The menu behaviour itself is the system's (DEC-3).
- **Action sheet.** It answers in the platform's result shape, with a
  refused presentation, a second sheet, and the asking surface told apart.
  React Native's own action sheet covers most of this; OQ1 asks whether the
  platform builds on it.
- **Presentation host.** No dependency-free piece presents a component's
  content in UIKit's detent sheet from anywhere in the tree, stacked in
  request order with other surfaces (DEC-2), and Astryx takes no third-party
  native dependency (`spec:AST-112/DEC-9`). An app may use react-native-screens
  or a bottom-sheet library beside these components without conflict
  (`spec:AST-140/FR9`).
- **Modal host.** React Native's modal host refuses a second window from the
  same screen; the modal host lifts that limit for drawn sheets. OQ4 asks
  whether the presentation host covers it.

## Who uses it

| Native piece                                        | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | What a person sees                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxSystemMenu` (`nativeSystemMenu`)             | native component (Fabric Native Component) | `DropdownMenu`, `MoreMenu`, `ContextMenu`, `Selector` (an iOS menu style over a short plain list), `FileInput`'s source menu, and the components built on DropdownMenu's menu button (`PlaybackRateMenu`, the menus of `Header` (TopNav's React Native form)) or on `DropdownMenu` (`Header`'s composed parts, `Table`, `BarButton`). Custom triggers reach it through the `useSystemMenuHost()` hook on `.`.                                                                                                                                                                               | In a notes app, a tap on "More" opens the system pull-down menu; a long press on a note lifts it over a dimmed backdrop with its menu beside it. |
| `AstryxActionSheet` (`nativeActionSheet`)           | native module (Turbo Native Module)        | `ActionSheet`; through it `FileInput`'s source menu where the system menu is absent, and `Item`'s swipe actions that carry a menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Swiping away a draft in a chat screen asks "Discard draft?" in the system action sheet, with Cancel apart at the bottom.                         |
| `AstryxPresentationHost` (`nativePresentationHost`) | native component (Fabric Native Component) | `BottomSheet` (the system sheet), and every surface that opens one: `ActionSheet`'s drawn form, `Popover`'s, `DropdownMenu`'s and `ContextMenu`'s sheet forms, `Selector`'s picker, `MultiSelector`, `ComplexSelector`, `Typeahead`, `DateInput`, `DateRangeInput`, `Tokenizer`, `PowerSearch`, the mega menu of `Header` (TopNav's React Native form). `Dialog`, `AlertDialog`, `CommandPalette`, and the modal `Drawer` open in its over-full-screen window. The router's stack navigator presents its `modal`, `formSheet`, `fullScreenModal`, and `transparentModal` routes through it. | A photo viewer's info sheet rests at half height in Liquid Glass, drags to full height, and a confirm dialog opened from it comes up on top.     |
| `AstryxModalHost`                                   | native component (Fabric Native Component) | `BottomSheet`'s drawn form on iOS and the router's drawn sheet routes: each drawn sheet opens in its own window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A drawn sheet opened from a second tab while another drawn sheet is up appears over it, and each closes on its own.                              |

## Non-goals

- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — Hosts and probes.** `AstryxAppRoot` installs the system menu,
  presentation, and action sheet hosts (`spec:AST-112/FR9`), and `nativeHosts`
  can remove each one; without a host, the library draws that surface. Each
  host is an `AstryxCapability`. `isAvailable()` answers true only on iOS
  when the host's native piece is registered; on Android, in Jest, and in a
  binary that lacks the piece, it answers false. The view hosts answer
  `version()` with `null`. The probes are `isSystemMenuAvailable()`,
  `isSystemMenuPreviewAvailable()`, `isPresentationHostAvailable()`, and
  `nativePresentationHost.supports(kind)`.
  - Under `spec:AST-112/FR21`, the system menu, the action sheet, and the
    chrome of a sheet the presentation host presents are `system`. The
    library's drawn menus and sheets, a drawn sheet in the modal host included,
    are `drawn`, and their look is their `surface` (`spec:AST-123`). Where the
    host is absent, the component draws (FR14).
- **FR2 — The system menu takes a menu description.** The host's component
  wraps a trigger view and takes `menu`, `trigger`, `isDisabled`, `onSelect`,
  `onOpenChange`, `onUnavailable`, `preview`, `previewColorScheme`, and a
  `ref` with `present()` and `dismiss()`. Each event has one object argument.
  - The description holds a name that is not drawn, an optional visible
    heading, and rows of three kinds. An action row has an `id`, a title, and
    optional subtitle, icon, glyph, on or off state, destructive and disabled
    flags, and a flag that keeps the menu open after the choice. A group is
    either an inline section between separators or a submenu, one level deep;
    it can be single-selection, disabled, or a row of icon elements (`small`
    or `medium`). A loading row shows the system's progress row.
  - A row's icon is an Astryx icon name, resolved as `Icon` resolves it
    under `spec:AST-082/FR17`: the icon the app or theme defines for the name
    (a system symbol or an image the app ships), else the platform's default
    symbol, else the fallback `Icon` draws for a name it cannot map
    (`spec:AST-127`). A row and an `Icon` with the same name therefore show the
    same image. A glyph (an emoji or a few characters) is drawn as the image of
    a row without an icon.
  - `useAnySystemMenuOpen()` and `isAnySystemMenuOpen()` tell whether any of
    the package's system menus is open in the current JavaScript runtime.
- **FR3 — The system menu behaves as the system's menu.**
  - With `trigger: 'tap'`, the trigger acts as a pull-down button: a touch
    down opens the menu, and the finger can slide to a row and lift to choose
    it. That touch belongs to the menu. With
    `trigger: 'longPress'`, a long press opens a context menu: the system
    raises the wrapped view above a dimmed background with its haptic, and
    short taps still reach the wrapped view.
  - A closed menu costs nothing when its trigger mounts, so a long list of rows
    with menus scrolls as one without them. When `menu` changes while the menu
    is open, the open menu shows the change. A menu opens when it has rows.
  - `present()` opens the menu on request from JavaScript. When the system
    cannot open it, `onUnavailable` gives the reason: `os` (iOS before 17.4),
    `disabled`, `not-shown` (the menu did not appear shortly after the
    request), `no-native-view`, or `error`. The caller then shows its drawn
    menu for that opening. A context menu opened this way appears beside the
    wrapped view without raising it. `dismiss()` closes the menu.
  - For `trigger: 'longPress'`, `preview` replaces the raised view with a card
    drawn in `previewColorScheme`. The card keeps a 16-point margin on each
    side of the window and uses at most 60 percent of its height. A tap on the
    card closes the menu.
  - An enabled touch shield (`spec:AST-112/FR1`) keeps the trigger's menu
    closed.
- **FR4 — The action sheet gives one answer.** `nativeActionSheet.show(sheet)`
  takes a title, a message, the actions (each a label and a destructive
  flag), a cancel label, and the `rootTag` of the surface that asks. It
  resolves `AstryxResult<{index}, 'no-window' | 'busy'>`: the index of the
  chosen action; `cancelled` for Cancel, or a tap outside on iPad;
  `no-window` when no view controller can present it; `busy` when another
  action sheet of the process is open; `no-module`; or `error`.
  - The sheet comes up over the topmost presented view controller of the
    asking surface, so it covers a sheet that asked for it. Destructive
    actions show in the system's destructive red, and Cancel is a separate
    row at the bottom. On iPad the sheet is a popover that points at the
    bottom centre of the presenting view (OQ3).
  - An open action sheet stays up until the person answers, and the answer
    always arrives.
- **FR5 — The presentation host presents five kinds.**
  `nativePresentationHost.component` takes `kind`, `isPresented`, `isModal`,
  `canDismiss`, `sheet`, `animation`, `statusBarHidden`, `statusBarStyle`,
  `colorScheme`, `estimatedSize`, the events of FR7, and `onError`, and lays
  its children out as the presented content.

  | `kind`           | iOS presentation                                                                   | Dismissal by the person         |
  | ---------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
  | `sheet`          | UISheetPresentationController with the detents of FR6                              | swipe down below the lowest one |
  | `pageSheet`      | UIModalPresentationPageSheet, configured by UIKit                                  | swipe down                      |
  | `formSheet`      | UIModalPresentationFormSheet, which UIKit shows as a page sheet in a compact width | swipe down                      |
  | `fullScreen`     | UIModalPresentationFullScreen on the system background                             | through the content's exit      |
  | `overFullScreen` | UIModalPresentationOverFullScreen; the presenting screen stays visible behind      | through the content             |
  - Any other `kind` reports `unsupported` through `onError`, once per mount.
  - The host reads `kind` and `animation` at the start of each presentation.
    `animation` is `default` (UIKit's transition), `fade`, or `none`, and the
    dismissal uses the same transition; a swipe dismissal stays interactive.
  - `isModal` false makes a `sheet` undimmed and leaves the screen behind it
    interactive. The other kinds always block the screen behind.
  - UIKit draws the whole container, with its own motion, grabber, corner
    radius, material (Liquid Glass at partial heights from iOS 26), dimming,
    resistance, scroll-to-expand, and the card effect behind a full-height
    sheet. The theme draws only the content (DEC-1). The host view itself is
    zero-size in the page and passes touches through, and the first presented
    frame already has the presented size.

- **FR6 — A detent is named by its value.** A detent is named by its
  value: a visible height in points, measured from the screen's bottom edge,
  or a named stop, `fit` (the content's measured height; the sheet waits for
  the measurement) or `large` (the system's large detent). `sheetHeights`
  lists the sheet's detents ascending by height. `sheetSelectedDetent` is the
  value of the detent the sheet opens at, and a new value moves it there.
  `onDetentChange({detent})` reports the value of the detent the person moved
  to.
  `large` is always the largest detent, and `fit` takes its place in the
  order by the content's measured height. The wrapper's `sheet` option
  carries the same values as these native props.
  `sheetGrabber` and `sheetScrollExpands` are on by default, and a negative
  `sheetCornerRadius` keeps the system's radius.
  - `sheetCovered` holds a sheet at the large detent while another modal
    sheet covers it and returns it to its detent afterwards;
    `onDetentChange` reports the sheet's own detents alone. `sheetRetained` keeps a sheet that another
    sheet replaced in place under it, faded out and hidden from assistive
    technology, until the flag turns false.
- **FR7 — Presentation events.** `onPresented` reports a finished
  presentation. `onDismissAttempt({reason})` reports a blocked dismissal while
  `canDismiss` is false: `swipe` (the sheet springs back) or `escape` (the
  VoiceOver escape is refused). `onUserDismiss({reason})` reports that the
  person closed it with `swipe` or `escape`; an unknown reason arrives as
  `system`. `onDismissed` reports, once for each presentation and whatever
  closed it, that it is off the screen; reports arrive in the order the
  presentations closed. The host stays mounted until `onDismissed`, so the
  content stays visible through the exit.
- **FR8 — Presentations stack in request order.** Presentations from every
  presentation host appear in the order they were requested, each over the
  one before it: a surface opened beside another, from inside another, or
  through a deep link that opens several levels comes up on top, and two
  requests in one update present one after the other, and each one
  presents. When a covered sheet closes, the sheets over
  it close with it and the ones still wanted present again. A replaced sheet
  and its replacement close together in one motion.
- **FR9 — Appearance and status bar in presented windows.**
  - `colorScheme` and `appearance` set the interface style of the presented
    view controller and of its presentation controller, so the system
    material matches the app's light or dark mode. A change of mode while a
    full-screen presentation is up reaches its content and everything over it.
  - A `fullScreen` presentation, and an `overFullScreen` one that sets the
    props, controls the status bar: the style from `statusBarStyle`, else
    from a navigation host in the content; hidden by `statusBarHidden`, else
    as that navigation host asks. The home indicator follows the content's
    navigation host.
  - On Android, each React Native `Modal` window follows the app's light or
    dark mode when it changes. The status bar of such a window is
    `spec:AST-129`'s window status bar view.
- **FR10 — Keyboard and safe area inside a presented surface.** UIKit moves
  a sheet for the keyboard: a sheet at its content height rises whole, a
  sheet at a partial detent grows to the large detent, and a full-height
  sheet stays where it is. Only a sheet whose bottom edge stays on the
  window's bottom edge insets its scroll content for the keyboard. Content of
  a full-screen presentation starts inside the window's safe area; content of
  a sheet starts below the window's top inset and takes the side and bottom
  insets only on the edges the sheet touches. The keyboard dock that docks
  views on the keyboard is `spec:AST-129`'s.
- **FR11 — The modal host extends React Native's modal host.**
  `AstryxModalHost` has the props and events of React Native's `Modal` host
  and the same behaviour, with one difference: it presents from the topmost
  view controller above its screen, so two of its windows can be open side by
  side. When a window under others closes, the windows over it close too and
  come back at once, without animation. The library reaches it through the
  internal `./host` entry. Where it is not registered, the library uses React
  Native's `Modal`. When the system removes a window that is still meant to be
  visible, the host reports it, and the surface that opened it closes. A
  modal window leaves the screen when the component that owns it unmounts,
  during a transition too. That guarantee rests on FR16's one exception:
  where React Native changes the state it depends on, React Native's own
  behaviour applies, and a window whose owner unmounts during a transition
  can stay on screen, taking touches, until something else dismisses it.
- **FR12 — Accessibility.**
  - The trigger or the presented content supplies the name, role, and state
    of the system menu, the action sheet, and the presentation host. The open menu, the action sheet, and the grabber
    are system elements and use the system font at the person's Dynamic Type
    size.
  - A menu trigger is one accessible element; a VoiceOver double tap opens
    its menu. The rows of an open menu are the system menu's own elements.
  - A presentation moves VoiceOver focus into its content; after the
    dismissal, focus returns to the element that had it before. The
    full-screen kinds mark their content as modal. A sheet relies on UIKit to
    keep VoiceOver inside it, which keeps the grabber reachable. While a modal
    sheet is open, VoiceOver ignores the containers under it, and they come
    back when the sheet closes for any reason.
  - When no element in the content handles the VoiceOver escape (the
    two-finger Z gesture), the presented content receives it: with
    `canDismiss` it closes the presentation, else it reports
    `onDismissAttempt({reason: 'escape'})`. In the modal host, the escape
    sends `onRequestClose` to the top window.
  - The system sheets, menus, and action sheets apply Reduce Motion as the
    system does.
- **FR13 — Threading.** Under `spec:AST-140/FR6`, presentation, detent
  drags, resistance, scroll-to-expand, menu tracking, and the context menu's
  raise run on the UI thread. JavaScript
  gets discrete events only: a choice, an open change, a presentation, a
  blocked dismissal, a dismissal, and a detent change.
- **FR14 — Absent pieces fall back and report.** A host without
  its native piece answers `isAvailable()` false, and the library draws
  (`spec:AST-140/FR2`). The system menu component, rendered without its
  native view, is a plain view that answers `present()` with
  `onUnavailable({reason: 'no-native-view'})`. A missing action sheet module
  resolves `no-module`. A kind that the host does not present reports
  `unsupported`. Every call resolves (`spec:AST-140/FR3`).
- **FR15 — Contract baseline.** Each contract keeps the baseline that `spec:AST-140/FR5` sets, and later behaviour is a named feature that JavaScript
  checks (`spec:AST-140/FR5`).
- **FR16 — Native code uses public API only.** The group's native code calls
  only the public API of iOS, Android, and React Native. One exception: to
  keep FR11's guarantee that no modal window stays on screen after the
  component that owns it unmounts, the modal host relies on non-public state
  of React Native's modal host. Where React Native changes that state, the
  modal host logs a fault and keeps React Native's own behaviour.

### Native contract

| Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                        | Commands                     | Events                                                                            | Platforms |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- | --------- |
| `AstryxSystemMenu`       | native component (Fabric Native Component) | `colorScheme`, `hasPreview`, `menu`, `menuDisabled`, `trigger`                                                                                                                                                                                                                                                                               | `dismissMenu`, `presentMenu` | `onMenuOpenChange`, `onMenuSelect`, `onMenuUnavailable`                           | iOS       |
| `AstryxPresentationHost` | native component (Fabric Native Component) | `animation`, `appearance`, `canDismiss`, `colorScheme`, `estimatedHeight`, `estimatedWidth`, `isModal`, `isPresented`, `kind`, `presentationStyle`, `sheetCornerRadius`, `sheetCovered`, `sheetFitHeight`, `sheetGrabber`, `sheetHeights`, `sheetRetained`, `sheetScrollExpands`, `sheetSelectedDetent`, `statusBarHidden`, `statusBarStyle` | none                         | `onDetentChange`, `onDismissAttempt`, `onDismissed`, `onPresent`, `onUserDismiss` | iOS       |
| `AstryxModalHost`        | native component (Fabric Native Component) | `allowSwipeDismissal`, `animationType`, `hardwareAccelerated`, `identifier`, `navigationBarTranslucent`, `presentationStyle`, `statusBarTranslucent`, `supportedOrientations`, `transparent`, `visible`                                                                                                                                      | none                         | `onDismiss`, `onOrientationChange`, `onRequestClose`, `onShow`                    | iOS       |

| Contract            | Kind                                | Methods                                          | Platforms |
| ------------------- | ----------------------------------- | ------------------------------------------------ | --------- |
| `AstryxActionSheet` | native module (Turbo Native Module) | `getConstants`, `isSupported`, `present`, `show` | iOS       |

On the wire, every built kind is the native `kind` `sheet` with
`presentationStyle` naming it. `present` takes one request object with the
calling surface and resolves `{status, index, reason, message}`, with `status`
`ok`, `cancelled`, or `error` (`spec:AST-140/FR3`); `show` is its positional
form.

### Platform support

| Contract                 | iOS                                                                                                                                      | Android                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AstryxSystemMenu`       | UIMenu on a UIButton (`showsMenuAsPrimaryAction`) and UIContextMenuInteraction; `present()` from iOS 17.4; row element sizes from iOS 16 | The library draws a Material 3 menu, anchored or in a bottom sheet                                     |
| `AstryxActionSheet`      | UIAlertController in the action sheet style; a popover on iPad                                                                           | An `AlertDialog` or a drawn bottom sheet of buttons                                                    |
| `AstryxPresentationHost` | UISheetPresentationController detents (custom heights from iOS 16), page, form, full-screen and over-full-screen presentations           | The library's drawn sheet in a React Native `Modal` window; full-screen routes in a full-screen window |
| `AstryxModalHost`        | React Native's modal host, presenting from the top of the stack                                                                          | React Native's `Modal`, whose Dialog windows stack                                                     |

- FR5 gap: `AlertDialog` draws its alert in the over-full-screen window, in
  place of a system alert.
- FR5 gap: `Popover` draws its anchored surface, on iPad too, in place of
  UIPopoverPresentationController.
- `spec:AST-082/FR11` gap: on Android, the library draws menus, sheets, and
  dialogs (OQ5).
- Supported feature/engine floor: `spec:AST-112` (iOS at React Native's
  minimum, Android API level 24, the New Architecture only).
- Unsupported behavior: a host whose native piece is absent reports itself
  unavailable and the library draws; a missing module resolves `no-module`; a
  kind the host does not build answers `unsupported` (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR1 (the presentation, menu, and action-sheet hosts
  in the core) and FR6 to FR9 for this group.
- Relies on `spec:AST-112` FR3: the core, with the native half of
  every library component, links by default.
- Relies on `spec:AST-082` FR10 gaining `render.default`, as `spec:AST-112`
  amends it (`spec:AST-112/FR21`).
- Relies on `spec:AST-140` FR5: each contract keeps the baseline that `spec:AST-140/FR5` sets, and later behaviour is a named feature that JavaScript
  checks.

## Verification

| Contract | Verification                                                                                | Representative states                                                                                                                                            | Mutation or failure expectation                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests of each host's probes through the `./testing` doubles                            | absent, older, and current view and module shapes; `nativeHosts` with a host off; `render` set to `system` and `drawn` and left `auto`; a theme `render.default` | A probe answers true without the native piece, a turned-off host still presents, or `system` shows a drawn surface while the host is available      |
| FR2      | Unit tests of the description and its native form                                           | every row type; an unmapped icon; a glyph; a theme's symbol icon and image icon                                                                                  | A row loses a field, an unmapped icon draws something other than `Icon`'s fallback, or a row and an `Icon` with one name show different images      |
| FR3      | Simulator checks of both triggers; unit tests of the unavailable reasons                    | touch-down and drag-release; a long press; `present()` before iOS 17.4; an update while open; a preview card                                                     | The trigger also opens the drawn menu, or `present()` fails without `onUnavailable`                                                                 |
| FR4      | Unit tests through the `./testing` module double; Simulator check over a sheet              | a choice; Cancel; a second sheet; no window; absent module; an older module with `show` only                                                                     | A result rejects, Cancel reads as an error, or a second sheet does not answer `busy`                                                                |
| FR5      | Unit tests of the kind mapping and `supports(kind)`; Simulator checks of each kind          | each kind; a kind the host does not build; `animation` values; an undimmed sheet                                                                                 | An unbuilt kind presents something or reports nothing, or a full-screen kind lets the page take touches                                             |
| FR6      | Simulator detent checks; UI-thread frame checks of a drag                                   | `large`, `fit`, and point heights in ascending order; a selected detent; a covered and a retained sheet                                                          | A detent height counts the bottom inset twice, a prop or event carries an index, a borrowed detent is reported, or a drag runs JavaScript per frame |
| FR7      | Unit tests of the event mapping; Simulator checks                                           | a resisted swipe; a refused escape; a swipe dismissal; dismissal by `isPresented`                                                                                | `onDismissed` fires twice or not at all, or the host unmounts before it                                                                             |
| FR8      | Simulator checks of sibling, nested, and deep-linked stacks                                 | three sheets; a dialog over a sheet; a replaced flow closing                                                                                                     | UIKit refuses a presentation, or the order differs from the request order                                                                           |
| FR9      | Simulator checks and a hosted test of a live mode switch; emulator check of Android windows | a mode switch under a full-screen presentation; `statusBarHidden`; a navigation host's style in the content                                                      | The container keeps the old mode, or the status bar ignores the presentation's props                                                                |
| FR10     | Simulator keyboard checks in each sheet height; unit tests of the presented insets          | a fitted, a partial, and a full-height sheet with a field; a full-screen presentation                                                                            | A field ends behind the keyboard, or the home indicator inset applies twice                                                                         |
| FR11     | Simulator checks                                                                            | two sibling windows; a window closed under another; absent host                                                                                                  | UIKit refuses a sibling window, or a surviving window loses its content                                                                             |
| FR12     | Simulator accessibility tree checks; device checks with VoiceOver                           | focus in and back; the escape; a sheet over a full-screen route; Reduce Motion                                                                                   | Focus stays behind, the escape is lost, or a sheet is missing from the tree                                                                         |
| FR13     | UI-thread frame checks during drags and menu tracking                                       | a detent drag; a pull-down drag                                                                                                                                  | A JavaScript event per frame                                                                                                                        |
| FR14     | Unit tests through the `./testing` doubles                                                  | each host absent                                                                                                                                                 | A throw, a rejection, or a silent no-op                                                                                                             |
| FR15     | The platform's spec rules check                                                             | a changed contract                                                                                                                                               | A changed contract without a named feature                                                                                                          |
| FR16     | Source review of the native code against the public headers                                 | a React Native version that renames the modal host's state                                                                                                       | A call outside public API other than the named exception, or a hook that guesses instead of reporting a fault                                       |

## Decision log

### DEC-1 — The system draws the container; the theme draws the content

**Reference:** `spec:AST-128/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A system menu, action sheet, or sheet takes no theme colour, radius, or
type: its material, grabber, dimming, motion, and rows are the system's, in
the app's light or dark mode. Astryx themes what the person reads inside a
sheet. A person gets the platform's own surfaces, and the system's material
stays intact.

### DEC-2 — Every presentation comes up over the one on top

**Reference:** `spec:AST-128/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Surfaces open from anywhere in the tree, so each presentation comes up over
whatever is on top at that moment, in request order. A dialog from a sheet, a
sheet from a modal route, and a deep link that opens three levels all stack
as asked, and every request presents, whatever is already up.

### DEC-3 — Menus and action sheets carry words, not React content

**Reference:** `spec:AST-128/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A system menu or action sheet takes rows as data, and a component whose
rows hold React content keeps its drawn surface. The system's surfaces then
behave exactly as the system's, with its Dynamic Type, VoiceOver, and
haptics, and the same component description drives the drawn fallback. The
one React subtree a menu takes is a context menu's preview card.

### DEC-4 — The host reports a blocked dismissal; the caller decides

**Reference:** `spec:AST-128/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

With `canDismiss` false, the host resists the swipe and refuses the
VoiceOver escape, and reports each attempt with its reason. The component or
the router decides what follows, such as an action sheet that asks to discard
a draft. A person always gets a response to a dismissal gesture, and no
draft is lost to one.

## Open questions

- **OQ1 — Does the action sheet build on React Native's `ActionSheetIOS`?**
  (`human-design`) Options: keep the platform's module, which reports `busy`,
  `no-window`, and the calling surface; or wrap `ActionSheetIOS` in the same
  result shape.
- **OQ2 — What does a request carry for a system alert and a popover?**
  (`human-api`) The FR5 gaps need a request shape. Options: an alert with a
  title, a message, and buttons, and a popover with an anchor (the trigger's
  rect on its surface); or one anchor field shared with the action sheet
  (OQ3).
- **OQ3 — Does the iPad action sheet anchor at the control that asked?**
  (`human-api`) Options: add an anchor (the trigger's rect on its surface) to
  the request; or keep the bottom centre of the presenting view.
- **OQ4 — Do the modal host and the over-full-screen kind merge?**
  (`human-design`) Both present a window from the top of the stack: the modal
  host for drawn sheets, the presentation host for dialogs and full-screen
  routes. Options: keep both; or present drawn sheets through the
  presentation host's `overFullScreen` kind and retire the modal host.
- **OQ5 — Does Android present menus, sheets, and dialogs through system
  hosts?** (`human-design`) Android menus are drawn, and Android sheets and
  dialogs are a drawn panel in a React Native `Modal` window. Options: native
  hosts over Material Components (its menu, its bottom sheet, its dialog); or
  the drawn surfaces.
