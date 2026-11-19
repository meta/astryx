---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-130
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

# React Native platform: System modules system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app built with `@astryxdesign/react-native` reads and changes the system
around it through a small set of native modules with no view: the app's light
or dark choice, the system's display and accessibility settings, haptic
feedback, the pasteboard, what the binary contains, runtime permissions,
Android's back press at the root, Android's cold launch, the system's file and
photo pickers, a string key-value store, and the app's cache location.
A developer calls one typed object per module, gets an answer on the first
render where the system already knows it, and handles every failure as data.
A person sees the app start in the right appearance, feels feedback that
matches the platform's own controls, sees drawn chrome follow Reduce
Transparency and Reduce Motion, and gets the system's back-to-home animation
and launch screen where the platform plays them. A file field opens the
system's own picker, and the app's navigation state survives a cold start.

This record details the system modules of the platform layer that
`spec:AST-112` defines. They are core modules (`spec:AST-112/FR1`): every app
links them. The shared platform rules are
`spec:AST-140`'s: every asynchronous call resolves the result vocabulary of
`spec:AST-140/FR3`, every interface evolves additively under
`spec:AST-140/FR5`, and every module has the capability shape of
`spec:AST-112/FR7`.

## Why this exists

The package depends on React and React Native alone at run time
(`spec:AST-112/FR2`); apps may use third-party libraries, haptics libraries
included, beside these modules without conflict (`spec:AST-140/FR9`). Each module exists for one
concrete gap; where the gap is small, OQ1 keeps the scope open.

- `AstryxAppearance`: the saved light or dark choice is in force from the first
  frame of every launch. A choice that JavaScript applies arrives a frame late,
  so the window and the status bar change after the app appears.
- `AstryxAccessibilitySettings`: one snapshot that is ready for the first
  frame, a change event for every key, and the iOS settings beyond those
  React Native's accessibility API reads.
- `AstryxHaptics`: a small gap. The theme maps moments to feedback kinds, and
  Android plays the view feedback its API level has (OQ1).
- `AstryxClipboard`: the pasteboard with the result vocabulary, from the
  package's own native code (OQ1).
- `AstryxPlatformInfo`: the binary's own contract facts (linked capabilities
  and named features), which only the binary can report.
- `AstryxPermissions`: a small gap. A closed set of permissions tied to the
  camera capability, with `not-declared` where the system would end the app
  (OQ1).
- `AstryxBack`: React Native's activity takes every back press; this gate
  hands the root press to the system, so Android plays its back-to-home
  animation.
- `AstryxLaunch`: the library ends Android's launch hold at its first content
  with no app code, and the router reads the launch link synchronously.
- `AstryxFilePicker`: a small gap. One call over photos and files with the
  result vocabulary (OQ1).
- `AstryxStorage`: a small gap. One string store with the result vocabulary,
  from the package's own native code, where the router keeps its state (OQ1).

## Who uses it

