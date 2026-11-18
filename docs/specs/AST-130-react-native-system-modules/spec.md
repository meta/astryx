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
feedback, the pasteboard, what the binary contains, runtime permissions, the
network path, Android's back press at the root, Android's cold launch, the
system's file and photo pickers, a string key-value store, and secure random
bytes.
A developer calls one typed object per module, gets an answer on the first
render where the system already knows it, and handles every failure as data.
A person sees the app start in the right appearance, feels feedback that
matches the platform's own controls, sees drawn chrome follow Reduce
Transparency and Reduce Motion, and gets the system's back-to-home animation
and launch screen where the platform plays them. A file field opens the
system's own picker, and the app's navigation state survives a cold start.

This record details the system modules of the platform layer that
`spec:AST-112` defines. They are core modules (`spec:AST-112/FR1`): every app
links them. Every asynchronous call resolves the result vocabulary of
`spec:AST-112/FR6`, every module has the capability shape of
`spec:AST-112/FR7`, every interface evolves additively under
`spec:AST-112/FR8`, and Astryx Stage implements each module as the contract
developers build against (`spec:AST-112/FR12`).

## Why this exists

React Native and its community already cover most of these needs. Astryx owns
a module where the ecosystem leaves a specific gap, or where the module is a
thin, dependency-free wrapper that gives the library one result shape, one
Preview policy, and one Astryx Stage simulation (`spec:AST-112/FR2`,
`spec:AST-082/FR13`).

