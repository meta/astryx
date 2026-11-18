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

# React Native: Astryx Stage (experimental) system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

Astryx Stage is an experimental feature: its commands, flags, results and
behaviour may change or be removed in any release (its outcome codes excepted,
FR8), and nothing in Astryx React Native depends on it.

**Astryx Stage** is a desktop app for developers and their agents, beside the
React Native packages of `spec:AST-112`. It runs the real JavaScript of an app
built with `@astryxdesign/react-native` and renders it with an iOS or Android
look, with no simulator, emulator, or device. A developer opens the app in a
window and uses it by hand; an agent or a continuous-integration job runs it
headless and gets a picture, a step report, the accessibility tree, logs, and
timings as data. Stage answers the platform's native contracts as iOS and
Android do, so a screen that renders and behaves in Stage is the screen the
developer expects on a device, and every place where it differs says so.

Stage conforms to Astryx React Native's contracts and never defines them.
`@astryxdesign/react-native` does not depend on it: an app builds and runs on
its devices with no Stage, and it may use third-party libraries and another
router beside the package. This record owns the `astryx rn stage …` commands
and Stage's notes per module. Preview in the Astryx app is specified in
`spec:AST-141`.

## Why this exists

Simulators and emulators need a native build per change and a Mac or a
virtual machine, and they give an agent no picture, accessibility tree, and
step report as data in one command. Web previews render web components instead
of the native contracts. Astryx Stage gives developers and agents the app's
real screens and behavior on the platform's contracts from any desktop,
headless or in a window. It follows the contracts that the platform's records
define, so Astryx React Native itself stays the same with or without it.

## Who uses it

| Who                                    | Astryx Stage                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A developer building an Astryx app     | Opens the app in a window beside the editor, switches iOS and Android looks, light and dark, text size, and RTL.      |
| An AI agent working on an Astryx app   | Renders a route headless, taps through a scripted flow, reads the accessibility tree and logs, and checks the result. |
| A continuous-integration job           | Runs scripted checks and captures on Linux on every change, with deterministic reports and exit codes.                |
| A reviewer, designer, or product owner | Reads the pictures and reports an agent or a job attached.                                                            |
| Astryx's own maintainers               | Checks every platform contract against the Simulator and emulator, and every documentation example.                   |

## Non-goals

- How Astryx Stage is implemented, built, and packaged. Only what an app, the
  CLI, a developer, and an agent observe is in this record.
- Each native contract's behavior on iOS and Android. Its platform group
  record (`spec:AST-123` to `spec:AST-132`, and `spec:AST-135`) states it, and Stage matches it
  (FR6).
