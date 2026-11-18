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
across paragraphs, headings and list items as one piece of text. The developer gets these from six native pieces: the safe-area provider, view and module, the keyboard dock, the window status bar, and the selectable text view, each with a JavaScript wrapper in the platform layer. Dates, numbers, counts and relative times in every component format through the JavaScript engine's `Intl`, which the package states as a requirement on the JavaScript engine, with a library fallback for each feature the engine lacks.

This record details the platform layer of `spec:AST-112` for this group. It
follows the shared platform rules of `spec:AST-140`: a missing piece is a
result (`spec:AST-140/FR2`), one result vocabulary (`spec:AST-140/FR3`),
additive evolution (`spec:AST-140/FR5`), threading (`spec:AST-140/FR6`), and
coexistence with an app's own native code (`spec:AST-140/FR9`); probes take
the shape of `spec:AST-112/FR7`. Every piece in the group belongs to the
platform's core (`spec:AST-112/FR1`): it links in every app and is not an opt-in
capability. The on-screen keyboard in browsers is `spec:AST-099`; this record
owns the keyboard on native React Native.

## Why this exists

- Safe-area provider, view and module: no behaviour gap with the ecosystem's
  safe-area library. Astryx owns them so the package takes no third-party
  native dependency for layout (`spec:AST-112/FR2`); an app may still use
  react-native-safe-area-context beside these components without conflict
  (`spec:AST-140/FR9`). OQ1 asks about scope.
- Keyboard dock: Astryx's own composer and its linked list must stay on the
  keyboard through every frame of a show, a hide and an interactive dismissal,
  on both platforms, with no JavaScript per frame.
- Window status bar (Android): a drawn modal is its own window, and the
  status bar set from JavaScript reaches only the activity's window.
- Selectable text: a selection must cross headings, paragraphs and list items
  and copy as one text, with selection events and programmatic selection.
- `Intl`: the engine lacks some `Intl` members on each platform; the package
  states which it relies on and keeps a fallback for the rest (DEC-6).

## Who uses it

| Native piece                                         | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | What a person sees                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSafeAreaProvider` (`SafeAreaProvider`, hooks) | native component (Fabric Native Component) | `AstryxAppRoot` mounts it around the tree. Through the library's shared insets (`useInsets`), fed by it: `AppShell`, `Header`, `TopNav`, `TabBar`, `Layout`, `InlineSheet`, `ChatLayout`, `ChatMessageList`, `KeyboardAccessoryView`, `VideoView`, and the layer host that places toasts; through a snapshot of the window's insets: `BottomSheet`, `Dialog`, `Drawer`, `Lightbox`, `CommandPalette`; the Astryx router's stack and tab navigators and their header search field. The `./safe-area-context` entry. | Bars, sheets, toasts and screen content clear the notch, Dynamic Island, status bar, home indicator and display cutout, and follow rotation.        |
| `AstryxSafeAreaView` (`SafeAreaView`)                | native component (Fabric Native Component) | No Astryx component; app API (`SafeAreaView`) and the `./safe-area-context` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                 | An app's own view padded by the safe area on the edges it names, from its first frame.                                                              |
| `AstryxSafeArea`                                     | native module (Turbo Native Module)        | The library's shared insets read its window metrics when no provider is above (a navigation root without an app root), so the same components as the provider's row; `initialWindowMetrics`; the platform status's `safeArea` row; the library's launch timing, which measures the module's first read.                                                                                                                                                                                                            | No jump from zero insets to real ones on the first frame.                                                                                           |
| `AstryxKeyboardDock` (`KeyboardDockView`)            | native component (Fabric Native Component) | `KeyboardAccessoryView`, `ChatLayout`, `BottomSheet`, `CommandPalette`; on Android, the library's shared keyboard frame, which keyboard-aware surfaces read.                                                                                                                                                                                                                                                                                                                                                       | A composer or footer that stands on the keyboard through a show, a hide and a drag down, with the newest message kept above it.                     |
| `AstryxWindowStatusBar`                              | native component (Fabric Native Component) | The Astryx router's stack navigator: drawn full-screen and transparent modal routes on Android.                                                                                                                                                                                                                                                                                                                                                                                                                    | A modal over a dark photo shows light status bar glyphs, and the screen under it keeps its own look after the modal closes.                         |
| `AstryxSelectableText` (`NativeSelectableTextView`)  | native component (Fabric Native Component) | `Markdown` with `isSelectable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Long-press a word in a notes app's rendered note, drag across a heading and two paragraphs, and copy them as one text, with the system's edit menu. |
| `Intl`                                               | engine requirement (JavaScript runtime)    | Every component that formats through the library's internationalization helpers (`./i18n`, `InternationalizationProvider`): `Calendar`, `DateInput`, `DateRangeInput`, `TimeInput`, `Timestamp`, `Timer`, `NumberInput`, `Slider`, `Stepper`, `ProgressBar`, `Pagination`, `TextArea` (the count's plural words), `Avatar` (initials), `DonutChart`, and every other component that writes a number.                                                                                                               | Dates, times, numbers and counts in the person's locale and digits, and right-to-left layout for right-to-left languages.                           |