| Native piece                  | Kind                                | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                    | What a person sees                                                                                                                       |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAppearance`            | native module (Turbo Native Module) | `AstryxProvider`, the theme provider every Astryx component renders under, which applies the app's light or dark override through it; app API (`.` entry)                                                                                                                                                                                                                                                                                        | The app opens in the saved light or dark appearance, with no flash of the system's.                                                      |
| `AstryxAccessibilitySettings` | native module (Turbo Native Module) | `AstryxProvider` and every component styled with `createStyles` (`./styles` entry); through the library's system-settings hook also `BottomSheet`, `Popover`, `Overlay`, `HoverCard`, `ContextMenu`, `Switch`, `SegmentedControl`, `ProgressBar`, `Carousel`, `TabBar`, `TopNav`, `Header`, `Toolbar`, `Table`, `Item`, `Markdown`, `SearchField`, `BarButton`, `Button` and the glass and material surfaces; app API `useAccessibilitySettings` | Drawn bars, sheets and menus turn opaque under Reduce Transparency, show borders under Show Borders, and cross-fade under Reduce Motion. |
| `AstryxHaptics`               | native module (Turbo Native Module) | Through the library's moment table (`useHaptics`): `Button`, `Switch`, `Slider`, `SegmentedControl`, `Selector`, `TabList`, `ToggleButton`, `Toast`, `BottomSheet`, `InlineSheet`, `ContextMenu`, `ReorderableList`, `Item` swipe actions, `Calendar`'s picker field, `DonutChart` and the charts                                                                                                                                                | A tick on a selection change, a click on a toggle, a bump at a slider's end, a threshold tick in a swipe.                                |
| `AstryxClipboard`             | native module (Turbo Native Module) | `PasteButton` (reads on the person's press); `CodeBlock`, `Chat` message actions and `Timestamp` through the library's copy hook (`useCopy`)                                                                                                                                                                                                                                                                                                     | A copy button shows its check glyph and announces "Copied"; a paste fills the field.                                                     |
| `AstryxPlatformInfo`          | native module (Turbo Native Module) | Its named-feature probes: every component that renders an `Icon` (where icon images load), the system menu of `ContextMenu`, `DropdownMenu` and `Selector`, the native presentation host of `BottomSheet` and modal windows, `Item` (native swipe-row support), the router's stack navigator (modal presentation kinds, header search field, stack host), and the zoom pager gesture; app API                                                    | Nothing directly: each component picks the native path the binary has, or its drawn fallback.                                            |
| `AstryxPermissions`           | native module (Turbo Native Module) | `CameraView` (`./camera` entry) reads camera access through it; app API `useCameraPermission`                                                                                                                                                                                                                                                                                                                                                    | The system prompt appears only when the app asks.                                                                                        |
| `AstryxBack`                  | native module (Turbo Native Module) | Through the library's back handling: `AppShell`, `SearchField`, the router's stack navigator (back, modals, header search field), and the dismissible layers `BottomSheet`, `Drawer`, `Popover`, `HoverCard`, `ContextMenu`, `DropdownMenu`, `Selector`, `SplitView`, `TabMenu`, `TopNav` menus                                                                                                                                                  | Back closes the open sheet or menu first; at the root, Android plays its back-to-home animation.                                         |
| `AstryxLaunch`                | native module (Turbo Native Module) | The router (its root's first state and its first focused screen's layout); app API `AstryxPerformance.markFirstFrame` for an app on another router                                                                                                                                                                                                                                                                                               | On Android the launch screen stays until the first screen is drawn, and a cold deep link opens on its own screen.                        |
| `AstryxFilePicker`            | native module (Turbo Native Module) | `FileInput` through the library's file picker hook (`useFilePicker`); app API `AstryxFilePicker`                                                                                                                                                                                                                                                                                                                                                 | Choosing a file opens the system's photo or document picker; backing out changes nothing.                                                |
| `AstryxStorage`               | native module (Turbo Native Module) | The router's state persistence (its default store); app API (`./storage` entry)                                                                                                                                                                                                                                                                                                                                                                  | After a cold start the app opens on the screen it showed last.                                                                           |
| React Native `Linking`        | React Native core API               | Every `href` the library renders, through its link helper and host services: `Link`, `Button`, `Chip`, `ClickableCard`, `Item`, `Avatar`, `Breadcrumbs`, `Citation`, `ContextMenu` and `DropdownMenu` items, `Markdown` links, `SideNav`, `NavMenu` and `Tab`; the router's external links; the `camera` template's "open Settings"                                                                                                              | A tapped link opens in the system's browser or the app that owns it; a blocked camera permission opens the app's Settings.               |
| React Native `Share`          | React Native core API               | The library's host services (`useHostServices().share`), which the `create` templates' share actions use (assistant, camera, gallery, maps, text feed)                                                                                                                                                                                                                                                                                           | The system share sheet opens with the item's text or link.                                                                               |

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

- **FR1 — The group is ten core native modules.** Every app links them
  (`spec:AST-112/FR1`). Each module is read with `TurboModuleRegistry.get`,
  only by its own wrapper (`spec:AST-140/FR1`, FR2), and its wrapper answers
  `no-module` where the module is absent. `AstryxBack` and `AstryxLaunch` are
  internal: the library is their one caller.
  - The native appearance step (FR4), the back gate (FR10) and the launch hold
    (FR11) act in the package's generated native shell. In an app whose shell
    lacks them, the saved appearance applies once JavaScript sets it, after
    the first frame; every back press goes to React Native; and the app shows
    as soon as its window is ready.

  | Contract                      | Kind                                | Methods                                                                              | Platforms    |
  | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
  | `AstryxAppearance`            | native module (Turbo Native Module) | `getConstants` (`initialOverride`), `setOverride`, `getRunOverride`                  | iOS, Android |
  | `AstryxAccessibilitySettings` | native module (Turbo Native Module) | `getConstants` (`initialSettings`), `getSettings`, `onSettingsChange` (event)        | iOS          |
  | `AstryxHaptics`               | native module (Turbo Native Module) | `getConstants`, `isSupported`, `play`, `prepare`                                     | iOS, Android |
  | `AstryxClipboard`             | native module (Turbo Native Module) | `getConstants`, `isSupported`, `write`, `getString`, `detectPatterns`                | iOS, Android |
  | `AstryxPlatformInfo`          | native module (Turbo Native Module) | `getConstants` (`app`, `capabilities`, `contractFeatures`, `launch`), `getInfo`      | iOS, Android |
  | `AstryxPermissions`           | native module (Turbo Native Module) | `getConstants`, `get`, `request`                                                     | iOS, Android |
  | `AstryxBack`                  | native module (Turbo Native Module) | `getConstants`, `setRootBackEnabled`                                                 | Android      |
  | `AstryxFilePicker`            | native module (Turbo Native Module) | `getConstants`, `getSources`, `pick`                                                 | iOS, Android |
  | `AstryxStorage`               | native module (Turbo Native Module) | `getConstants`, `getItem`, `setItem`, `removeItem`, `getAllKeys`, `clear`, `getInfo` | iOS, Android |
  | `AstryxLaunch`                | native module (Turbo Native Module) | `getConstants`, `firstContent`, `initialURL`                                         | Android      |

- **FR2 — Constants are synchronous; everything else is a result.**
  - What the system knows at launch is a launch value, read once and then
    answered synchronously: the saved appearance and the run's override, the
    accessibility snapshot, the app's version, build, identifier and install or
    last update time, the linked capabilities, the named contract features, and the
    process start. Synchronous members (`isAvailable()`,
    `getOverride()`, `getRunOverride()`, `current()`, `app`,
    `capabilities`, `contractFeatures`, `launch`, and `AstryxLaunch`'s
    `initialURL()`) always return: they answer `null`, `'system'`, or
    all-false where the module or the constant is absent.
  - Every asynchronous call resolves an `AstryxResult`, failures included
    (`spec:AST-140/FR3`). Each module adds these reasons to the common ones:

    | Module                        | Module reasons                                                                   |
    | ----------------------------- | -------------------------------------------------------------------------------- |
    | `AstryxAppearance`            | `invalid` (not `light`, `dark` or `system`)                                      |
    | `AstryxAccessibilitySettings` | `unavailable` (the module is torn down during a reload)                          |
    | `AstryxClipboard`             | `unavailable` (no pasteboard on this device)                                     |
    | `AstryxPlatformInfo`          | `unavailable` (the system did not answer a read)                                 |
    | `AstryxPermissions`           | `unknown-permission`, `busy`, `no-activity` (Android), `not-declared`            |
    | `AstryxFilePicker`            | `unsupported-source`, `no-window`, `busy`; `cancelled` when the person backs out |
    | `AstryxStorage`               | `invalid-key`, `invalid-value`, `invalid-json`, `no-space`, `io`, `no-namespace` |

  - `AstryxHaptics.play` and `prepare` return no value: they play where the
    device can, and `isAvailable()` says whether it can. `setRootBackEnabled`
    and `firstContent` return no value either; they are hints the native side
    follows where it can.

- **FR3 — Change events start with the first subscriber and stop after the
  last.**
  - `AstryxAccessibilitySettings.subscribe` calls the listener with each real
    change and returns the unsubscribe function. The listener hears changed
    values only; `current()` answers the value in force.
  - A module follows native changes only while at least one listener is
    subscribed. After the last unsubscribe it stops; until the next subscribe,
    a read answers the last value it followed, and the next first subscriber
    reads the settings again.
  - On the first subscribe, the accessibility snapshot is read once more. A
    change that arrives before that answer wins, because it is newer.
  - Hooks (`useAccessibilitySettings`, `useCameraPermission`)
    subscribe on mount, remove the subscription on unmount, and return stable
    callbacks (`spec:AST-112/FR7`). `useCameraPermission` reads again when the app
    returns to the foreground, because the person may change the permission in
    Settings.
  - `AstryxPermissions.subscribe` delivers each state change the package
    learns from a `get` or a `request` anywhere in the app.

- **FR4 — `AstryxAppearance` keeps the app's light or dark choice natively.**
  - `AstryxAppearance` is core: the library's theme provider, which every
    Astryx component renders under, reads the system appearance and applies
    the app's light or dark override through this module, so it is native code
    Astryx itself uses (`spec:AST-112/FR20`, amended).
  - `setOverride('light' | 'dark' | 'system')` applies the choice to every
    window of the app at once and saves it; `system` removes the saved choice.
    `getOverride()` answers the saved choice synchronously.
  - The native shell applies the saved choice before the app's first frame: on
    iOS as the window's user interface style before the window shows, on
    Android as AppCompat's default night mode at process start. React Native's
    `Appearance` and `useColorScheme` then report the chosen scheme, so the
    theme follows it. The system draws the iOS launch screen before any of the
    app's code runs, so it keeps the system's appearance; on Android 12 and
    later the splash uses the night mode the system stores for the app, which
    is the saved choice.
  - The appearance is one model with three scopes, from the widest:
    - preference: the saved choice, kept across launches;
    - session: the run-only override (`persist: false`, or the cold-launch link),
      which a new process forgets;
    - screen: a screen's own light or dark choice, through the router's screen
      options (`spec:AST-125`), in force while that screen is in front.
  - The library owns the precedence: a screen's choice wins over the session's,
    the session's over the preference, and the preference over the system's
    appearance. The theme provider resolves the scopes in one place and gives
    every component and the app one resolved read of the appearance in force.
  - FR4 gap: the theme provider follows React Native's colour scheme alone;
    an app calls `setOverride` itself and writes
    the precedence across the saved choice, the run's override, a screen's
    option and the system's scheme.
  - `setOverride(value, {persist: false})` (feature `persist-false`) applies the
    choice for this run only; the saved choice stays as it was, and
    `getOverride()` and the next launch keep it. A saving `setOverride` ends the run-only
    override, so `setOverride(getOverride())` restores the saved choice and
    `getRunOverride()` then answers `null`.
  - `getRunOverride()` (feature `run-override`) answers the run's own override
    synchronously, or `null` when the saved choice is in force, so the first
    render matches the first frame.
  - With `appearance.launchLinkParameter` set in the app's configuration
    (default: off), which the generated native project carries
    (`spec:AST-112/FR4`), a link on one of the app's own schemes whose named query
    parameter is `light`, `dark` or `system` applies that appearance natively
    as a run-only override at cold launch only: when the first activity is
    created on Android, and when the app's first window scene connects on iOS,
    before the first
    frame (feature `launch-link`). The saved choice stays as it was. A link
    that arrives later (a new intent, or a scene URL) navigates, and the
    screen it opens sets its look through its own `appearance` option
    (`spec:AST-125/FR7`).
  - FR4 gap: a link that arrives while the app runs applies its appearance as
    a run-only override too.

- **FR5 — `AstryxAccessibilitySettings` publishes one settings snapshot.**
  - The snapshot has seven booleans. Every answer carries all seven, and a key
    reads false on an OS version without that setting: `isReduceTransparency`,
    `isIncreaseContrast`, `isReduceMotion`, `prefersCrossFadeTransitions`,
    `isBoldText`, `isReduceBrightEffects` (iOS 26.4 and later), and
    `isShowBorders` (Show Borders on iOS 26.1 and later, Button Shapes before).
  - `current()` answers the snapshot synchronously from the constants, so the
    first frame is drawn with it; `getSettings()` reads it again.
  - Where the module is absent (Android, an older binary, Jest), `isAvailable()`
    is false, `getSettings()` answers `no-module`, and the snapshot comes from
    React Native's `AccessibilityInfo`: Reduce Motion everywhere, high text
    contrast as `isIncreaseContrast` on Android, and the iOS settings it reads.
    Every other key reads false.
  - Native glass follows the system's Clear or Tinted Liquid Glass look
    itself; drawn chrome follows the seven keys of the snapshot.

- **FR6 — `AstryxHaptics` plays the platform's feedback kinds.**
  - `play(kind)` plays one of UIKit's nine kinds: `selection`, `impactLight`,
    `impactMedium`, `impactHeavy`, `impactSoft`, `impactRigid`,
    `notificationSuccess`, `notificationWarning`, `notificationError`. iOS plays
    it with a prepared feedback generator; `prepare(kind)` warms the generator
    so the next `play` has no delay.
  - Android plays a chain of `HapticFeedbackConstants` names, in order of
    preference, on the root view of the activity in front: the first name the
    device's API level knows. Each kind has a default chain; `play(kind, {android})` passes another.
  - `isAvailable()` is true where the module is present and `isSupported()`
    is true (haptic hardware and a window); `play` and `prepare` play feedback
    then.
  - The library maps its moments (select, toggle, edge, threshold arm and
    disarm, commit and others) to kinds through the theme's haptic tokens, each
    matched to the iOS control that plays it. A theme's `native.haptics`
    overrides a token, and `'none'` silences it.

- **FR7 — `AstryxClipboard` reads and writes plain text.**
  - `write({text})` replaces the pasteboard's content and answers `ok` once the
    text is there.
  - `getString()` answers `{value}`, with `null` for an empty or non-text
    pasteboard. A read shows the system's paste notice on iOS 16 and later and
    Android 12 and later, so the library reads only on the person's action
    (`PasteButton`), and copy buttons only write.
  - `detectPatterns(['webURL' | 'webSearch' | 'number'])` answers whether the
    pasteboard probably holds each pattern. It reads only the pasteboard's
    metadata, so the system shows its paste notice for reads alone. The answer
    carries the patterns the platform tests: all three on iOS, and a web URL
    on Android 12 and later.
  - `isAvailable()` is false where the module is absent or `isSupported()` is
    false; calls then answer `no-module` or `unavailable`.

- **FR8 — `AstryxPlatformInfo` says what this binary has.**
  - Constants: `app` (version, build, identifier, and `installedAt` in ISO
    8601 UTC: when this binary was installed or last updated, the bundle
    container's creation date on iOS and `PackageInfo.lastUpdateTime` on
    Android), `capabilities` (the opted-in
    capabilities this binary links; `[]` for core only), `contractFeatures` (the named contract
    features, FR17), and `launch` (`processStartedAt` in epoch milliseconds,
    and `isPrewarmed`, always false on Android). `packageVersion` is the
    JavaScript package's version.
  - `get()` answers the platform, the calling runtime's namespace, the per-platform feature rows
    (`<capability>.<behaviour>`, with `isSupported` and a note), and the
    self-checks of the platform internals the package relies on (`compat`).
    `supports(name)` reads a feature row from the last answer and is `null`
    while it is unknown.

- **FR9 — `AstryxPermissions` reads and asks explicitly.**
  - `get(name)` reads the state silently. `request(name)` shows the system
    prompt for `undetermined` (and Android `denied`), then answers the state;
    otherwise it answers the current state at once. The prompt comes only from
    `request` (`spec:AST-112/FR7`).
  - `name` is a closed set (`camera`). The states are `granted`,
    `undetermined`, `denied` (refused; the app may ask again) and `blocked`
    (the person can change it in Settings only: iOS `denied` or `restricted`,
    Android "don't ask again").
  - `hasHardware` says whether the device has the hardware: false on the iOS
    Simulator and an emulator without a camera; `null` where the platform does
    not say.
  - A permission the app has not declared answers `not-declared` at once. The generated native project declares it when the app opts the
    capability in (`spec:AST-112/FR4`).
  - Where the module is absent, Android answers through React Native's
    `PermissionsAndroid` (which reads `undetermined` until a `request` in this
    run learns of a refusal), and iOS answers `no-module`.

- **FR10 — `AstryxBack` gives Android's root back press to the system when
  JavaScript cannot use it.**
  - A back press at the root goes to JavaScript only while something in the
    app can consume it: an open sheet, menu or search field, a `BackHandler`
    listener, or a navigator that can go back.
  - With nothing to consume, the system takes the press and plays its
    back-to-home animation (Android 16 predictive back).
  - Until the library reports for the first time, and after its runtime stops,
    back presses go to React Native unchanged.
  - On iOS back is native, so the module is Android-only.

- **FR11 — `AstryxLaunch` hands Android's cold launch to the first content.**
  - The shell activity keeps the system's launch window (the splash screen on
    API 31 and later, the window background before) until the library calls
    `firstContent()`, so no blank frame appears between the launch window and
    the first screen. After 2.5 seconds without a call, it shows the app.
  - The library calls it once per runtime: from the Astryx router's first
    focused screen's first content layout, or from `AstryxPerformance.markFirstFrame()`,
    whichever comes first; that first call ends the hold.
  - `AstryxPerformance.markFirstFrame()` (`.` entry) is the app API for an app whose first
    screen comes from another router: the app calls it from its first
    screen's first content layout, and the library passes it to
    `firstContent()`. An app on the Astryx router makes no call. On iOS, and
    where the module is absent, it returns at once.
  - `initialURL()` answers the launch link synchronously (what
    `Linking.getInitialURL()` answers), or `null` when the app launched
    without one. The router builds its first state from it, so a cold deep
    link draws its own screen first. On iOS, and where the module is absent,
    the router reads `Linking.getInitialURL()`.
  - On iOS the launch screen stays until the first frame, so the module is
    Android-only.

- **FR12 — `AstryxFilePicker` presents the system's pickers.**
  - `sources()` lists what the device offers, in menu order: `photos` and
    `files`. It is empty where the module is absent. Camera capture belongs to
    the `camera` capability (`./camera` entry); the core picker's two sources
    work without a camera permission or usage string.
  - `pick({source, isMultiple?, limit?, media?, accept?}, events?)` presents one picker
    over the calling surface and resolves `{ok: true, files}` with at least
    one file, `cancelled` when the person backs out, or a reason: a source the
    device does not offer answers `unsupported-source` at once with the
    platform's message, and a second picker while one is open answers `busy`.
    Each file has `uri`, `name`, `size` (`-1` when the provider does not say)
    and `type`.
  - iOS: `photos` is `PHPickerViewController` (out of process, so it works
    without photo library permission) and `files` is `UIDocumentPickerViewController`. Each picked file is copied into the
    app's cache location (FR14) and returned as a `file://` URL; the photo
    picker closes before it loads and copies, and `events.onLoading()` (no
    argument) is called once when that loading step starts.
  - Android: `photos` is the Photo Picker (the document picker on devices
    without it) and `files` is the Storage Access Framework. Each picked file
    is copied into the app's cache location (FR14) and returned as a `file://`
    URL.
  - Defaults: one file, the platform's limit, the media `accept` allows (else
    all), and any file type.
  - The library's `FileInput` reaches it through `useFilePicker()`.
  - FR12 gap: on Android the core picker returns the `content://` URIs the
    pickers grant instead of `file://` URIs in the cache location.
  - FR12 gap: on iOS the core picker offers a `camera` source
    (`UIImagePickerController`) and answers its `permission-denied` and
    `restricted` reasons.

