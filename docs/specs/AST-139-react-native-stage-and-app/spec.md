---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-139
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

# React Native: Astryx Stage and the Astryx app system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

Two products sit beside the React Native packages of `spec:AST-112`. Both run
an app's own JavaScript instead of a copy of it, and both conform to Astryx
React Native's contracts and never define them. `@astryxdesign/react-native`
depends on neither: an app builds and runs on its devices with no Stage and no
Preview, and it may use third-party libraries and another router beside the
package.

**Astryx Stage** is a desktop app for developers and their agents. It runs the
real JavaScript of an app built with `@astryxdesign/react-native` and renders
it with an iOS or Android look, with no simulator, emulator, or device. A
developer opens the app in a window and uses it by hand; an agent or a
continuous-integration job runs it headless and gets a picture, a step report,
the accessibility tree, logs, and timings as data. Stage answers the
platform's native contracts as iOS and Android do, so a screen that renders
and behaves in Stage is the screen the developer expects on a device, and
every place where it differs says so.

**The Astryx app** is the native iOS and Android app for Astryx React Native.
It shows every component running natively, with live examples, example apps,
the themes, and an inspector. It is also the Preview host: a person opens a
project from a developer's computer or from a hosted bundle, and the project
runs inside the app on a real phone, without building or installing anything.

Preview is the same feature in both places. A project opened in the Astryx app
and the same project run in Astryx Stage start from the same bundle, check the
same native requirements, and get the same limits on what they may reach.
This record owns the `astryx rn stage …` and `astryx rn preview …` commands, the
Preview policy per module, and Stage's notes per module.

## Why this exists

Simulators and emulators need a native build per change and a Mac or a
virtual machine, and they give an agent no picture, accessibility tree, and
step report as data in one command. Expo Go cannot load the platform's native
code (`spec:AST-112/FR11`), and web previews render web components instead of
the native contracts. Astryx Stage gives developers and agents the app's real
screens and behavior on the platform's contracts from any desktop, headless or
in a window, and the Astryx app opens a project that uses only Astryx's native
code on a real phone with no build. Both follow the contracts that the
platform's records define, so Astryx React Native itself stays the same with
or without them.

## Who uses it

| Who                                    | Astryx Stage                                                                                                          | The Astryx app                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A developer building an Astryx app     | Opens the app in a window beside the editor, switches iOS and Android looks, light and dark, text size, and RTL.      | Scans a QR code from `astryx rn preview` and uses the project on a real phone while it hot-reloads. |
| An AI agent working on an Astryx app   | Renders a route headless, taps through a scripted flow, reads the accessibility tree and logs, and checks the result. | None directly; the agent prints the Preview link for the person.                                    |
| A continuous-integration job           | Runs scripted checks and captures on Linux on every change, with stable reports and exit codes.                       | None.                                                                                               |
| A reviewer, designer, or product owner | Reads the pictures and reports an agent or a job attached.                                                            | Opens a hosted bundle from a link and tries the change on a phone.                                  |
| A person evaluating Astryx             | None.                                                                                                                 | Browses every component, the example apps, and the themes on a native app.                          |
| Astryx's own maintainers               | Checks every platform contract against the Simulator and emulator, and every documentation example.                   | Checks components on devices; the app's examples are the documentation's examples.                  |

## Non-goals

- How Astryx Stage and the Astryx app are implemented, built, and packaged.
  Only what an app, the CLI, a developer, and a person observe is in this
  record.
- Each native contract's behavior on iOS and Android. Its platform group
  record (`spec:AST-123` to `spec:AST-137`) states it; Stage matches it (FR6),
  and Preview limits what a project reaches of it (FR13).
- The React Native commands outside the `astryx rn stage` and `astryx rn preview`
  groups, and the rules every React Native command follows
  (`spec:AST-112/FR13`).
- How the Astryx app runs a project internally.
- The Astryx app's screen design, beyond the features a person can reach.
- macOS, Windows, and the web as targets for apps built with the packages
  (`spec:AST-112`).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

### Astryx Stage

- **FR1 — Stage runs the app's own JavaScript and renders it without a
  device.** Stage runs the same JavaScript bundle the app runs on a device,
  and its screens take the layout they take on a device. It renders with an
  iOS or an Android look. It runs on macOS, Linux, and Windows. It is a
  development tool: no app depends on it at run time, and
  `@astryxdesign/react-native` imports nothing from it.

  FR1 gap: Astryx Stage does not run on Windows.

- **FR2 — Stage has a window and a headless mode.**
  - In the window, a person uses the app with a pointer and a keyboard, and
    changes the render options while it runs.
  - Headless, a command produces, for one run: a capture (a picture of the
    final frame), a scripted check (a sequence of steps such as tap, type,
    scroll, swipe back, wait for an element, and capture, with a result per
    step), the accessibility tree and text queries over it, the run's logs,
    and its timings. Recording a run as a video is optional output.
  - Every headless result is one machine-readable report with a status. A
    JavaScript exception, a failed step, a start that throws, and a route the
    app does not take are failed results, never a picture of nothing.
  - A running headless session can be driven by later commands, and a command
    can drive an open window (FR8).
- **FR3 — The render options are the device's settings.** A run takes a
  platform profile (iOS-style or Android-style, with operating-system version
  presets), a device size, an orientation, light or dark appearance, a locale,
  right-to-left layout, a text size, the accessibility settings the platform
  contracts read (such as Reduce Motion, Reduce Transparency, Bold Text,
  Increase Contrast, and a screen reader), animation speed, network
  conditions, and a start route (FR8 names the options). The theme is the
  app's: Stage adds no theme default of its own.
- **FR4 — Stage runs a project from its sources or from a bundle.** It runs
  the local project through its dev server, with hot reload that keeps the
  app's state, or as a one-shot production bundle of the project. It also runs
  a prebuilt app bundle and its own built-in samples.
- **FR5 — Every result says what is simulated.** Each report lists what in it
  is not the device's own rendering or behavior: drawn look-alikes of system
  chrome, stand-in fonts, a system service that Stage records instead of
  performing (such as haptics or the share sheet), and every native view or
  module the project uses that Stage does not implement, by name. A
  difference Stage knows about is never silent.
