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
follows the finger, a context menu that lifts the held item over a dimmed
backdrop, an action sheet with Cancel set apart, and a sheet with the
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

| Native piece      | What the ecosystem does well                                                                                                                                                                                                                                                                                                             | The gap Astryx closes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System menu       | @react-native-menu/menu puts a UIMenu on iOS and a PopupMenu on Android behind one view, with subtitles, images, check states, destructive rows, and nesting. react-native-ios-context-menu wraps UIContextMenuInteraction with custom React previews and deferred rows. zeego gives both a Radix-style compound API and a web fallback. | Astryx's DropdownMenu, MoreMenu, ContextMenu, and Selector already own their rows as compound parts, so the platform takes the menu as data from them and hands it back to the drawn surface when it cannot show it (an OS without the API, React content in a row). Icon names go through Astryx's one icon table. The package takes no third-party native dependency (`spec:AST-112/FR2`), and every public API has an Astryx Stage implementation (`spec:AST-112/FR12`). The menu behaviour itself overlaps these libraries; DEC-3.                     |
| Action sheet      | React Native's own `ActionSheetIOS` shows UIAlertController's action sheet from the top-most controller, with destructive and disabled rows, an iPad anchor, and an interface style, at no dependency cost.                                                                                                                              | `ActionSheetIOS` answers through a callback with an index only: it reports no refused presentation, no second sheet while one is up, and no calling surface, and it has no Astryx Stage implementation. These are small gaps; OQ2 asks whether the platform builds on it instead.                                                                                                                                                                                                                                                                          |
| Presentation host | React Native's `Modal` presents page and form sheets and full-screen windows. react-native-screens' `formSheet` gives a navigation route UIKit's detent sheet with a grabber and corner radius. @gorhom/bottom-sheet draws a fully customisable sheet with gesture-handler and Reanimated on both platforms.                             | `Modal` has no detents and presents from the view controller that holds it in the page, so UIKit refuses a second sibling sheet. A react-native-screens sheet is a route of its navigator, not a component a screen opens anywhere in its tree, and the package takes no third-party navigation dependency (`spec:AST-112/DEC-9`). A drawn sheet is not the system container: no iOS 26 Liquid Glass at partial heights, no card effect, no system keyboard avoidance. The host gives every Astryx surface the system container through one queue (DEC-2). |
| Modal host        | React Native's `Modal` host is the platform's window for drawn content, with orientations, swipe dismissal, `onRequestClose`, and VoiceOver focus save and restore.                                                                                                                                                                      | The same presenter limit: a drawn sheet opened while another drawn window is up is refused. The modal host is React Native's host with one change, presenting from the top of the stack, so each drawn sheet keeps its own window at its own place in the tree.                                                                                                                                                                                                                                                                                            |

## Who uses it