## Non-goals

- The keyboard in browsers (`spec:AST-099`); how each library component lays out against the insets and
  the keyboard (each component's own record); the router's state and
  transitions (`spec:AST-112/DEC-9` and the navigation record); the
  activity-level status bar and the iOS status bar, which the presentation and
  navigation hosts answer.
- Astryx Stage (`spec:AST-139`) and Preview in the Astryx app (`spec:AST-141`)
  are separate products; they conform to this record's contracts.
- Equivalent internal implementations remain valid when they satisfy this contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.
- The strings catalog's words and translations, and each component's own
  date and number formats.
- Markdown parsing, rich text editing, and text input. Selectable text draws
  resolved, read-only blocks.
- Corner adaptation of insets (react-native-safe-area-context's
  `cornerAdaptation` option): the platform reports plain insets.

## Requirements

- **FR1 — One native provider is the source of truth for a subtree's insets.**
  `SafeAreaProvider` renders `AstryxSafeAreaProvider`, an ordinary flex
  container that reports how far the system's bars, cutouts, rounded corners
  and home indicator reach into its own frame.
  - It sends `onInsetsChange {insets, frame}` once it has a size and then
    whenever the insets or the frame change by more than one pixel: `insets`
    relative to the provider's own frame, `frame` in its window, in points (dp
    on Android). The keyboard is never part of the insets.
  - The subtree reads them with `useSafeAreaInsets()` and `useSafeAreaFrame()`
    or `SafeAreaInsetsContext` and `SafeAreaFrameContext`. The hooks throw
    outside every provider, as react-native-safe-area-context's do.
    `onMetricsChange(metrics)` reports each measurement to the app.
  - `AstryxAppRoot` mounts a provider around the tree by default, and the
    library's insets come from it unless the app supplies its own
    (`spec:AST-112/FR9`).
- **FR2 — The initial layout uses real numbers.** A provider starts from
  `initialMetrics` when given, else the enclosing provider's values, else the
  window's metrics from `AstryxSafeArea` at mount time, so a provider mounted
  after a rotation starts right. With none of them (`initialMetrics={null}`, or
  no window) its children wait for the native measurement.