| Module                        | What the ecosystem does well                                                                                                                                              | The gap Astryx fills                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxAppearance`            | React Native's `Appearance` reports the scheme and can override it while JavaScript runs; `expo-system-ui` sets the root background.                                      | A saved choice that the native shell applies before the first frame of every launch, a run-only override, and an opt-in launch link. A choice that JavaScript applies arrives after the first frame, so the window and status bar cross-fade.          |
| `AstryxAccessibilitySettings` | `AccessibilityInfo` reads Reduce Motion, Reduce Transparency, Bold Text, darker system colours and cross-fade transitions, with change events for most.                   | One synchronous snapshot for the first frame, a change event for every key, and the iOS settings `AccessibilityInfo` does not read (Reduce Bright Effects, Show Borders). Android uses `AccessibilityInfo` itself (FR5).                               |
| `AstryxHaptics`               | `Vibration` plays patterns; `expo-haptics` plays UIKit's feedback kinds and Android effects well.                                                                         | Little capability gap. The module plays Android's `HapticFeedbackConstants` on the view with an API-level chain, needs no Expo runtime library (`spec:AST-112/FR11`), and lets the theme map moments to kinds (FR6). Scope: OQ1.                       |
| `AstryxClipboard`             | `expo-clipboard` and `@react-native-clipboard/clipboard` read and write text and test for content without reading it.                                                     | No real capability gap. The module exists for the result vocabulary, the Preview read and write policy (`not-allowed`), and Astryx Stage parity. Scope: OQ1.                                                                                           |
| `AstryxPlatformInfo`          | `expo-device`, `expo-application` and `react-native-device-info` report the device, the app's version and install time.                                                   | The binary's own contract facts no library can know: each native component's revision, the linked capabilities, the named contract features, per-platform feature rows, and self-checks. Its app constants overlap the ecosystem with no gap.          |
| `AstryxPermissions`           | `PermissionsAndroid` asks on Android; `react-native-permissions` covers many permissions with `blocked` and `denied` states.                                              | Little gap. A closed set tied to the opted-in capabilities, `not-declared` instead of a system crash, the Preview consent policy, and no extra dependency. Scope: OQ1.                                                                                 |
| `AstryxNetwork`               | `@react-native-community/netinfo` reports the connection and its changes; cookie libraries read the native jar.                                                           | For state, little gap: one meaning of "connected" on every platform and a constrained flag (FR10). Cookies per runtime and a request with no identity have no ecosystem equivalent; they belong with data and security (OQ2).                          |
| `AstryxBack`                  | `BackHandler` delivers Android back presses to JavaScript, and navigators consume them.                                                                                   | React Native's activity always takes the back press, so Android's predictive back-to-home animation never plays at the root. The gate gives the press to the system when JavaScript has nothing to consume (FR11).                                     |
| `AstryxLaunch`                | `expo-splash-screen` holds the splash until the app hides it; `Linking.getInitialURL()` reads the launch link.                                                            | The library ends the Android launch hold at its first content with no app code and no Expo runtime library, and the router reads the launch link synchronously, so a cold deep link draws its screen in the first frame (FR12).                        |
| `AstryxFilePicker`            | `expo-image-picker`, `expo-document-picker`, `react-native-image-picker` and `@react-native-documents/picker` present the system photo, camera and document pickers well. | Little gap: one call over photos and files with the result vocabulary (`cancelled` is not an error), no permission for the out-of-process photo picker, and no extra dependency. Camera capture belongs to the `camera` capability (FR13). Scope: OQ1. |
| `AstryxStorage`               | `@react-native-async-storage/async-storage` and `react-native-mmkv` store strings and JSON well.                                                                          | Little gap: the namespace is the calling runtime's, decided natively, so a Preview project never reads the app's data or another project's, and the app's runtime clears a project's data in one call. Scope: OQ1.                                     |
| `AstryxCrypto`                | `react-native-get-random-values`, `expo-crypto` and `react-native-quick-crypto` give secure random bytes and Web Crypto shapes.                                           | No real capability gap. The module gives synchronous bytes from the system's secure generator with no non-secure fallback, for the package's own code and its crypto installer (`spec:AST-112/FR5`), with no extra dependency. Scope: OQ1.             |

## Who uses it

| Native piece                  | Kind                                | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                    | What a person sees                                                                                                                       |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAppearance`            | native module (Turbo Native Module) | No Astryx component; app API only (`.` entry). The theme follows its effect through React Native's colour scheme (OQ3).                                                                                                                                                                                                                                                                                                                          | The app opens in the saved light or dark appearance, with no flash of the system's.                                                      |
| `AstryxAccessibilitySettings` | native module (Turbo Native Module) | `AstryxProvider` and every component styled with `createStyles` (`./styles` entry); through the library's system-settings hook also `BottomSheet`, `Popover`, `Overlay`, `HoverCard`, `ContextMenu`, `Switch`, `SegmentedControl`, `ProgressBar`, `Carousel`, `TabBar`, `TopNav`, `Header`, `Toolbar`, `Table`, `Item`, `Markdown`, `SearchField`, `BarButton`, `Button` and the glass and material surfaces; app API `useAccessibilitySettings` | Drawn bars, sheets and menus turn opaque under Reduce Transparency, show borders under Show Borders, and cross-fade under Reduce Motion. |
| `AstryxHaptics`               | native module (Turbo Native Module) | Through the library's moment table (`useHaptics`): `Button`, `Switch`, `Slider`, `SegmentedControl`, `Selector`, `TabList`, `ToggleButton`, `Toast`, `BottomSheet`, `InlineSheet`, `ContextMenu`, `ReorderableList`, `Item` swipe actions, `Calendar`'s picker field, `DonutChart` and the charts                                                                                                                                                | A tick on a selection change, a click on a toggle, a bump at a slider's end, a threshold tick in a swipe.                                |
| `AstryxClipboard`             | native module (Turbo Native Module) | `PasteButton` (reads on the person's press); `CodeBlock`, `Chat` message actions and `Timestamp` through the library's copy hook (`useCopy`)                                                                                                                                                                                                                                                                                                     | A copy button shows its check glyph and announces "Copied"; a paste fills the field.                                                     |
| `AstryxPlatformInfo`          | native module (Turbo Native Module) | Its revision and feature probes: every component that renders an `Icon` (where icon images load), the system menu of `ContextMenu`, `DropdownMenu` and `Selector`, the native presentation host of `BottomSheet` and modal windows, `Item` (native swipe-row support), the router's stack navigator (modal presentation kinds, header search field, stack host), the zoom pager gesture, and `useComponentRevision`; app API                     | Nothing directly: each component picks the native path the binary has, or its drawn fallback.                                            |
| `AstryxPermissions`           | native module (Turbo Native Module) | No library component. `CameraView` (`./camera` entry) and the audio recorder (`./microphone` entry) read it; app API `useCameraPermission` (OQ3)                                                                                                                                                                                                                                                                                                 | The system prompt appears only when the app asks, never when a view mounts.                                                              |
| `AstryxNetwork`               | native module (Turbo Native Module) | No Astryx component calls the module; app API (`./network` entry: `useNetworkState`, `AstryxCookies`, `fetchUntrusted`) (OQ2, OQ3)                                                                                                                                                                                                                                                                                                               | An offline banner or a sign-out that the app draws.                                                                                      |
| `AstryxBack`                  | native module (Turbo Native Module) | Through the library's back registry: `AppShell`, `SearchField`, the router's stack navigator (back, modals, header search field), and the dismissible layers `BottomSheet`, `Drawer`, `Popover`, `HoverCard`, `ContextMenu`, `DropdownMenu`, `Selector`, `SplitView`, `TabMenu`, `TopNav` menus                                                                                                                                                  | Back closes the open sheet or menu first; at the root, Android plays its back-to-home animation.                                         |
| `AstryxLaunch`                | native module (Turbo Native Module) | The router (its root's first state and its first focused screen's layout) and `AstryxPerformance.markFirstFrame`                                                                                                                                                                                                                                                                                                                                 | On Android the launch screen stays until the first screen is drawn, and a cold deep link opens on its own screen.                        |
| `AstryxFilePicker`            | native module (Turbo Native Module) | `FileInput` through the library's file picker hook (`useFilePicker`); app API `AstryxFilePicker`                                                                                                                                                                                                                                                                                                                                                 | Choosing a file opens the system's photo or document picker; backing out changes nothing.                                                |
| `AstryxStorage`               | native module (Turbo Native Module) | The router's state persistence (its default store) and the update check's "Not now" (`./updates` entry); app API (`./storage` entry)                                                                                                                                                                                                                                                                                                             | After a cold start the app opens on the screen it showed last; a dismissed update stays dismissed.                                       |
| `AstryxCrypto`                | native module (Turbo Native Module) | No Astryx component; the public crypto installer (`./network` entry) and app API `AstryxCrypto` (OQ3)                                                                                                                                                                                                                                                                                                                                            | Nothing directly: identifiers and sign-in nonces an app makes come from the system's secure generator.                                   |

## Non-goals

- The data and security modules (files, secure storage) and their records.
  This record names only the parts of `AstryxNetwork` the library depends on
  (OQ2).
- Client identity, crash reports, daily metrics, the frame recorder, and
  image markup. Each is part of the platform package and has its own record.
- Camera capture. The `camera` capability owns it, the camera source of a
  picker included.
- Sharing, opening links and Settings, keep-awake, and orientation lock. None
  is a core module; each one is an opt-in capability of its own when Astryx
  provides it.
- The design of the theme's appearance model and its scopes; this record owns
  only the native appearance override.
- Haptic intensities per moment. The theme's haptic tokens own them
  (`spec:AST-112/FR9`).
- Each component's use of these modules beyond what "Who uses it" names; the
  component's own record owns it.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The group is twelve core native modules.** Every app links them
  (`spec:AST-112/FR1`). Each module is read with `TurboModuleRegistry.get`,
  only by its own wrapper (`spec:AST-112/FR8`), and its wrapper answers
  `no-module` where the module is absent. `AstryxBack` and `AstryxLaunch` have
  no public object: the library is their one caller.

  | Contract                      | Kind                                | Methods                                                                                                                                                                             | Platforms    |
  | ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxAppearance`            | native module (Turbo Native Module) | `getConstants` (`initialOverride`), `setOverride`, `getRunOverride`                                                                                                                 | iOS, Android |
  | `AstryxAccessibilitySettings` | native module (Turbo Native Module) | `getConstants` (`initialSettings`), `getSettings`, `onSettingsChange` (event)                                                                                                       | iOS          |
  | `AstryxHaptics`               | native module (Turbo Native Module) | `getConstants`, `isSupported`, `play`, `prepare`                                                                                                                                    | iOS, Android |
  | `AstryxClipboard`             | native module (Turbo Native Module) | `getConstants`, `isSupported`, `write`, `getString`, `setString`, `detectPatterns`                                                                                                  | iOS, Android |
  | `AstryxPlatformInfo`          | native module (Turbo Native Module) | `getConstants` (`app`, `capabilities`, `components`, `contractFeatures`, `launch`), `getInfo`, `getMemory`, `getBundleSize`                                                         | iOS, Android |
  | `AstryxPermissions`           | native module (Turbo Native Module) | `getConstants`, `get`, `request`                                                                                                                                                    | iOS, Android |
  | `AstryxNetwork`               | native module (Turbo Native Module) | `getConstants`, `getState`, `onNetworkChange` (event), `getCookies`, `listCookies`, `setCookie`, `removeCookie`, `clearCookies`, `getDomainInfo`, `redirectModes`, `fetchUntrusted` | iOS, Android |
  | `AstryxBack`                  | native module (Turbo Native Module) | `getConstants`, `setRootBackEnabled`                                                                                                                                                | Android      |
  | `AstryxFilePicker`            | native module (Turbo Native Module) | `getConstants`, `getSources`, `pick`                                                                                                                                                | iOS, Android |
  | `AstryxStorage`               | native module (Turbo Native Module) | `getConstants`, `getItem`, `setItem`, `removeItem`, `getAllKeys`, `clear`, `getInfo`, `clearProjectData`                                                                            | iOS, Android |
  | `AstryxCrypto`                | native module (Turbo Native Module) | `getConstants`, `randomBytes` (synchronous)                                                                                                                                         | iOS, Android |
  | `AstryxLaunch`                | native module (Turbo Native Module) | `getConstants`, `firstContent`, `initialURL`                                                                                                                                        | Android      |

- **FR2 — Constants are synchronous; everything else is a result.**
  - What the system knows at launch is a constant that the wrapper reads once
    per module and keeps: the saved appearance and the run's override, the
    accessibility snapshot, the app's version, build, identifier and install
    time, the linked capabilities, the component revisions, the named contract
    features, and the process start. Synchronous members (`isAvailable()`,
    `version()`, `getOverride()`, `getRunOverride()`, `current()`, `app`,
    `capabilities`, `launch`, `componentRevision(name)`) never throw; they
    answer `null`, `'system'`, or all-false where the module or the constant is
    absent.
  - Every asynchronous call resolves `AstryxResult` and never rejects
    (`spec:AST-112/FR6`). Each module adds only these reasons to the common
    ones:

    | Module                        | Module reasons                                                                                                                                                            |
    | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `AstryxAppearance`            | `invalid` (not `light`, `dark` or `system`)                                                                                                                               |
    | `AstryxAccessibilitySettings` | `unavailable` (the module is torn down during a reload)                                                                                                                   |
    | `AstryxClipboard`             | `unavailable` (no pasteboard on this device)                                                                                                                              |
    | `AstryxPlatformInfo`          | `unavailable` (the system did not answer a measure)                                                                                                                       |
    | `AstryxPermissions`           | `unknown-permission`, `busy`, `no-activity` (Android), `not-declared`                                                                                                     |
    | `AstryxFilePicker`            | `unsupported-source`, `no-window`, `busy`; `cancelled` when the person backs out                                                                                          |
    | `AstryxStorage`               | `invalid-key`, `invalid-value`, `invalid-json`, `no-space`, `io`, `no-namespace`; `invalid-url` for `clearProjectData`                                                    |
    | `AstryxNetwork`               | `unavailable`, `invalid-url`, `invalid-host`, `invalid-cookie`; for `fetchUntrusted`: `invalid-request`, `redirect-refused`, `timeout`, `too-large`, `network`, `aborted` |

  - `AstryxCrypto` is the one synchronous exception: its methods return
    bytes or throw, as Web Crypto's do (FR15).
  - `AstryxHaptics.play` and `prepare` return nothing: they play or do nothing,
    and `isAvailable()` says which. `AstryxBack` and `AstryxLaunch` calls
    return nothing either; they are hints that the native side may ignore.
  - In a Preview project's runtime, a call that acts for the host app
    (`setOverride`, `fetchUntrusted`, `getMemory`, `getBundleSize`,
    `clearProjectData`) answers
    `not-allowed`, and a refused clipboard read or write or camera consent
    answers `not-allowed` too. `AstryxBack` and `AstryxLaunch` change nothing
    there.

- **FR3 — Change events start with the first subscriber and stop after the
  last.**
  - `AstryxAccessibilitySettings.subscribe` and `AstryxNetwork.subscribe` call
    the listener with each real change, never with the current value, and
    return the unsubscribe function. A native event that repeats an unchanged
    value is not delivered.
  - One process-wide store per module listens to the native event while at
    least one subscriber exists. After the last unsubscribe it removes the
    native subscription, and the next read starts again from the constants.
  - On its first subscriber, the accessibility store reads `getSettings` once
    to resync. An event that arrives before that answer wins, because it is
    newer.
  - Hooks (`useAccessibilitySettings`, `useNetworkState`, `useCameraPermission`)
    subscribe on mount, remove the subscription on unmount, and return stable
    callbacks (`spec:AST-112/FR7`). `useNetworkState` reports `loading`,
    `ready` or `unavailable`. `useCameraPermission` reads again when the app
    returns to the foreground, because the person may change the permission in
    Settings.
  - `AstryxPermissions.subscribe` delivers each state change the package
    learns from a `get` or a `request` anywhere in the app.

- **FR4 — `AstryxAppearance` keeps the app's light or dark choice natively.**
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
  - `setOverride(value, {persist: false})` (feature `persist-false`) applies the
    choice for this run only and saves nothing. `getOverride()` and the next
    launch keep the saved choice, and `setOverride(getOverride())` restores
    it.
  - `getRunOverride()` (feature `run-override`) answers the run's own override
    synchronously, or `null` when the saved choice is in force, so the first
    render matches the first frame.
  - With the configuration plugin's `appearance.launchLinkParameter` set
    (default: off), a link on one of the app's own schemes whose named query
    parameter is `light`, `dark` or `system` applies that appearance natively
    as a run-only override: before the first frame on a cold launch, and on
    arrival on a warm one (feature `launch-link`). Nothing is saved.
  - In a Preview project's runtime, `getOverride()` answers `'system'`,
    `getRunOverride()` answers `null`, and `setOverride` answers `not-allowed`:
    a project cannot change the appearance of the app that hosts it.

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
    Keys `AccessibilityInfo` cannot read stay false.
  - The snapshot has no key for Liquid Glass's Clear or Tinted look, because the
    system gives apps no way to read that setting. Native glass follows it;
    drawn chrome does not.

- **FR6 — `AstryxHaptics` plays the platform's feedback kinds.**
  - `play(kind)` plays one of UIKit's nine kinds: `selection`, `impactLight`,
    `impactMedium`, `impactHeavy`, `impactSoft`, `impactRigid`,
    `notificationSuccess`, `notificationWarning`, `notificationError`. iOS plays
    it with a prepared feedback generator; `prepare(kind)` warms the generator
    so the next `play` has no delay.
  - Android plays a chain of `HapticFeedbackConstants` names, in order of
    preference, on the root view of the activity in front: the first name the
    device's API level knows. Each kind has a default chain; `play(kind, {android})` passes another.
  - `isAvailable()` is false where the module is absent or `isSupported()` is
    false (no haptic hardware, or no window). `play` and `prepare` do nothing
    then.
  - The library maps its moments (select, toggle, edge, threshold arm and
    disarm, commit and others) to kinds through the theme's haptic tokens, each
    matched to the iOS control that plays it. A theme's `native.haptics`
    overrides a token, and `'none'` silences it.

- **FR7 — `AstryxClipboard` reads and writes plain text.**
  - `write({text})` replaces the pasteboard's content and answers `ok` once the
    text is there. `setString(text)` is its deprecated alias.
  - `getString()` answers `{value}`, with `null` for an empty or non-text
    pasteboard. A read shows the system's paste notice on iOS 16 and later and
    Android 12 and later, so the library reads only on the person's action
    (`PasteButton`); copy buttons never read.
  - `detectPatterns(['webURL' | 'webSearch' | 'number'])` answers whether the
    pasteboard probably holds each pattern, without reading the content and
    without a paste notice. The answer omits every pattern the platform cannot
    test: Android tests only for a web URL, and only from Android 12.
  - `isAvailable()` is false where the module is absent or `isSupported()` is
    false; calls then answer `no-module` or `unavailable`.

- **FR8 — `AstryxPlatformInfo` says what this binary has.**
  - Constants: `app` (version, build, identifier, and `installedAt` in ISO
    8601 UTC: the bundle container's creation date on iOS,
    `PackageInfo.lastUpdateTime` on Android), `capabilities` (the opted-in
    capabilities this binary links; `[]` for core only), `components` (each
    native component's revision), `contractFeatures` (the named contract
    features, FR18), and `launch` (`processStartedAt` in epoch milliseconds,
    and `isPrewarmed`, always false on Android). `packageVersion` is the
    JavaScript package's version.
  - `get()` answers the platform, the calling runtime's namespace (`app` or a
    Preview project's), the components, the per-platform feature rows
    (`<capability>.<behaviour>`, with `isSupported` and a note), and the
    self-checks of the platform internals the package relies on (`compat`).
    `supports(name)` reads a feature row from the last answer and is `null`
    while it is unknown.
  - `memory()` answers the process's memory in bytes, counted the way each
    platform counts it (iOS `phys_footprint`, Android total PSS); the iOS and
    Android numbers do not compare. `bundleSize()` answers the installed app's size on disk, read
    off the main thread.
  - A Preview project's runtime gets no `launch`, an empty `installedAt`, and
    `not-allowed` from `memory()` and `bundleSize()`: a project cannot read
    facts about the app that hosts it.

- **FR9 — `AstryxPermissions` reads and asks explicitly.**
  - `get(name)` never prompts. `request(name)` shows the system prompt only for
    `undetermined` (and Android `denied`), then answers the state; otherwise it
    answers the current state at once. Mounting a view never prompts
    (`spec:AST-112/FR7`).
  - `name` is a closed set (`camera`). The states are `granted`,
    `undetermined`, `denied` (refused; the app may ask again) and `blocked`
    (the person can change it in Settings only: iOS `denied` or `restricted`,
    Android "don't ask again").
  - `hasHardware` says whether the device has the hardware: false on the iOS
    Simulator and an emulator without a camera; `null` where the platform does
    not say.
  - A permission the app did not declare answers `not-declared` and shows no
    prompt; the configuration plugin declares it when the app opts the
    capability in (`spec:AST-112/FR4`).
  - Where the module is absent, Android answers through React Native's
    `PermissionsAndroid` (which reads `undetermined` until a `request` in this
    run learns of a refusal), and iOS answers `no-module`.

- **FR10 — `AstryxNetwork` reports the network path.**
  - `getState()` answers `isConnected`, `type` (`wifi`, `cellular`,
    `ethernet`, `other`, `none`, `unknown`), `isMetered`, and `isConstrained`
    (iOS Low Data Mode, Android Data Saver for this app). `connected`,
    `expensive` and `constrained` are deprecated aliases.
  - `isConnected` is true when the device has a default route to the
    internet: on iOS a satisfied path from the path monitor, on Android a
    default network with the INTERNET capability. It says nothing about whether
    a server answers: it is true behind a captive portal, where requests still
    fail.
  - On Android the reads need `ACCESS_NETWORK_STATE`, which the configuration
    plugin writes for the core; without it, `getState()` answers `unavailable`
    and names the permission.
  - The module also carries the calling runtime's cookie jar (`AstryxCookies`:
    `get`, `set`, `remove`, `clear`; an `httpOnly` cookie's value never reaches
    JavaScript), a host's public suffix and registrable domain
    (`getDomainInfo`), whether the runtime's request handler honours `fetch`'s
    redirect modes (`redirectModes`), and one HTTPS request from a client with
    no identity, cookies or cache that follows no redirect natively
    (`fetchUntrusted`; `supports('fetchUntrusted')`). Their contracts belong with
    the data and security modules (OQ2).

- **FR11 — `AstryxBack` gives Android's root back press to the system when
  JavaScript cannot use it.**
  - The library's back registry tells the native side whether JavaScript can
    consume a back press at the root: a registered consumer (an open
    sheet, menu or search field), a `BackHandler` listener, or a navigator that
    can go back. The shell activity enables its one back callback only then.
  - With nothing to consume, the system takes the press and plays its
    back-to-home animation (Android 16 predictive back).
  - Until the library reports for the first time, and after its runtime stops,
    back presses go to React Native unchanged.
  - The registry sends a value only when it changes. A Preview project's
    runtime changes nothing. iOS has no module: back is native there.

- **FR12 — `AstryxLaunch` hands Android's cold launch to the first content.**
  - The shell activity keeps the system's launch window (the splash screen on
    API 31 and later, the window background before) until the library calls
    `firstContent()`, so no blank frame appears between the launch window and
    the first screen. When no call arrives within 2.5 seconds, it shows the app
    anyway.
  - The library calls it once per runtime: from the router's first focused
    screen's first content layout, or from `AstryxPerformance.markFirstFrame`,
    whichever comes first. Later calls do nothing.
  - `initialURL()` answers the launch link synchronously (what
    `Linking.getInitialURL()` answers), or `null` when the app launched
    without one. The router builds its first state from it, so a cold deep
    link draws its own screen first. Where the platform cannot answer
    synchronously (iOS, an absent module, a Preview project's runtime), the
    router reads `Linking.getInitialURL()`.
  - iOS has no module: its launch screen stays until the first frame.

- **FR13 — `AstryxFilePicker` presents the system's pickers.**
  - `sources()` lists what the device offers, in menu order: `photos` and
    `files`. It is empty where the module is absent. Camera capture is the
    `camera` capability's (`./camera` entry), never a source of the core
    picker, so the core needs no camera permission or usage string.
  - `pick({source, isMultiple?, limit?, media?, accept?})` presents one picker
    over the calling surface and resolves `{ok: true, files}` with at least
    one file, `cancelled` when the person backs out, or a reason: a source the
    device does not offer answers `unsupported-source` at once with the
    platform's message, and a second picker while one is open answers `busy`.
    Each file has `uri`, `name`, `size` (`-1` when the provider does not say)
    and `type`.
  - iOS: `photos` is `PHPickerViewController` (out of process, so no photo
    library permission) and `files` is `UIDocumentPickerViewController`. Each picked file is copied into the
    app's temporary directory and returned as a `file://` URL; the photo
    picker closes before it loads and copies, and `events.onLoading` reports
    that loading step.
  - Android: `photos` is the Photo Picker (the document picker on devices
    without it) and `files` is the Storage Access Framework; the `content://`
    URIs the pickers grant are returned as they are.
  - Defaults: one file, the platform's limit, the media `accept` allows (else
    all), and any file type.
  - The library's `FileInput` reaches it through `useFilePicker()`.
  - FR13 gap: on iOS the core picker offers a `camera` source
    (`UIImagePickerController`) and answers its `permission-denied` and
    `restricted` reasons.

