---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-129
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

# React Native platform: Layout, text and keyboard system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an app built with Astryx on iOS or Android sees content that
clears the notch, the Dynamic Island, the status bar, the home indicator and the
display cutout on every screen and in every orientation; sees a chat composer or
a sheet footer stand on the software keyboard through every frame of its motion,
including when they drag the keyboard down; sees a drawn full-screen modal on
Android with status bar glyphs that match it; and can select and copy prose
across paragraphs, headings and list items as one piece of text. The developer
gets these from six native pieces: the safe-area provider, view and module, the
keyboard dock, the window status bar, and the selectable text view, each with a
JavaScript wrapper in the platform layer.

This record details the platform layer of `spec:AST-112` for this group. It
uses the result and probe vocabulary of `spec:AST-112/FR6` and
`spec:AST-112/FR7`, the additive evolution of `spec:AST-112/FR8`, and the Astryx
Stage contract of `spec:AST-112/FR12`. Every piece in the group belongs to the
platform's core (`spec:AST-112/FR1`): it links in every app and is not an opt-in
capability. The on-screen keyboard in browsers is `spec:AST-099`; this record
owns the keyboard on native React Native.

## Why this exists

The React Native ecosystem covers most of this ground well. Astryx owns these
pieces for specific gaps, stated per piece.

| Native piece                     | What the ecosystem does well                                                                                                                                                                                                                                                         | The gap Astryx closes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Safe-area provider, view, module | react-native-safe-area-context measures insets natively per provider, applies them in a native view without a frame of delay, and is the de facto API that navigation libraries import.                                                                                              | No behaviour gap. The package takes no third-party native dependency for navigation and layout (`spec:AST-112/FR2`, `spec:AST-112/DEC-9`), every public API has an Astryx Stage implementation (`spec:AST-112/FR12`), and the Astryx app's preview host links no third-party native code. Astryx keeps the same names and meaning (DEC-1); OQ1 asks about scope.                                                                                                                                 |
| Keyboard dock                    | react-native-keyboard-controller tracks the keyboard on the UI thread on both platforms, including interactive dismissal. React Native's `KeyboardAvoidingView` is simple and dependency-free. `InputAccessoryView` rides the iOS keyboard natively, interactive dismissal included. | `KeyboardAvoidingView` moves content from JavaScript keyboard events at the start and end of a change and cannot follow a drag. `InputAccessoryView` is iOS-only and lives in the keyboard's window, outside the screen's layout and theme. The controller library adds a native dependency and its animated values reach layout through an animation library; the dock moves Astryx's own composer and transcript together with no JavaScript per frame and has an Astryx Stage implementation. |
| Window status bar (Android)      | React Native's `StatusBar` sets the activity window's bar style and visibility from JavaScript.                                                                                                                                                                                      | On Android, React Native's `Modal` is its own Dialog window, which copies the activity's bar look once when it opens; nothing written through `StatusBar` reaches it afterwards. A drawn full-screen modal needs its own window's bar.                                                                                                                                                                                                                                                           |
| Selectable text                  | React Native's `Text` with `selectable` gives the system's selection on one `Text` element.                                                                                                                                                                                          | A selection cannot cross from one `Text` to the next, so a heading and the paragraph under it cannot be copied as one piece. `Text` reports no selection, takes no programmatic selection, and gives a screen reader one element for the whole run.                                                                                                                                                                                                                                              |

## Who uses it