- The Astryx app and its Preview: `spec:AST-141`.
- The React Native commands outside the `astryx rn stage` group, and the
  rules every React Native command follows (`spec:AST-112/FR13`).
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
  - A command can drive an open window (FR8).
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
  a prebuilt app bundle and its own built-in samples. Whether it opens a
  Preview project is OQ6; a Preview project it opens meets the namespaces and
  the Preview policy of `spec:AST-141/FR4` and `spec:AST-141/FR5`, as on a
  phone.
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
  - Stage implements each contract from its engine-neutral description, in
    the contract's result shape, and passes the contract's conformance suite,
    the same suite that runs on iOS, on Android, and against the contract's
    JavaScript double (`spec:AST-140`).
  - Each module answers its calls as the device of the chosen look does,
    in the calling runtime's namespace (the app's, or a Preview project's,
    `spec:AST-141/FR4`): its results, reasons, and
    named features. A module that iOS or Android does not have is absent in
    that look, as on the device.
  - Stage notes per module, where a module needs one:

    | Module (record)                                                                                                              | In Stage                                                                                                                                                                                                                                                                                                                                                                                              |
    | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, `AstryxScrollEdgeView` (`spec:AST-123`)                 | iOS looks: simulated Liquid Glass with grouping, materialize, layout spring, morph, and the press response; the system blur and hairline in the pre-26 look; neighbouring glass within `spacing` as one outline; the same material per variant and look; soft and hard edge bands over the target scroll view. Android looks: glass as a plain view, and no edge bands.                               |
    | Gestures and drag (`spec:AST-124`)                                                                                           | Every view in both looks, `AstryxGestureRootView` in the iOS look. A held press lifts a drag item, which follows the finger or the pointer; snap rules are the device's.                                                                                                                                                                                                                              |
    | Navigation hosts and `AstryxRouter` (`spec:AST-125`)                                                                         | Stack and tab hosts, screens, header slots, and tab accessories in both looks. The address bar shows the host root's routes and opens paths through the router's snapshot (`spec:AST-141/FR6`).                                                                                                                                                                                                       |
    | Controls (`spec:AST-126`)                                                                                                    | Button and text field in both looks; slider and segmented control in the iOS look, absent in the Android look; a simulated date picker in the iOS look, whose module resolves each request with the request's value; the paste control in the iOS look from iOS 16.                                                                                                                                   |
    | Icons and drawing (`spec:AST-127`)                                                                                           | Local masks tinted, fitted, and mirrored; icon counts and `not-allowed` as on a device. On macOS the SF Symbol, elsewhere the drawn glyph with a close stroke. Vector scenes drawn as a device draws them; no system viewer, and the Large Content Viewer image in the accessibility output; the scene reader reports version 2.                                                                      |
    | Menus and presentation (`spec:AST-128`)                                                                                      | A system menu look-alike (pull-down, context menu with the lifted area and dimmed backdrop, the preview card), which the Android look also draws; an action sheet look-alike, with no module in the Android look; sheets with their detents, drags, swipe dismissal, and status bar; modal windows in presentation order with `onShow`, `onDismiss`, and the escape's `onRequestClose`.               |
    | Layout, text, and keyboard (`spec:AST-129`)                                                                                  | Safe areas, the keyboard dock, and selectable text in both looks (word selection by long press or double tap, Copy, Select All); the window status bar in the Android look. The same `Intl` set as the device; a run reports at start each required member it lacks and each it only approximates.                                                                                                    |
    | `AstryxAppearance`, `AstryxAccessibilitySettings`, `AstryxHaptics`, `AstryxClipboard`, `AstryxPlatformInfo` (`spec:AST-130`) | The saved appearance per app, kept across runs and applied before the first frame, and a run-only override; the run's accessibility settings, changed live, with the same snapshot and event; each haptic in the run's trace, with no feedback; the clipboard as an in-memory string that `detectPatterns` classifies without handing it back; Stage's own app identity, revisions, and feature rows. |
    | `AstryxPermissions`, `AstryxFilePicker`, `AstryxStorage`, `AstryxBack`, `AstryxLaunch` (`spec:AST-130`)                      | Permissions start `undetermined` and a request draws a prompt (a run option starts one granted), and `hasHardware` is false, as on the Simulator; the document picker, and a photo picker over a fixed set of sample images with thumbnails for them; one store per namespace, kept across runs, and empty at the start of a headless run; back and launch absent, as on iOS.                         |
    | Web view (`spec:AST-131`)                                                                                                    | On macOS the page in the system's web engine, with the device's navigation, sessions, page storage, bundled folders, messages, and content-process end; `preventsCapture` ignored, as iOS does. `AstryxWebViewInfo` answers as the device it shows.                                                                                                                                                   |
    | Media and camera (`spec:AST-132`)                                                                                            | Players with the device's states, seeking, rate, volume, mute, and loop; sound in a window on macOS, and state without sound headless; `isBackgroundAvailable()` true. Video: on macOS the frame at the player's position with `contain` and `cover`, elsewhere a surface at the video's ratio; picture in picture unsupported. The camera view absent, as on a device with no camera.                |
    | Photos and documents (`spec:AST-135`)                                                                                        | A built-in library of placeholder photos and one video with fixed ids; the run sets the starting access and the prompt's answer; listing, cursors, export, and change events follow the platform Stage runs as. Thumbnails draw the asset's placeholder tile, `cover` or `contain`, with that platform's load size.                                                                                   |

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

  FR6 gap: Astryx Stage writes an `original` photo as a JPEG, not in its
  stored format, and a video as a file that does not play.

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
  - The group is experimental (`spec:AST-017` FR21; this record's DEC-6): its
    help and its docs say so, the docs carry `stability: 'experimental'`, and
    its commands, flags, and results may change or be removed in any release.
    Its outcome codes are the exception: they are append-only, and a shipped
    code keeps its meaning (`architecture:cli-surface` INV3).
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

    | Outcome                                                                                                                      | Code                         |
    | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
    | No Stage binary is installed; the suggestion is `astryx rn stage install`                                                    | `ERR_DEP_MISSING`            |
    | The Stage download fails                                                                                                     | `ERR_FETCH_FAILED`           |
    | A Stage binary fails its checksum or signature                                                                               | `ERR_STAGE_UNTRUSTED`        |
    | `--window` names no open Stage window                                                                                        | `ERR_STAGE_NO_WINDOW`        |
    | A script step fails; the report names the step                                                                               | `ERR_STAGE_STEP_FAILED`      |
    | The app throws or fails to start in Stage                                                                                    | `ERR_STAGE_JS_ERROR`         |
    | Stage cannot set up the project                                                                                              | `ERR_STAGE_PROJECT_SETUP`    |
    | The project's Stage version floor is above this Stage; the envelope lists the contracts it lacks and the Stage that has them | `ERR_STAGE_CONTRACTS`        |
    | A named dev server does not answer                                                                                           | `ERR_DEV_SERVER_UNREACHABLE` |

### Evidence

- **FR9 — Stage results are development evidence.** A Stage result shows
  what the app does on the platform's contracts. A claim about native
  behavior is checked on the Simulator, the emulator, or a device
  (`spec:AST-112/FR15`); every change to native behavior is checked there,
  and Stage is kept matched to them (FR6).

### Platform support

- Supported feature/engine floor: Astryx Stage runs on macOS (Apple silicon),
  Linux (x86-64; the window under X11), and Windows, each with the window and
  the headless mode (FR1, FR2).
- Unsupported behavior: a Stage feature that needs a system service another
  desktop lacks, such as a real web view, shows the component's fallback and
  lists the gap in the report (FR5).
- Browser evidence: none. Stage claims are checked against the Simulator and
  the emulator.
- Compatibility: experimental (DEC-6). No release promises Stage's commands,
  flags, reports, or behavior, its outcome codes excepted (FR8), and an app's
  build and run never depend on them.

## Current-state impact

- `spec:AST-112` names this record for Astryx Stage and the
  `astryx rn stage …` commands, and `spec:AST-141` for Preview.
- `architecture:cli-surface` INV10 and `spec:AST-081` FR7 gain the Stage
  cache as a per-user write root, and INV10 admits a file that `--out` names
  by an absolute path, as DEC-16 does for `experimental render --out`.
- Each platform group record (`spec:AST-123` to `spec:AST-132`, and `spec:AST-135`) states its
  contracts; this record states how Stage shows them (FR6) and how Stage
  pairs with them (FR7).

## Verification

| Contract | Verification                                                                                                                | Representative states                                                                                      | Mutation or failure expectation                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The same bundle rendered in Stage and on the Simulator and emulator; layout comparison                                      | a sample app; each platform profile                                                                        | A layout that differs from the device's with no entry in the report                                                                                              |
| FR2      | Report contract tests of each headless verb; a scripted check that fails a step                                             | capture; scripted check; accessibility tree; a JavaScript exception; an unknown route                      | A failed run that reports success, or a picture of nothing reported as ready                                                                                     |
| FR3      | Captures per option compared with the Simulator and emulator                                                                | each profile; dark; RTL; largest text size; Reduce Motion                                                  | An option that changes nothing, or a theme default that Stage adds                                                                                               |
| FR4      | Runs from a dev server with an edit, from a production bundle, and from a sample                                            | hot reload with state; one-shot bundle                                                                     | An edit that loses the app's state on hot reload, or a bundle that runs differently from the dev server's                                                        |
| FR5      | A project with an unknown native view and module; a run on a desktop without a system web view                              | each kind of simulated entry                                                                               | A missing native piece that the report does not name                                                                                                             |
| FR6      | Stage contract checks of each group's contracts beside the same scripts on the Simulator and emulator                       | each public API; each note in FR6's table; each look                                                       | A Stage answer that differs from iOS and Android and is not a named gap, or a public API with neither a simulation nor a report entry                            |
| FR7      | Stage's declared contracts and named features compared with the package's; a Stage below the floor; a Stage at the floor    | an older package; a newer package; one missing contract; one missing named feature                         | A Stage below the floor that runs the project, a refusal without the list, JavaScript that runs before the refusal, or a missing feature that `supports` reports |
| FR8      | CLI contract tests of `astryx rn stage`: envelopes, exit codes, each code in FR8's table; a tampered binary; window driving | the pinned version; a named binary; `--window` with an open window and with none; `--window` with `--mode` | A tampered binary that runs, a named binary that `stage which` does not report, or `--window` beside a render option that does not fail                          |
| FR9      | Review of each native change's evidence                                                                                     | a native behavior change                                                                                   | A native claim backed only by Stage                                                                                                                              |

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

### DEC-3 — Stage runs on macOS, Linux, and Windows

**Reference:** `spec:AST-139/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Developers build Android apps on all three desktops, and an agent or a job
runs wherever the developer's tools run. Stage has the window and the
headless mode on each.

### DEC-4 — Stage conforms to the contracts; devices are the truth

**Reference:** `spec:AST-139/DEC-4`
**Decider:** imdreamrunner, 2026-11-09

Developers rely on the contracts; Stage simulates them. Astryx's own checks
use the Simulator, the emulator, and devices as the source of truth and keep
Stage matched to them, so a missing or divergent path is a Stage defect, never
a change to the contract.

### DEC-5 — Astryx React Native stays neutral of Stage

**Reference:** `spec:AST-139/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The package's contracts serve every app, with or without a development tool.
Stage is a separate product that follows those contracts: the package does not
depend on it, and an app may use third-party libraries and another router
beside the package. Stage covers Astryx's contracts and names what it does not
cover (FR5).

Rejected: Stage rules inside the package's records, because every contract
would then carry the requirements of a development tool.

### DEC-6 — Stage is experimental

**Reference:** `spec:AST-139/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

Stage is a tool that follows the contracts, not part of them, so its commands,
flags, reports, and behavior stay free to change with its simulation, its
outcome codes excepted, and no app or contract depends on them.

Rejected: a stable compatibility promise for Stage, because it would bind the
contracts to a development tool's output.

## Open questions

- **OQ1 — How does an app's own native library work with Stage?**
  (`human-design`) An app may add its own native component or module, or a
  third-party library with native code, a router's included. Stage implements
  only the platform's declared contracts, so it does not run that native
  code. Options:
  - **A visible stand-in only.** Stage lays out the view as a labelled box and
    the module's calls answer `no-module`. Simple and honest; the screens that
    use the library cannot be checked in Stage.
  - **A JavaScript simulation that the library ships.** The library provides a
    simulation of its view and module, in the shape of the `./testing` doubles
    (`spec:AST-112/FR5`), that Stage loads. Works on every desktop with no
    native build; the simulation can drift from the real native code.
  - **A native extension for Stage.** The library ships a desktop version of
    its native side that Stage loads. Closest to the real behavior; each
    library ships and signs one per desktop operating system and
    architecture, and Stage gains an extension interface to keep stable.
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
- **OQ4 — Where are Stage's binaries published, how are they signed and
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
- **OQ5 — Does Stage run remotely?** (`human-design`) Options: local runs only,
  with continuous integration running Stage itself on Linux; a self-hosted
  runner that a developer's commands attach to and that returns the same report
  as a local run; or a hosted service. A remote runner gives a developer on an
  unsupported desktop the same results, at the cost of sending the project's
  code to that runner.
- **OQ6 — Does Stage open hosted Preview bundles?** (`checkable`) Options:
  open only local projects, prebuilt bundles, and samples (FR4); or also open
  a hosted bundle from a Preview link, encrypted ones included, as the Astryx
  app does. The second lets a reviewer without a phone open the same link; it
  brings the encrypted-bundle checks of `spec:AST-141/FR8` to Stage.
- **OQ7 — Does Stage simulate the Android root back gate and launch hold?**
  (`checkable`) Options: keep both absent, as on iOS (FR6); or simulate the
  back-to-home animation at the root and a launch window held until the
  first content. Absent keeps Stage simple and honest in the report; a
  simulation lets a check cover the Android root and the first frame.