- **FR13 — `AstryxStorage` is the runtime's string key-value store.**
  - `get(key)` answers `{value}`, with `null` for a missing key; `set`,
    `remove`, `keys({prefix?})` and `clear({prefix?})` complete the store;
    `getJSON` and `setJSON` parse and serialize (`invalid-json`). `info()`
    answers the namespace, the key count, the bytes the store takes on disk,
    and the free space (`null` when the platform does not say).
  - Every call works in the calling runtime's namespace. Native code decides
    the namespace, and `info()` names it.
  - Values are kept across launches in storage the system keeps for the app.
    The device's free space bounds a value's size.
  - The router's state persistence uses it as its default store.

- **FR14 — The core package owns the app's cache location.**
  - The core package owns one cache location for the app. Pieces that produce
    files write them there and return `file://` URIs: the core's file picker
    (FR12), which `FileInput` uses, and the `camera` capability's camera view.
  - The system may reclaim the location under storage pressure. A caller that
    needs a file to last copies it elsewhere.

- **FR15 — Threads and lifecycle.** The threading rules of
  `spec:AST-140/FR6` apply; for this group:
  - Constants are read on the JavaScript thread once per module, at the first
    call that needs them. Asynchronous calls do their native work off the
    JavaScript thread.
  - The appearance override and the root back gate act natively on the UI
    thread at once, so each frame follows them without a JavaScript round
    trip.
  - Native events reach JavaScript on the JavaScript thread, once per real
    change.
  - A call made while its module is torn down during a reload answers
    `unavailable` where FR2 gives the module that reason, and `error`
    otherwise. A subscription made before the reload ends with it.