- **FR3 — `SafeAreaView` pads the chosen edges in the same layout.**
  `SafeAreaView` renders `AstryxSafeAreaView`, which applies the nearest
  provider's insets during native layout, so the padding lands in the same
  frame as the insets.
  - `mode`: `padding` (default) or `margin`.
  - `edges`: a list (those edges `additive`, the rest `off`) or a mode per edge:
    `additive` (the inset plus the style's own value for that edge), `maximum`
    (the larger of the two) or `off` (the style's value alone). An unknown or
    unnamed edge is `off`; no `edges` means every edge `additive`. The style's
    own value for an edge is what layout resolves for that physical edge,
    including logical start and end; only point values count, so a percentage
    or `auto` adds nothing.
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
  `cornerAdaptation` and ignores it. The entry implements that API itself and needs no react-native-safe-area-context
  installed; the package's only declaration of it is the optional peer of
  `./navigation-legacy` (`spec:AST-112/FR2`, `spec:AST-112/FR5`). An app may
  also install react-native-safe-area-context itself and use it beside these
  components without conflict (`spec:AST-140/FR9`).
- **FR6 — `KeyboardDockView` holds content that stays on the keyboard.** The
  caller sizes the dock and gives it bottom padding equal to the part of the
  dock the keyboard covers; the dock itself never resizes.
  - `followsKeyboard` (default `true`): with `false` the children keep their
    laid-out position whatever the keyboard does. A screen hidden behind
    another one passes `false`, so only the visible screen's dock moves.
  - `onKeyboardDockChange({height, overlap, settled})` fires when a keyboard
    change begins (`settled: false`, with the numbers of where the keyboard is
    going) and when it ends (`settled: true`), and after a later layout only
    if the rounded numbers changed. It never fires per frame. `height` is the
    docked keyboard's height, 0 when it is hidden, floating or split;
    `overlap` is the part of the dock's frame the keyboard covers at the end
    of the change.
  - `transcriptNativeID` links one scroll view to the dock (FR8): the first
    scroll view inside the view with that `nativeID`, which must sit within
    the dock's three closest ancestors. An ID the dock cannot find has no
    effect, and the dock looks for it again at the next layout.
  - `bottomInset` and `restingInset` (Android): the bottom padding the caller
    gives the dock, and the padding the children keep when the keyboard is
    hidden, in dp.
  - `isKeyboardDockAvailable()` is true wherever the binary registers the
    dock, on iOS and on Android. `animatesSideInsets` is a prop only the
    library sets; an app that sets it gets the default behaviour.
- FR6 gap: `isKeyboardDockAvailable()` answers false on Android binaries that
  register the dock.
- **FR7 — The dock rides the keyboard with no JavaScript per frame.** The
  dock moves its children natively on every frame of a keyboard change, and
  JavaScript hears only the change's start and end (`spec:AST-140/FR6`).
  - iOS: a show, a
    hide or a height change moves them with the keyboard's own duration and
    curve, and the caller's padding update causes no jump. During an
    interactive dismissal (`keyboardDismissMode="interactive"` on a scroll
    view) they follow the keyboard's top on every frame, and if the finger
    lets go halfway they return with the keyboard.
  - Android: the dock follows the IME's inset animation and offsets itself on
    the UI thread from `bottomInset` and `restingInset`, so the children sit
    on the IME's visible top on every frame of a show and a hide. When the IME
    comes to rest and the padding matches, the offset is 0. On Android the
    dock's start and end reports also update the library's shared keyboard
    frame.
  - iOS, `animatesSideInsets`: when one commit changes the dock's own left or
    right padding, the children's new frames animate on the render server;
    the layout itself takes the new values at once.
- **FR8 — The linked scroll view rides the keyboard with the dock.** On both
  platforms, the linked scroll view's bottom content inset follows how far the
  children are above their resting place on every frame, and a list scrolled
  to its end stays at its end, so its last row stays visible above the docked
  content. The linked list sets no `contentInset`, `scrollIndicatorInsets` or
  `automaticallyAdjustKeyboardInsets` of its own.
- FR8 gap: on Android the dock writes no inset to the linked scroll view; the
  list keeps its place in the layout and moves only at a change's start and
  end.
- **FR9 — A drawn modal window owns its status bar on Android.**
  `AstryxWindowStatusBar` is a zero-size view that sets the status bar of the
  Dialog window it is rendered in: `barStyle` (`light`, `dark`, `auto`) and
  `barVisibility` (`hidden`, `shown`, `auto`). Values travel as strings, and a
  value the binary does not recognize is treated as `auto`.
  - The router's drawn full-screen and transparent modal routes render it
    with the route's status bar style and visibility. A native stack inside
    the same window takes precedence with its top screen's values. When
    nothing asks, the window shows the activity's look.
  - Only that window's bar is written: never the activity's window, never the
    navigation bar. In the activity's own window the view does nothing, and it
    renders nothing when the route asks nothing.
  - iOS does not register it: the presentation host answers a route's status
    bar there.
- **FR10 — `NativeSelectableTextView` draws blocks as one selectable text.**
  The view takes `blocks` (each a list of runs with resolved styles, a `role`
  such as `heading`, and an optional `href` per run) and draws them in one
  native text view.
  - The view's text is every block's text with a line break between blocks.
    Offsets are UTF-16 code unit indices into that text, the unit JavaScript
    strings use. List markers belong to the text, so a copy includes them.
  - `onSelectionChange(selection)` reports the offsets, the blocks the
    selection touches with block-relative ranges, and the text a copy gives,
    only when the selection changes.
  - The handle's `setSelection({start, end})`, `selectBlocks({first, last})`
    and `clearSelection()` select without showing a menu; offsets clamp to the
    text.
  - `onLinkPress({href, blockIndex})` comes for a tap on a link with no
    selection, or for the screen reader's link action. The platform opens
    nothing.
  - Props: `isSelectable` (default `true`; `false` keeps the text visible
    and readable by screen readers but not selectable, and links still report), `selectionColor`, `colorScheme` (iOS; the edit
    menu and handles), `allowFontScaling` (default `true`),
    `maxFontSizeMultiplier` (0 for no limit), `estimatedHeight`, `fallback`,
    `onError`.
- **FR11 — Selectable text sizes itself and uses the system's menus.** The
  native view measures the height its text needs at its current width and
  reports it; the wrapper sets that height one layout pass after the text
  changes, and a `height` in `style` takes precedence. The edit menu is the system's (Copy, Look Up,
  Translate, Share on iOS; Copy, Share, Select all on Android). A block
  uses the same font face a React Native `Text` with the same style gets.
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
  the window status bar's probe is internal (`spec:AST-112/FR7`,
  `spec:AST-140/FR2`).
  - Without the native provider, `SafeAreaProvider` is a plain view whose
    subtree gets the starting numbers, or zeros; it always renders its
    children. Without the native view, `SafeAreaView` applies the same edge rule
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
- **FR14 — The group follows the package's contract baseline.** Every
  contract in this group is at revision 1 and grows only by named features
  (`spec:AST-140/FR5`). The
  keyboard dock's `transcriptNativeID`, `bottomInset`, `restingInset` and
  `animatesSideInsets` belong to revision 1; the group lists no named features.

