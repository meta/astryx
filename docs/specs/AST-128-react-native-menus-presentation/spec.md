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

This record details the platform layer of `spec:AST-112` for this group. It
uses the result vocabulary of `spec:AST-112/FR6`, the capability shape of
`spec:AST-112/FR7`, the additive evolution of `spec:AST-112/FR8`, the host
wiring of `spec:AST-112/FR9`, and the Astryx Stage contract of
`spec:AST-112/FR12`. It applies `spec:AST-082/FR11` and
`spec:AST-093/FR2` (native-first sheets and menus) to React Native on iOS.
The menu, action sheet, presentation, and modal hosts belong to the platform's
core (`spec:AST-112/FR1`) and link in every app.

## Why this exists

The ecosystem covers much of this ground. Astryx owns these pieces for the
gaps stated per piece.

| Native piece      | What the ecosystem does well                                                                                                                                                                                                                                                                                                             | The gap Astryx closes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System menu       | @react-native-menu/menu puts a UIMenu on iOS and a PopupMenu on Android behind one view, with subtitles, images, check states, destructive rows, and nesting. react-native-ios-context-menu wraps UIContextMenuInteraction with custom React previews and deferred rows. zeego gives both a Radix-style compound API and a web fallback. | Astryx's DropdownMenu, MoreMenu, ContextMenu, and Selector already own their rows as compound parts, so the platform takes the menu as data from them and hands it back to the drawn surface when it cannot show it (an OS without the API, React content in a row). Icon names go through Astryx's one icon table. The package takes no third-party native dependency (`spec:AST-112/FR2`), and every public API has an Astryx Stage implementation (`spec:AST-112/FR12`). The menu behaviour itself overlaps these libraries; DEC-3.                                                |
| Action sheet      | React Native's own `ActionSheetIOS` shows UIAlertController's action sheet from the top-most controller, with destructive and disabled rows, an iPad anchor, and an interface style, at no dependency cost.                                                                                                                              | `ActionSheetIOS` answers through a callback with an index only: it reports no refused presentation, no second sheet while one is up, and no calling surface, and it has no Astryx Stage implementation. These are small gaps; OQ1 asks whether the platform builds on it instead.                                                                                                                                                                                                                                                                                                     |
| Presentation host | React Native's `Modal` presents page and form sheets and full-screen windows. react-native-screens' `formSheet` gives a navigation route UIKit's detent sheet with a grabber and corner radius. @gorhom/bottom-sheet draws a fully customisable sheet with gesture-handler and Reanimated on both platforms.                             | `Modal` has no detents, and it presents from the view controller of its own screen; when that controller already shows a sheet, UIKit refuses the next one. A react-native-screens sheet is a route of its navigator, not a component a screen opens anywhere in its tree, and the package takes no third-party navigation dependency (`spec:AST-112/DEC-9`). A drawn sheet is not the system container: no iOS 26 Liquid Glass at partial heights, no card effect, no system keyboard avoidance. The host gives every Astryx surface the system container through one queue (DEC-2). |
| Modal host        | React Native's `Modal` host is the platform's window for drawn content, with orientations, swipe dismissal, `onRequestClose`, and VoiceOver focus save and restore.                                                                                                                                                                      | It has the same limit: UIKit refuses a second drawn window from the same screen. The modal host keeps React Native's host and changes only where it presents from, so each drawn sheet gets a window of its own.                                                                                                                                                                                                                                                                                                                                                                      |

## Who uses it