- **FR14 — `AstryxStorage` is the runtime's string key-value store.**
  - `get(key)` answers `{value}`, with `null` for a missing key; `set`,
    `remove`, `keys({prefix?})` and `clear({prefix?})` complete the store;
    `getJSON` and `setJSON` parse and serialize (`invalid-json`). `info()`
    answers the namespace, the key count, the bytes the store takes on disk,
    and the free space (`null` when the platform does not say).
  - Every call works in the calling runtime's namespace, decided natively and
    never by JavaScript: `app` for the app's own runtime, and a namespace of
    its own for each Preview project, so a project never reads the app's data
    or another project's.
  - Values are kept across launches: one file per key in Application Support
    on iOS and in the app's internal files directory on Android. The package
    sets no size limit; only the device's free space limits a value.
  - `clearProjectData(bundleUrl)` is for the app's runtime only: it removes
    everything one Preview project stored, in every store that registers a
    clearer with the core, and answers the cleared namespace. A project's web
    view data goes through the `web` capability's own clearer where that
    capability is linked, and `isWebDataCleared` says whether it went. A Preview project's call, or the app's own bundle URL,
    answers `not-allowed`; a value that is not a URL answers `invalid-url`.
  - The router's state persistence uses it as its default store, and the
    update check keeps its "Not now" in the app's namespace.