- **FR15 — The JavaScript engine meets a declared `Intl` requirement.**
  `Intl` is a requirement on the JavaScript runtime, not a native contract.
  The package names each `Intl` member it relies on and each member it must
  not use, per platform:
  - Required on iOS and Android: `Collator`, `DateTimeFormat` with
    `formatToParts`, `NumberFormat`, and `getCanonicalLocales`;
    `NumberFormat.prototype.formatToParts` on Android.
  - Absent, so the package never calls them unguarded:
    `NumberFormat.prototype.formatToParts` on iOS, `formatRange` and
    `formatRangeToParts` of `DateTimeFormat` and `NumberFormat`,
    `RelativeTimeFormat`, `PluralRules`, `ListFormat`, `Segmenter`,
    `DisplayNames`, `Locale`, and `supportedValuesOf`.
  - The table comes from a measurement of the engine in release builds on the
    iOS Simulator and the Android emulator, never from belief. A newer engine
    that gains a member changes nothing until a new measurement moves it to
    required.
- **FR16 — Every member outside the required set has a fallback or no use.**
  Where the engine lacks a member, the library's output falls back:
  - `DateTimeFormat#formatRange`: the two dates joined by the strings
    catalog's range separator.
  - `RelativeTimeFormat`: English relative words from CLDR's English
    patterns; other locales show the absolute date and time; calendar words
    such as "today" and "next month" come from the strings catalog.
  - `PluralRules`: the library's own plural rules, with English built in and
    other languages from registered CLDR plural data. Importing the package
    installs no `Intl.PluralRules` (`spec:AST-112/DEC-10`). English plural
    data ships in the package, and the package has no runtime dependency for
    the rest (`spec:AST-112/FR4`).
  - `NumberFormat#formatToParts` (iOS): a locale's decimal and grouping
    symbols come from formatted sample numbers. `DateTimeFormat` parts are
    used only when they match what `format()` writes, and day-period words
    fall back to the difference between 01:00 and 13:00, then to the catalog.
  - `Segmenter`: initials split by code point instead of by grapheme cluster.
  - `Locale`: writing direction from the language's known script direction,
    and locale matching by lookup (`ar-EG`, then `ar`, then the default).
  - Typed numbers and dates in native digits are read as ASCII digits.
  - `DateTimeFormat#formatRangeToParts`, `NumberFormat#formatRange`,
    `NumberFormat#formatRangeToParts`, `ListFormat`, `DisplayNames` and
    `supportedValuesOf`: the library never calls them, so they need no
    fallback.