| Native piece                                         | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | What a person sees                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSafeAreaProvider` (`SafeAreaProvider`, hooks) | native component (Fabric Native Component) | `AstryxAppRoot` mounts it around the tree. Through the library's shared insets (`useInsets`), fed by it: `AppShell`, `Header`, `TopNav`, `FloatingHeader`, `TabBar`, `Layout`, `InlineSheet`, `ChatLayout`, `ChatMessageList`, `KeyboardAccessoryView`, `VideoView`, and the layer host that places toasts; through a snapshot of the window's insets: `BottomSheet`, `Dialog`, `Drawer`, `Lightbox`, `CommandPalette`; the Astryx router's stack and tab navigators and their header search field. The `./safe-area-context` entry. | Bars, sheets, toasts and screen content clear the notch, Dynamic Island, status bar, home indicator and display cutout, and follow rotation.        |
| `AstryxSafeAreaView` (`SafeAreaView`)                | native component (Fabric Native Component) | No Astryx component; app API (`SafeAreaView`) and the `./safe-area-context` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | An app's own view padded by the safe area on the edges it names, from its first frame.                                                              |
| `AstryxSafeArea`                                     | native module (Turbo Native Module)        | The library's shared insets read its window metrics when no provider is above (a navigation root without an app root), so the same components as the provider's row; `initialWindowMetrics`; the platform status's `safeArea` row; the library's launch timing, which measures the module's first read.                                                                                                                                                                                                                              | No jump from zero insets to real ones on the first frame.                                                                                           |
| `AstryxKeyboardDock` (`KeyboardDockView`)            | native component (Fabric Native Component) | `KeyboardAccessoryView`; `ChatLayout` (the composer, through `KeyboardAccessoryView`, and the transcript's bottom inset); `BottomSheet` (a footer that rides the keyboard, and the Android sheet lift); `CommandPalette` (the Android lift). On Android its reports also feed the library's shared keyboard frame, which every keyboard-aware surface reads.                                                                                                                                                                         | A composer or footer that stands on the keyboard through a show, a hide and a drag down, with the newest message kept above it.                     |
| `AstryxWindowStatusBar`                              | native component (Fabric Native Component) | The Astryx router's stack navigator: drawn full-screen and transparent modal routes on Android.                                                                                                                                                                                                                                                                                                                                                                                                                                      | A modal over a dark photo shows light status bar glyphs, and the screen under it keeps its own look after the modal closes.                         |
| `AstryxSelectableText` (`NativeSelectableTextView`)  | native component (Fabric Native Component) | `Markdown` with `isSelectable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Long-press a word in a notes app's rendered note, drag across a heading and two paragraphs, and copy them as one text, with the system's edit menu. |

## Non-goals

- The keyboard in browsers (`spec:AST-099`); how each library component lays out against the insets and
  the keyboard (each component's own record); the router's state and
  transitions (`spec:AST-112/DEC-9` and the navigation record); the
  activity-level status bar and the iOS status bar, which the presentation and
  navigation hosts answer.
- Equivalent internal implementations remain valid when they satisfy this contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.
- Markdown parsing, rich text editing, and text input. Selectable text draws
  resolved, read-only blocks.
- Corner adaptation of insets (react-native-safe-area-context's
  `cornerAdaptation` option): the platform reports plain insets.

## Requirements

- **FR1 — One native provider is the source of truth for a subtree's insets.**
  `SafeAreaProvider` renders `AstryxSafeAreaProvider`, a plain flex container
  that measures the part of its own frame the system's bars, cutouts, rounded
  corners and home indicator leave free.
  - It sends `onInsetsChange {insets, frame}` once it has a size and then
    whenever the insets or the frame change by more than one pixel: `insets`
    relative to the provider's own frame, `frame` in its window, in points (dp
    on Android). The keyboard is never part of the insets.
  - The subtree reads them with `useSafeAreaInsets()` and `useSafeAreaFrame()`
    or `SafeAreaInsetsContext` and `SafeAreaFrameContext`. The hooks throw
    outside every provider, as react-native-safe-area-context's do.
    `onMetricsChange(metrics)` reports each measurement to the app.
  - `AstryxAppRoot` mounts a provider around the tree unless the app passes
    `safeArea={false}`, and feeds the library's insets from it when the app
    passes no `insets` of its own (`spec:AST-112/FR9`).
- **FR2 — The initial layout uses real numbers.** A provider starts from
  `initialMetrics` when given, else the enclosing provider's values, else the
  window's metrics from `AstryxSafeArea` at mount time, so a provider mounted
  after a rotation starts right. With none of them (`initialMetrics={null}`, or
  no window) its children wait for the native measurement.
  `initialSafeAreaInsets` is a deprecated alias of `initialMetrics`.