- **FR16 — Accessibility.**
  - The library's drawn chrome follows the snapshot of FR5: Reduce
    Transparency makes drawn glass and materials opaque, Increase Contrast and
    Show Borders strengthen edges, Bold Text reaches drawn text and symbols,
    and Reduce Motion with `prefersCrossFadeTransitions` replaces motion with
    cross-fades within the limits of `spec:AST-108`. The theme's style helper
    gives every key to component styles.
  - Every haptic moment goes with a visual change, and a copy also announces
    "Copied" through the status announcements of `spec:AST-086`.

- **FR17 — The group's named features.**
  - Contracts grow by named features (`spec:AST-140/FR5`). The group's named
    features are `AstryxAppearance.persist-false`,
    `AstryxAppearance.run-override` and `AstryxAppearance.launch-link`, and
    `AstryxPlatformInfo`'s `contractFeatures` constant is the list a binary
    reports.
  - In a binary without a feature: `setOverride` with `persist: false`
    answers `unsupported` and the saved choice stays; `getRunOverride()`
    answers `null`; and the app opens in the saved appearance whatever the
    launch link says. A missing feature is reported once with a development
    warning.

- **FR18 — The group's native code uses public platform API.**
  - The native code of every module in the group uses public platform API.
  - Each module links the system frameworks the platform support table names
    for it. The web engine and the web view's data belong to the `web`
    capability (`spec:AST-131`).
  - FR18 gap: on iOS the core's storage module also links WebKit, to remove
    web view data.