- FR16 gap: evaluating the library's root or `./i18n` entry installs the
  library's plural rules as `Intl.PluralRules` where the engine has none.
- FR16 gap: the package depends on a FormatJS package for CLDR plural data.
- **FR17 — Native code uses only public platform API.** This group's native
  code needs no exception to the public-API rule of `spec:AST-112/FR4`.

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

`Intl` is a requirement on the JavaScript engine (FR15), not a native
contract. `AstryxSelectableText`'s `content` is the blocks as JSON, with sizes in dp
before font scaling and colours as processed colour numbers; the wrapper builds
it. A platform-only prop says so in its documentation (`spec:AST-140/FR1`).

### Platform support

| Contract                 | iOS                                                                                                                                                                                                                                                                       | Android                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSafeAreaProvider` | UIKit `safeAreaInsets` and `safeAreaInsetsDidChange`                                                                                                                                                                                                                      | `WindowInsetsCompat` `systemBars` and `displayCutout` against the view's place in its window, IME excluded, in dp                                                                                       |
| `AstryxSafeAreaView`     | Applies the edge rule during native layout                                                                                                                                                                                                                                | Applies the edge rule during native layout                                                                                                                                                              |
| `AstryxSafeArea`         | The key window's `safeAreaInsets` and frame                                                                                                                                                                                                                               | The activity window's root insets for `systemBars` and `displayCutout`, IME excluded, in dp                                                                                                             |
| `AstryxKeyboardDock`     | `keyboardLayoutGuide` and Core Animation on the render server: show, hide, height change, interactive dismissal, the linked scroll view's inset, side-inset animation. A gap the caller's padding leaves between the children and the keyboard is kept through the motion | `WindowInsetsAnimationCompat` and a UI-thread offset on show and hide; the children sit on the IME's top, so a gap above the keyboard is not kept. No interactive dismissal and no `animatesSideInsets` |
| `AstryxWindowStatusBar`  | Not registered; the presentation host answers a route's status bar                                                                                                                                                                                                        | The Dialog window's `WindowInsetsControllerCompat`                                                                                                                                                      |
| `AstryxSelectableText`   | Non-editable, selectable `UITextView`; `UIFontMetrics` per block; system edit menu                                                                                                                                                                                        | `TextView` with `setTextIsSelectable` over one `Spannable`; sizes in sp; `ExploreByTouchHelper` per block; system text-selection action mode                                                            |

- Engine: the JavaScript engine on iOS meets FR15 without
  `NumberFormat#formatToParts`; on Android it meets FR15 with it.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, which has UIKit's keyboard layout guide; Android API level
  24; the New Architecture only).