- **FR15 — `AstryxCrypto` gives secure random bytes synchronously.**
  - `randomBytes(byteLength)`, `getRandomValues(array)` and `randomUUID()`
    take their bytes from the system's secure generator (iOS
    `SecRandomCopyBytes`, Android `java.security.SecureRandom`). They are
    synchronous, because Web Crypto's `getRandomValues` is, and code written for
    it expects the bytes at once.
  - They follow Web Crypto's rules and errors: at most 65,536 bytes per call
    (`QuotaExceededError`), integer typed arrays only (`TypeMismatchError`).
    Where the module is absent they throw `NotSupportedError`; there is never
    a non-secure fallback.
  - The crypto installer of `spec:AST-112/FR5` (`./network` entry) installs
    `crypto.getRandomValues` and `crypto.randomUUID` from this module where
    the runtime lacks them, and installs nothing and reports `no-module`
    without it.

- **FR16 — Threads and lifecycle.**
  - Constants are read on the JavaScript thread once per module, at the first
    call that needs them. Asynchronous calls do their native work off the
    JavaScript thread, and a measure that walks files (`bundleSize()`) runs off
    the main thread.
  - The appearance override and the root back gate act on the UI thread at
    once; neither waits for a JavaScript round trip per frame.
  - Native events reach JavaScript on the JavaScript thread, once per real
    change.
  - A module torn down during a reload answers `unavailable` until its runtime
    is back; a subscription made before the reload is removed with its store.