| Native piece                                        | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What a person sees                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxSystemMenu` (`nativeSystemMenu`)             | native component (Fabric Native Component) | `DropdownMenu`, `MoreMenu`, `ContextMenu`, `Selector` (an iOS menu style over a short plain list), `FileInput`'s source menu, and the components built on DropdownMenu's menu button (`PlaybackRateMenu`, `TopNav`'s menus, `FloatingHeader`) or on `DropdownMenu` (`Header`, `Table`, `BarButton`). Custom triggers reach it through the `useSystemMenuHost()` hook on `.`.                                                                                                                             | In a notes app, a tap on "More" opens the system pull-down menu; a long press on a note lifts it over a dimmed backdrop with its menu beside it. |
| `AstryxActionSheet` (`nativeActionSheet`)           | native module (Turbo Native Module)        | `ActionSheet`; through it `FileInput`'s source menu where the system menu is absent, and `Item`'s swipe actions that carry a menu.                                                                                                                                                                                                                                                                                                                                                                       | Swiping away a draft in a chat screen asks "Discard draft?" in the system action sheet, with Cancel apart at the bottom.                         |
| `AstryxPresentationHost` (`nativePresentationHost`) | native component (Fabric Native Component) | `BottomSheet` (the system sheet), and every surface that opens one: `ActionSheet`'s drawn form, `Popover`'s, `DropdownMenu`'s and `ContextMenu`'s sheet forms, `Selector`'s picker, `DateInput`, `DateRangeInput`, `Tokenizer`, `PowerSearch`, `TopNav`'s mega menu. `Dialog`, `AlertDialog`, `CommandPalette`, and the modal `Drawer` open in its over-full-screen window. The router's stack navigator presents its `modal`, `formSheet`, `fullScreenModal`, and `transparentModal` routes through it. | A photo viewer's info sheet rests at half height in Liquid Glass, drags to full height, and a confirm dialog opened from it comes up on top.     |
| `AstryxModalHost`                                   | native component (Fabric Native Component) | `BottomSheet`'s drawn form on iOS and the router's drawn sheet routes: each drawn sheet opens in its own window.                                                                                                                                                                                                                                                                                                                                                                                         | A drawn sheet opened from a second tab while another drawn sheet is up appears over it, and each closes on its own.                              |
| `AstryxOverlayWindowHost` (`OverlayWindow`)         | native component (Fabric Native Component) | No Astryx component. Part of the Preview host package and outside this record; the Astryx app's preview route draws its exit control in it.                                                                                                                                                                                                                                                                                                                                                              | While previewing a project in the Astryx app, the exit control floats above everything the project shows, its own sheets included.               |

## Non-goals

- Each component's own contract: its rows, its sheet heights, its purpose and
  dismissal rules, and its drawn surface. The component's record owns them
  (`spec:AST-082/FR3`); this record owns the native pieces they present
  through.
- The library's drawn menus, sheets, and dialogs on Android and as fallbacks.
- The router's route options and navigation state (`spec:AST-112/DEC-9`); this
  record owns the presentation the router asks for.
- `AstryxOverlayWindowHost`, which is part of the Preview host package.
- The window status bar view and the keyboard dock that sheets use
  (`spec:AST-129`).
- How an app chooses between the system surface and the drawn one per
  component (OQ4).
- Equivalent internal implementations remain valid when they satisfy this contract.
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
  - A row's icon is an Astryx icon name. The host maps it to a system symbol
    through the library's icon table, so a row and an `Icon` with the same
    name match; a name without a symbol shows no image.
    `createNativeSystemMenu({symbols})` adds an app's own names. A glyph (an
    emoji or a few characters) is drawn as the image of a row without an icon.
  - `useAnySystemMenuOpen()` and `isAnySystemMenuOpen()` tell whether any of
    the package's system menus is open in the current JavaScript runtime.
- **FR3 — The system menu behaves as the system's menu.**
  - With `trigger: 'tap'`, the trigger acts as a pull-down button: a touch
    down opens the menu, and the finger can slide to a row and lift to choose
    it. JavaScript never sees that touch as a press of the trigger. With
    `trigger: 'longPress'`, a long press opens a context menu: the system
    raises the wrapped view above a dimmed background with its haptic, and
    short taps still reach the wrapped view.
  - The host builds the native menu only when it is about to show it, so many
    closed menus cost nothing at mount. When `menu` changes while the menu is
    open, the open menu shows the change. An empty menu does not open.
  - `present()` opens the menu on request from JavaScript. When the system
    cannot open it, `onUnavailable` gives the reason: `os` (iOS before 17.4),
    `disabled`, `not-shown` (the menu did not appear shortly after the
    request), `no-native-view`, or `error`. The caller then shows its drawn
    menu for that opening. A context menu opened this way appears beside the
    wrapped view without raising it. `dismiss()` closes the menu.
  - For `trigger: 'longPress'`, `preview` replaces the raised view with a card
    drawn in `previewColorScheme`. The card keeps a 16-point margin on each
    side of the window and uses at most 60 percent of its height. A tap on the
    card closes the menu. A project that runs in the Astryx app's preview host
    shows no card.
  - Inside an enabled touch shield (`spec:AST-112/FR1`), the trigger opens no
    menu.
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
  - Code cannot close an open action sheet; the answer still arrives.
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
  | `fullScreen`     | UIModalPresentationFullScreen on the system background                             | none; the content has an exit   |
  | `overFullScreen` | UIModalPresentationOverFullScreen; the presenting screen stays visible behind      | none                            |
  - Another `kind` presents nothing and reports `unsupported` through
    `onError`, once per mount.
  - The host reads `kind` and `animation` at the start of each presentation.
    `animation` is `default` (UIKit's transition), `fade`, or `none`, and the
    dismissal uses the same transition; a swipe dismissal stays interactive.
  - `isModal` false makes a `sheet` undimmed and leaves the screen behind it
    interactive. The other kinds always block the screen behind.
  - UIKit draws the whole container, with its own motion, grabber, corner
    radius, material (Liquid Glass at partial heights from iOS 26), dimming,
    resistance, scroll-to-expand, and the card effect behind a full-height
    sheet. The theme draws only the content (DEC-1). The host view itself has
    no size in the page and takes no touches, and the first presented frame
    already has the presented size.

- **FR6 — Detents are visible heights, smallest first.** Every detent list
  in the native contract runs ascending by height: index 0 is the smallest
  detent. `sheetHeights` gives visible heights in points, measured from the
  screen's bottom edge. `sheetTallest` sets the largest detent: the system's
  large detent, the content's measured height (`fit`; the sheet waits for the
  measurement), or the last entry of `sheetHeights`. `sheetSelectedIndex` is
  the detent the sheet opens at, and a change moves it there.
  `onDetentChange` reports the index of a detent the person moved to, on the
  same scale. `sheetGrabber` and `sheetScrollExpands` are on by default, and
  a negative `sheetCornerRadius` keeps the system's radius. OQ7 covers the
  library's own counting.
  - `sheetCovered` holds a sheet at the large detent while another modal
    sheet covers it and returns it to its detent afterwards; that borrowed
    detent is never reported. `sheetRetained` keeps a sheet that another
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
- **FR8 — Presentations stack in request order.** All presentation hosts use
  one queue. Each presentation waits until no other host is in a transition
  and is presented by the topmost presented view controller. A surface opened
  beside, inside, or through a deep link to another one therefore appears
  over it, in the order of the requests, and two requests in one update
  present one after the other. When a covered sheet closes, the sheets over
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
  visible, the host reports it, and the surface that opened it closes.
- **FR12 — Accessibility.**
  - The system menu, action sheet, and presentation hosts take no
    accessibility props. The trigger or the presented content supplies the
    name, role, and state. The open menu, the action sheet, and the grabber
    are system elements and use the system font at the person's Dynamic Type
    size.
  - A menu trigger is one accessible element; a VoiceOver double tap opens
    its menu. The rows of an open menu are the system menu's elements, not
    accessibility actions of the trigger.
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
- **FR13 — Threading.** Presentation, detent drags, resistance,
  scroll-to-expand, menu tracking, and the context menu's raise run on the UI
  thread, with no JavaScript in any frame. JavaScript gets discrete events
  only: a choice, an open change, a presentation, a blocked dismissal, a
  dismissal, and a detent change.
- **FR14 — Absent pieces fall back, never fail silently.** A host without
  its native piece answers `isAvailable()` false, and the library draws
  (`spec:AST-112/FR7`). The system menu component, rendered without its
  native view, is a plain view that answers `present()` with
  `onUnavailable({reason: 'no-native-view'})`. A missing action sheet module
  resolves `no-module`. A kind that the host does not present reports
  `unsupported`. Nothing throws or rejects (`spec:AST-112/FR6`).
- **FR15 — Contract baseline.** Every contract in the group is at revision 1.
  A behaviour added after revision 1 is a named feature
  (`<Contract>.<feature>`) that the binary lists and the JavaScript checks with
  `hasContractFeature` before it uses it; without it the JavaScript keeps the
  revision-1 behaviour or answers `unsupported`, with a development warning,
  never a silent weaker path. No contract in this group lists a named feature.
  Astryx Stage pairs with the package by each contract's spec hash and the
  package's Stage version floor: the package names the oldest Stage that
  implements its contract set, and an older Stage refuses the project with the
  gaps listed.
- **FR16 — Native code uses public API only.** The group's native code calls
  only the public API of iOS, Android, and React Native. One exception: the
  modal host resets the presented state of React Native's modal host by name
  and hooks its recycle and invalidate steps. This guarantees that no modal
  window stays on screen after the component that owns it unmounts during a
  transition. If React Native renames that state, the hook logs a fault and
  does nothing.

### Native contract

| Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                       | Commands                     | Events                                                                            | Platforms |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- | --------- |
| `AstryxSystemMenu`       | native component (Fabric Native Component) | `colorScheme`, `hasPreview`, `menu`, `menuDisabled`, `trigger`                                                                                                                                                                                                                                                                                              | `dismissMenu`, `presentMenu` | `onMenuOpenChange`, `onMenuSelect`, `onMenuUnavailable`                           | iOS       |
| `AstryxPresentationHost` | native component (Fabric Native Component) | `animation`, `appearance`, `canDismiss`, `colorScheme`, `estimatedHeight`, `estimatedWidth`, `isModal`, `isPresented`, `kind`, `presentationStyle`, `sheetCornerRadius`, `sheetCovered`, `sheetFitHeight`, `sheetGrabber`, `sheetHeights`, `sheetRetained`, `sheetScrollExpands`, `sheetSelectedIndex`, `sheetTallest`, `statusBarHidden`, `statusBarStyle` | none                         | `onDetentChange`, `onDismissAttempt`, `onDismissed`, `onPresent`, `onUserDismiss` | iOS       |
| `AstryxModalHost`        | native component (Fabric Native Component) | `allowSwipeDismissal`, `animationType`, `hardwareAccelerated`, `identifier`, `navigationBarTranslucent`, `presentationStyle`, `statusBarTranslucent`, `supportedOrientations`, `transparent`, `visible`                                                                                                                                                     | none                         | `onDismiss`, `onOrientationChange`, `onRequestClose`, `onShow`                    | iOS       |

| Contract            | Kind                                | Methods                                          | Platforms |
| ------------------- | ----------------------------------- | ------------------------------------------------ | --------- |
| `AstryxActionSheet` | native module (Turbo Native Module) | `getConstants`, `isSupported`, `present`, `show` | iOS       |

On the wire, every built kind is the native `kind` `sheet` with
`presentationStyle` naming it; any other native `kind` value presents
nothing. `present` takes one request object with the calling surface and
resolves `{index, reason, message}`; `show` is its positional form.

### Platform support

| Contract                 | iOS                                                                                                                                      | Android                                                                                                                | Astryx Stage                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSystemMenu`       | UIMenu on a UIButton (`showsMenuAsPrimaryAction`) and UIContextMenuInteraction; `present()` from iOS 17.4; row element sizes from iOS 16 | Not registered: the library draws a Material 3 menu, anchored or in a bottom sheet                                     | A UIMenu look-alike: pull-down, context menu with the lifted area and dimmed backdrop, the preview card; the Android profile draws |
| `AstryxActionSheet`      | UIAlertController in the action sheet style; a popover on iPad                                                                           | No module: an `AlertDialog` or a drawn bottom sheet of buttons                                                         | A UIAlertController look-alike; the Android profile has no module                                                                  |
| `AstryxPresentationHost` | UISheetPresentationController detents (custom heights from iOS 16), page, form, full-screen and over-full-screen presentations           | Not registered: the library's drawn sheet in a React Native `Modal` window; full-screen routes in a full-screen window | Sheets with their detents, drags, swipe dismissal and the presentation's status bar                                                |
| `AstryxModalHost`        | React Native's modal host, presenting from the top of the stack                                                                          | Not registered: React Native's `Modal`, whose Dialog windows stack                                                     | Sibling windows in presentation order, `onShow`, `onDismiss`, the escape's `onRequestClose`                                        |