### Platform support

| Contract                      | iOS                                                                                               | Android                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AstryxAppearance`            | `overrideUserInterfaceStyle` on every window of the app's scenes                                  | AppCompat default night mode at process start                                                |
| `AstryxAccessibilitySettings` | UIKit accessibility status and notifications; the Accessibility framework for 26.1 and later keys | No module; `AccessibilityInfo` fallback (FR5)                                                |
| `AstryxHaptics`               | `UIFeedbackGenerator` subclasses, prepared and cached                                             | `HapticFeedbackConstants` on the activity's root view, by API level                          |
| `AstryxClipboard`             | `UIPasteboard`, with pattern detection                                                            | `ClipboardManager`; the clip description's URL confidence on Android 12 and later            |
| `AstryxPlatformInfo`          | Bundle info, `sysctl` process start, `ActivePrewarm`                                              | `PackageInfo`, `Process.getStartElapsedRealtime()`                                           |
| `AstryxPermissions`           | `AVCaptureDevice` authorization                                                                   | Runtime permission with its "don't ask again" state; `PermissionsAndroid` without the module |
| `AstryxFilePicker`            | `PHPickerViewController`, `UIDocumentPickerViewController`                                        | Photo Picker, Storage Access Framework                                                       |
| `AstryxStorage`               | Application Support                                                                               | The app's internal files directory                                                           |
| Cache location (FR14)         | The app's Caches directory                                                                        | The app's cache directory                                                                    |
| `AstryxBack`                  | No module (native back)                                                                           | `OnBackPressedCallback` on the shell activity, enabled by the gate                           |
| `AstryxLaunch`                | No module (the launch screen stays until the first frame)                                         | The shell activity holds the launch window; synchronous launch intent data                   |

- Supported feature/engine floor: the platform floor of `spec:AST-112`
  (iOS at React Native's minimum, Android API level 24, the New Architecture
  only). Settings that newer OS versions add (Reduce Bright Effects, Show
  Borders, Android 12 pattern detection, Android 16 predictive back) read
  false, stay out of an answer, or keep the older behaviour below them.
- Unsupported behavior: an absent module answers `no-module` and its
  synchronous members answer their empty values (FR2); a missing named feature
  answers `unsupported` or keeps the baseline behaviour (FR17); a
  platform-only module is absent on the other platform, and the library takes
  the path FR5, FR10 and FR11 name.
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`, amended); haptic feel needs
  a real device.