- **FR17 — Accessibility.**
  - The library's drawn chrome follows the snapshot of FR5: Reduce
    Transparency makes drawn glass and materials opaque, Increase Contrast and
    Show Borders strengthen edges, Bold Text reaches drawn text and symbols,
    and Reduce Motion with `prefersCrossFadeTransitions` replaces motion with
    cross-fades within the limits of `spec:AST-108`. The theme's style helper
    gives every key to component styles.
  - Haptic feedback is never the only signal: each moment goes with a visual
    change, and a copy also announces "Copied" through the status
    announcements of `spec:AST-086`.
  - These modules expose nothing to VoiceOver or TalkBack themselves; they have
    no view.

- **FR18 — Every contract is at revision 1; later behaviour is a named
  feature.**
  - Every contract in the group reports revision 1. A behaviour added after
    revision 1 is a named feature, `<Contract>.<feature>`, that the binary
    lists in `AstryxPlatformInfo`'s `contractFeatures` constant. JavaScript
    checks it with `hasContractFeature` before it uses the behaviour.
  - The group's named features are `AstryxAppearance.persist-false`,
    `AstryxAppearance.run-override` and `AstryxAppearance.launch-link`. The
    `contractFeatures` constant is the list itself and adds no behaviour.
  - Without a feature, JavaScript keeps the revision-1 behaviour or answers
    `unsupported`, never a silently weaker path: `setOverride` with
    `persist: false` answers `unsupported` and saves nothing,
    `getRunOverride()` answers `null` (such a binary has no run-only override),
    and a missing feature is reported once with a development warning.
  - Astryx Stage pairs with the package through the library's Stage version
    floor: the package names the oldest Astryx Stage that implements its
    contract set, and an older Astryx Stage refuses the project with the gaps
    listed.