- FR5 gap: the presentation host presents no system alert; `AlertDialog`
  draws its alert in the over-full-screen window.
- FR5 gap: the presentation host presents no popover; `Popover` draws its
  anchored surface, and an iPad gets no UIPopoverPresentationController.
- FR3 gap: in Astryx Stage the context menu does not play the lift
  animation, a held finger cannot slide onto a row, and `medium` row elements
  draw as a list.
- Supported feature/engine floor: `spec:AST-112` (iOS at React Native's
  minimum, Android API level 24, the New Architecture only).
- Unsupported behavior: a host whose native piece is absent reports itself
  unavailable and the library draws; a missing module resolves `no-module`; a
  kind the host does not build answers `unsupported` (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- None beyond `spec:AST-112`. This record details its FR1 (the presentation,
  menu, and action-sheet hosts in the core), FR6 to FR9, and FR12 for this
  group.

## Verification

| Contract | Verification                                                                                                                | Representative states                                                                                                           | Mutation or failure expectation                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests of each host's probes through the `./testing` doubles                                                            | absent, older, and current view and module shapes; `nativeHosts` with a host off                                                | A probe answers true without the native piece, or a turned-off host still presents                                                                         |
| FR2      | Unit tests of the description and its native form                                                                           | every row type; an unmapped icon; a glyph; an app's own icon names                                                              | A row loses a field, an unmapped icon draws an image, or a row and an `Icon` with one name show different symbols                                          |
| FR3      | Simulator checks of both triggers; Astryx Stage contract suites; unit tests of the unavailable reasons                      | touch-down and drag-release; a long press; `present()` before iOS 17.4; an update while open; a preview card; a preview project | The trigger also opens the drawn menu, `present()` fails without `onUnavailable`, or a preview project shows a card                                        |
| FR4      | Unit tests through the `./testing` module double; Simulator check over a sheet                                              | a choice; Cancel; a second sheet; no window; absent module; an older module with `show` only                                    | A result rejects, Cancel reads as an error, or a second sheet does not answer `busy`                                                                       |
| FR5      | Unit tests of the kind mapping and `supports(kind)`; Simulator checks of each kind; Astryx Stage contract suites            | each kind; a kind the host does not build; `animation` values; an undimmed sheet                                                | An unbuilt kind presents something or reports nothing, or a full-screen kind lets the page take touches                                                    |
| FR6      | Simulator detent checks; Astryx Stage contract suites; UI-thread frame checks of a drag                                     | `large`, `fit`, `height`; several detents in ascending order; a covered and a retained sheet                                    | A detent height counts the bottom inset twice, an index counts from the largest detent, a borrowed detent is reported, or a drag runs JavaScript per frame |
| FR7      | Unit tests of the event mapping; Simulator checks                                                                           | a resisted swipe; a refused escape; a swipe dismissal; dismissal by `isPresented`                                               | `onDismissed` fires twice or not at all, or the host unmounts before it                                                                                    |
| FR8      | Simulator checks of sibling, nested, and deep-linked stacks                                                                 | three sheets; a dialog over a sheet; a replaced flow closing                                                                    | UIKit refuses a presentation, or the order differs from the request order                                                                                  |
| FR9      | Simulator checks and a hosted test of a live mode switch; Astryx Stage status bar suites; emulator check of Android windows | a mode switch under a full-screen presentation; `statusBarHidden`; a navigation host's style in the content                     | The container keeps the old mode, or the status bar ignores the presentation's props                                                                       |
| FR10     | Simulator keyboard checks in each sheet height; unit tests of the presented insets                                          | a fitted, a partial, and a full-height sheet with a field; a full-screen presentation                                           | A field ends behind the keyboard, or the home indicator inset applies twice                                                                                |
| FR11     | Astryx Stage contract suites; Simulator checks                                                                              | two sibling windows; a window closed under another; absent host                                                                 | UIKit refuses a sibling window, or a surviving window loses its content                                                                                    |
| FR12     | Simulator accessibility tree checks; device checks with VoiceOver                                                           | focus in and back; the escape; a sheet over a full-screen route; Reduce Motion                                                  | Focus stays behind, the escape is lost, or a sheet is missing from the tree                                                                                |
| FR13     | UI-thread frame checks during drags and menu tracking                                                                       | a detent drag; a pull-down drag                                                                                                 | A JavaScript event per frame                                                                                                                               |
| FR14     | Unit tests through the `./testing` doubles                                                                                  | each host absent                                                                                                                | A throw, a rejection, or a silent no-op                                                                                                                    |
| FR15     | The platform's spec rules check; Astryx Stage version floor check                                                           | a contract hash change; an older Stage                                                                                          | A changed contract without a named feature, or an older Stage that runs the project                                                                        |
| FR16     | Source review of the native code against the public headers                                                                 | a React Native version that renames the modal host's state                                                                      | A call outside public API other than the named exception, or a hook that guesses instead of reporting a fault                                              |

## Decision log

### DEC-1 — The system draws the container; the theme draws the content

**Reference:** `spec:AST-128/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A system menu, action sheet, or sheet takes no theme colour, radius, or
type: its material, grabber, dimming, motion, and rows are the system's, in
the app's light or dark mode. Astryx themes what the person reads inside a
sheet. A person gets the platform's own surfaces, and the theme never fights
the system's material.

Rejected: painting the theme's panel colour on the system sheet, because it
hides the system material and Liquid Glass.

### DEC-2 — One queue presents from the topmost controller

**Reference:** `spec:AST-128/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Surfaces open from anywhere in the tree, so every presentation goes through
one queue and presents from the topmost presented controller. A dialog from a
sheet, a sheet from a modal route, and a deep link that opens three levels
all stack in request order.

Rejected: presenting from the view controller of the host's own screen, as
React Native's `Modal` does, because UIKit refuses a second sibling
presentation.

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
  result shape, with Astryx Stage implementing that wrapper.
- **OQ2 — What does a request carry for a system alert and a popover?**
  (`human-api`) The FR5 gaps need a request shape. Options: an alert with a
  title, a message, and buttons, and a popover with an anchor (the trigger's
  rect on its surface); or one anchor field shared with the action sheet
  (OQ3).
- **OQ3 — Does the iPad action sheet anchor at the control that asked?**
  (`human-api`) Options: add an anchor (the trigger's rect on its surface) to
  the request; or keep the bottom centre of the presenting view.
- **OQ4 — How does an app choose the system or the drawn surface?**
  (`human-api`) Components choose per call, and `nativeHosts` turns a host
  off for the whole tree. Options: one axis with the same values on every
  component that has a system form; or each component's own choice, as its
  record defines.
- **OQ5 — Do the modal host and the over-full-screen kind merge?**
  (`human-design`) Both present a window from the top of the stack: the modal
  host for drawn sheets, the presentation host for dialogs and full-screen
  routes. Options: keep both; or present drawn sheets through the
  presentation host's `overFullScreen` kind and retire the modal host.
- **OQ6 — Does Android present menus, sheets, and dialogs through system
  hosts?** (`human-design`) Android menus are drawn, and Android sheets and
  dialogs are a drawn panel in a React Native `Modal` window. Options: native
  hosts over Material Components (its menu, its bottom sheet, its dialog); or
  the drawn surfaces.
- **OQ7 — How does the library count detents?** (`checkable`) The native
  contracts count detents smallest first (FR6). In the library, one detent
  index counts from the smallest and another from the largest. Options: both
  move to the native order; or the library keeps its own order and converts
  at the platform boundary, with one order in every public API.
- **OQ8 — Do bar-item menus and dropdown menus share one menu model?**
  (`human-api`) The router's bar-item and title menus use one menu shape
  (`NavigationMenu`), and `DropdownMenu`'s `items` use another
  (`DropdownMenuOption`); both reach the same system menu. Options: one shape
  for both, mapped to the system menu's description; or two shapes, each
  owned by its component's record.