## Current-state impact

- Every `spec:AST-112` clause this record cites is that record's amended
  text.
- Relies on `spec:AST-112` FR3 (amended): the core links in every app, and
  every module of this group is core.
- Relies on `spec:AST-140` FR5: contracts grow by named features, which the
  platform info module reports.
- Relies on `spec:AST-140/FR9` and `spec:AST-140/DEC-9`: native code uses
  public platform API only.
- Relies on `spec:AST-112` FR20 (amended): the package covers the native code
  Astryx itself uses; every module of this group is such code.
- Is the System modules group record that `spec:AST-112/FR7` names: it lists
  the group's ten core modules and the core cache location (FR1, FR14).
- Camera capture, the camera source of a picker included, is the `camera`
  capability's (`spec:AST-112/FR7`; FR12).
- Departs from `spec:AST-112/FR7` ("never a silent no-op") for the hint calls
  that return no value (FR2); OQ2 asks whether FR7 names them as an
  exception.
- Details `spec:AST-112` FR7 (each module's probes) and FR9 (the haptic moment mapping), and `spec:AST-140/FR3`
  (each module's results).

## Verification

| Contract | Verification                                                                                                                                                                               | Representative states                                                                                                                                 | Mutation or failure expectation                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The platform's spec rules check; the contracts list                                                                                                                                        | each module's spec; a platform-only module                                                                                                            | A module read with `getEnforcing`, read outside its wrapper, or missing from the contracts list                                 |
| FR2      | Unit tests through the `./testing` doubles in absent, older and current shapes                                                                                                             | each synchronous member; each call; a native throw                                                                                                    | A synchronous member throws, a call rejects, or answers a reason outside its set                                                |
| FR3      | Unit tests of each store and hook                                                                                                                                                          | first subscriber; last unsubscribe; an event before the resync answer; unmount; foreground                                                            | A listener hears the current value, a repeat, or a change after unsubscribe; a native subscription outlives the last subscriber |
| FR4      | Unit tests of the scope precedence; Simulator and emulator launches with a saved choice opposite the system; a run-only change and a relaunch; a launch link; a screen with its own choice | saved `dark` under a light system; `persist: false`; launch link cold, and a later link that changes nothing; a screen choice over a session override | The first frame shows the system's style, a run-only change survives a relaunch, or a narrower scope loses to a wider one       |
| FR5      | Unit tests of the snapshot and the fallback; Simulator runs per setting                                                                                                                    | each key on and off; Android; module absent                                                                                                           | A key missing, an unchanged snapshot delivered, or the first frame drawn before the snapshot                                    |
| FR6      | Unit tests of the moment table and the Android chain; a device check of feel                                                                                                               | each kind; an API level without the preferred constant; no hardware; a theme token `'none'`                                                           | A kind plays the wrong constant, plays where unavailable, or a silenced token plays                                             |
| FR7      | Unit tests; Simulator and emulator copy and paste                                                                                                                                          | write; empty read; non-text read; pattern detection on Android 11 and 12                                                                              | A copy button reads, a detection reads the content, or an unknown key is answered                                               |
| FR8      | Unit tests; Simulator and emulator reads                                                                                                                                                   | constants; `get()`                                                                                                                                    | A constant throws, or `get()` answers a feature row the binary does not report                                                  |
| FR9      | Unit tests; Simulator and emulator prompts                                                                                                                                                 | each state; undeclared permission; a busy prompt; module absent on each platform                                                                      | A mount prompts, a `blocked` permission prompts, or an undeclared permission crashes                                            |
| FR10     | Unit tests of the back gate; emulator runs on Android 16                                                                                                                                   | an open sheet; a navigator that can go back; the root; before the first call                                                                          | The back-to-home animation does not play at the root, or a press with a consumer reaches the system                             |
| FR11     | Unit tests of the once-per-runtime report and the synchronous link; emulator cold launches                                                                                                 | a launch with and without a link; a launch that never reports                                                                                         | An empty root frame shows before the first content, the hold never ends, or a cold deep link draws another screen first         |
| FR12     | Unit tests through the `./testing` doubles; Simulator and emulator picks                                                                                                                   | each source; multiple; cancel; a source the device does not offer; a second pick while one is open                                                    | A cancel reads as an error, an empty `ok` list, a camera source in the core picker, or two pickers at once                      |
| FR13     | Unit tests through the `./testing` doubles; Simulator and emulator runs                                                                                                                    | two runtimes; a full disk                                                                                                                             | One runtime reads another runtime's data, or a full disk answers anything but `no-space`                                        |
| FR14     | Unit tests of each piece that produces files; Simulator and emulator runs                                                                                                                  | a picked photo; a camera photo; storage pressure                                                                                                      | A file written outside the cache location, or a URI that is not a `file://` URI                                                 |
| FR15     | UI-thread frame checks during an appearance change; reload tests                                                                                                                           | appearance change while scrolling; a reload with subscribers                                                                                          | JavaScript runs per frame for the change, or a subscription survives a reload                                                   |
| FR16     | Simulator runs per accessibility setting; announcement tests                                                                                                                               | Reduce Transparency; Show Borders; Reduce Motion; a copy                                                                                              | Drawn chrome ignores a setting, or a copy confirms with haptics alone                                                           |
| FR17     | The platform's spec rules check; unit tests with a binary that lacks each feature                                                                                                          | each named feature present and absent                                                                                                                 | A behaviour runs without its feature, a missing feature answers anything but the baseline path or `unsupported`, or no warning  |
| FR18     | Binary symbol and linked-framework check of a core-only build; review of each native change for private API                                                                                | a core-only iOS and Android build                                                                                                                     | A framework outside the platform support table linked by the group's native code, or a private API call in it                   |

## Decision log

### DEC-1 — The appearance choice is native, applied before the first frame

**Reference:** `spec:AST-130/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A choice that JavaScript applies arrives after the first frame, so a saved
choice opposite the system shows the system's style first and then
cross-fades. The native shell saves the choice and applies it to the window
before it shows; run-only changes and the launch link use the same path and
save nothing. The preference, session and screen scopes form one model whose
precedence the library owns, so an app reads one resolved appearance instead
of combining the inputs itself.

### DEC-2 — Accessibility settings are one snapshot with a fallback

**Reference:** `spec:AST-130/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Drawn chrome needs every setting that native glass and system bars follow, in
the first frame, so the module publishes them together as constants and one
event. Where the module is absent, React Native's `AccessibilityInfo` answers
the keys it can, so the library has one code path.

### DEC-3 — Android's root back press belongs to the system unless JavaScript can use it

**Reference:** `spec:AST-130/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Predictive back plays only when the activity does not intercept the press.
The library knows whether anything can consume it, so it publishes that fact
and the activity follows; the system then plays its own back-to-home
animation at the root.

### DEC-4 — The library ends the Android launch hold

**Reference:** `spec:AST-130/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

The router knows when the first screen has content, so it releases the launch
window with no app code, and a time bound keeps a broken launch visible. The
launch link is read synchronously so the router's first state is the linked
screen.

### DEC-5 — Thin modules stay dependency-free wrappers

**Reference:** `spec:AST-130/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Haptics, the clipboard, permissions, the file pickers and storage are small
wrappers
where the ecosystem has good libraries. They stay Astryx modules because the
package depends on React and React Native alone at run time
(`spec:AST-112/FR2`), and because each needs the result vocabulary. DEC-5 holds until OQ1 is
answered.

## Open questions

- **OQ1 — Do the thin system modules stay Astryx modules?** (`human-design`)
  `AstryxHaptics`, `AstryxClipboard`, `AstryxPermissions`, `AstryxFilePicker`,
  and `AstryxStorage` fill little capability gap. Options: keep them as
  Astryx modules (one dependency set, one result shape); or
  replace their native side with adapters over community libraries, keeping
  the wrappers' API.
- **OQ2 — Do the calls that return nothing keep doing nothing where they
  cannot act?** (`human-api`) `AstryxHaptics.play` and `prepare`, and the
  back and launch hints, do nothing where the module is absent or
  unsupported, which `spec:AST-112/FR7` counts as a silent no-op. Options:
  `spec:AST-112/FR7` names them as an exception, with `isAvailable()` saying
  when they do nothing; or each gains a result that answers why it did not
  act.
- **OQ3 — Light and dark: does the platform resolve theme colours natively at
  the trait change, or does JavaScript re-resolve the tokens and re-render on
  each flip?** (`human-design`) Options:
  - Native resolution (iOS dynamic colour providers, Android night-mode
    resources): no JavaScript work or re-render per flip, and the first frame
    after a flip is already right. Tokens must be dynamic native colours,
    which is harder for custom or computed tokens and for web parity.
  - Tokens resolved in JavaScript: one token pipeline shared with the web, and
    any computed token works. Each flip costs a JavaScript re-resolve and a
    re-render.