- Unsupported behavior: a view a binary lacks reports itself unavailable and
  the wrapper draws the fallback of FR13; the module answers `null` metrics; a
  named feature a binary lacks keeps the revision-1 behaviour or answers
  `unsupported` (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Relies on `spec:AST-112` FR1 (amended): layout, text and keyboard belong to
  the platform's core.
- Relies on `spec:AST-112` FR3 (amended): the core links in every app by
  default.
- Relies on `spec:AST-112` FR4 (amended): native code calls public platform
  API only.
- Relies on `spec:AST-140` FR5: contracts start at revision 1 and grow by
  named features.
- Details `spec:AST-140/FR2`, `spec:AST-140/FR3`, `spec:AST-112/FR7` and
  `spec:AST-112/FR9` for
  this group's probes, fallbacks and app root.
- `spec:AST-099` is unchanged; it keeps the keyboard in browsers.
- The package's `Intl` engine requirement is owned here; FR16's plural rules
  follow `spec:AST-112/DEC-10` (no global installed by an import).

## Verification

| Contract | Verification                                                                                                                  | Representative states                                                                                           | Mutation or failure expectation                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests through the `./testing` view doubles; Simulator and emulator checks                                                | portrait, landscape, a notch and a cutout; a nested provider; a change under one pixel                          | Insets include the keyboard, an event per sub-pixel change, or a hook that answers outside every provider                                               |
| FR2      | Unit tests with absent, older and current module doubles                                                                      | explicit, inherited and window metrics; `initialMetrics={null}`; a provider mounted after rotation              | The initial frame lays out with zeros where metrics exist, or stale metrics after a rotation                                                            |
| FR3      | Unit tests of the edge rule; Simulator and emulator layout checks                                                             | each edge mode; padding and margin; logical start and end; right to left with and without the swap              | Padding a frame late, a wrong combined value, or an inset on the wrong side in right to left                                                            |
| FR4      | Unit tests with absent, malformed and current module doubles                                                                  | no window; a malformed constant                                                                                 | A throw, or a value other than `null` without the module                                                                                                |
| FR5      | Unit tests of the entry's names against react-native-safe-area-context 5.x; package manifest check                            | each exported name; `cornerAdaptation`; the package's dependencies and peer dependencies                        | A missing name, or a declaration of react-native-safe-area-context other than the optional peer of `./navigation-legacy`                                |
| FR6      | Unit tests through the `./testing` view doubles                                                                               | `followsKeyboard` false; an unknown `nativeID`; the library-only prop set by an app                             | An event per frame, a held dock that moves, or an app that gets the library-only behaviour                                                              |
| FR7      | Simulator, emulator and device checks with UI-thread frame checks (no JavaScript per frame); Android unit tests of the offset | show, hide and height change on both platforms; interactive drag and release on iOS; a side-inset commit on iOS | The docked content leaves the keyboard's top on any frame, a band opens between it and the IME, an offset remains at rest, or JavaScript runs per frame |
| FR8      | Simulator and emulator checks with UI-thread frame checks                                                                     | a list at its end; a list scrolled up; a list under a finger; a show, a hide and an interactive drag            | The last row slips under the docked content, the list jumps, or the list's own inset props fight the dock's                                             |
| FR9      | Emulator checks; Android unit tests; router tests with the view registered and absent                                         | light and dark style; hidden and shown; nested stack; closing the modal; a view in the activity's window        | The activity's window or the navigation bar is written, or the look stays after the modal closes                                                        |
| FR10     | Unit tests through the `./testing` doubles; Simulator and emulator selection checks                                           | a selection across blocks; `setSelection` and `selectBlocks`; a link tap with and without a selection           | A selection that stops at a block edge, wrong UTF-16 offsets, or a link opened natively                                                                 |
| FR11     | Simulator and emulator layout checks; Android instrumentation of font scaling                                                 | a width change; a text change; a `height` in style                                                              | A clipped or stale height, or a face that differs from `Text`'s                                                                                         |
| FR12     | VoiceOver and TalkBack checks on Simulator, emulator and device; Reduce Motion on                                             | per-block elements; a heading; a link action; the largest text size; Reduce Motion                              | One element for the whole text, a missing header trait, a dock that adds motion, or a side-inset animation under Reduce Motion                          |
| FR13     | Unit tests with each view and the module absent                                                                               | every fallback                                                                                                  | A held-back subtree, lost padding, an event from a fallback, or a missing `no-native-view` report                                                       |
| FR14     | The platform's spec rules check                                                                                               | a contract at revision 1; a missing named feature                                                               | A revision above 1, or a named feature used without checking that the binary has it                                                                     |
| FR15     | On-device probe of the engine's `Intl` in Simulator and emulator release builds                                               | each member on iOS and Android                                                                                  | The table differs from the probe                                                                                                                        |
| FR16     | Unit tests in an engine shaped like the device's, with the absent members removed                                             | each fallback; an English and a non-English locale; native digits                                               | A call to an absent member without its check, a component that throws or writes nothing, or a global installed by an import                             |
| FR17     | Review of the native source against the public iOS SDK and the Android SDK and AndroidX                                       | each native piece on iOS and Android                                                                            | A private selector, a private class, or reflection into a framework                                                                                     |

## Decision log

### DEC-1 — The safe area keeps react-native-safe-area-context's names and meaning

**Reference:** `spec:AST-129/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Apps and libraries already speak `SafeAreaProvider`, `SafeAreaView`,
`useSafeAreaInsets` and `initialWindowMetrics`, so moving an app over is an
import change, and the `./safe-area-context` entry lets code written for that
library run unchanged. The native side is Astryx's, so the package keeps one
dependency set.

Rejected: an Astryx-specific inset API, because every app and navigation
library would need a second vocabulary for the same numbers.

### DEC-2 — Insets apply during native layout

**Reference:** `spec:AST-129/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The safe-area view applies the provider's insets during native layout, in the
same frame that measures them, and the initial layout starts from the window's
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
when the JavaScript thread is busy. iOS follows UIKit's keyboard layout guide
and Android follows the IME's inset animation.

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

### DEC-6 — The engine's `Intl` is a measured requirement with fallbacks

**Reference:** `spec:AST-129/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

The library formats with the engine's own `Intl` where it exists and keeps a
small fallback for each member it lacks, so the bundle stays small and a newer
engine improves the output with no change. The set is declared from a
measurement, so a missing fallback fails in tests as it would on a device.

Rejected: polyfilling every missing `Intl` member, because the bundle would
carry code the engine may ship and tests would no longer show the device's
gaps.

## Open questions

- **OQ1 — Does `SafeAreaView` stay in the platform's core when no Astryx
  component renders it?** (`human-api`) Options: keep it as app API beside the
  provider, as react-native-safe-area-context does; or keep it only in the
  `./safe-area-context` entry, so the core's own app API is the provider and
  its hooks.
- **OQ2 — Is the dock's scroll-view link public?** (`human-api`)
  `transcriptNativeID` finds its scroll view among the dock's three closest
  ancestors. Options: a public prop any app can use for its own list; or a
  prop only the library sets.
- **OQ3 — Does an app's own `Modal` get a public way to set its window's status
  bar on Android?** (`human-api`) The window status bar is internal and only
  the router's drawn modal routes use it; React Native's `StatusBar` inside a
  `Modal` writes the activity's window. Options: export a public component for
  an app's own `Modal`; or keep it internal and route full-screen modals
  through the router.
- **OQ4 — Is hiding the keyboard by dragging the linked list down a dock
  behaviour?** (`human-api`) Android binaries hide the IME when a finger drags
  the linked scroll view down past the touch slop, once per gesture, and keep
  the field's focus; iOS has the scroll view's own interactive dismissal.
  Options: a named dock behaviour on Android with its own opt-in; or no dock
  behaviour, leaving dismissal to the scroll view.
- **OQ5 — Does the package keep an optional peer on
  react-native-safe-area-context?** (`human-api`) `spec:AST-112/FR2` and
  `spec:AST-112/FR5` list it as an optional peer of `./navigation-legacy`,
  while the `./safe-area-context` entry needs none. Options: keep the optional
  peer until `./navigation-legacy` leaves the package; or drop it and let
  `./navigation-legacy` resolve the compatibility entry.