- **FR6 — Stage conforms to Astryx React Native's contracts and never defines
  them.**
  - Astryx's own checks use the iOS Simulator, the Android emulator, and
    devices as the source of truth; Stage matches them, and a divergence is a
    Stage defect.
  - Every public platform API has a Stage simulation or is reported as not
    simulated (FR5). Each contract's documentation names where Stage's
    simulation differs from iOS and Android until the difference is fixed.
  - Each module answers its calls as the device of the chosen look does,
    in the calling runtime's namespace (FR12): its results, reasons, and
    named features. A module that iOS or Android does not have is absent in
    that look, as on the device.
  - Stage notes per module, where a module needs one:

    | Module (record)                                                                                                                          | In Stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
    | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, `AstryxScrollEdgeView` (`spec:AST-123`)                             | iOS looks: simulated Liquid Glass with grouping, materialize, layout spring, morph, and the press response; the system blur and hairline in the pre-26 look; neighbouring glass within `spacing` as one outline; the same material per variant and look; soft and hard edge bands over the target scroll view. Android looks: glass as a plain view, and no edge bands.                                                                                                                                                                                                                                                                                           |
    | Gestures and drag (`spec:AST-124`)                                                                                                       | Every view in both looks, `AstryxGestureRootView` in the iOS look. A held press lifts a drag item, which follows the finger or the pointer; snap rules are the device's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
    | Navigation hosts and `AstryxRouter` (`spec:AST-125`)                                                                                     | Stack and tab hosts, screens, header slots, and tab accessories in both looks. The address bar shows the host root's routes and opens paths through the router's snapshot (FR14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
    | Controls (`spec:AST-126`)                                                                                                                | Button and text field in both looks; slider and segmented control in the iOS look, absent in the Android look; a simulated date picker in the iOS look, whose module resolves each request with the request's value; the paste control in the iOS look from iOS 16.                                                                                                                                                                                                                                                                                                                                                                                               |
    | Icons and drawing (`spec:AST-127`)                                                                                                       | Local masks tinted, fitted, and mirrored; icon counts and `not-allowed` as on a device. On macOS the SF Symbol, elsewhere the drawn glyph with a close stroke. Vector scenes drawn as a device draws them; no system viewer, and the Large Content Viewer image in the accessibility output; the scene reader reports version 2.                                                                                                                                                                                                                                                                                                                                  |
    | Menus and presentation (`spec:AST-128`)                                                                                                  | A system menu look-alike (pull-down, context menu with the lifted area and dimmed backdrop, the preview card), which the Android look also draws; an action sheet look-alike, with no module in the Android look; sheets with their detents, drags, swipe dismissal, and status bar; modal windows in presentation order with `onShow`, `onDismiss`, and the escape's `onRequestClose`.                                                                                                                                                                                                                                                                           |
    | Layout, text, and keyboard (`spec:AST-129`)                                                                                              | Safe areas, the keyboard dock, and selectable text in both looks (word selection by long press or double tap, Copy, Select All); the window status bar in the Android look. The same `Intl` set as the device; a run reports at start each required member it lacks and each it only approximates.                                                                                                                                                                                                                                                                                                                                                                |
    | `AstryxAppearance`, `AstryxAccessibilitySettings`, `AstryxHaptics`, `AstryxClipboard`, `AstryxPlatformInfo` (`spec:AST-130`)             | The saved appearance per app, kept across runs and applied before the first frame, and a run-only override; the run's accessibility settings, changed live, with the same snapshot and event; each haptic in the run's trace, with no feedback; the clipboard as an in-memory string that `detectPatterns` classifies without handing it back; Stage's own app identity, revisions, and feature rows.                                                                                                                                                                                                                                                             |
    | `AstryxPermissions`, `AstryxNetwork`, `AstryxFilePicker`, `AstryxStorage`, `AstryxCrypto`, `AstryxBack`, `AstryxLaunch` (`spec:AST-130`) | Permissions start `undetermined` and a request draws a prompt (a run option starts one granted), and `hasHardware` is false, as on the Simulator; a default route that is never metered, cookies per namespace, and `fetchUntrusted` from a client with no identity that follows no redirect; the document picker, and a photo picker over a fixed set of sample images with thumbnails for them; one store per namespace, kept across runs, and empty at the start of a headless run; the system's secure generator; back and launch absent, as on iOS.                                                                                                          |
    | Web view (`spec:AST-131`)                                                                                                                | On macOS the page in the system's web engine, with the device's navigation, sessions, page storage, bundled folders, messages, and content-process end; `preventsCapture` ignored, as iOS does. `AstryxWebViewInfo` answers as the device it shows.                                                                                                                                                                                                                                                                                                                                                                                                               |
    | Media and camera (`spec:AST-132`)                                                                                                        | Players with the device's states, seeking, rate, volume, mute, and loop; sound in a window on macOS, and state without sound headless; `isBackgroundAvailable()` true. Video: on macOS the frame at the player's position with `contain` and `cover`, elsewhere a surface at the video's ratio; picture in picture unsupported. The camera view absent, as on a device with no camera.                                                                                                                                                                                                                                                                            |
    | Storage, identity, and files (`spec:AST-133`)                                                                                            | Secrets and identities per namespace, kept across runs and readable only by the person running Stage; no device lock, so `locked` never occurs; a protected read asks with the `prompt` in the iOS look, and `user-presence` is absent in the Android look; keys that are not hardware-backed; `system-identity` absent; a cache per namespace, downloads, a save dialog, and a share sheet. A secret reaches the launched project only through Stage's start, never the environment.                                                                                                                                                                             |
    | Web data and sign-in (`spec:AST-134`)                                                                                                    | Web sessions, web data, and web bundles as on a device wherever Stage shows a web view: the same sessions, page store, policy, bundled folders, and byte route. A sign-in opens in the desktop's browser. A flow whose `redirect_uri` uses the callback scheme comes back through a loopback redirect on `127.0.0.1` that accepts one request with the right path and state; on macOS a custom-scheme callback comes back through the system's sign-in sheet, and on Linux only while a sign-in with a state is open and only on a scheme the app declares. Headless, nothing opens and a script step supplies the callback. The routing checks are the device's. |
    | Photos and documents (`spec:AST-135`)                                                                                                    | A built-in library of placeholder photos and one video with fixed ids; the run sets the starting access and the prompt's answer; listing, cursors, export, and change events follow the platform Stage runs as. Thumbnails draw the asset's placeholder tile, `cover` or `contain`, with that platform's load size. The PDF view shows the document's own pages on macOS, with `fit`, `displayMode`, `pageGap`, `colorScheme`, `goToPage`, and the events as on a device. Image markup's refusals and their order are the device's.                                                                                                                               |
    | Capture (`spec:AST-136`)                                                                                                                 | No microphone: the permission starts `undetermined`, an ask answers with no drawn prompt, a recording is a playable silent file of the recorded length, and levels are silence unless a scripted check sets them. Barcodes decode from image files as on a device. Screen-capture holds keep their count with no window to flag in the Android look, and the module is absent in the iOS look.                                                                                                                                                                                                                                                                    |
    | Diagnostics (`spec:AST-137`)                                                                                                             | Crash reports present, with `isEnabled()` following the project's opt-in: an opted-in project's `list` answers no reports, an opted-out one's answers `not-declared`, and `crashForTest` answers `not-declared`, because Stage never crashes a project on purpose. Daily metrics present as on the iOS Simulator: `latest()` answers `metrics: null`, and the feature row reads false. The frame recorder in the iOS look in the app's own runtime, sampling what Stage draws at each displayed frame with the iOS sample shape; absent in the Android look and in a Preview project.                                                                             |

  FR6 gap: Astryx Stage reports no `contractFeatures` list, and its
  `AstryxAppearance` has no `getRunOverride` and no launch link.

  FR6 gap: in Astryx Stage the context menu does not play the lift
  animation, a held finger cannot slide onto a row, and `medium` row elements
  draw as a list.

  FR6 gap: Astryx Stage draws a keyboard dock's side-inset change with
  `animatesSideInsets` in one frame, and selects text by word and Select All
  with no selection-handle drags.

  FR6 gap: in Astryx Stage an app runtime's remote mask shows nothing and
  `prefetch` counts it without downloading it; symbol effects show in their
  end state without animation.

  FR6 gap: Astryx Stage shows `AstryxWebView` only on macOS (on Linux and
  Windows the view reports absent and the library draws its fallback), loads
  no page ahead of time (a `warm` bundle view loads its own page, and
  `warmBundle` is not listed), and ignores `preventsCapture` in an Android
  look.

  FR6 gap: Astryx Stage shows no Now Playing card and has no remote commands,
  interruptions, route changes, or background pausing; it reads real levels
  only from PCM WAV, where a multichannel file's level follows the channels'
  mean, and other formats answer a fixed synthetic waveform; it draws the bare
  picture for `controls: 'system'`.

  FR6 gap: Astryx Stage reports a download's progress only once, at the end,
  and presents a bound identity on a download only with
  `credentials: 'include'`.

  FR6 gap: Astryx Stage has no `AstryxPageSnapshots` (`isAvailable()` answers
  false), keeps no warm pages, and does not list `AstryxWebBundles.warmPages`.

  FR6 gap: on Linux and Windows, where Astryx Stage shows no web view,
  `AstryxWebData` answers `unavailable`, as on a device with no web engine,
  and web sessions and bundles register but no view shows them.

  FR6 gap: on Windows an Astryx Stage sign-in whose callback is a custom scheme
  does not come back; only a loopback redirect does, and the person ends any
  other sign-in with Cancel.

  FR6 gap: Astryx Stage writes an `original` photo as a JPEG, not in its
  stored format, and a video as a file that does not play.

  FR6 gap: Astryx Stage does not scroll or zoom inside the PDF view with a
  finger or trackpad, `resetZoom` does nothing, and a find answers
  `unsupported`, because it has no page text; on Linux and Windows it shows
  numbered placeholder pages instead of the document's.

  FR6 gap: Astryx Stage has no `AstryxPdfModule`, so `canRenderPage()` is
  false and `renderPage` answers `no-module`; it shows no markup screen, so a
  markup answers `cancelled` unless a script plays a save, which saves the
  source's pixels as the new file.

  FR6 gap: Astryx Stage has no `AstryxCrashReports` and no
  `AstryxDailyMetrics` module; their wrappers answer `no-module` there.

  FR6 gap: Astryx Stage simulates no audio session or audio focus and no
  Bluetooth input, and never answers `busy`, `no-activity`, or `no-input`.

- **FR7 — Stage pairs with a project by the package's version floor.**
  - Each release of `@astryxdesign/react-native` names the oldest Astryx
    Stage that implements its native contracts: the project's Stage version
    floor.
  - Stage declares the contracts it implements, by name, with its own
    version, and reports the named features each contract has in its binary
    (`spec:AST-112/DEC-14`). How it publishes the declaration is OQ3.
  - Before any of the project's JavaScript runs, a Stage below the floor
    refuses the project by itself. The refusal lists each contract it lacks
    and names the Stage version that has them. It never renders with a silent
    fallback.
  - A Stage at or above the floor runs the project, and a newer Stage renders
    a project on an older package.
  - A named feature that the Stage binary does not implement answers as an
    older device binary does: `supports(feature)` is false and the call takes
    its fallback or its refusal, so the project's JavaScript detects what is
    missing. The report lists it (FR5).
- **FR8 — `astryx rn stage` runs Stage from the Astryx CLI.**
  `@astryxdesign/react-native` contributes the group to the Astryx CLI with
  its other commands, and the group follows their rules
  (`spec:AST-112/FR13`): it asks no question, prints one envelope under
  `--json`, prints plain text otherwise, exits 0 or 1 the same in text and
  JSON, and its outcomes differ by `code`. `astryx rn stage` without a
  subcommand prints the group's help. It answers for one platform: the one
  `--platform` names, `ios` otherwise.

  | Command                         | Its one job                                                                                                                                         |
  | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `astryx rn stage open`          | Shows the app in a Stage window, and keeps running until the window closes or the process is stopped.                                               |
  | `astryx rn stage shot`          | Takes one capture of the app and writes it with the run's report.                                                                                   |
  | `astryx rn stage play <script>` | Runs a scripted check and reports each step.                                                                                                        |
  | `astryx rn stage a11y`          | Reads the app's accessibility tree.                                                                                                                 |
  | `astryx rn stage install`       | Gets the Stage release that the package pins, and verifies each binary's checksum and signature.                                                    |
  | `astryx rn stage windows`       | Lists this user's open Stage windows, each with its id.                                                                                             |
  | `astryx rn stage which`         | Says which Stage binary the commands use, its version, where it comes from (the pinned release or `--engine`), and the contracts it declares (FR7). |
  - `stage open`, `stage shot`, `stage play`, and `stage a11y` take one set of
    render options, which set the simulated device and its settings (FR3):
    - the device: `--platform ios|android`, `--device <name>`,
      `--os-version <version>`, and
      `--orientation portrait|landscape-left|landscape-right|portrait-upside-down`;
    - appearance and text: `--mode light|dark` (the appearance the app
      renders in), `--theme <name>` (the theme it renders with),
      `--content-size <size|scale>` (the device's text size setting, not a
      theme's `--text-size`), `--locale <id>`, and `--rtl`;
    - accessibility settings: `--reduce-motion`, `--bold-text`,
      `--increase-contrast`, `--reduce-transparency`, and `--screen-reader`;
    - motion: `--animation-scale <k>`, which runs animations `k` times slower;
    - the network: `--network wifi|ethernet|cellular|offline`, with
      `+constrained` for a low-data path, and
      `--network-profile <name|latency,down,up,loss>` for a conditioned link;
    - the project: `--route <path>`, `--dev-server-url <url>`,
      `--engine <path>`, and `--out <path>`.
  - `--window <id>` on `stage shot`, `stage a11y`, and `stage play` acts on
    that window's running app, with its state kept, instead of a fresh render:
    a capture of the live screen, its accessibility tree, or a script of steps
    (a tap, typed text, a key, a route or deep link, the orientation, the
    appearance, the app state, the network profile, or the animation scale).
    Beside `--window`, only `--out` (where the result is written) and
    `--route` (which the window opens first) are accepted; any other render
    option fails with `ERR_INVALID_OPTION`. A script's steps change a running
    window's settings. A window answers only its own user on its own
    computer.
  - The package pins the Stage release its commands use, in a file the
    package ships, never in `astryx.config`. A binary that fails its checksum
    or signature never runs. `--engine <path>` runs a binary that no checksum
    covers, and `stage which` reports that source. No command passes
    arguments through to another tool.
  - `stage open` says in its summary that it keeps running and follows the
    long-running rule of `spec:AST-112/FR13`.
  - The group's own writes stay inside the app, with two exceptions: the
    Stage cache is a per-user place (`spec:AST-081` FR7), and a file that
    `--out` names by an absolute path is written there, never replacing a
    file the command did not write (`architecture:cli-surface` DEC-16).
  - The group answers: what does this app render, and
    how does it behave, without a simulator? `experimental render` renders a
    web page from a page module, so it does not answer. Its function is
    `stage` in the package's `./commands` entry, and its result is captures,
    step reports, and the accessibility tree.
  - Outcomes beyond the shared ones of `spec:AST-112/FR13`:

    | Outcome                                                                                                             | Code                         |
    | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
    | No Stage binary is installed; the suggestion is `astryx rn stage install`                                           | `ERR_DEP_MISSING`            |
    | The Stage download fails                                                                                            | `ERR_FETCH_FAILED`           |
    | A Stage binary fails its checksum or signature                                                                      | `ERR_STAGE_UNTRUSTED`        |
    | `--window` names no open Stage window                                                                               | `ERR_STAGE_NO_WINDOW`        |
    | A script step fails; the report names the step                                                                      | `ERR_STAGE_STEP_FAILED`      |
    | The app throws or fails to start in Stage                                                                           | `ERR_STAGE_JS_ERROR`         |
    | Stage cannot set up the project                                                                                     | `ERR_STAGE_PROJECT_SETUP`    |
    | The project needs contracts or named features this Stage lacks; the envelope lists them and the Stage that has them | `ERR_STAGE_CONTRACTS`        |
    | A named dev server does not answer                                                                                  | `ERR_DEV_SERVER_UNREACHABLE` |

### The Astryx app

- **FR9 — The app shows Astryx React Native running natively.** It shows every
  component of `@astryxdesign/react-native` with live examples, searchable by
  name; example apps built only with Astryx; and the themes, with light, dark,
  and system appearance. The examples are the documentation's examples. Its
  inspector picks an element on a running screen, a Preview project's
  included, and shows the component under it.
- **FR10 — The app is a Preview host on iOS and Android.** A person opens a
  project in the app in three ways: by scanning a QR code (with the app's
  scanner, from a photo, or with the system camera), by opening a Preview link,
  or by typing an address. The project comes from:
  - a developer's computer: the project's dev server on the local network,
    which `astryx rn preview` prints as a link and a QR code; or
  - a hosted bundle: a bundle that `astryx rn preview bundle` writes, served
    over HTTPS from any host (FR20).
- **FR11 — No project code runs without the person's confirmation.** A
  scanned code and a Preview link opened from outside the app show a
  confirmation first, with the name the link carries and the address it comes
  from, and whether that address is this device, the local network, or the
  internet. Nothing is fetched or run until the person confirms. An address
  the person types counts as their choice. A project the app lists as opened
  before asks again. A link cannot carry a confirmation.
- **FR12 — A Preview project runs apart from the app and from other
  projects.**
  - The project runs inside the app in its own JavaScript runtime, separate
    from the app's own code and from every other project, with the platform
    capabilities that the app has, as the Preview policy allows (FR13).
  - Every module decides the calling runtime's namespace natively, never from
    JavaScript: `app` for the app's own runtime and one of its own for each
    project. Stored data, secrets, identities, cache files, cookies, web
    sessions, web bundles, page stores, snapshot files, sign-in redirect URIs,
    and players belong to the namespace that made them; a project never reads or
    acts on the app's or another project's. A runtime with no namespace
    answers `no-namespace`.
  - It never reaches the app's own identity, stored data, files, sign-in,
    players, or the person's photo library, and it cannot change the app's appearance, bars, or lock-screen
    controls.
  - A call that the host's policy refuses for a project answers
    `not-allowed`, a reason the host adds to every capability's set
    (`spec:AST-112/FR6`); it is never a silent no-op. The other reasons that
    FR13's table names are the host's too, on the modules it names them for.
  - Removing a project from the app's list removes everything it stored, in
    every store of the package, and its web data through the web
    capability's clearer where that capability is linked.
    `AstryxStorage.clearProjectData(bundleUrl)` is that call, made by the
    host in the app's runtime: it answers the cleared namespace and whether
    the web data went. A project's own call, or the app's own bundle URL,
    answers `not-allowed`; a value that is not a URL answers `invalid-url`.
  - Astryx Stage applies the same namespaces and policy when it runs a
    Preview project, so a project meets the same limits in Stage and on a
    phone.
- **FR13 — The Preview policy per module.** A module the table does not name
  answers a project as it answers the app, within the app's own permissions.

  | Module (record)                                                                                  | What a Preview project gets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `AstryxAppearance` (`spec:AST-130`)                                                              | `getOverride()` answers `'system'`, `getRunOverride()` answers `null`, and `setOverride` answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `AstryxPlatformInfo`, launch info (`spec:AST-130`)                                               | No `launch` and an empty `installedAt`; the memory and bundle-size reads answer `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | `AstryxNetwork` (`spec:AST-130`)                                                                 | `fetchUntrusted` answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | `AstryxStorage` (`spec:AST-130`)                                                                 | Its own namespace (FR12); `clearProjectData` answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | `AstryxClipboard` (`spec:AST-130`)                                                               | Each read asks as the device does; a refused read or write answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
  | `AstryxBack`, `AstryxLaunch` (`spec:AST-130`)                                                    | Change nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `AstryxSecureStorage`, `AstryxClientIdentity` (`spec:AST-133`)                                   | Only its own secrets and identities. The app asks the person before `createKey` and `bindToHosts`, and a refusal answers `not-allowed`. `bindToHosts` may also bind `*.` patterns under a registrable domain, never at or above a public suffix (`*.co.uk` and `*` answer `invalid-host`). It cannot change the app's own identity declaration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `AstryxFiles` (`spec:AST-133`)                                                                   | Saves or shares only files in its own cache, and reads only its own bundle's assets and its cache; any other path answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | `AstryxWebSessions`, `AstryxWebData`, `AstryxWebBundles`, `AstryxPageSnapshots` (`spec:AST-134`) | Its own sessions, bundles and their byte-route requests, page store and its policy, and snapshot files. Its page store is its own and its `fetch` shares it, so its `clear()` also ends its own `fetch` session; the app's store is never touched. `register` and `capture` answer `not-allowed`, and `prewarm` and the warm pool keep nothing for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
  | `AstryxAuthSession` (`spec:AST-134`)                                                             | The app asks for the person's consent before a sign-in, and one consent covers both steps of a `followUp`; a declined consent settles `cancelled`. A project origin the app does not admit answers `origin-not-trusted`. `prefersEphemeral` defaults to true. `getRedirectUri` answers `<scheme>://oauth/<namespace>[/<path>]`, and a callback reaches only the runtime that started the sign-in. The sign-in URL carries a state of at least 16 characters (`missing-state`), and its `redirect_uri` names the project's own namespace (`wrong-project`, or `redirect-not-owned` on one of the app's schemes); a callback that names no namespace fails `redirect-not-owned` unless the app lists that callback host for projects in its native configuration. The app's own sign-in pre-empts a project's open one, which settles `cancelled`. |
  | `AstryxAudio`, `AstryxVideoView` (`spec:AST-132`)                                                | Players open beside the app's. A `playerId` another runtime holds answers `busy`; a runtime's `close` or teardown frees only its own players; a video view draws only its own runtime's player. The player that started last, in any runtime, owns the Now Playing card and remote commands, and one runtime's teardown never removes another's. A file outside its own folders answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
  | `AstryxPhotoLibrary`, `AstryxPhotoThumbnailView` (`spec:AST-135`)                                | Every library call answers `not-allowed`, and the thumbnail view reports `not-allowed` and draws nothing: the person's photo library is the app's alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | The system photo picker, `AstryxFilePicker` (`spec:AST-130`)                                     | Allowed: the iOS system picker and the Android Photo Picker expose no library, and only the items the person picks reach the project, copied into its own cache as picker results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `AstryxPdfView`, `AstryxPdfModule`, `AstryxImageMarkup` (`spec:AST-135`)                         | `PdfView`, `renderPage`, and `markupImage` read only the files the project may read (its own cache, its temporary files, its package, and picker results) and write only into its own cache; any other file answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `AstryxCameraView` (`spec:AST-132`)                                                              | The camera's consent in the app; without it, the permission reports `denied`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | `AstryxAudioRecorder` (`spec:AST-136`)                                                           | `getPermission`, `requestPermission`, and `start` answer `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | `AstryxBarcode` (`spec:AST-136`)                                                                 | Camera-class: a call passes the camera's consent and answers `not-allowed` when the host blocks the camera or the person declines. It decodes only its own files (its temporary folder, its cache, and its package).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | `AstryxScreenCapture` (`spec:AST-136`)                                                           | `hold` and `release` answer `not-allowed` with `holds: 0` and change nothing; `supports('preventCapture')` is false. Its web views keep `preventsCapture` (`spec:AST-131`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | `AstryxCrashReports`, `AstryxDailyMetrics`, `AstryxFrameRecorder` (`spec:AST-137`)               | Every crash-report and daily-metrics call answers `not-allowed`: a project cannot read the crashes or the measures of the app that hosts it. The frame recorder is never served to a project, so it is absent there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | `AstryxPasteControl` (`spec:AST-126`)                                                            | Never served; `PasteButton` draws its fallback, which reads the clipboard under the clipboard's consent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | `AstryxIconView`, `AstryxIcons` (`spec:AST-127`)                                                 | A bundled mask, a `data:` URI, or a file it may read; a remote mask goes through `Image`, under its own image loading and network rules, and never as a mask the app's runtime downloaded. `prefetch` answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | `AstryxSystemMenu` (`spec:AST-128`)                                                              | No preview card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | Navigation hosts and `AstryxRouter` (`spec:AST-125`)                                             | The Preview chrome shows the host root's routes and opens paths through the router's snapshot (FR14). A navigator whose native host is missing shows an in-place message, announced as an alert, and a development error; never a blank screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `./safe-area-context` (`spec:AST-129`)                                                           | A project that imports `react-native-safe-area-context` gets this entry and renders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **FR14 — The host prepares a project before its code runs.**
  - Before a project's main module runs, the host checks it (FR15), gives
    it its runtime and namespace (FR12), and installs the prelude: the
    globals of both installers of `spec:AST-112/FR5` (`crypto.getRandomValues`
    and `crypto.randomUUID` from the system's secure generator, and `fetch`
    with `redirect: 'error'` and `redirect: 'manual'`). The project imports
    nothing for them, and the host installs no other global.
  - The host root is the router root that the host names, else the
    outermost root that mounted first and is still mounted. Stage's address
    bar, the Preview chrome, and the inspector read one serialisable snapshot
    of it, whose `revision` names its shape, and open paths through the
    app's own linking. They reach the app's routes only when the host asks
    for them; an app's own mount never offers its routes to a host
    (`spec:AST-125`).
- **FR15 — The host checks a project before its code runs.**
  - A project declares what it requires from the host. Before the project's
    main module runs, the host compares that with the native components,
    modules, versions, and named features it has; a project that needs one
    the host lacks is refused with a screen that names what is missing.
    `astryx rn preview check` answers the same question on the developer's
    computer (FR20).
  - The host runs source bundles only. A precompiled bytecode bundle is
    refused before it runs.
- **FR16 — An encrypted hosted bundle keeps its key on the phone.** For an
  encrypted bundle, the key travels only in the part of the link after `#`,
  which is never sent to the server. The app verifies the integrity of every
  part of the bundle before any of its code runs, keeps the decrypted bundle in
  memory only, and writes nothing decrypted to the device. An encrypted project
  is never kept in the list of opened projects, and the data it stores lasts
  only while it is open. Any failed check refuses the project with one line
  saying why.
- **FR17 — A running project can always be left and reloaded.** While a
  project runs, the person can return to the app and reload the project. A
  failure to open shows what happened, the address when the server did not
  answer, and a retry where a retry can help. The app lists the projects a
  person opened, except encrypted ones; removing one also removes the data
  that project stored (FR12).
- **FR18 — Preview is part of the Astryx app.** Opening and running a
  project is a feature of the Astryx app, which carries its own native pieces
  for it. `@astryxdesign/react-native` keeps only the project side of
  Preview: the types and manifest shape that a previewed project uses
  (`spec:AST-112/FR1`), and it imports nothing from a host. A project carries
  no Preview code of its own: the host sets up what the project needs before
  the project's code runs (FR14).
- **FR19 — Picking an element never touches the project.** While the
  inspector (FR9) is picking an element in a running project, every touch
  goes to the inspector and none reaches the project. When picking ends, the
  project receives touches again.
- **FR20 — `astryx rn preview` makes what a Preview host opens.**
  `@astryxdesign/react-native` contributes the group to the Astryx CLI with
  its other commands, under the same rules as FR8.

  | Command                    | Its one job                                                                                                                                                                                                                                                                                                                                                                                       |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `astryx rn preview`        | Prints the link with which a Preview host opens the project from this computer's dev server, and whether a dev server answers. It never starts one; `--start` starts the dev server and keeps running. `--link-only` probes nothing, `--dev-server-url <url>` names a running dev server, `--display-name <words>` is the name the link carries, and `--qr-png <file>` writes the link's QR code. |
  | `astryx rn preview check`  | Compares the project's requirements with what a Preview host provides (FR15), and lists each requirement the host lacks.                                                                                                                                                                                                                                                                          |
  | `astryx rn preview bundle` | Writes a preview bundle per platform, with its manifest, for any HTTPS host. `--single-file` writes one file per platform, and `--encrypt --public-url <url>` writes it encrypted, with the key only in the link (FR16).                                                                                                                                                                          |
  | `astryx rn preview serve`  | Serves the preview bundle (`--bundle <dir>`) read-only from this computer on `--port <n>`, and writes it first when it is older than the project's sources.                                                                                                                                                                                                                                       |
  | `astryx rn preview share`  | Serves the encrypted preview bundle over the internet through a carrier and prints one link.                                                                                                                                                                                                                                                                                                      |
  - `preview` answers for one platform: the one `--platform` names, `ios`
    otherwise. `preview bundle`, `preview serve`, and `preview share` act on
    every platform the app has unless `--platform ios|android` names one.
  - The text output is plain text, so a QR code reaches a person only as a
    PNG file (`--qr-png`).
  - `preview share` takes each carrier's terms with `--accept-carrier <name>`,
    once per carrier it may use, on every run. Nothing is stored. It refuses
    a file that its deny rules match.
  - `preview --start`, `preview serve`, and `preview share` say in their
    summary that they keep running and follow the long-running rule of
    `spec:AST-112/FR13`.
  - A file that `--qr-png` names by an absolute path is written there, never
    replacing a file the command did not write
    (`architecture:cli-surface` DEC-16).
  - `astryx doctor --scope preview` reports the native-build items as `info`.
  - The group answers: how does a Preview host open
    this project? `template --cdn` writes a web page, and no command makes
    what a Preview host opens. Its function is `preview` in the package's
    `./commands` entry, and its result is links, URLs, and host-check items.
  - Outcomes beyond the shared ones of `spec:AST-112/FR13`:

    | Outcome                                                                                                                                                    | Code                               |
    | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
    | A named dev server does not answer                                                                                                                         | `ERR_DEV_SERVER_UNREACHABLE`       |
    | `preview check` finds a requirement the Preview host does not provide                                                                                      | `ERR_PREVIEW_HOST_MISSING`         |
    | `preview share` finds a file that its deny rules refuse                                                                                                    | `ERR_PREVIEW_SHARE_DENIED`         |
    | `preview share` uses a carrier that no `--accept-carrier` names; the suggestions name the same run with `--accept-carrier <name>` and each carrier's terms | `ERR_PREVIEW_CARRIER_NOT_ACCEPTED` |

### Evidence

- **FR21 — Stage and Preview are development evidence.** A Stage result and a
  Preview run show what the app does on the platform's contracts. A claim
  about native behavior is checked on the Simulator, the emulator, or a
  device (`spec:AST-112/FR15`); every change to native behavior is checked
  there and in Stage, and Stage is kept matched to them (FR6).

### Platform support

- Supported feature/engine floor: Astryx Stage runs on macOS (Apple silicon),
  Linux (x86-64; the window under X11), and Windows, each with the window and
  the headless mode (FR1, FR2). The Astryx app runs on iOS and Android at the platform floor of
  `spec:AST-112`; encrypted hosted bundles need Android 11 or later on
  Android.
- Unsupported behavior: a Stage feature that needs a
  system service another desktop lacks, such as a real web view, shows the
  component's fallback and lists the gap in the report (FR5). On a device
  without a camera, the scanner offers the typed address.
- Browser evidence: none. Stage claims are checked against the Simulator and
  the emulator; Preview claims on the Simulator, the emulator, and devices.

## Current-state impact

- `spec:AST-112` names this record for Astryx Stage and the Astryx app's
  Preview, and for the `astryx rn stage …` and `astryx rn preview …` commands; its
  library layer keeps the types and manifest shape a previewed project uses
  (`spec:AST-112/FR1`), and its installers (`spec:AST-112/FR5`) are what the
  prelude installs (FR14).
- `architecture:cli-surface` INV10 and `spec:AST-081` FR7 gain the Stage
  cache as a per-user write root, and INV10 admits a file that `--out` or
  `--qr-png` names by an absolute path, as DEC-16 does for
  `experimental render --out`. `spec:AST-114` FR5's table gains `doctor`'s
  `--scope`, which requires `setup.checks`.
- Each platform group record (`spec:AST-123` to `spec:AST-137`) states its
  contracts; this record states how Stage shows them (FR6), what a Preview
  project reaches of them (FR13), and how Stage pairs with them (FR7).

## Verification

| Contract | Verification                                                                                                                | Representative states                                                                                      | Mutation or failure expectation                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The same bundle rendered in Stage and on the Simulator and emulator; layout comparison                                      | a sample app; each platform profile                                                                        | A layout that differs from the device's with no entry in the report                                                                                                                 |
| FR2      | Report contract tests of each headless verb; a scripted check that fails a step                                             | capture; scripted check; accessibility tree; a JavaScript exception; an unknown route                      | A failed run that reports success, or a picture of nothing reported as ready                                                                                                        |
| FR3      | Captures per option compared with the Simulator and emulator                                                                | each profile; dark; RTL; largest text size; Reduce Motion                                                  | An option that changes nothing, or a theme default that Stage adds                                                                                                                  |
| FR4      | Runs from a dev server with an edit, from a production bundle, and from a sample                                            | hot reload with state; one-shot bundle                                                                     | An edit that loses the app's state on hot reload, or a bundle that runs differently from the dev server's                                                                           |
| FR5      | A project with an unknown native view and module; a run on a desktop without a system web view                              | each kind of simulated entry                                                                               | A missing native piece that the report does not name                                                                                                                                |
| FR6      | Stage contract checks of each group's contracts beside the same scripts on the Simulator and emulator                       | each public API; each note in FR6's table; each look                                                       | A Stage answer that differs from iOS and Android and is not a named gap, or a public API with neither a simulation nor a report entry                                               |
| FR7      | Stage's declared contracts and named features compared with the package's; a Stage below the floor; a Stage at the floor    | an older package; a newer package; one missing contract; one missing named feature                         | A Stage below the floor that runs the project, a refusal without the list, JavaScript that runs before the refusal, or a missing feature that `supports` reports                    |
| FR8      | CLI contract tests of `astryx rn stage`: envelopes, exit codes, each code in FR8's table; a tampered binary; window driving | the pinned version; a named binary; `--window` with an open window and with none; `--window` with `--mode` | A tampered binary that runs, a named binary that `stage which` does not report, or `--window` beside a render option that does not fail                                             |
| FR9      | A walk of every component page and example app on the Simulator and emulator; the inspector over the app and a project      | each component; each example app; each appearance                                                          | A component without live examples, an example that differs from the documentation's, or an inspector that names the wrong component                                                 |
| FR10     | Opening a project by each way in, from a dev server and from a hosted bundle, on iOS and Android                            | QR code; photo; link; typed address; dev server; hosted bundle                                             | A way in that does not open the project                                                                                                                                             |
| FR11     | Links and codes from outside the app; a link that claims a confirmation                                                     | local network; internet; typed; opened before                                                              | Any request or code that runs before the person confirms                                                                                                                            |
| FR12     | The app and two projects that read and write each store; a refused capability; a removed project; the same in Stage         | each store; each refused capability; `clearProjectData` from a project and with the app's bundle URL       | One namespace that reads another's data, a refusal that is a silent no-op, a removed project that leaves data, or a Stage run with other limits                                     |
| FR13     | Device and Stage runs of a project that calls each module in the table; a project sign-in with another namespace's redirect | each row of FR13's table; a declined sign-in consent                                                       | A project that changes the app's appearance, reads its launch facts, records, takes the app's players, reads a file outside its own, or receives another runtime's sign-in callback |
| FR14     | A project that uses the prelude's globals without importing them; Stage's address bar and the Preview chrome over a project | a project; an app with two routers                                                                         | A project that starts without the globals, a global the host adds beyond the prelude, or an app's routes offered without the host asking                                            |
| FR15     | A project that requires a piece the host lacks; a bytecode bundle; `astryx rn preview check`                                | a missing native piece; an older host                                                                      | A project's main module that runs on a failed check, or a bytecode bundle that runs                                                                                                 |
| FR16     | Encrypted bundles with a bad key, a changed part, and a redirect; the server's request log                                  | a valid link; each failed check; data written while open                                                   | A key that reaches the server, code that runs before every check passes, decrypted bytes written to the device, or data kept after the project closes                               |
| FR17     | Reload and return while a project runs; a dev server that stops; removing a listed project                                  | a running project; an unreachable address; an encrypted project                                            | A project that cannot be left, an encrypted project in the list, or stored data left after removal                                                                                  |
| FR18     | A dependency check of `@astryxdesign/react-native`; a project with no Preview code                                          | the Astryx app's build; a plain project                                                                    | The app's native Preview pieces in `@astryxdesign/react-native`, or a project that needs Preview code to run                                                                        |
| FR19     | Inspector picking over a project that counts its touches, on iOS and Android                                                | picking on; picking ended                                                                                  | A touch that reaches the project while picking, or a project that gets no touches after picking ends                                                                                |
| FR20     | CLI contract tests of `astryx rn preview`: envelopes, exit codes, each code in FR20's table; a share without terms          | a link; a QR PNG; a plain and an encrypted bundle; a share with a denied file                              | A share that runs without accepted terms, a key outside the link's fragment, or a QR code printed as text                                                                           |
| FR21     | Review of each native change's evidence                                                                                     | a native behavior change                                                                                   | A native claim backed only by Stage or Preview                                                                                                                                      |

## Decision log

### DEC-1 — Stage runs the app's JavaScript against the platform's contracts

**Reference:** `spec:AST-139/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Developers and agents need to see what the app does on iOS and Android without
a device. Stage runs the app's own bundle and
implements the same native contracts as the platform layer, so the screen,
the accessibility tree, and the behavior come from the app's real code.

Rejected: a web preview through React Native for Web, because it renders web
components instead of the native contracts.

### DEC-2 — A missing contract is a refusal, not a fallback

**Reference:** `spec:AST-139/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A picture that silently leaves out a native piece misleads the person or agent
who trusts it. Stage pairs with a project by the version floor its package
names and refuses, with the list, when it lacks what the project needs. Known
differences that remain are listed in every report.

### DEC-3 — Preview asks before any project code runs

**Reference:** `spec:AST-139/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A Preview project runs inside an app that has camera access and reaches the
local network. Nothing is fetched or run until the person confirms, with the
address in view, and a link cannot carry that confirmation.

Rejected: running a project as soon as its code is scanned, because any code
on a poster or a web page would then run on the phone.

### DEC-4 — A Preview project never reaches the app's identity, data, or sign-in

**Reference:** `spec:AST-139/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A project opened from a link is code the app did not ship, running in the same
app as the app's own code. Each module derives the calling runtime's namespace
natively, so stored data, secrets, identities, cache files, and players belong
to the runtime that made them, and a call the policy refuses answers
`not-allowed`. Opening a project cannot read or act as the app, or take its
lock-screen controls away. The person's photo library is the app's alone; a
project reaches the photos the person chooses through the file picker.

Rejected: a namespace argument from JavaScript, because a project could name
the app's.

### DEC-5 — Stage runs on macOS, Linux, and Windows

**Reference:** `spec:AST-139/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Developers build Android apps on all three desktops, and an agent or a job
runs wherever the developer's tools run. Stage has the window and the
headless mode on each.

### DEC-6 — Preview is part of the Astryx app

**Reference:** `spec:AST-139/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

Running a separate React Native project inside an app is the job of a Preview
host, so the Astryx app carries its own native pieces for it.
`@astryxdesign/react-native` keeps only what every previewed project needs:
its manifest shape and its types.

Rejected: a `preview` capability that an app opts into, because no app other than a host needs it, and every app's package would carry its code.

### DEC-7 — Stage conforms to the contracts; devices are the truth

**Reference:** `spec:AST-139/DEC-7`
**Decider:** imdreamrunner, 2026-11-09

Developers rely on the contracts; Stage simulates them. Astryx's own checks
use the Simulator, the emulator, and devices as the source of truth and keep
Stage matched to them, so a missing or divergent path is a Stage defect, never
a change to the contract.

### DEC-8 — Astryx React Native stays neutral of Stage and Preview

**Reference:** `spec:AST-139/DEC-8`
**Decider:** imdreamrunner, 2026-11-17

The package's contracts serve every app, with or without a development tool.
Stage and Preview are separate products that follow those contracts: the
package depends on neither, and an app may use third-party libraries and
another router beside the package. Stage and Preview cover Astryx's contracts
and name what they do not cover (FR5, FR15).

Rejected: Stage and Preview rules inside the package's records, because every
contract would then carry the requirements of two development tools.

## Open questions

- **OQ1 — How does an app's own native library work with Stage and with
  Preview?** (`human-design`) An app may add its own native component or
  module, or a third-party library with native code, a router's included.
  Stage implements only the platform's declared contracts, and the Astryx app
  carries only the platform's native code, so neither runs that native code.
  Options:
  - **A visible stand-in only.** Stage lays out the view as a labelled box and
    the module's calls answer `no-module`; the Astryx app refuses the project
    at the host check (FR15). Simple and honest; the screens that use the
    library cannot be checked in Stage or Preview.
  - **A JavaScript simulation that the library ships.** The library provides a
    simulation of its view and module, in the shape of the `./testing` doubles
    (`spec:AST-112/FR5`), that Stage loads and Preview may load. Works on every
    desktop with no native build; the simulation can drift from the real
    native code, and a Preview simulation is not the real behavior on a phone.
  - **A native extension for Stage.** The library ships a desktop version of
    its native side that Stage loads. Closest to the real behavior; each
    library ships and signs one per desktop operating system and
    architecture, Stage gains an extension interface to keep stable, and
    loading third-party native code in a Preview project is a new trust
    question.
  - **A declared contract with data only.** The library declares its contract
    and static answers or pictures for Stage to show. No code runs; it covers
    only simple, static pieces.
- **OQ2 — What does Stage do with a native view or module it does not
  implement?** (`checkable`) FR5 names it in the report. Options: draw an
  empty laid-out box; draw a labelled stand-in so the gap shows in the
  picture; or refuse the run unless an option allows gaps. An empty box keeps
  pictures close to the layout; a labelled stand-in makes the gap visible to a
  person reading only the picture; a refusal stops an agent from trusting an
  incomplete screen.
- **OQ3 — How does Stage publish the contracts it implements?**
  (`human-design`) FR7 pairs by the package's version floor and named
  features. Options for the declaration:
  - **A published manifest per Stage release** that lists each contract and
    its named features, read by `astryx doctor` and `astryx rn stage which`. One
    table to compare with the package's contracts.
  - **The manifest plus each contract's spec hash**, so a contract whose spec
    changed without a new floor is caught at start. Catches drift the floor
    misses; the package then records a hash per contract, which
    `spec:AST-112` does not.
  - **Documented divergences in the manifest**: a contract Stage implements
    with a known difference carries the difference in the manifest, and the
    report repeats it. Honest and testable; the list must only shrink, or it
    hides defects.
- **OQ4 — What more may a Preview project reach?** (`human-design`) FR12 and
  FR13 fix the namespaces and the per-module policy. Open: whether storage is
  per project or per project and per source address; cookies and web data
  (per project, or none); network (any host, the local network only for dev
  servers, or a declared list); which project origins a sign-in admits;
  permissions beyond the camera (the system
  prompt once for the app with a per-project consent in the app, or no
  permission-gated capability for projects); and web content. A
  wider reach makes more apps previewable; each widening is a capability that
  code from a link can use on the person's phone.
- **OQ5 — How does a person know who served a project?** (`human-design`)
  The confirmation shows the address and the name the link carries, which
  the person cannot verify. Options: pair the app with
  the developer's computer once, so a dev server link from another machine on
  the same network is refused; sign hosted bundles, so the confirmation can
  name the author and a changed bundle is refused; or keep the address and
  encryption only. Pairing and signing each add a key to manage; without them,
  anyone who can get a person to scan and confirm can serve that person code.
  Whether plain hosted bundles may be kept for offline use belongs to the same
  question.
- **OQ6 — Where are Stage's binaries published, how are they signed and
  updated, and for which architectures?** (`human-design`) Options for where:
  per operating system and architecture packages on npm that the CLI
  installs; or release assets that the CLI downloads and verifies.
  Recommendation: release assets with checksums and signatures, because the
  binaries are large and npm's optional dependencies install every
  architecture's metadata. Also open: code signing and notarization on macOS
  and a signing scheme on Linux and Windows; a built-in updater, or only the
  pinned install; and which architectures are supported beyond macOS on
  Apple silicon and Linux on x86-64 (macOS on Intel, Linux and Windows on
  ARM). Platform signing removes the system's warnings and proves the
  publisher, at the cost of a signing identity per platform; an updater keeps
  developers current but competes with the pin.
- **OQ7 — Does the Astryx app ship publicly, and where?** (`human-design`)
  Options: the App Store and Google Play; a public beta channel; or build from
  source only. Store review rules on running downloaded code (App Store Review
  Guidelines 2.5.2, Google Play's policy on code loaded at run time) may
  require Preview to be limited or left out of a store build, which would
  split the documentation app from the Preview host. The app's own minimum
  operating-system versions belong to the same question.
- **OQ8 — Does Stage run remotely?** (`human-design`) Options: local runs only,
  with continuous integration running Stage itself on Linux; a self-hosted
  runner that a developer's commands attach to and that returns the same report
  as a local run; or a hosted service. A remote runner gives a developer on an
  unsupported desktop the same results, at the cost of sending the project's
  code to that runner.
- **OQ9 — Does Stage open hosted Preview bundles?** (`checkable`) Options:
  open only local projects, prebuilt bundles, and samples (FR4); or also open
  a hosted bundle from a Preview link, encrypted ones included, as the Astryx
  app does. The second lets a reviewer without a phone open the same link; it
  brings FR16's checks to Stage.
- **OQ10 — Does Stage simulate the Android root back gate and launch hold?**
  (`checkable`) Options: keep both absent, as on iOS (FR6); or simulate the
  back-to-home animation at the root and a launch window held until the
  first content. Absent keeps Stage simple and honest in the report; a
  simulation lets a check cover the Android root and the first frame.