- **FR19 — Astryx Stage simulates each module.**
  - `AstryxAppearance`: the saved choice per app in Astryx Stage's data folder,
    applied before the first frame; a run-only override in memory, which a new
    run forgets.
  - `AstryxAccessibilitySettings`: the run's device settings, set by
    arguments and changed live, delivered as the same snapshot and event.
  - `AstryxHaptics`: present and supported; each `play` is a trace entry that
    names the kind or the Android constant, and plays nothing.
  - `AstryxClipboard`: an in-memory string; `detectPatterns` classifies it
    without handing it back; Preview reads ask as on a device.
  - `AstryxPlatformInfo`: Astryx Stage's own app identity, its component
    revisions, linked capabilities, feature rows, launch, memory and size.
  - `AstryxPermissions`: `undetermined` until `request`, which draws a prompt;
    an argument starts it granted; `hasHardware` is false, as on the
    Simulator.
  - `AstryxNetwork`: a default route exists and the path is never metered;
    cookies in a jar per namespace; `fetchUntrusted` from a client of its own
    with no identity and no redirect following.
  - `AstryxFilePicker`: the photo and document pickers.
  - `AstryxStorage`: one store per namespace in Astryx Stage's data folder,
    counted the same way as on a device; a headless run starts empty.
  - `AstryxCrypto`: the operating system's secure generator.
  - `AstryxBack` and `AstryxLaunch` are absent, as on iOS: the library takes
    its no-module path, every back press goes to React Native, and the first
    frame draws with no launch hold (OQ4).

- **FR20 — Public platform API only, and no web engine in the core.**
  - The native code of every module in the group uses public platform API
    only; the group needs no exception.
  - No core module links WebKit (iOS) or androidx.webkit (Android). Web view
    data and the web view's cookie store belong to the `web` capability
    (`spec:AST-112/FR3`), which registers what the core needs through the
    core's registration hooks (`spec:AST-112/FR2`).
  - FR20 gap: on iOS the core's project-data clear removes web view data
    through WebKit, and on Android the core's cookie API reaches the cookie
    store through androidx.webkit.

### Platform support