| Native piece                                        | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What a person sees                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxSystemMenu` (`nativeSystemMenu`)             | native component (Fabric Native Component) | `DropdownMenu`, `MoreMenu`, `ContextMenu`, `Selector` (an iOS menu style over a short plain list), `FileInput`'s source menu, and the components built on DropdownMenu's menu button (`PlaybackRateMenu`, `TopNav`'s menus, `FloatingHeader`) or on `DropdownMenu` (`Header`, `Table`, `BarButton`). Custom triggers reach it through the `useSystemMenuHost()` hook on `.`.                                                                                                                             | In a notes app, a tap on "More" opens the system pull-down menu; a long press on a note lifts it over a dimmed backdrop with its menu beside it. |
| `AstryxActionSheet` (`nativeActionSheet`)           | native module (Turbo Native Module)        | `ActionSheet`; through it `FileInput`'s source menu where the system menu is absent, and `Item`'s swipe actions that carry a menu.                                                                                                                                                                                                                                                                                                                                                                       | Swiping away a draft in a chat screen asks "Discard draft?" in the system action sheet, with Cancel apart at the bottom.                         |
| `AstryxPresentationHost` (`nativePresentationHost`) | native component (Fabric Native Component) | `BottomSheet` (the system sheet), and every surface that opens one: `ActionSheet`'s drawn form, `Popover`'s, `DropdownMenu`'s and `ContextMenu`'s sheet forms, `Selector`'s picker, `DateInput`, `DateRangeInput`, `Tokenizer`, `PowerSearch`, `TopNav`'s mega menu. `Dialog`, `AlertDialog`, `CommandPalette`, and the modal `Drawer` open in its over-full-screen window. The router's stack navigator presents its `modal`, `formSheet`, `fullScreenModal`, and `transparentModal` routes through it. | A photo viewer's info sheet rests at half height in Liquid Glass, drags to full height, and a confirm dialog opened from it comes up on top.     |
| `AstryxModalHost`                                   | native component (Fabric Native Component) | `BottomSheet`'s drawn form on iOS and the router's drawn sheet routes: each drawn sheet opens in its own window.                                                                                                                                                                                                                                                                                                                                                                                         | A drawn sheet opened from a second tab while another drawn sheet is up appears over it, and each closes on its own.                              |
| `AstryxOverlayWindowHost` (`OverlayWindow`)         | native component (Fabric Native Component) | No Astryx component. `OverlayWindow` on the internal `./preview/host` entry; the Astryx app's preview route draws its exit control in it.                                                                                                                                                                                                                                                                                                                                                                | While previewing a project in the Astryx app, the exit control floats above everything the project shows, its own sheets included.               |

## Non-goals

- Each component's own contract: its rows, its sheet heights, its purpose and
  dismissal rules, and its drawn surface. The component's record owns them
  (`spec:AST-082/FR3`); this record owns the native pieces they present
  through.
- The library's drawn menus, sheets, and dialogs on Android and as fallbacks.
- The router's route options and navigation state (`spec:AST-112/DEC-9`); this
  record owns the presentation the router asks for.
- The window status bar view and the keyboard dock that sheets use
  (`spec:AST-129`).
- How an app chooses between the system surface and the drawn one per
  component (OQ5).
- Equivalent internal implementations remain valid when they satisfy this contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The hosts are installed by default and each can be turned off.**
  `AstryxAppRoot` installs the system menu, presentation, and action sheet
  hosts (`spec:AST-112/FR9`); `nativeHosts` turns each one off, and the library
  then draws that surface everywhere. Each host is an `AstryxCapability`:
  `isAvailable()` is true only on iOS where its native piece is registered,
  and false on Android, in Jest, and in a binary without it, where the library
  draws. `version()` answers `null` for the view hosts. Probes:
  `isSystemMenuAvailable()`, `isSystemMenuPreviewAvailable()`,
  `isPresentationHostAvailable()`, and `nativePresentationHost.supports(kind)`.
- **FR2 — A system menu is data.** `nativeSystemMenu.component` takes
  `SystemMenuProps`: `menu` (a `SystemMenuDescription`), `trigger` (`tap`, a
  pull-down button; `longPress`, a context menu), `isDisabled`, `onSelect({id})`,
  `onOpenChange({isOpen})`, `onUnavailable({reason})`, a `ref` with
  `present()` and `dismiss()`, `preview` and `previewColorScheme`, and the
  trigger as `children`.
  - A description has a `title` (its name, not drawn), an optional visible
    `heading`, and children: actions (`id`, `title`, `subtitle`, `icon`,
    `glyph`, `state` on or off, `isDestructive`, `isDisabled`,
    `keepsMenuPresented`), groups (inline sections with separators, or one
    level of submenu; `singleSelection`; `elementSize` `small` or `medium` for
    a row of icon elements; `isDisabled`), and loading rows.
  - An `icon` is an Astryx icon name mapped through the library's one icon
    table, so a menu row and an `Icon` show the same symbol; a name with no
    symbol draws no image. `createNativeSystemMenu({symbols})` adds an app's
    namespaced names. A `glyph` (an emoji or short text) draws as the row's
    image when it has no icon.
  - `useAnySystemMenuOpen()` and `isAnySystemMenuOpen()` report whether any
    system menu from the package is open in this JavaScript runtime.
  - The library's menus describe their rows as data. A menu with React content
    (end content, a React header or footer, a custom row), or a second submenu
    level, keeps its drawn surface. A Selector uses the system menu only for an
    iOS menu style over a short plain list, without search, clear, or loading.
- **FR3 — The system menu opens and closes as the system's.**
  - `tap`: the trigger is a pull-down button; the menu opens on touch-down and
    supports press, drag, and release onto a row, and the trigger's own press
    never also opens the drawn menu. `longPress`: a context menu; the area
    lifts as the preview, the backdrop dims, the system plays its haptic, and
    the area's taps reach its children as usual.
  - The native menu is built when it is first needed, so a list of closed
    menus builds none at mount. A new `menu` while the menu is open updates
    the open menu (a check row that keeps the menu open shows its new state).
    A menu with no rows opens nothing.
  - `present()` opens the menu from JavaScript (a screen-reader activation, a
    controlled open state). Where it cannot, `onUnavailable` answers with
    `os` (before iOS 17.4), `disabled`, `not-shown` (no menu shown shortly
    after the request), `no-native-view`, or `error` for an unknown answer, and
    the library opens its drawn menu for that opening. A JavaScript opening of
    a context menu shows the menu anchored at the area, without the lift.
    `dismiss()` closes it.
  - `preview` on a `longPress` menu is the context menu's preview card in
    `previewColorScheme`, as wide as the window less 32 points and at most 0.6
    of its height; the lift starts from the trigger, and a tap on the card
    dismisses the menu. A project running in the Astryx app's preview host
    gets no card: the area lifts.
  - Under an enabled touch shield (`spec:AST-112/FR1`), the trigger offers no
    menu and a tap only selects.
- **FR4 — The action sheet answers once.** `nativeActionSheet.show(sheet)`
  takes `title`, `message`, `actions` (`label`, `isDestructive`),
  `cancelLabel`, and the calling surface's `rootTag`, and resolves
  `AstryxResult<{index}, 'no-window' | 'busy'>`: the chosen index, `cancelled`
  for Cancel or a tap outside on iPad, `no-window` when nothing can present
  it, `busy` while another action sheet is up in the process, `no-module`, or
  `error`.
  - It presents from the calling surface's top-most presented view controller,
    so it appears above a sheet whose dismissal it guards. Destructive rows
    draw in the system's red, and Cancel is a separate row at the bottom. On
    iPad it is a popover anchored at the bottom centre of the presenting view
    (OQ4).
  - Code cannot close it once shown: the library waits for the answer and
    ignores it when its `isOpen` turned false meanwhile.
  - On Android there is no module; `ActionSheet` draws an `AlertDialog` for
    one choice and a drawn bottom sheet of buttons for two or more.
- **FR5 — The presentation host presents five kinds.** `nativePresentationHost.component` takes `kind`, `isPresented`,
  `isModal`, `canDismiss`, `sheet`, `animation`, `statusBarHidden`,
  `statusBarStyle`, `colorScheme`, `estimatedSize`, the events of FR7, and
  `onError`.

  | `kind`           | iOS presentation                                                           | System dismissal                     |
  | ---------------- | -------------------------------------------------------------------------- | ------------------------------------ |
  | `sheet`          | UISheetPresentationController with the stops of FR6                        | swipe down past the lowest stop      |
  | `pageSheet`      | UIModalPresentationPageSheet as UIKit configures it                        | swipe down                           |
  | `formSheet`      | UIModalPresentationFormSheet (a page sheet in a compact width)             | swipe down                           |
  | `fullScreen`     | UIModalPresentationFullScreen, system background                           | none; the content offers the way out |
  | `overFullScreen` | UIModalPresentationOverFullScreen, clear container, presenter drawn behind | none                                 |
  - Any other `kind` presents nothing and reports `unsupported` through
    `onError` once per mount.
  - `kind` and `animation` are read when a presentation starts; a change
    applies to the next one. `animation` is `default` (the system's slide),
    `fade` (a cross-dissolve), or `none`; the dismissal mirrors it, and a
    swipe stays interactive.
  - `isModal` false (an undimmed sheet whose page stays interactive) applies
    to `sheet` only; every other kind blocks what is behind.
  - The router maps `modal` to `pageSheet`, `fullScreenModal` to `fullScreen`,
    `transparentModal` to `overFullScreen`, and `formSheet` to `sheet` with
    the route's detents.
  - The system draws the container: spring, grabber, corner radius, material
    (Liquid Glass at partial heights on iOS 26 and later), dimming, the rubber
    band, scroll-to-expand, and the card effect behind a full-height sheet.
    The content is React-drawn with the theme (DEC-1). The host sits in the
    page with no size and takes no touches; the first presented frame is laid
    out at the presented size.

- **FR6 — Sheet stops are visible heights.** `sheet.tallest` is the system's
  large detent, the content's measured height (`fit`, presented once measured),
  or `heights[0]`. The other `heights` are further stops, in points from the
  screen's bottom edge, tallest first. `selectedIndex` is the stop it opens at
  and moves to when it changes; `hasGrabber` and `expandsOnScroll` default to
  true; `cornerRadius` omitted keeps the system's.
  - `isCovered` rests a sheet at the large detent while another modal sheet
    is stacked over it and returns it to its stop when uncovered.
    `isRetained` keeps a replaced sheet presented beneath its replacement,
    faded out and hidden from assistive technology, and shows it again when it
    turns false (core's replace handoff).
  - `onStopChange({index})` reports a stop the person moved to, never one the
    host borrowed for a covered sheet.
- **FR7 — Presentation lifecycle events.** `onPresented` fires when a
  presentation finishes. `onDismissAttempt({reason})` fires when
  `canDismiss` is false and the person tries the system dismissal: `swipe` (the
  sheet rubber-bands back) or `escape` (the VoiceOver escape is refused).
  `onUserDismiss({reason})` fires after the person dismissed it (`swipe` or
  `escape`; an unknown reason reads as `system`). `onDismissed` fires once per
  presentation, by any route, in the order the presentations left. The host
  stays mounted until `onDismissed`, so a closing surface keeps its content
  through its exit.
- **FR8 — Presentations stack in request order.** Every presentation host
  shares one queue: a presentation waits for any other host's transition and
  presents from the topmost presented controller, so sibling, nested, and
  deep-linked surfaces stack in the order they were asked for, and
  presentations asked for in one update run one after another. Closing a
  covered sheet takes the sheets above it down, and those still open present
  again. When a replaced flow closes, both sheets leave in one motion.
- **FR9 — Presented windows follow the app's appearance and own their status
  bar.**
  - `colorScheme` (and the `appearance` it sends) sets the presented
    controller's and the presentation controller's interface style, so the
    system material follows the app's mode, not the device's. A live light or
    dark switch reaches content presented full screen and anything over it.
  - A `fullScreen` presentation, or an `overFullScreen` one that asks,
    answers the status bar: its style from `statusBarStyle`, else from a
    navigation host inside the content; hidden when `statusBarHidden`, else as
    the content's host asks. The home indicator follows the content's host.
    The router sends these only when the route sets them.
  - On Android, every presented window (a React Native `Modal` window) follows
    the app's mode live, and a drawn full-screen route sets its own window's
    bar through the window status bar view (`spec:AST-129`).
- **FR10 — Keyboard and safe area inside a presented surface.** The system
  moves a sheet for the keyboard: a sheet at its content height lifts whole, a
  sheet at a partial stop grows to the large detent, and a full-height sheet
  stays. Only a sheet whose bottom stays at the window's bottom insets its
  scroll content for the keyboard. A sheet's pinned footer stands on the
  keyboard through the keyboard dock (`spec:AST-129`). A full-screen
  presentation's content starts from the window's insets; a sheet's content
  starts below the window's top inset and takes the side and bottom insets
  only on the edges it reaches; a drawn sheet pads its own bottom inset.
- **FR11 — The modal host is React Native's modal host, presenting from the
  top.** `AstryxModalHost` takes exactly the props and events of React
  Native's `Modal` host and behaves as it does, except that it presents from
  the top of the presentation stack that starts at its page's controller, so
  its windows can be siblings. A window closed under others closes with them,
  and those are presented again from the new top without animation. It is
  internal: the library reaches it through the `./host` entry. Where it is
  absent (Android, whose Dialog windows already stack; a binary without it), the
  library's drawn sheets share one `Modal` per tree. A window the system takes
  away while still meant to show reports it, so the surface that opened it
  closes through its own path.
- **FR12 — Accessibility.**
  - The system menu, action sheet, and presentation hosts carry no
    accessibility props: the trigger or the presented content is the
    accessible surface (its name, role, and state), and the opened menu, the
    action sheet, and the sheet's grabber are the system's own elements, read
    in the system font at the person's Dynamic Type size.
  - A menu trigger stays one accessible element, and a VoiceOver double tap on
    it opens the menu. A `ContextMenu` trigger exposes a "Show menu"
    accessibility action; where nothing claims it, a "More" button follows the
    area while a screen reader runs. The menu's rows are the system menu's own
    elements, not actions of the trigger.
  - Presenting moves VoiceOver focus into the presented content, and
    dismissing focuses the element that had focus before. Full-screen kinds
    mark the content modal; sheets keep UIKit's confinement, so the grabber
    stays reachable. While a modal sheet is up, the containers under it are
    hidden from VoiceOver and restored when it leaves by any route.
  - The VoiceOver escape (the two-finger Z gesture) that no element inside
    handles reaches the presented content: it dismisses when `canDismiss`,
    else it reports `onDismissAttempt({reason: 'escape'})`. On the modal host,
    it asks the top window to close (`onRequestClose`).
  - System sheets, menus, and action sheets follow Reduce Motion as the system
    does; a drawn window's `slide` becomes a fade under Reduce Motion.
- **FR13 — Threading.** Presentation, detent drags, the rubber band,
  scroll-to-expand, menu tracking, and the context menu's lift run on the UI
  thread with no JavaScript per frame. JavaScript receives discrete events
  only: a selection, an open change, a presentation, a dismissal attempt, a
  dismissal, and a stop change.
- **FR14 — Absent pieces fall back, never fail silently.** A host whose
  native piece is not registered answers `isAvailable()` false and the
  library draws (`spec:AST-112/FR7`). A system menu component rendered anyway
  is a plain view that answers `present()` with
  `onUnavailable({reason: 'no-native-view'})`. A missing action sheet module
  resolves `no-module`. A `kind` the host does not build reports `unsupported`
  and presents nothing. None throws or rejects (`spec:AST-112/FR6`).
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
  modal host resets React Native's modal host's own presented state by name
  and hooks its recycle and invalidate steps, so that no modal window outlives
  the component that owns it when that component unmounts during a
  transition. Where React Native renames that state, the hook reports a fault
  and changes nothing.

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
| `AstryxPresentationHost` | UISheetPresentationController detents (custom heights from iOS 16), page, form, full-screen and over-full-screen presentations           | Not registered: the library's drawn sheet in a React Native `Modal` window; full-screen routes in a full-screen window | Sheets with their stops, drags, swipe dismissal and the route's status bar                                                         |
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

| Contract | Verification                                                                                                                  | Representative states                                                                                                           | Mutation or failure expectation                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests of each host's probes through the `./testing` doubles                                                              | absent, older, and current view and module shapes; `nativeHosts` with a host off                                                | A probe answers true without the native piece, or a turned-off host still presents                                  |
| FR2      | Unit tests of the description and its native form; library tests of which menus describe as data                              | every row type; an unmapped icon; a glyph; React content in a row; a nested submenu                                             | A row loses a field, an unmapped icon draws an image, or a menu with React content uses the system menu             |
| FR3      | Simulator checks of both triggers; Astryx Stage contract suites; unit tests of the unavailable reasons                        | touch-down and drag-release; a long press; `present()` before iOS 17.4; an update while open; a preview card; a preview project | The trigger also opens the drawn menu, `present()` fails without `onUnavailable`, or a preview project shows a card |
| FR4      | Unit tests through the `./testing` module double; Simulator check over a sheet                                                | a choice; Cancel; a second sheet; no window; absent module; an older module with `show` only                                    | A result rejects, Cancel reads as an error, or a second sheet does not answer `busy`                                |
| FR5      | Unit tests of the kind mapping and `supports(kind)`; Simulator checks of each kind; Astryx Stage contract suites              | each kind; a kind the host does not build; `animation` values; an undimmed sheet                                                | An unbuilt kind presents something or reports nothing, or a full-screen kind lets the page take touches             |
| FR6      | Simulator detent checks; Astryx Stage contract suites; UI-thread frame checks of a drag                                       | `large`, `fit`, `height`; several stops; a covered and a retained sheet                                                         | A stop height includes the bottom inset twice, a borrowed detent is reported, or a drag runs JavaScript per frame   |
| FR7      | Unit tests of the event mapping; Simulator checks                                                                             | a resisted swipe; a refused escape; a swipe dismissal; dismissal by `isPresented`                                               | `onDismissed` fires twice or not at all, or the host unmounts before it                                             |
| FR8      | Simulator checks of sibling, nested, and deep-linked stacks                                                                   | three sheets; a dialog over a sheet; a replaced flow closing                                                                    | UIKit refuses a presentation, or the order differs from the request order                                           |
| FR9      | Simulator checks and a hosted test of the appearance relay; Astryx Stage status bar suites; emulator check of Android windows | a live mode switch under a full-screen route; a route that hides the bar; a content host's style                                | The container keeps the old mode, or the status bar ignores the route                                               |
| FR10     | Simulator keyboard checks in each sheet height; unit tests of the presented insets                                            | a fitted, a partial, and a full-height sheet with a field; a full-screen route                                                  | A field ends behind the keyboard, or the home indicator inset applies twice                                         |
| FR11     | Astryx Stage contract suites; Simulator checks                                                                                | two sibling windows; a window closed under another; absent host                                                                 | UIKit refuses a sibling window, or a surviving window loses its content                                             |
| FR12     | Simulator accessibility tree checks; device checks with VoiceOver                                                             | focus in and back; the escape; a sheet over a full-screen route; Reduce Motion                                                  | Focus stays behind, the escape is lost, or a sheet is missing from the tree                                         |
| FR13     | UI-thread frame checks during drags and menu tracking                                                                         | a detent drag; a pull-down drag                                                                                                 | A JavaScript event per frame                                                                                        |
| FR14     | Unit tests through the `./testing` doubles                                                                                    | each host absent                                                                                                                | A throw, a rejection, or a silent no-op                                                                             |
| FR15     | The platform's spec rules check; Astryx Stage version floor check                                                             | a contract hash change; an older Stage                                                                                          | A changed contract without a named feature, or an older Stage that runs the project                                 |
| FR16     | Source review of the native code against the public headers                                                                   | a React Native version that renames the modal host's state                                                                      | A call outside public API other than the named exception, or a hook that guesses instead of reporting a fault       |

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

Rejected: presenting from the controller that holds the host in the page, as
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

- **OQ1 — Does the overlay window host stay in the platform's scope?**
  (`human-design`) No Astryx component uses it; only the Astryx app's preview
  route does, and this record specifies no contract for it. Options: keep it in the package as an internal piece of the
  `preview` capability, which `spec:AST-112/FR1` then lists; or move it to the
  Astryx app's preview host, outside the package.
- **OQ2 — Does the action sheet build on React Native's `ActionSheetIOS`?**
  (`human-design`) Options: keep the platform's module, which reports `busy`,
  `no-window`, and the calling surface; or wrap `ActionSheetIOS` in the same
  result shape, with Astryx Stage implementing that wrapper.
- **OQ3 — What does a request carry for a system alert and a popover?**
  (`human-api`) The FR5 gaps need a request shape. Options: an alert with a
  title, a message, and buttons, and a popover with an anchor (the trigger's
  rect on its surface); or one anchor field shared with the action sheet
  (OQ4).
- **OQ4 — Does the iPad action sheet anchor at the control that asked?**
  (`human-api`) Options: add an anchor (the trigger's rect on its surface) to
  the request; or keep the bottom centre of the presenting view.
- **OQ5 — How does an app choose the system or the drawn surface?**
  (`human-api`) Components choose per call, and `nativeHosts` turns a host
  off for the whole tree. Options: one axis with the same values on every
  component that has a system form; or each component's own choice, as its
  record defines.
- **OQ6 — Do the modal host and the over-full-screen kind merge?**
  (`human-design`) Both present a window from the top of the stack: the modal
  host for drawn sheets, the presentation host for dialogs and full-screen
  routes. Options: keep both; or present drawn sheets through the
  presentation host's `overFullScreen` kind and retire the modal host.
- **OQ7 — Does Android present menus, sheets, and dialogs through system
  hosts?** (`human-design`) Android menus are drawn, and Android sheets and
  dialogs are a drawn panel in a React Native `Modal` window. Options: native
  hosts over Material Components (its menu, its bottom sheet, its dialog); or
  the drawn surfaces.