- **FR3 — `SafeAreaView` pads the chosen edges in the same layout.**
  `SafeAreaView` renders `AstryxSafeAreaView`, whose shadow node applies the
  nearest provider's insets during layout, so the padding never arrives a frame
  after the insets.
  - `mode`: `padding` (default) or `margin`.
  - `edges`: a list (those edges `additive`, the rest `off`) or a mode per edge:
    `additive` (the inset plus the style's own value for that edge), `maximum`
    (the larger of the two) or `off` (the style's value alone). An unknown or
    unnamed edge is `off`; no `edges` means every edge `additive`. The style's
    own value is the one the layout engine resolves for the physical edge,
    logical start and end included, in points; a percentage or `auto` counts as 0.
  - Right to left: the view takes React Native's direction and its left-right
    swap, so a physical inset stays on its physical side.
  - `initialInsets` is the context's value when the view renders, so the
    initial layout is already padded; the provider's live insets win from then
    on.
- **FR4 — The window's metrics are a synchronous read.** `AstryxSafeArea` has
  `isAvailable()`, `version()` and `windowMetrics()`: the key window's insets
  and frame read from the native side on each call, or `null` without the
  module or a window. `initialWindowMetrics` is the same read once, when the
  package loads. A malformed answer reads as `null`; nothing throws.
- **FR5 — The safe area has a compatibility entry.** `./safe-area-context`
  exports react-native-safe-area-context's 5.x names over FR1 to FR4:
  `SafeAreaProvider`, `SafeAreaView`, `useSafeAreaInsets`, `useSafeAreaFrame`,
  the two contexts, `initialWindowMetrics`, `withSafeAreaInsets`,
  `SafeAreaListener`, `SafeAreaConsumer`, `SafeAreaContext`, `useSafeArea`,
  `initialWindowSafeAreaInsets`, and the types. `useSafeAreaInsets` accepts
  `cornerAdaptation` and ignores it. The Astryx app's preview resolves
  `react-native-safe-area-context` to this entry, so a previewed project that
  imports it renders.
- **FR6 — `KeyboardDockView` is a container whose children ride the keyboard.**
  The caller lays the dock out and pads its bottom by the keyboard's overlap;
  the dock never changes its own size.
  - `followsKeyboard` (default `true`): `false` parks the children at their
    laid-out place. The library passes the router's focus, so only the focused
    screen's dock moves.
  - `onKeyboardDockChange({height, overlap, settled})` comes at the start of a
    keyboard change (`settled: false`, the end frame's numbers) and at its end
    (`settled: true`), and on a later layout only when the rounded numbers
    differ; never per frame. `height` is the docked keyboard's height (0 when
    hidden, floating or split); `overlap` is how much of the dock's own frame
    the keyboard's end frame covers.
  - `transcriptNativeID` names a view among the dock's three nearest ancestors
    whose first scroll view is the transcript the dock owns (FR7, FR8). Such a
    list sets no `contentInset`, `scrollIndicatorInsets` or
    `automaticallyAdjustKeyboardInsets` itself. A name the dock cannot find is
    ignored and looked up again at the next layout.
  - `bottomInset` and `restingInset` (Android): the bottom padding the caller
    lays the dock out with, and the padding its children rest at with the
    keyboard hidden, in dp.
  - `isKeyboardDockAvailable()` answers true where the binary registers the
    dock with the transcript inset of FR7, which is iOS. The library passes one more prop of its own,
    `animatesSideInsets` (FR7); an app that passes it gets the public behaviour.
- **FR7 — On iOS the dock follows the keyboard on the render server.** The
  dock anchors its children's carrier to UIKit's keyboard layout guide.
  - A show, a hide or a height change animates the children to the keyboard's
    place with the keyboard's own duration and curve, in the keyboard's own
    transaction; the caller's padding lands in one commit that the dock
    compensates in the same transaction.
  - During an interactive dismissal (a scroll view's
    `keyboardDismissMode="interactive"`) the children follow the keyboard's top
    frame by frame; a drag released midway animates back along the keyboard's
    curve.
  - With `transcriptNativeID`, the transcript's bottom content inset follows how
    far the children have risen above their rest, frame by frame, and a list
    at its end stays at its end: the newest row stays above the composer.
  - With `animatesSideInsets`, a commit that changes the dock's own left or
    right padding animates its children's new frames on the render server
    instead of landing in one frame; the layout is the new one at once.
  - No JavaScript runs per frame in any of these.
- **FR8 — On Android the dock follows the IME's animated inset on the UI
  thread.** The dock follows the IME's inset animation on every frame of a show
  and a hide and moves itself by a translation against `bottomInset` and
  `restingInset`, so the children stand on the IME's drawn top on every frame;
  once the IME settles and the padding matches, the translation is 0. Its
  events come at the animation's start and end and also reach the library's
  shared keyboard frame. With `transcriptNativeID`, the transcript stays in flow
  and a finger dragging it down by the touch slop hides the IME once per
  gesture, keeping the focused field's focus; a tap, an upward drag or a
  shorter drag leaves it up.
- **FR9 — A drawn modal window owns its status bar on Android.**
  `AstryxWindowStatusBar` is a zero-size view whose props are the status bar
  ask of the Dialog window it renders in: `barStyle` (`light`, `dark`, `auto`)
  and `barVisibility` (`hidden`, `shown`, `auto`), strings on the wire, where
  an unknown value reads as `auto`.
  - The router's drawn full-screen and transparent modal routes render it from
    the route's `statusBarStyle` and `statusBarHidden`; a native stack inside
    the same window asks over it with its top screen's values. With nothing
    asking, the window shows the activity's look.
  - Only that window's bar is written: never the activity's window, never the
    navigation bar. In the activity's own window the view does nothing, and it
    renders nothing when the route asks nothing.
  - iOS does not register it: the presentation host answers a route's status
    bar there.
- **FR10 — `NativeSelectableTextView` draws blocks as one selectable text.**
  The view takes `blocks` (each a list of runs with resolved styles, a `role`
  such as `heading`, and an optional `href` per run) and draws them in one
  native text view.
  - The text is the blocks' texts joined by `"\n"`; every offset counts UTF-16
    code units, as JavaScript strings do. A list marker is part of the text and
    of a copy.
  - `onSelectionChange(selection)` reports the offsets, the blocks the
    selection touches with block-relative ranges, and the text a copy gives,
    only when the selection changes.
  - The handle's `setSelection({start, end})`, `selectBlocks({first, last})`
    and `clearSelection()` select without showing a menu; offsets clamp to the
    text.
  - `onLinkPress({href, blockIndex})` comes for a tap on a link with no
    selection, or for the screen reader's link action. The platform opens
    nothing.
  - Props: `isSelectable` (default `true`; `false` draws and reads the text
    and still reports links), `selectionColor`, `colorScheme` (iOS; the edit
    menu and handles), `allowFontScaling` (default `true`),
    `maxFontSizeMultiplier` (0 for no limit), `estimatedHeight`, `fallback`,
    `onError`.
- **FR11 — Selectable text sizes itself and uses the system's menus.** The
  native view lays its text out at the width it is given and reports the height
  it needs; the wrapper applies it one layout pass after the text changes, and
  a `height` in `style` wins. The edit menu is the system's (Copy, Look Up,
  Translate, Share on iOS; Copy, Share, Select all on Android). Fonts resolve
  through React Native's font manager, so a block gets the same faces a `Text`
  does.
- **FR12 — Every piece is accessible.**
  - The safe-area provider and view and the keyboard dock expose no element of
    their own; their children keep theirs. The dock forwards the accessibility
    props it is given. The window status bar is hidden from screen readers.
  - Selectable text exposes one element per block to VoiceOver and TalkBack;
    a heading carries the header trait or role, and a block's links are
    actions on its element. Text grows with Dynamic Type and the system font
    scale, capped by `maxFontSizeMultiplier`, unless `allowFontScaling` is
    `false`.
  - Reduce Motion: the dock's following of the keyboard adds no motion of its
    own, it tracks the system's; the side-inset animation (FR7) is off, and the
    new frames land at once.
  - Insets are in points and dp, so text size settings never change them.
- **FR13 — A missing piece degrades to a correct layout.** Each view has a
  probe (`isSafeAreaProviderAvailable()`, `isSafeAreaViewAvailable()`,
  `isKeyboardDockAvailable()`, `isNativeSelectableTextViewAvailable()`), and
  the window status bar's probe is internal (`spec:AST-112/FR7`).
  - Without the native provider, `SafeAreaProvider` is a plain view whose
    subtree gets the starting numbers, or zeros; it never holds its children
    back. Without the native view, `SafeAreaView` applies the same edge rule
    as FR3 from context in JavaScript. The platform status's `safeArea` row
    says which applies.
  - Without the dock, `KeyboardDockView` is a plain view: the keyboard's start
    and end positions arrive through React Native's `Keyboard` events, the
    caller's padding moves the children at the start and end of a change, and
    no `onKeyboardDockChange` comes.
  - Without the window status bar, the modal window keeps the look React
    Native copied into it.
  - Without the selectable text view, each block draws as a React Native
    `Text` with `selectable`, selection works one block at a time, `onError`
    reports `no-native-view` once per mount, and `onSelectionChange` never
    comes.
- **FR14 — Every contract is at revision 1 and grows by named features.**
  Every contract in this group is at revision 1, the keyboard dock's
  `transcriptNativeID`, `bottomInset`, `restingInset` and `animatesSideInsets`
  included. A behaviour added after revision 1 is a named feature
  (`<Contract>.<feature>`, for example `AstryxKeyboardDock.<feature>`) that the
  binary lists and the JavaScript checks with `hasContractFeature` before it
  uses it; without it the JavaScript keeps the revision-1 behaviour or answers
  `unsupported`, never a silent weaker path. Astryx Stage pairs with the
  package by spec hash and the package's Stage version floor: the package names
  the oldest Stage that implements its contract set, and an older Stage refuses
  the project and lists the gaps.

### Native contract

| Contract                 | Kind                                       | Props                                                                                                   | Commands       | Events                                                                                              | Platforms    |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| `AstryxSafeAreaProvider` | native component (Fabric Native Component) | none                                                                                                    | none           | `onInsetsChange`                                                                                    | iOS, Android |
| `AstryxSafeAreaView`     | native component (Fabric Native Component) | `edges`, `initialInsets`, `isRTL`, `mode`, `swapLeftAndRightInRTL`                                      | none           | none                                                                                                | iOS, Android |
| `AstryxKeyboardDock`     | native component (Fabric Native Component) | `animatesSideInsets`, `bottomInset`, `followsKeyboard`, `restingInset`, `transcriptNativeID`            | none           | `onKeyboardDockChange`                                                                              | iOS, Android |
| `AstryxWindowStatusBar`  | native component (Fabric Native Component) | `barStyle`, `barVisibility`                                                                             | none           | none                                                                                                | Android      |
| `AstryxSelectableText`   | native component (Fabric Native Component) | `allowFontScaling`, `colorScheme`, `content`, `isSelectable`, `maxFontSizeMultiplier`, `selectionColor` | `setSelection` | `onSelectableTextContentSizeChange`, `onSelectableTextLinkPress`, `onSelectableTextSelectionChange` | iOS, Android |

| Contract         | Kind                                | Methods                                                                               | Platforms    |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| `AstryxSafeArea` | native module (Turbo Native Module) | `getConstants` (`version`, `initialWindowMetrics`: the key window's insets and frame) | iOS, Android |

`AstryxSelectableText`'s `content` is the blocks as JSON, with sizes in dp
before font scaling and colours as processed colour numbers; the wrapper builds
it. A platform-only prop says so in its documentation (`spec:AST-112/FR8`).

### Platform support

| Contract                 | iOS                                                                                                                                                     | Android                                                                                                                                                                     | Astryx Stage                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `AstryxSafeAreaProvider` | UIKit `safeAreaInsets` and `safeAreaInsetsDidChange`                                                                                                    | `WindowInsetsCompat` `systemBars` and `displayCutout` against the view's place in its window, IME excluded, in dp                                                           | Implemented on both looks                                                                  |
| `AstryxSafeAreaView`     | Shared shadow node applies the edge rule during layout                                                                                                  | The same shared shadow node                                                                                                                                                 | Implemented on both looks                                                                  |
| `AstryxSafeArea`         | The key window's `safeAreaInsets` and frame                                                                                                             | The activity window's root insets for `systemBars` and `displayCutout`, IME excluded, in dp                                                                                 | Implemented on both looks                                                                  |
| `AstryxKeyboardDock`     | `keyboardLayoutGuide` and Core Animation on the render server: show, hide, height change, interactive dismissal, transcript inset, side-inset animation | `WindowInsetsAnimationCompat` and a UI-thread translation on show and hide; transcript drag hides the IME. Interactive dismissal and `animatesSideInsets` are iOS behaviour | Implemented on both looks                                                                  |
| `AstryxWindowStatusBar`  | Not registered; the presentation host answers a route's status bar                                                                                      | The Dialog window's `WindowInsetsControllerCompat`                                                                                                                          | Implemented on the Android look                                                            |
| `AstryxSelectableText`   | Non-editable, selectable `UITextView`; `UIFontMetrics` per block; system edit menu                                                                      | `TextView` with `setTextIsSelectable` over one `Spannable`; sizes in sp; `ExploreByTouchHelper` per block; system text-selection action mode                                | Implemented on both looks: word selection by long press or double tap, Copy and Select All |

- FR7 gap: Astryx Stage draws a dock side-inset change with
  `animatesSideInsets` in one frame instead of animating it.
- FR10 gap: Astryx Stage selects by word and Select All and has no
  selection-handle drags.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, which has UIKit's keyboard layout guide; Android API level
  24; the New Architecture only).
- Unsupported behavior: a view a binary lacks reports itself unavailable and
  the wrapper draws the fallback of FR13; the module answers `null` metrics; a
  named feature a binary lacks keeps the revision-1 behaviour or answers
  `unsupported` (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112/FR1` (the core's safe-area insets), `spec:AST-112/FR6`
  and `spec:AST-112/FR7` (fallbacks and probes for these views),
  `spec:AST-112/FR8` (revision 1 and named features), `spec:AST-112/FR9`
  (`AstryxAppRoot` wires the provider), and `spec:AST-112/FR12` (the Astryx
  Stage implementation of each piece).
- The capability model is unchanged for this group: every piece is core and
  links by default.
- `spec:AST-099` is unchanged; it keeps the keyboard in browsers.

## Verification

| Contract | Verification                                                                                                                      | Representative states                                                                                    | Mutation or failure expectation                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Unit tests through the `./testing` view doubles; Simulator and emulator checks; Astryx Stage contract suite                       | portrait, landscape, a notch and a cutout; a nested provider; a change under one pixel                   | Insets include the keyboard, an event per sub-pixel change, or a hook that answers outside every provider                      |
| FR2      | Unit tests with absent, older and current module doubles                                                                          | explicit, inherited and window metrics; `initialMetrics={null}`; a provider mounted after rotation       | The initial frame lays out with zeros where metrics exist, or stale metrics after a rotation                                   |
| FR3      | Unit tests of the edge rule; Simulator and emulator layout checks; Astryx Stage contract suite                                    | each edge mode; padding and margin; logical start and end; right to left with and without the swap       | Padding a frame late, a wrong combined value, or an inset on the wrong side in right to left                                   |
| FR4      | Unit tests with absent, malformed and current module doubles                                                                      | no window; a malformed constant                                                                          | A throw, or a value other than `null` without the module                                                                       |
| FR5      | Unit tests of the entry's names against react-native-safe-area-context 5.x; a previewed project that imports it                   | each exported name; `cornerAdaptation`                                                                   | A missing name, or a previewed project that renders blank                                                                      |
| FR6      | Unit tests through the `./testing` view doubles                                                                                   | `followsKeyboard` false; an unknown transcript name; the internal prop passed by an app                  | An event per frame, a parked dock that moves, or an app that gets the internal behaviour                                       |
| FR7      | Simulator and device checks with UI-thread frame checks (no JavaScript per frame); Astryx Stage contract suite                    | show, hide, height change, interactive drag and release, a transcript at its end, a side-inset commit    | The composer leaves the keyboard's top on any frame, JavaScript runs per frame, or the newest row slips under the composer     |
| FR8      | Emulator checks with UI-thread frame checks; Android unit tests of the translation and the drag rule; Astryx Stage contract suite | show and hide frame by frame; a drag down past and short of the slop; a tap                              | A blank band between composer and IME, a non-zero translation once settled, or the IME hidden by a tap or twice in one gesture |
| FR9      | Emulator checks; Android unit tests; Astryx Stage contract suite; router tests with the view registered and absent                | light and dark style; hidden and shown; nested stack; closing the modal; a view in the activity's window | The activity's window or the navigation bar is written, or the look stays after the modal closes                               |
| FR10     | Unit tests through the `./testing` doubles; Simulator, emulator and Astryx Stage selection checks                                 | a selection across blocks; `setSelection` and `selectBlocks`; a link tap with and without a selection    | A selection that stops at a block edge, wrong UTF-16 offsets, or a link opened natively                                        |
| FR11     | Simulator and emulator layout checks; Android instrumentation of font scaling                                                     | a width change; a text change; a `height` in style                                                       | A clipped or stale height, or a face that differs from `Text`'s                                                                |
| FR12     | VoiceOver and TalkBack checks on Simulator, emulator and device; Reduce Motion on                                                 | per-block elements; a heading; a link action; the largest text size; Reduce Motion                       | One element for every block, a missing header trait, a dock that adds motion, or a side-inset animation under Reduce Motion    |
| FR13     | Unit tests with each view and the module absent                                                                                   | every fallback                                                                                           | A held-back subtree, lost padding, an event from a fallback, or a missing `no-native-view` report                              |
| FR14     | The platform's spec rules check; Astryx Stage contract suites and the Stage version floor                                         | a contract at revision 1; a missing named feature; a Stage below the floor                               | A revision above 1, a feature used without `hasContractFeature`, or an older Stage that runs the project                       |

## Decision log

### DEC-1 — The safe area keeps react-native-safe-area-context's names and meaning

**Reference:** `spec:AST-129/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Apps and libraries already speak `SafeAreaProvider`, `SafeAreaView`,
`useSafeAreaInsets` and `initialWindowMetrics`, so moving an app over is an
import change, and the `./safe-area-context` entry lets code written for that
library run unchanged in the Astryx app's preview. The native side is Astryx's,
so the package keeps one dependency set and an Astryx Stage implementation.

Rejected: an Astryx-specific inset API, because every app and navigation
library would need a second vocabulary for the same numbers.

### DEC-2 — Insets apply during native layout

**Reference:** `spec:AST-129/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The safe-area view's shadow node applies the provider's insets in the same
commit that measures them, and the initial layout starts from the window's
metrics. A rotation or a status bar change never shows content under a bar for
a frame.

Rejected: padding from JavaScript state, because it lands one frame after the
insets change.

### DEC-3 — The dock moves its children natively and reports only start and end

**Reference:** `spec:AST-129/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

The keyboard's motion belongs to the system's animation, so the dock follows it
on the UI thread and the render server, and JavaScript sets padding only at a
change's start and end. The composer stays on the keyboard on every frame even
when the JavaScript thread is busy. Android follows the IME's animated inset;
a drag down on the transcript hides the IME instead of following the finger.

Rejected: keyboard frames sent to JavaScript per frame, because each frame would
wait on the JavaScript thread.

### DEC-4 — A modal window owns its own status bar on Android

**Reference:** `spec:AST-129/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A drawn modal is its own Dialog window, so its route's status bar is written to
that window only. Closing the modal leaves the activity's look exactly as it
was, with nothing to restore.

Rejected: writing the activity's window from the modal, because a dismissal
would leave the modal's look behind.

### DEC-5 — Selectable prose is one native text view; links report and never open

**Reference:** `spec:AST-129/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

One native text view over resolved blocks lets a selection cross headings,
paragraphs and list items and copy as one text, with the system's menus and
per-block accessibility. Links go to the app, which decides how to open them,
as everywhere else in Astryx.

Rejected: one selectable `Text` per block, because a selection cannot cross
from one block to the next.

## Open questions

- **OQ1 — Does `SafeAreaView` stay in the platform's core when no Astryx
  component renders it?** (`human-api`) Options: keep it as app API beside the
  provider, as react-native-safe-area-context does; or keep it only in the
  `./safe-area-context` entry, so the core's own app API is the provider and
  its hooks.
- **OQ2 — Is the dock's transcript coupling public?** (`human-api`)
  `transcriptNativeID` reaches a scroll view among the dock's three nearest
  ancestors. Options: keep it as public API for apps that build their own chat
  screen; or keep it library-internal, with `ChatLayout` as the public way to
  get a transcript that rides the keyboard.
- **OQ3 — Does an app's own `Modal` get a public way to set its window's status
  bar on Android?** (`human-api`) The window status bar is internal and only
  the router's drawn modal routes use it; React Native's `StatusBar` inside a
  `Modal` writes the activity's window. Options: export a public component for
  an app's own `Modal`; or keep it internal and route full-screen modals
  through the router.