| Contract                      | iOS                                                                                               | Android                                                                                            | Astryx Stage                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `AstryxAppearance`            | `overrideUserInterfaceStyle` on every window of the app's scenes                                  | AppCompat default night mode at process start                                                      | Saved file and in-memory run override (FR19)     |
| `AstryxAccessibilitySettings` | UIKit accessibility status and notifications; the Accessibility framework for 26.1 and later keys | No module; `AccessibilityInfo` fallback (FR5)                                                      | Device settings from the run (FR19)              |
| `AstryxHaptics`               | `UIFeedbackGenerator` subclasses, prepared and cached                                             | `HapticFeedbackConstants` on the activity's root view, by API level                                | Trace entries; no feedback                       |
| `AstryxClipboard`             | `UIPasteboard`, with pattern detection                                                            | `ClipboardManager`; the clip description's URL confidence on Android 12 and later                  | In-memory string                                 |
| `AstryxPlatformInfo`          | Bundle info, `sysctl` process start, `ActivePrewarm`, `task_vm_info`                              | `PackageInfo`, `Process.getStartElapsedRealtime()`, `Debug.MemoryInfo`, APK sizes                  | Astryx Stage's own identity and tables           |
| `AstryxPermissions`           | `AVCaptureDevice` authorization                                                                   | Runtime permission with its "don't ask again" state; `PermissionsAndroid` without the module       | Drawn prompt; `undetermined` until asked         |
| `AstryxNetwork`               | `NWPathMonitor`; `NSHTTPCookieStorage`; an ephemeral `NSURLSession` for `fetchUntrusted`          | `ConnectivityManager` default network callback; the runtime's cookie store; a separate HTTP client | Default route; per-namespace jar; its own client |
| `AstryxFilePicker`            | `PHPickerViewController`, `UIDocumentPickerViewController`                                        | Photo Picker, Storage Access Framework                                                             | Photos and files pickers                         |
| `AstryxStorage`               | One file per key in Application Support                                                           | One file per key in the internal files directory                                                   | One store per namespace in its data folder       |
| `AstryxCrypto`                | `SecRandomCopyBytes`                                                                              | `java.security.SecureRandom`                                                                       | The operating system's generator                 |
| `AstryxBack`                  | No module (native back)                                                                           | `OnBackPressedCallback` on the shell activity, enabled by the gate                                 | Absent (FR19)                                    |
| `AstryxLaunch`                | No module (the launch screen stays until the first frame)                                         | The shell activity holds the launch window; synchronous launch intent data                         | Absent (FR19)                                    |

- FR19 gap: Astryx Stage reports no `contractFeatures` list, and its
  `AstryxAppearance` has no `getRunOverride` and no launch link.
- Supported feature/engine floor: the platform floor of `spec:AST-112`
  (iOS at React Native's minimum, Android API level 24, the New Architecture
  only). Settings that newer OS versions add (Reduce Bright Effects, Show
  Borders, Android 12 pattern detection, Android 16 predictive back) read
  false, stay out of an answer, or keep the older behaviour below them.
- Unsupported behavior: an absent module answers `no-module` and its
  synchronous members answer their empty values (FR2); a missing named feature
  answers `unsupported` or keeps the revision-1 behaviour (FR18); a
  platform-only module is absent on the other platform, and the library takes
  the path FR5, FR11 and FR12 name.
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`); haptic feel needs
  a real device.

## Current-state impact

- This record details `spec:AST-112`: its FR1 (the core's system modules), FR5
  for the crypto installer's module, FR6 and FR7 for each module's results and
  probes, FR8 for the revision-1 baseline and named features, FR9 for the
  haptic moment mapping, and FR12 for Astryx Stage's simulation.
- It changes `spec:AST-112/FR1` in one place: the `camera` capability gains
  camera capture, the camera source of the file picker included (FR13).
- `spec:AST-112/FR1` and FR3 gain one rule: the core links no web engine, and
  the `web` capability carries web view data and its cookie store (FR20).
- The rest of the split between core and opt-in capabilities does not change
  for this group: every module in it is core.

## Verification

| Contract | Verification                                                                                                                         | Representative states                                                                              | Mutation or failure expectation                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The platform's spec rules check; the contracts list                                                                                  | each module's spec; a platform-only module                                                         | A module read with `getEnforcing`, read outside its wrapper, or missing from the contracts list                                     |
| FR2      | Unit tests through the `./testing` doubles in absent, older and current shapes                                                       | each synchronous member; each call; a native throw; a Preview runtime                              | A synchronous member throws, a call rejects, or answers a reason outside its set                                                    |
| FR3      | Unit tests of each store and hook                                                                                                    | first subscriber; last unsubscribe; an event before the resync answer; unmount; foreground         | A listener hears the current value, a repeat, or a change after unsubscribe; a native subscription outlives the last subscriber     |
| FR4      | Unit tests; Simulator and emulator launches with a saved choice opposite the system; a run-only change and a relaunch; a launch link | saved `dark` under a light system; `persist: false`; launch link cold and warm; Preview runtime    | The first frame shows the system's style, a run-only change survives a relaunch, or a Preview project changes the host's appearance |
| FR5      | Unit tests of the snapshot and the fallback; Simulator runs per setting; Astryx Stage settings suites                                | each key on and off; Android; module absent                                                        | A key missing, an unchanged snapshot delivered, or the first frame drawn before the snapshot                                        |
| FR6      | Unit tests of the moment table and the Android chain; a device check of feel                                                         | each kind; an API level without the preferred constant; no hardware; a theme token `'none'`        | A kind plays the wrong constant, plays where unavailable, or a silenced token plays                                                 |
| FR7      | Unit tests; Simulator and emulator copy and paste; Astryx Stage clipboard suites                                                     | write; empty read; non-text read; pattern detection on Android 11 and 12                           | A copy button reads, a detection reads the content, or an unknown key is answered                                                   |
| FR8      | Unit tests; Astryx Stage platform-info suites; Simulator and emulator reads                                                          | constants; `get()`; memory and size; Preview runtime                                               | A Preview project reads the host's launch, memory or size, or a constant throws                                                     |
| FR9      | Unit tests; Simulator and emulator prompts; Astryx Stage permission suites                                                           | each state; undeclared permission; a busy prompt; module absent on each platform                   | A mount prompts, a `blocked` permission prompts, or an undeclared permission crashes                                                |
| FR10     | Unit tests; emulator and Simulator network changes; Astryx Stage network suites                                                      | Wi-Fi, cellular, none; captive portal; Low Data Mode; missing Android permission                   | `isConnected` differs between platforms for the same route, or a missing permission answers anything but `unavailable`              |
| FR11     | Unit tests of the registry; emulator runs on Android 16                                                                              | an open sheet; a navigator that can go back; the root; before the first call                       | The back-to-home animation does not play at the root, or a press with a consumer reaches the system                                 |
| FR12     | Unit tests of the once-per-runtime report and the synchronous link; emulator cold launches                                           | a launch with and without a link; a launch that never reports; a Preview runtime                   | An empty root frame shows before the first content, the hold never ends, or a cold deep link draws another screen first             |
| FR13     | Unit tests through the `./testing` doubles; Simulator and emulator picks; Astryx Stage picker suites                                 | each source; multiple; cancel; a source the device does not offer; a second pick while one is open | A cancel reads as an error, an empty `ok` list, a camera source in the core picker, or two pickers at once                          |
| FR14     | Unit tests through the `./testing` doubles; Simulator and emulator runs; Astryx Stage storage suites                                 | the app's runtime and a Preview project's; a full disk; a project removed                          | One namespace reads another's data, a Preview project clears a project, or a cleared project leaves data                            |
| FR15     | Unit tests of the bytes, errors and installer; Simulator and emulator reads                                                          | 0 and 65,536 bytes; above the ceiling; module absent; an existing `crypto`                         | A non-secure fill, a call that does not throw Web Crypto's error, or an installer that replaces an existing function                |
| FR16     | UI-thread frame checks during an appearance change; reload tests                                                                     | appearance change while scrolling; a reload with subscribers                                       | JavaScript runs per frame for the change, or a subscription survives a reload                                                       |
| FR17     | Simulator runs per accessibility setting; announcement tests                                                                         | Reduce Transparency; Show Borders; Reduce Motion; a copy                                           | Drawn chrome ignores a setting, or a copy confirms with haptics alone                                                               |
| FR18     | The platform's spec rules check; unit tests with a binary that lacks each feature                                                    | each named feature present and absent; an older Astryx Stage                                       | A behaviour runs without its feature, a missing feature answers anything but the revision-1 path or `unsupported`, or no warning    |
| FR19     | Astryx Stage contract suites against the Simulator and emulator results                                                              | each module's suite                                                                                | An Astryx Stage answer differs from iOS and Android and its documentation does not name it                                          |
| FR20     | Binary symbol and linked-framework check of a core-only build; review of each native change for private API                          | a core-only iOS and Android build                                                                  | WebKit or androidx.webkit linked into a core-only build, or a private API call in the group's native code                           |

## Decision log

### DEC-1 — The appearance choice is native, applied before the first frame

**Reference:** `spec:AST-130/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A choice that JavaScript applies arrives after the first frame, so a saved
choice opposite the system shows the system's style first and then
cross-fades. The native shell saves the choice and applies it to the window
before it shows; run-only changes and the launch link use the same path and
save nothing.

Rejected: applying the choice from JavaScript at start, because the first
frame cannot follow it.

### DEC-2 — Accessibility settings are one snapshot with a fallback

**Reference:** `spec:AST-130/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Drawn chrome needs every setting that native glass and system bars follow, in
the first frame, so the module publishes them together as constants and one
event. Where the module is absent, React Native's `AccessibilityInfo` answers
the keys it can, so the library never needs two code paths.

### DEC-3 — Android's root back press belongs to the system unless JavaScript can use it

**Reference:** `spec:AST-130/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Predictive back plays only when the activity does not intercept the press.
The library knows whether anything can consume it, so it publishes that fact
and the activity follows; the system then plays its own back-to-home
animation at the root.

Rejected: a JavaScript handler that exits the app, because the system's
animation cannot play from it.

### DEC-4 — The library ends the Android launch hold

**Reference:** `spec:AST-130/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

The router knows when the first screen has content, so it releases the launch
window with no app code, and a time bound keeps a broken launch visible. The
launch link is read synchronously so the router's first state is the linked
screen.

Rejected: an app-called hide, because every app would need the step and a
missed call holds the splash.

### DEC-5 — Thin modules stay dependency-free wrappers

**Reference:** `spec:AST-130/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Haptics, the clipboard, permissions, the file pickers, storage, secure random
bytes and network state are small wrappers
where the ecosystem has good libraries. They stay in the core because the
package takes no runtime dependency outside React and React Native
(`spec:AST-112/FR2`), and because each needs the result vocabulary, the
Preview policy and an Astryx Stage simulation. OQ1 keeps the scope open.

## Open questions

- **OQ1 — Do the thin system modules stay Astryx modules?** (`human-design`)
  `AstryxHaptics`, `AstryxClipboard`, `AstryxPermissions`, `AstryxFilePicker`,
  `AstryxStorage`, `AstryxCrypto` and the network state of `AstryxNetwork`
  fill little capability gap. Options: keep them as
  core modules (one dependency set, one result shape, Astryx Stage parity); or
  replace their native side with adapters over community libraries
  (`expo-haptics`, `expo-clipboard`, `react-native-permissions`,
  `expo-document-picker`, `@react-native-async-storage/async-storage`,
  `react-native-get-random-values`, `@react-native-community/netinfo`),
  keeping the wrappers' API.
- **OQ2 — Do cookies, domain info, redirect modes and `fetchUntrusted` move to
  the data and security group?** (`human-design`) They are methods
  of `AstryxNetwork`, no Astryx component calls them, and their rules
  (per-runtime jars, values that stay native, requests with no identity)
  are data and security contracts. The library's marker for content-chosen
  image and media URLs belongs to the same question. Options: a separate
  module in that group, with `AstryxNetwork` keeping only the path state; or
  one module whose contract this record shares with that group's record.
- **OQ3 — Do the app-API-only modules stay in this group and the core?**
  (`human-design`) No Astryx component calls `AstryxAppearance`,
  `AstryxPermissions` (used by the `./camera` and `./microphone` entries),
  `AstryxNetwork` or `AstryxCrypto` (used by the crypto installer). Options: keep them in the core with this record; or move
  each to the entry that uses it.
- **OQ4 — Does Astryx Stage simulate the Android root back gate and launch
  hold?** (`checkable`) Options: keep both absent, as FR19 states; or simulate
  the back-to-home animation at the root and a launch window held until the
  first content.
