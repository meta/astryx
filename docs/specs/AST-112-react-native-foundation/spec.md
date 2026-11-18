---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-112
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [imdreamrunner]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli]
---

# React Native foundation system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer builds an iOS and Android app with React Native and Astryx by
installing one package, `@astryxdesign/react-native`: a component library
written in JavaScript over a platform layer that holds every line of native
code. An Expo app adds `@astryxdesign/react-native-expo`, which carries the
Expo configuration plugin and host hooks (FR11). The Astryx CLI's React Native
commands create, check, and preview the app (FR13). The app gets Astryx's
components, themes, and icons, and native capabilities (storage, files,
camera, media, web content, documents, native controls) through one
consistent API. The app itself holds no hand-written native code, builds in a
generated native project, links the native half of Astryx's components by
default, and links each device feature only when it opts that feature in
(FR3).

Two apps work with these packages: the Astryx app on iOS and Android, for
previewing projects and browsing the components, and Astryx Stage, the
desktop app for macOS, Linux, and Windows, which renders an app built with
these packages with iOS and Android looks for development (FR12). The
Preview host that runs a project inside the Astryx app ships in its own host
package, outside `@astryxdesign/react-native` (FR1).

These packages are the React Native candidate of `spec:AST-082/FR12` for the
`ios` and `android` platforms. They follow `spec:AST-082`: dependencies under
FR13, the canary channel under FR15, the one-way read of core under FR16, and
shared icon names under FR17.

## Non-goals

- Which candidate wins a platform. `spec:AST-082/FR12` decides that by
  measurement.
- The contract of any one component. Each component's own record and
  `spec:AST-082/FR3` own it; this record owns where the React Native
  implementation lives and how its packages relate.
- macOS and Windows as targets for apps built with these packages.
- The design of each capability's methods beyond the shared rules in FR6 to
  FR9. Each capability documents its own methods, options, and reasons, and
  each group of the platform has its own record (FR7).
- The Preview host's own contract: its native pieces, its inspector channel,
  and its overlay window (FR1).
- The internals of Astryx Stage (FR12), beyond what an app and the
  CLI depend on.
- The Astryx app's design, features, and distribution.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — One package, plus one for Expo.** The public set is:
  - `@astryxdesign/react-native`: the one package every app installs. It holds
    two layers, the per-capability host declarations (FR4), and the React
    Native commands it contributes to the Astryx CLI (FR13). It carries no Expo
    code:
    - The library layer: components, the app root (`AstryxAppRoot`), theming,
      the hooks an app uses, and the Astryx router (DEC-9). JavaScript and
      TypeScript only. It also holds the project side of Preview: what a
      previewed project may reach, its manifest, and its types.
    - The platform layer, which holds every line of the package's native code.
      Its core links in every app (FR3): the result vocabulary (FR6), the
      capability shape (FR7), the types of every capability, the registry
      seams the capabilities plug into, the generic capabilities (storage,
      secure storage, files, network, cookies, permissions, haptics,
      clipboard, client identity), system symbols, safe-area insets, and the
      native half of the library's own components: the native controls, the
      navigation hosts, gestures and drag (the gesture owner, gesture root,
      and touch shield included), system materials and glass surfaces, the
      presentation, menu, and action-sheet hosts, icons and drawing, and
      layout, text, and keyboard. Its opt-in capabilities are the device
      features an app chooses (FR3): `camera` (camera view, live code
      scanning, and code decoding from still images), `media` (audio and
      video playback), `microphone` (audio recording), `pdf` (document view),
      `photos` (the photo library), and `web` (web view and sign-in session).
  - `@astryxdesign/react-native-expo`: the Expo configuration plugin and the
    Expo host hooks, the native pieces that join the platform to an Expo
    app's lifecycle (FR11). Its peer dependencies are
    `@astryxdesign/react-native` at the same version and `expo`. It holds no
    component and no platform API.
  - The Preview host is outside the public set: the native pieces that run a
    separate React Native project inside a host app, its inspector channel, and
    its overlay window ship in their own host package, which a host app such as
    the Astryx app installs. Preview is not a capability an app opts into.
    Whether the host package is published is OQ7.
  - A native piece belongs in `@astryxdesign/react-native` when the alternative
    an app would otherwise need is an open-source library that ships native
    code, so an app stays JavaScript-only and runs in Preview. App-level modules
    of that kind are part of the package even where no library component uses
    them: secure storage; client identity; files; web data, bundled web
    folders, and page snapshots; the system sign-in session; photos; PDF;
    image markup; screen capture; audio recording; code scanning; and
    diagnostics. Each is specified in its own record (FR7).

  FR1 gap: `@astryxdesign/react-native` carries the Expo configuration plugin,
  the Expo host hooks, and the Preview host.

- **FR2 — Dependencies point one way.**
  - The library layer calls the platform layer directly. The platform layer
    imports nothing from the library layer, in source or in tests.
  - A capability uses the platform's core only. Apart from its loader
    (`AstryxPlatform.capability(name)`), the core imports no capability; the
    loader is the one place that names the capability modules. A need that
    crosses capabilities goes through a registration hook in the core, never
    through an import between capabilities.
  - The library layer reaches an optional capability only through that
    loader. The loader answers the capability's module whenever its
    JavaScript loads, opted in or not, and `null` only when the module cannot
    load. When the app did not opt the capability in, the module's probes
    answer false and its calls resolve `not-linked` (FR3); on a binary that
    records no list of linked capabilities, they resolve `no-module` where
    the native module is missing.
  - The package depends on no other Astryx package at run time, other than
    the reads of `@astryxdesign/core` that `spec:AST-082/FR16` allows and
    `@astryxdesign/native` (FR10, OQ2, OQ3). `@astryxdesign/core`
    and `@astryxdesign/cli` never depend on it (`spec:AST-082/FR14`).
  - The Astryx router (the `navigation` entry) holds the routing state and
    drives the platform's navigation hosts (`spec:AST-125`). Astryx also owns
    the native stack and tab containers, transitions, gestures, insets, and
    every bar, header, button, and search field, rendered by the system
    through the platform's hosts or drawn by the library (DEC-9).
  - The package takes no third-party navigation dependency, a router,
    react-native-screens, and react-native-safe-area-context included: its
    only peer dependencies outside Astryx are React and React Native. The one exception is the optional peers of the
    `./navigation-legacy` entry (FR5). Apart from that entry, a React
    Navigation adapter may exist only as a separate optional package, never
    as a dependency of the set; it drives the platform's navigation hosts and
    depends on no package that ships native navigation code,
    react-native-screens and react-native-safe-area-context included.
  - `@astryxdesign/react-native` imports nothing from Expo or from
    `@astryxdesign/react-native-expo`, and declares neither as a dependency.
    `@astryxdesign/react-native-expo` reaches the platform only through the
    package's public and internal entries (FR5) and adds no capability.
  - The Preview host's package depends on `@astryxdesign/react-native`;
    `@astryxdesign/react-native` imports nothing from it.
  - The package's `./commands` entry (FR5, FR13) runs only in the Astryx CLI.
    An app's runtime never imports it, and `@astryxdesign/cli` never depends
    on the package.
- **FR3 — Astryx's components link by default; an app opts in to each device
  feature.** The core, with the native half of every library component, links
  in every app. Each opt-in capability is a device feature an app chooses, and
  it carries its own native module, system frameworks, dependencies, manifest
  components, services, and the permission, usage string, or library size
  that comes with the feature. The app's native build links a capability only
  when the app opts it in: on iOS a Podfile helper adds the capability's
  subspec, and on Android a Gradle property enables its source set. The app
  lists its capabilities in its configuration, and the generator of its native
  project (`astryx shell`, or the Expo package's plugin) writes both from that
  list (FR4); an empty list links the core only. The native build records the list of capabilities it links, which the
  core reads. A minimal opt-out of the default set may exist; this record
  does not fix its shape.
  - An app that does not opt a capability in links none of its native code,
    frameworks, or dependencies. The capability's `isAvailable()` and
    `is<View>Available()` answer false, and each of its calls resolves
    `not-linked`.
  - `not-linked` applies to a capability missing from the build's list.
    `no-module` applies to a module that is missing although its capability
    is on the list, or on a binary that records no list (FR8).
  - The package's manifests declare no permission. The generated native
    project carries every permission the app needs (FR4).

  FR3 gap: the native controls and the navigation hosts link only when an app
  opts in a `controls` or a `navigation` capability.

- **FR4 — Native code lives only in the platform layer.**
  - The library layer contains no native code, and the package has no
    runtime dependency beyond `react`, `react-native`, the Astryx packages FR2
    allows, and the optional peers of `./navigation-legacy` (FR5).
  - An app holds no hand-written native code. Its iOS and Android projects are
    generated from the app's configuration: by `astryx shell` (FR13), or by
    Expo's prebuild through `@astryxdesign/react-native-expo`'s configuration
    plugin (FR11). Both write the same host declarations, from data
    `@astryxdesign/react-native` provides per capability (`./declarations/*`,
    FR5). They always write the core's host declarations (on Android, the
    network-state permission), and from the app's list of capabilities they
    write the opt-in (FR3) and the host declarations each listed capability
    needs (permissions, usage descriptions, manifest entries, background
    modes). Every usage description has a default that the app can override,
    and nothing is written for a capability the app does not list.
  - An app-level native setting is configuration that the generated project
    carries. JavaScript cannot read or change it at run time.
  - The platform layer ships its native code as source that the app's native
    build compiles; the core and each opted-in capability register through
    autolinking and React Native's code generation.
  - The platform's native code calls public platform API only. A capability
    or group record that needs an exception names the API and the reason.
  - `@astryxdesign/native` is the single cross-platform contracts package of
    `spec:AST-082` (DEC-7). The React Native platform ships inside
    `@astryxdesign/react-native`, with the native half of Astryx's components
    linked by default and each device feature linked when an app opts it in
    (FR3), because each device feature carries its own native code,
    permissions, and size. The package may consume `@astryxdesign/native`'s
    generated contracts (OQ2).
- **FR5 — The public surface is deliberate.** Each package declares its entries
  in its `exports` map, and an import outside the map is unsupported.
  - `.` is the app API: the library layer's components, themes, and hooks,
    and the platform core's always-present objects, views, and result
    vocabulary. It holds no router and no optional capability's objects or
    views.
  - `./storage` (storage, secure storage, files) and `./network` (network,
    cookies, client identity, and the installers below) hold the rest of the
    core.
  - `./theme`, `./styles`, and `./i18n` hold the theme objects, the style
    helpers, and the strings.
  - `./camera`, `./media`, `./microphone`, `./pdf`, `./photos`, and `./web`
    are the opt-in capabilities' entries. `./controls` holds the native
    controls and the gesture views of the library's components
    (`spec:AST-126`, `spec:AST-124`). `./navigation` is reserved for the Astryx
    router and its navigators over the navigation hosts (FR2): the name is
    held, and the package exports the entry only once it holds them.
  - Apart from the Jest setup file, no entry installs a global when it is
    imported (DEC-10). `./network` exports two installer functions that an
    app calls when it wants the globals below:
    - One installs each of `crypto.getRandomValues` and `crypto.randomUUID`
      that the runtime lacks, from the system's secure random generator, and
      leaves an existing one in place. Without that generator it installs
      nothing and reports `no-module`; it never fills them from a non-secure
      source. It reports which of the two it installed.
    - The other makes the global `fetch` honor `redirect: 'error'` and
      `redirect: 'manual'`. It reports false when the runtime has no global
      `fetch`.
    - Calling an installer again changes nothing.
  - Apart from the crypto installer, the package's own code reads no global
    `crypto` and does not depend on `fetch`'s `redirect: 'error'` or
    `redirect: 'manual'` modes.
  - The Preview host (FR1) calls both installers before a previewed
    project's code runs, so a project in preview has these globals without
    importing anything for them. Outside the Preview host, the package
    installs them only when the app calls the installers.
  - `./navigation-legacy` (with its `./navigation-legacy/core`) is the React
    Navigation binding, the one inside the package: a transitional entry that
    binds React Navigation's navigators. Its peer dependencies on React Navigation,
    react-native-screens, react-native-safe-area-context, and
    `@callstack/liquid-glass` are optional, so an app that does not import it
    installs none of them, and no other entry imports it. It is removed before the package joins the stable channel (FR14).
  - `./testing` is the testing surface: mocks of every native module in its
    absent, older, and current shapes, event emitters, and a Jest setup file
    (`./testing/jest-setup`), the package's only module with side effects. It
    is public and documented.
  - Internal entries hold the plumbing Astryx's own tools need (the host plumbing that the Expo package and the Preview host use, Astryx Stage's simulation, and the documentation site's examples and coverage data). They have the status `spec:AST-017` FR21 gives Core's
    `./internal/*`: undocumented for apps, versioned with the package (FR14),
    limited by a package-boundary check, and outside the compatibility
    promise.
  - `./commands` is the Node-only entry that exports one function per
    command of FR13, with its reference docs and tests (`spec:AST-042` FR2).
    No other entry imports it.
  - `./declarations/*` holds the per-capability host declarations that
    `astryx shell`, `astryx apply`, and the Expo package's plugin write (FR4).
  - `@astryxdesign/react-native-expo` exports its configuration plugin as
    `./app.plugin.js`, so an Expo app names that package in its plugin list.
    `@astryxdesign/react-native`'s own `./app.plugin.js` stays exported,
    marked `@deprecated`, for one minor version (DEP-0020): loading it fails
    with an error that names `@astryxdesign/react-native-expo`, and it writes
    nothing.
  - `.` exports nothing named `*ForTesting`, `reset*`, `SIMULATED_*`, or
    `*_NAME`.
  - A renamed or removed public name or entry stays exported, marked
    `@deprecated`, for one minor version.
- **FR6 — One result vocabulary.** Every asynchronous call in the platform resolves `AstryxResult<T, R>`: `{ok: true, …}` with its data, or
  `{ok: false, reason, message?}`. It never rejects.
  - `reason` comes from a closed set per capability plus the common reasons
    `no-module`, `not-linked`, `unsupported`, `cancelled`, `not-allowed`, and
    `error`. `no-module` means the platform's native side is absent;
    `not-linked` means the app did not opt the capability's native code in
    (FR3); `unsupported` means the binary predates the method or one of its
    options; `not-allowed` means the Astryx app's policy refused the
    capability for the project that called it. A capability may add reasons
    of its own, such as `unsupported-option` where a platform cannot honor an
    option.
  - `cancelled` is the one failure that is not an error: the person declined
    or dismissed something. A caller branches on it and shows no error.
  - `message` is platform text for logs. It never carries a URL's query, a
    cookie, a key, or a token.
- **FR7 — One capability shape.**
  - Every capability object has `isAvailable(): boolean` (synchronous, cheap,
    cached), and `supports(feature)` where the capability has named features
    (FR8). Every view has an
    `is<View>Available()` probe. A capability the app did not opt in answers
    false, and its calls answer `not-linked`.
  - A path a platform or an older binary does not support answers
    `unsupported`, or the capability's own reason for an option the platform
    cannot honor. It is never a silent no-op and
    never a quietly weaker behavior.
  - Permissions are explicit: `AstryxPermissions.get` and `request`, and a
    `use<Capability>Permission()` hook. Mounting a view never prompts.
  - Hooks own lifecycle: they cancel their work on unmount and return stable
    callbacks. Module handles and native versions never appear in app-facing types. A
    request that presents system UI (sign-in, the file picker) may take an
    optional `rootTag` that names the presenting surface.
  - Names follow React Native's own conventions: `source={{uri}}`, `ref`,
    `on<Event>(event)` with one object argument, `is` and `has` booleans, and
    string unions for closed sets. A call takes its subject first and one
    options object, with defaults for every option.
  - Each group of the platform has its own record, which details these rules
    and FR3's linking for the group's pieces:

    | Group                      | Record         | Links             |
    | -------------------------- | -------------- | ----------------- |
    | Surfaces and glass         | `spec:AST-123` | core              |
    | Gestures and drag          | `spec:AST-124` | core              |
    | Navigation hosts           | `spec:AST-125` | core              |
    | Native controls            | `spec:AST-126` | core              |
    | Icons and drawing          | `spec:AST-127` | core              |
    | Menus and presentation     | `spec:AST-128` | core              |
    | Layout, text, and keyboard | `spec:AST-129` | core              |
    | System modules             | `spec:AST-130` | core              |
    | Web                        | `spec:AST-131` | `web`             |
    | Media and camera           | `spec:AST-132` | `media`, `camera` |
- **FR8 — Native interfaces evolve additively.** Every TurboModule and native
  component spec in the platform follows these rules, and a check in the
  package enforces them:
  - A module is read with `TurboModuleRegistry.get`, never `getEnforcing`; an
    absent module answers `no-module`, or `not-linked` when the app did not
    opt its capability in (FR3).
  - Each module's handle is read only by its own wrapper.
  - New behavior is a new optional method or prop. A shipped method's
    arguments and result never change.
  - A new method takes one request object and resolves one result object with
    `status` (`ok`, `cancelled`, or `error`), `reason`, and `message`. A
    domain outcome, such as "not found", is a field of an `ok` result.
  - Every native contract is at revision 1. Behavior added after that
    baseline is a named feature, `<Contract>.<feature>`, that the binary
    reports through the platform info module (`spec:AST-130`). JavaScript
    checks a feature before it uses the behavior. On a binary without it,
    JavaScript keeps the revision-1 behavior, draws its fallback, or answers
    `unsupported`, so an older binary is never silently wrong. No contract
    carries a revision counter.
  - A member that exists on one platform only says so in its name or tag.
  - Every spec file has a header with its owner, platforms, first version,
    and stability, and lists the contract's named features.

  FR8 gap: each module reports a behavior revision number
  (`getConstants().version`) instead of named features.

- **FR9 — The library speaks Astryx; the platform speaks the platform.** The
  platform's public types use platform vocabulary, except the native controls,
  whose appearance is Astryx's design language. The library maps Astryx
  vocabulary onto the platform: icon names onto system symbols
  (`spec:AST-082/FR17`), feedback moments onto haptic kinds, and the theme onto
  native appearance. `AstryxAppRoot` wires the platform's hosts by default and
  takes `nativeHosts` options; `NativeHostsProvider` composes the same hosts
  for an app that builds its own root.
- **FR10 — The packages build on core and on the shared native code.**
  - Tokens, themes, and icon names come from `@astryxdesign/core`'s one theme
    definition (`spec:AST-082/FR10`), read under `spec:AST-082/FR16`. The React
    Native packages never define a second token set.
  - Components keep core's names and core contracts (`spec:AST-082/FR3`).
  - Where `@astryxdesign/native`'s Swift package provides a native control or
    view for a component, the platform wraps that shared control instead of
    drawing a second one.
- **FR11 — Expo builds are supported; Expo Go is not a target.** The platform builds in a prebuild or development-build project and in EAS Build
  through `@astryxdesign/react-native-expo`, with no manual native edits. Its
  configuration plugin writes the host declarations of FR4, and its host
  hooks join the platform to the Expo app's lifecycle, on iOS through the
  app delegate and on Android through the application's lifecycle
  listeners. The platform does not run in Expo Go.
  `@astryxdesign/react-native` requires no Expo library
  (`spec:AST-082/FR13`); `expo` is a peer dependency of
  `@astryxdesign/react-native-expo` only, which an app outside Expo never
  installs. Expo's API shapes do not limit the platform's API.
- **FR12 — Astryx Stage is the contract developers build against.** Astryx
  Stage runs on macOS, Linux, and Windows. It renders an app
  built with these packages with iOS and Android looks, headless or in a
  window, for previews, scripted checks, and agent loops.
  - Every public platform API has an implementation in Astryx Stage whose
    behavior matches iOS and Android. A missing or divergent path is a
    defect, and the capability's documentation names it until it is fixed.
  - Each capability's documentation states its behavior in Astryx Stage as
    the contract and notes where iOS and Android differ.
  - Astryx Stage is a development tool. An app never depends on it at run
    time.
  - Astryx Stage pairs with a project by the spec hash of the project's
    native contracts plus a version floor: the package records each native
    contract's spec hash and the oldest Astryx Stage that implements that
    contract set. An Astryx Stage below the floor refuses the project by
    itself and lists the contracts it lacks. The pairing reads no revision
    counter (FR8).
- **FR13 — React Native commands are Astryx CLI commands.**
  `@astryxdesign/react-native` contributes the commands below to the Astryx
  CLI (`@astryxdesign/cli`), and a developer or an agent runs them as
  `astryx <command>`. In an app, that is `npx astryx <command>`, or the
  package manager's runner, such as `pnpm exec astryx <command>`, because the
  app installs the CLI (below). The record, the package's docs, its templates,
  and its agent text write each command bare, as `astryx <command>`, and the
  CLI prints it with the app's runner prefix. How the CLI loads and calls the
  commands is OQ5.
  - The package is a base (`spec:AST-114` FR3): its integration manifest
    declares `base`. In an app that installs it and no Core, every run reads
    it with no flag (`spec:AST-114` FR2). In a project that installs both,
    every React Native command takes `--base @astryxdesign/react-native`, which
    a `package.json` script can carry, such as
    `"ios": "astryx run ios --base @astryxdesign/react-native"`.
  - An app installs `@astryxdesign/cli` as a development dependency. The
    package declares `@astryxdesign/cli` as an optional peer dependency whose
    lowest version is the first release that runs these commands, and
    `create` writes the CLI into the new app's `devDependencies` at that range.
    An app that adopts the package without `create` installs both packages.
  - The commands, each with the one job it does:

    | Command                                | Its one job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
    | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `astryx create <path>`                 | Writes a new app into an empty folder from an app template (`--template <name>`, default `starter`; `--list` lists the templates). With `--install-deps` it also installs the dependencies; otherwise it prints the install command for the app's package manager. `astryx run` generates the native projects when they are missing.                                                                                                                                                                                                                                                                         |
    | `astryx shell`                         | Writes the app's generated `ios/` and `android/` projects from `astryx.shell` in its `package.json`. `--check` compares instead of writing, `--ensure` writes a platform that has no generated files and checks the others, `--entry-only` writes only the generated entry files and touches no native folder, and `--profile <name>` applies a profile of the configuration. `astryx shell save-lock` keeps the iOS pod lock for the next generation.                                                                                                                                                       |
    | `astryx apply`                         | Writes the configuration plugin's declarations into the native projects of an app that keeps its own, with no `astryx.shell`. `--check` compares instead of writing.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
    | `astryx run ios`, `astryx run android` | Puts the app on a simulator, an emulator, or a device. The steps of its plan are: generate or check the native project, check the machine, build, start the dev server for a debug build, install, and launch. `--target <name\|id>` names the simulator, emulator, or connected device, by name or identifier (default: the booted one, else the newest). `--release` builds the release configuration, `--with-dev-server` and `--skip-dev-server` change the dev-server default (together they fail with `ERR_INVALID_OPTION`), `--skip-launch` stops after the install, and `--dry-run` prints the plan. |
    | `astryx preview`                       | Prints the link with which the Astryx app opens the project from this computer's dev server, and whether a dev server answers. It never starts one; `--start` starts the dev server and keeps running. `--link-only` probes nothing, `--dev-server-url <url>` names a running dev server, and `--qr-png <file>` writes the link's QR code.                                                                                                                                                                                                                                                                   |
    | `astryx preview check`                 | Compares the project's requirements with what the Astryx app provides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
    | `astryx preview bundle`                | Writes a preview bundle per platform, with its manifest, for any HTTPS host. `--single-file` writes one file per platform, and `--encrypt --public-url <url>` writes it encrypted, with the key only in the link.                                                                                                                                                                                                                                                                                                                                                                                            |
    | `astryx preview serve`                 | Serves the preview bundle (`--bundle <dir>`) read-only from this computer, and writes it first when it is older than the project's sources.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
    | `astryx preview share`                 | Serves the encrypted preview bundle over the internet through a carrier and prints one link.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
    | `astryx stage shot`                    | Takes one capture of the app in Astryx Stage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
    | `astryx stage play <script>`           | Runs a scripted check in Astryx Stage and reports each step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
    | `astryx stage a11y`                    | Reads the app's accessibility tree in Astryx Stage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
    | `astryx stage open`                    | Shows the app in an Astryx Stage window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
    | `astryx stage install`                 | Gets the Astryx Stage release that the package pins, and verifies it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
    | `astryx stage which`                   | Says which Astryx Stage the commands use and where it comes from.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
    | `astryx doctor`                        | Its existing job. In a run on the package, its report includes the toolchain (Xcode, CocoaPods, the JDK, the Android SDK, the dev-server port) and the app (generated projects, the pod lock, applied declarations).                                                                                                                                                                                                                                                                                                                                                                                         |
    | `astryx docs react-native`             | Its existing job, on the package's docs topic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

    `astryx stage` without a subcommand prints the group's help. The `stage`
    subcommands take Astryx Stage's render options as their own:
    `--platform`, `--device`, `--os-version`, `--mode light|dark`, `--rtl`,
    `--theme`, `--route`, `--dev-server-url <url>`, `--engine <path>`, and
    `--out <path>`. `--engine` runs a binary that no checksum covers, and
    `stage which` reports that source. No command passes arguments through to
    another tool.

  - Each command is a thin layer over one function that the package's
    `./commands` entry exports (FR5, `spec:AST-042` FR1), and each new
    top-level command meets `spec:AST-042` FR4:

    | Command   | The question it answers                                                             | The closest command, and why it does not answer                                                              | Function  | Its result as data                                    |
    | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------- |
    | `create`  | How do I start a React Native app on Astryx?                                        | `experimental theme preview app` writes a web starter app for a theme; `init` sets up a project that exists. | `create`  | The app's folder, its files, and the next commands    |
    | `shell`   | Are this app's generated native projects what its configuration generates?          | `init` writes agent docs and setup steps, not native projects.                                               | `shell`   | The written or differing paths                        |
    | `apply`   | Do the native projects this app keeps carry the declarations its capabilities need? | `shell` owns generated projects and replaces them whole; `apply` changes files the app owns, in place.       | `apply`   | The changed or differing files                        |
    | `run`     | How do I see this app on a simulator, an emulator, or a device?                     | `build` names the template or playbook for a page; it builds no app.                                         | `run`     | The plan, each step's result, and the launched target |
    | `preview` | How does the Astryx app open this project?                                          | `template --cdn` writes a web page; no command makes what the Astryx app opens.                              | `preview` | Links, URLs, and host-check items                     |
    | `stage`   | What does this app render, and how does it behave, without a simulator?             | `experimental render` renders a web page from a page module.                                                 | `stage`   | Captures, step reports, and the accessibility tree    |

  - Flags keep the Astryx CLI's names and meanings (`spec:AST-042` FR5).
    `--json` and `--base` are the CLI's global flags. `shell`, `apply`,
    `doctor`, `preview bundle`, `preview serve`, and `preview share` act on
    every platform the app has unless `--platform ios|android` names one.
    `preview` and the `stage` subcommands answer for one platform: the one
    `--platform` names, `ios` otherwise. `--check` compares instead of writing. `--dry-run` prints the
    plan and changes nothing. `--out <path>` names where a command writes.
    `--dev-server-url <url>` names a running dev server and
    `--dev-server-port <n>` the port of the one a command starts or probes.
    `--display-name <words>` is the name a person sees, on `create` and on
    `preview`. `create --package-spec <version|tarball>` names what the app
    depends on. The app is the project that encloses the working folder; no
    command takes a folder option for it, because the run's release and base
    come from that folder (`spec:AST-081` FR2, `spec:AST-114` FR2).
  - The commands read no Astryx-owned environment variable
    (`spec:AST-017` FR14). Every setting is an option or a `package.json`
    field. React Native's own variables, such as `RCT_METRO_PORT`, keep their
    meaning.
  - Every command follows `architecture:cli-surface`. It asks no question
    (INV1). With `--json` it prints one envelope (INV2). Its text output is
    plain text (INV4), so a QR code reaches a person only as a PNG file
    (`--qr-png`). It exits 0 or 1, the same in text and JSON (INV8), and its
    outcomes differ by `code` (INV3):

    | Outcome                                                                                                                                                    | Code                                                                 |
    | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
    | A wrong or missing argument or option                                                                                                                      | `ERR_INVALID_ARGUMENT`, `ERR_INVALID_OPTION`, `ERR_MISSING_ARGUMENT` |
    | No app encloses the working folder                                                                                                                         | `ERR_PROJECT_REQUIRED`                                               |
    | A tool the command needs is missing: Xcode, CocoaPods, the JDK, the Android SDK, or Astryx Stage (with the suggestion `astryx stage install`)              | `ERR_DEP_MISSING`                                                    |
    | `create` names a folder that is not empty                                                                                                                  | `ERR_FILE_EXISTS`                                                    |
    | `create --template` names no app template                                                                                                                  | `ERR_UNKNOWN_TEMPLATE`                                               |
    | `run --target` names no simulator, emulator, or device                                                                                                     | `ERR_NOT_FOUND`                                                      |
    | The dev-server port a command starts on is in use                                                                                                          | `ERR_DEV_SERVER_PORT_IN_USE`                                         |
    | A download fails                                                                                                                                           | `ERR_FETCH_FAILED`                                                   |
    | `shell --check` or `--ensure` finds generated files that differ                                                                                            | `ERR_SHELL_STALE`                                                    |
    | `apply --check` finds files to change                                                                                                                      | `ERR_APPLY_STALE`                                                    |
    | A build or an install step fails; the envelope's `log` member holds the log's path and its last lines                                                      | `ERR_RUN_BUILD_FAILED`                                               |
    | A named dev server does not answer                                                                                                                         | `ERR_DEV_SERVER_UNREACHABLE`                                         |
    | `preview check` finds a requirement the Astryx app does not provide                                                                                        | `ERR_PREVIEW_HOST_MISSING`                                           |
    | `preview share` finds a file that its deny rules refuse                                                                                                    | `ERR_PREVIEW_SHARE_DENIED`                                           |
    | `preview share` uses a carrier that no `--accept-carrier` names; the suggestions name the same run with `--accept-carrier <name>` and each carrier's terms | `ERR_PREVIEW_CARRIER_NOT_ACCEPTED`                                   |
    | An Astryx Stage binary fails its checksum or signature                                                                                                     | `ERR_STAGE_UNTRUSTED`                                                |
    | An Astryx Stage script step fails                                                                                                                          | `ERR_STAGE_STEP_FAILED`                                              |
    | The app throws or fails to start in Astryx Stage                                                                                                           | `ERR_STAGE_JS_ERROR`                                                 |
    | Astryx Stage cannot set up the project                                                                                                                     | `ERR_STAGE_PROJECT_SETUP`                                            |
    | The app's platform contracts need revisions this Astryx Stage lacks                                                                                        | `ERR_STAGE_CONTRACTS`                                                |
    | A React Native command runs on a base that does not provide it                                                                                             | `ERR_BASE_COMMAND`                                                   |

  - `preview share` takes each carrier's terms with `--accept-carrier <name>`,
    once per carrier it may use, on every run. Nothing is stored. Without it,
    the share fails with `ERR_PREVIEW_CARRIER_NOT_ACCEPTED`, and the error lists each
    carrier with its terms in its suggestions.
  - A command that keeps running (`run` while it holds the dev server,
    `preview --start`, `preview serve`, `preview share`, and `stage open`)
    says so in its summary, so help and the manifest carry it. It writes its
    result once, when it is ready, and then closes standard output; under
    `--json` that result is one envelope with `running` (whether the process
    stays) and the process's `pid`, `port`, and `url` where it has them. Progress and the output of every process it
    starts go to standard error. Stopping it with SIGINT or SIGTERM exits 0.
  - The commands' own writes stay inside the app (INV10), with three
    exceptions: `create` writes the new app's folder inside the working
    folder; the Astryx Stage cache is a per-user place (`spec:AST-081` FR7);
    and a file that `--out` or `--qr-png` names by an absolute path is written
    there, never replacing a file the command did not write
    (`architecture:cli-surface` DEC-16). The tools a command starts (Xcode,
    Gradle, CocoaPods) keep their own caches.
  - `create` runs before any project installs the package. After a computer
    install of both packages,
    `npm install -g @astryxdesign/cli @astryxdesign/react-native`, the
    command `astryx create my-app --base @astryxdesign/react-native` runs in
    a folder outside any project. Inside a project, the project installs
    `@astryxdesign/react-native` first, and `create` then needs no computer
    install. A one-off package runner without a computer install is OQ6.
  - In a run whose active base is not the package, a React Native command is
    hidden from help and still recognized, as `spec:AST-114` FR7 and FR8 do
    for a step. Running one writes nothing, exits 1 with `ERR_BASE_COMMAND`,
    and prints one line:

        Error: astryx stage is a React Native command from @astryxdesign/react-native; the active base @astryxdesign/core does not provide it.

    The suggestions depend on the project. With no such package installed,
    the suggestion is the install command. With the package installed beside
    Core, it is the same command with `--base @astryxdesign/react-native`. In
    a run on Core, the suggestions also name the web commands that the
    unknown-command answer names. `astryx <command> --help` prints the same
    line and exits 1, and `astryx manifest` lists the command by name with
    `available: false`. The CLI recognizes the names in the official-packages
    data of the release that answers; any other name fails with
    `ERR_UNKNOWN_COMMAND`.

  - An integration that builds on the package (`spec:AST-114` FR9) adds
    commands the same way the package adds its own.
  - The commands start and stream long-running processes (the dev server,
    Xcode and Gradle, a static server, a tunnel, the Astryx Stage window).
    They write many files, binary files included (generated native projects,
    template images and fonts). The mechanism that OQ5 settles carries each
    of these, and it also carries the commands' `CommandDoc`s, their error
    codes, their JSON response types, their output blocks (INV23), their
    write confinement (INV10), and their `outsideProject` values
    (`spec:AST-081` FR4).
  - `doctor`'s React Native items come from one step that the package's
    adapter serves, appended to `spec:AST-114` FR4's list as `setup.checks`:
    findings in `doctor`'s issue format, with the statuses `pass`, `warn`,
    `fail`, and `info`. `astryx doctor` takes `--platform ios|android`,
    `--scope preview` (native-build items report as `info`), and
    `--dev-server-port <n>`; each declares `requires: [setup.checks]`
    (`spec:AST-114` FR5).
  - The package's own command, `astryx-react-native <command>` (also
    `npx @astryxdesign/react-native <command>`), runs the same commands with
    its own flag spellings. When `astryx <command>` runs the commands,
    DEP-0019 deprecates every command of the bin except `create`, and
    CLN-0019 removes them. `create` stays on the bin until OQ6 is answered.
  - The package pins the Astryx Stage release its commands use, in a file the
    package ships, never in `astryx.config`, whose keys `@astryxdesign/cli`
    validates. `astryx stage install` verifies each binary's checksum and
    signature.
  - No command writes a key into `astryx.config`. `@astryxdesign/cli`
    contains no React Native command code, so a web project installs nothing
    for these commands.

  FR13 gap: `astryx <command>` does not run the React Native commands; they
  run as `astryx-react-native <command>`.

- **FR14 — One React Native release train.** `@astryxdesign/react-native`
  releases on one version; its capabilities are opted in, never versioned
  apart, and its commands (FR13) release with it.
  `@astryxdesign/react-native-expo` and the Preview host's package release on
  the same version, from the same tagged commit, under the rules below.
  - The package versions on its own, outside the repository's fixed package
    group (`spec:AST-017` FR46): the version in its `package.json` is its own
    next planned release, not core's.
  - A release starts as release candidates, `<version>-rc.<n>`, each cut from
    a tagged commit. A fix after a release candidate ships as the next release
    candidate, and a fix after the release ships as a patch release.
  - While it is canary-only, the package publishes only on the canary channel, under `spec:AST-082/FR15`: its release candidates and releases, and canaries that carry its own declared version with `-canary.<commit>`. It joins the stable channel in
    a planned minor once a platform is supported.
  - Before 1.0, a minor version may change the API. Each release has a
    changelog with migration steps for every rename and removal, and a
    release records the packed tarball with its hash.
- **FR15 — Evidence matches the claim.**
  - Evidence for native behavior comes from the iOS Simulator, the Android
    emulator, devices, and Astryx Stage. The Simulator and the emulator are the
    source of truth during development; every change to native behavior is
    checked there and in Astryx Stage.
  - A passing build is not evidence of behavior. A claim about camera,
    haptic feel, or performance needs a real device.
  - The platform's tests cover each native module in its absent,
    older, and current shapes through `./testing`.
  - API blocks in each package's documentation are generated from source, and
    a check fails when they drift.

### Platform support

- Supported feature/engine floor: iOS at React Native's own minimum and Android
  API level 24, on React Native's New Architecture (Fabric and TurboModules)
  only, with the React and React Native versions each package declares as
  peers.
- Unsupported behavior: a capability a binary lacks answers `not-linked`,
  `no-module`, or `unsupported` (FR3, FR6, FR7); a view a binary lacks reports itself unavailable
  and the library draws its fallback; Expo Go and the old architecture are not
  supported (FR11).
- Browser evidence: none. Native claims are proven on the Simulator, the
  emulator, devices, and Astryx Stage (FR15).

## Current-state impact

- Two new packages under `packages/`: `@astryxdesign/react-native` and
  `@astryxdesign/react-native-expo`, canary-only (FR1, FR14). The Preview
  host's package is a third, whose publication OQ7 settles.
- `@astryxdesign/cli` runs the package's commands (FR13) through the mechanism
  OQ5 settles, and `architecture:cli-surface` gains that mechanism. The CLI
  holds no React Native command code.
- `spec:AST-114` reads the package as a base. Its FR4 list gains the
  `setup.checks` step, and its FR5 table gains `doctor`'s `--platform`,
  `--scope`, and `--dev-server-port`, each requiring that step (FR13).
- `spec:AST-114` FR6's check, FR7's help and manifest, and FR8's refusal also
  cover a command that a base package provides: `ERR_BASE_COMMAND`, checked
  after `ERR_BASE_NOT_FOUND` and `ERR_BASE_AMBIGUOUS` and before any
  `requires`. The official-packages data that `@astryxdesign/cli` bundles
  gains each official base's command names.
- `spec:AST-042` FR1 and FR2 extend to the functions that a base package's
  entry exports for its commands, and FR4's admission covers FR13's new
  top-level commands.
- `architecture:cli-surface`: INV3 registers FR13's new codes,
  `ERR_BASE_COMMAND` included; INV2 and INV9 admit a command that keeps
  running, writes its one result, and closes standard output; INV2's error
  envelope gains the `log` member of `ERR_RUN_BUILD_FAILED`; INV10 and `spec:AST-081` FR7 gain the new app's folder
  and the Astryx Stage cache as write roots, and INV10 admits a file that
  `--out` or `--qr-png` names by an absolute path, as DEC-16 does for
  `experimental render --out`.
- `@astryxdesign/react-native` and `@astryxdesign/react-native-expo` version
  on their own, outside the fixed package group of `spec:AST-017` FR46, and
  the repository's canary release gives them their own declared version
  (FR14).
- `spec:AST-017` FR21 extends the status of Core's `./internal/*` to the
  package's internal entries (FR5).
- The group records `spec:AST-123` to `spec:AST-132` detail FR3's linking and
  FR7's shape for each group of the platform (FR7).
- `spec:AST-082` DEC-7 gains one sentence: the React Native candidate's native
  code lives in the platform layer of `@astryxdesign/react-native` (`spec:AST-112` FR4), and
  `@astryxdesign/native` stays the single cross-platform contracts package.
- The package-boundary check gains the FR2 rules: no import from the library layer in
  the platform layer, no import of Expo, of `@astryxdesign/react-native-expo`, or of the Preview host's package in `@astryxdesign/react-native`, no import of a capability from the platform's core outside its loader or from another capability, no dependency on a third-party navigation package (react-native-screens and react-native-safe-area-context included) other than the optional peers of `./navigation-legacy`, no peer dependency outside Astryx other than React, React Native, and the optional peers of `./navigation-legacy`, and no dependency on these packages from core or the CLI.

## Verification

| Contract | Verification                                                                                                                                                                                                                                                                                                                                                    | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Package manifest check of names, entries, and dependencies; the canary release's package list; a source check of `@astryxdesign/react-native` for Expo code and Preview host code                                                                                                                                                                               | each package in the public set; each capability entry; `@astryxdesign/react-native-expo`'s peers; the Preview host's package                                                                                                                                                                                                                                                                                                                                  | A package missing from the set, a set package missing from the canary release, a capability without its entry, Expo code or a Preview host piece in `@astryxdesign/react-native`, or an Expo package whose peer is not `@astryxdesign/react-native` at the same version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR2      | Package-boundary, source, and dependency check                                                                                                                                                                                                                                                                                                                  | the platform's source and tests; the library and platform layers; the core and each capability; the package's dependencies; `@astryxdesign/react-native-expo`; the Preview host's package                                                                                                                                                                                                                                                                     | An import from the library in the platform, a capability import in the core outside its loader, an import between capabilities, a dependency on a third-party navigation package (react-native-screens and react-native-safe-area-context included) other than the optional peers of `./navigation-legacy`, or a peer dependency outside Astryx other than React, React Native, and the optional peers of `./navigation-legacy`, or an import of Expo, `@astryxdesign/react-native-expo`, or the Preview host's package in `@astryxdesign/react-native`                                                                                                                                                                                                                                                                                                                                                                                       |
| FR3      | Built app with the core only, compared with one per opted-in capability: binary symbols and the merged manifest; unit tests of each capability's `isAvailable()` and a call's reason                                                                                                                                                                            | the native half of each library component; a capability's native module, frameworks, dependencies, permissions; an opted-out capability; a missing module of an opted-in one; a binary that records no list                                                                                                                                                                                                                                                   | A core-only app that lacks a library component's native half, an app that did not opt a capability in links any of its native code or declarations, `isAvailable()` answers true for it, a call resolves a reason other than `not-linked`, or a missing module of an opted-in capability, or one on a binary that records no list, resolves a reason other than `no-module`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR4      | `npm pack` file list; a sample app's projects generated by `astryx shell` and by Expo's prebuild from configuration with a capability list; a source check of the platform's native calls                                                                                                                                                                       | the package's files; the sample's iOS and Android projects from each generator; a default and an overridden usage description; a call outside public platform API                                                                                                                                                                                                                                                                                             | Native code outside the platform layer, the package manifests declare a permission, the sample needs a manual native edit, the two generators write different declarations, the generated project lacks the core's declarations, it writes a usage description other than the default or the app's override, or a call outside public platform API with no exception named in its record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR5      | `exports` map and public-entry name check; package-boundary check of the internal entries' imports; source check of global reads; unit tests of the installers; a previewed project's runtime                                                                                                                                                                   | `.`, `./storage`, `./network`, `./theme`, `./styles`, `./i18n`, each capability entry, `./navigation-legacy`, `./testing`, `./testing/jest-setup`, the internal entries, `./declarations/*`, the deprecated `./app.plugin.js`, the Expo package's `./app.plugin.js`; a runtime without the secure random generator; a runtime with only one of the two `crypto` functions; a runtime without a global `fetch`; an installer called twice; a previewed project | A private name on `.`, a deep import resolving, an app importing an internal entry, a router or optional capability exported from `.`, another entry importing `./navigation-legacy`, a `./navigation` entry that does not hold the router, a deprecated `./app.plugin.js` that loads without an error naming `@astryxdesign/react-native-expo`, a module with side effects other than the Jest setup, an import other than the Jest setup that installs a global, package code other than the crypto installer that reads the global `crypto`, package code that depends on `fetch`'s redirect modes, a non-secure random fill, a crypto installer that replaces a `crypto` function the runtime provides, an installer that reports nothing or changes anything on a second call, a `fetch` that follows a redirect under `redirect: 'error'` or `'manual'` after its installer ran, or a previewed project that starts without the globals |
| FR6      | Unit tests of every asynchronous call through `./testing` mocks                                                                                                                                                                                                                                                                                                 | absent, older, and current module; a missing option; a native throw; cancel                                                                                                                                                                                                                                                                                                                                                                                   | A call rejects, or answers a reason outside its set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR7      | Unit tests of each capability's probes, permissions, and hook cleanup                                                                                                                                                                                                                                                                                           | an older binary; a view mounted without permission; unmount                                                                                                                                                                                                                                                                                                                                                                                                   | A silent no-op, a prompt on mount, or work that outlives its component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR8      | Spec rules check in the platform; unit tests of each named feature through `./testing` mocks of an older binary                                                                                                                                                                                                                                                 | a new method; a component spec; a platform-only member; a binary without a named feature                                                                                                                                                                                                                                                                                                                                                                      | A changed shipped method, a missing header, a new method without `status`, a contract that reports a revision other than 1 or a revision counter, a behavior after revision 1 without a named feature, or JavaScript that uses a feature the binary does not report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR9      | Source check of platform public types; library tests of the mappings and the default hosts                                                                                                                                                                                                                                                                      | an icon name; a feedback moment; a theme change                                                                                                                                                                                                                                                                                                                                                                                                               | Astryx vocabulary in a generic capability type, or the app root without hosts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR10     | Token comparison between the library and core's theme; review of shared native controls                                                                                                                                                                                                                                                                         | every token; each component with a shared native control                                                                                                                                                                                                                                                                                                                                                                                                      | A token value that differs from core's, or a second native control drawn beside a shared one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR11     | Prebuild and EAS Build of the sample app with `@astryxdesign/react-native-expo`; the old plugin entry loaded                                                                                                                                                                                                                                                    | the sample with every capability opted in; `@astryxdesign/react-native`'s `./app.plugin.js`                                                                                                                                                                                                                                                                                                                                                                   | The build needs a manual native edit, `@astryxdesign/react-native` requires an Expo library, or the old plugin entry writes anything or fails without naming `@astryxdesign/react-native-expo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR12     | Scripted checks of each capability in Astryx Stage, the simulator, and the emulator; Astryx Stage run on a project above its floor                                                                                                                                                                                                                              | each public API; an Astryx Stage below the version floor                                                                                                                                                                                                                                                                                                                                                                                                      | An Astryx Stage result differs from iOS and Android and the documentation does not name it, or an Astryx Stage below the floor runs the project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR13     | CLI contract tests of each React Native command, run as `astryx <command>` and as `astryx-react-native <command>`: JSON envelopes, exit codes, each code in FR13's table, Astryx Stage's checksum and signature refusal, the refusal in a run on another base; a source check for Astryx-owned environment variables; a dependency check of `@astryxdesign/cli` | each command; a long-running command stopped by SIGINT; `create` after a computer install; `create` inside a project that installs Core; a tampered binary; a web project; a project that installs Core and the package                                                                                                                                                                                                                                       | An exit code that depends on `--json` or is neither 0 nor 1, a question asked, output on standard output after a long-running command's result, a tampered binary runs, an Astryx-owned environment variable read, a React Native command in a web project reads as unknown, the two command names disagree on a result, or `@astryxdesign/cli` contains or depends on React Native command code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR14     | Canary and release-candidate dry run                                                                                                                                                                                                                                                                                                                            | a release of the package set                                                                                                                                                                                                                                                                                                                                                                                                                                  | A release without a changelog or the tarball's hash, a capability versioned apart, a package of the set on another version, or a release candidate or canary that carries a version other than the package's own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR15     | Review of each native change's evidence; documentation drift check                                                                                                                                                                                                                                                                                              | a native behavior change; a renamed API                                                                                                                                                                                                                                                                                                                                                                                                                       | A native claim backed only by a build or by anything other than the Simulator, the emulator, a device, or Astryx Stage, or documentation that no longer matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Decision log

### DEC-1 — The platform is a layer for Astryx, below the library

**Reference:** `spec:AST-112/DEC-1`
**Decider:** imdreamrunner, 2026-11-09

The platform layer owns the native contract and first-class capability
objects; the library layer calls them directly and keeps the Astryx mapping.
Apps call the same objects for capabilities the library does not cover.
Dependencies point from the library layer to the platform layer only, so the
native API stays clean and the library can change without touching native
code.

Rejected: a design-system-neutral platform built for standalone use, because
it would duplicate the mapping the library owns.

### DEC-2 — One package with opt-in capabilities

**Reference:** `spec:AST-112/DEC-2`
**Decider:** imdreamrunner, 2026-11-09

An app installs one package and imports everything from it: the components
and the native platform layer. An app that stores data does not ship a camera
permission, a media service, or their frameworks: it links each device feature
only when it opts it in (DEC-13), and its generated native project carries the
opt-in and the declarations, so an app never edits a native project by hand.

Rejected: a separate platform package, or one package per capability, because
the packages could be installed at different versions and each app would
track several packages that only work together.

### DEC-3 — Apps hold no native code

**Reference:** `spec:AST-112/DEC-3`
**Decider:** imdreamrunner, 2026-11-09

The platform brings all native code; an app's native projects are
generated from configuration with the package's plugin. An Astryx upgrade then
reaches every app through its dependencies, and no app carries native code that
drifts from the platform.

Rejected: app-owned native shell code, because each app would maintain native
code the platform cannot update.

### DEC-4 — Results, never rejections

**Reference:** `spec:AST-112/DEC-4`
**Decider:** imdreamrunner, 2026-11-09

Every failure is data in one shape with a closed reason, so a caller handles it
with a type-checked branch, and a cancel is told apart from an error.

Rejected: rejecting promises for failures, because an unhandled rejection is
easy to miss and its reason is not typed.

### DEC-5 — Expo builds, not Expo Go

**Reference:** `spec:AST-112/DEC-5`
**Decider:** imdreamrunner, 2026-11-09

Cloud and prebuild builds are a goal, so the platform has a configuration
plugin and host hooks for Expo, in their own package (DEC-11). Expo Go cannot
load the packages' native code, and an API limited to what every Expo module
offers would cap the platform.

Rejected: building the platform's modules on Expo's module system, because it
adds a second interface to keep in step without enabling any build.

### DEC-6 — React Native commands are Astryx CLI commands

**Reference:** `spec:AST-112/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An agent learns one command, one help, and one output and error-code
contract, so the package's commands run as `astryx <command>` under the
CLI's rules. The package ships them, so a web project installs nothing for
them, and they release with the package.

Rejected: a separate released CLI, or the commands inside `@astryxdesign/cli`,
because the first keeps a second contract in step and the second puts React
Native commands in every web project.

### DEC-7 — Astryx Stage's behavior is the contract developers read

**Reference:** `spec:AST-112/DEC-7`
**Decider:** imdreamrunner, 2026-11-09

Developers build against Astryx Stage, so its behavior is what they rely on. Astryx's
own development checks the simulator and emulator as the source of truth and
keeps Astryx Stage matched to them. A missing or divergent path is a defect.

### DEC-8 — One release train, canary first

**Reference:** `spec:AST-112/DEC-8`
**Decider:** imdreamrunner, 2026-11-09

The library and platform layers change together, so they ship in one package
on one version of its own, released through release candidates. It stays on
the canary channel until a platform is supported under `spec:AST-082/FR15`.

Rejected: core's version in the repository's fixed package group, because
every core release would move the package without a change in it, and the
package's pre-1.0 API changes would follow core's minor versions.

### DEC-9 — Astryx owns navigation, routing included

**Reference:** `spec:AST-112/DEC-9`
**Decider:** imdreamrunner, 2026-11-09

Gestures, bars, safe areas, and routing meet in the native stack, so Astryx
owns all of it: the package's `navigation` entry holds the router, the
platform's `navigation` capability holds the native stack and tab containers
with their transitions and gestures, the core holds safe-area insets, and
every bar, header, button, and search field is the system's, through the
platform's hosts, or drawn by the library. The packages take no third-party navigation dependency outside one
transitional entry, and an app that navigates with Astryx's router runs no
third-party native code for navigation.

Rejected: building on React Navigation, react-native-screens, and
react-native-safe-area-context, because their gesture handling couples to the
platform's and their state model would bound Astryx's.

### DEC-10 — Importing the package changes no globals outside its Jest setup

**Reference:** `spec:AST-112/DEC-10`
**Decider:** imdreamrunner, 2026-11-10

An app's behavior does not depend on the order of its imports, and the package
runs in a runtime whose globals it does not control. The package's own code
calls its platform directly instead of relying on the global `crypto` or on
`fetch`'s redirect modes. The preview host installs these globals for the
projects it hosts; any other app calls the exported installers when it wants
them.

Rejected: a side-effect `./polyfills` entry that an app imports first in its
entry file, because every app must remember the step and its effect depends on
import order.

### DEC-11 — Expo support ships in its own package

**Reference:** `spec:AST-112/DEC-11`
**Decider:** imdreamrunner, 2026-11-17

The configuration plugin and the host hooks depend on Expo's APIs, so they
live in `@astryxdesign/react-native-expo`, on the same version as the package.
An app outside Expo installs no Expo code, and the package's peers outside
Astryx stay React and React Native. The old plugin entry fails and names the
new package, so an Expo app learns of the move at its next prebuild instead of
building without its declarations.

Rejected: the plugin and hooks in the core package behind an optional peer,
because every app would carry Expo code.

### DEC-12 — The Preview host is a host package, not a capability

**Reference:** `spec:AST-112/DEC-12`
**Decider:** imdreamrunner, 2026-11-17

Running a separate React Native project inside an app is the job of a host,
such as the Astryx app, not a feature an app chooses. The host's native
pieces, its inspector channel, and its overlay window live in their own host
package. The library keeps the project side, because every previewed project
needs it.

Rejected: a `preview` capability that an app opts into, because no app other
than a host needs it, and every app's package would carry its code.

### DEC-13 — The library's own native pieces link by default

**Reference:** `spec:AST-112/DEC-13`
**Decider:** imdreamrunner, 2026-11-17

A library component with a native half is complete only when that half links,
so the native half of every library component links in every app: controls,
navigation hosts, gestures and drag, surfaces, menus, icons, and layout and
keyboard. A device feature brings a permission, a usage string, or a
library's size that an app must choose to carry, so camera, media,
microphone, PDF, photos, and web stay opt-in.

Rejected: opt-in capabilities for the library's own native pieces, because an
app would have to know which component needs which capability.

### DEC-14 — Contracts start at revision 1 and grow by named features

**Reference:** `spec:AST-112/DEC-14`
**Decider:** imdreamrunner, 2026-11-17

A named feature says which behavior a binary has, so JavaScript asks for the
behavior it is about to use and an older binary answers with a fallback or a
loud refusal. Astryx Stage pairs by the contracts' spec hashes and a version
floor, so it needs no count either.

Rejected: a revision counter per contract, because a number says that a
contract changed, not which behavior a binary has.

### DEC-15 — Native code uses public platform API only

**Reference:** `spec:AST-112/DEC-15`
**Decider:** imdreamrunner, 2026-11-17

An app built with these packages passes store review and keeps working across
OS updates only when its native code uses public API. A record that needs an
exception names it and the reason, so each one is visible and reviewed.

### DEC-16 — Native code an app would get from a library ships in the package

**Reference:** `spec:AST-112/DEC-16`
**Decider:** imdreamrunner, 2026-11-17

An app stays JavaScript-only and runs in Preview only when every native piece
it uses is in the package. A module whose alternative is an open-source
library that ships native code is therefore part of the platform, even when no
library component uses it, and its own record specifies it.

Rejected: a separate extras package for modules no component uses, because an
app and every Preview host would install a second package of native code.

## Deprecation and cleanup descriptions

These tables describe deprecations and removals for readers; the gate for a
removal is the declared minor and its `[breaking]` Changeset
(`spec:AST-017` FR31).

### DEP-0019 — Deprecate the `astryx-react-native` command

| Field            | Value                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0019`                                                                                                                                                                                                           |
| cleanup          | `CLN-0019`                                                                                                                                                                                                           |
| package          | `@astryxdesign/react-native`                                                                                                                                                                                         |
| surface          | Every command of the package's bin, `astryx-react-native <command>` (also `npx @astryxdesign/react-native <command>`), except `create`, with its flag spellings and its exit statuses 2, 3, and 4                    |
| old contract     | The FR13 commands under the package's own bin, with its own help, output, and exit statuses                                                                                                                          |
| replacement      | `astryx <command>` (FR13)                                                                                                                                                                                            |
| warning          | Text mode: one line on standard error that names DEP-0019 and the exact `astryx` command line, renamed flags included. JSON mode: the same line on standard error, because the bin's JSON outputs carry no envelope. |
| migration        | Mechanical. Each flag spelling and exit status maps to one `astryx` flag or code (FR13).                                                                                                                             |
| codemod          | None: the change is in commands a person or a script types, not in source.                                                                                                                                           |
| downstream       | The package's docs, templates, and agent text name `astryx <command>` only.                                                                                                                                          |
| direct authority | `spec:AST-112`                                                                                                                                                                                                       |
| state            | `proposed`: it starts when `astryx <command>` runs the commands                                                                                                                                                      |

### CLN-0019 — Remove the `astryx-react-native` command

| Field     | Value                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0019`                                                                                                                                                                    |
| lifecycle | `DEP-0019`                                                                                                                                                                    |
| delta     | The bin runs `create` only. Every other command prints one line that names the `astryx` form and exits 1, so `npx @astryxdesign/react-native …` never ends without a pointer. |
| rollback  | Restore the bin's dispatch to the FR13 commands from the last release that had it.                                                                                            |
| state     | `pending`: lands in the declared minor after DEP-0019, with its `[breaking]` Changeset                                                                                        |

### DEP-0020 — Deprecate the configuration plugin entry of `@astryxdesign/react-native`

| Field            | Value                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0020`                                                                                                                                                                |
| cleanup          | `CLN-0020`                                                                                                                                                                |
| package          | `@astryxdesign/react-native`                                                                                                                                              |
| surface          | The `./app.plugin.js` entry, which an Expo app names as `@astryxdesign/react-native` in its plugin list                                                                   |
| old contract     | The package's own configuration plugin writes the host declarations and the capability opt-in in Expo's prebuild                                                          |
| replacement      | `@astryxdesign/react-native-expo` in the plugin list, with the same options (FR11)                                                                                        |
| warning          | Loading the entry fails with one error that names `@astryxdesign/react-native-expo` and the plugin-list change. It writes nothing, so no prebuild runs on a stale plugin. |
| migration        | Mechanical: install `@astryxdesign/react-native-expo` at the package's version and rename the plugin entry.                                                               |
| codemod          | None: the change is one line of an app's Expo configuration.                                                                                                              |
| downstream       | The package's docs, templates, and agent text name `@astryxdesign/react-native-expo` only.                                                                                |
| direct authority | `spec:AST-112`                                                                                                                                                            |
| state            | `proposed`: it starts in the release that first publishes `@astryxdesign/react-native-expo`                                                                               |

### CLN-0020 — Remove the configuration plugin entry of `@astryxdesign/react-native`

| Field     | Value                                                                                  |
| --------- | -------------------------------------------------------------------------------------- |
| id        | `CLN-0020`                                                                             |
| lifecycle | `DEP-0020`                                                                             |
| delta     | `@astryxdesign/react-native` exports no `./app.plugin.js`.                             |
| rollback  | Restore the failing entry from the last release that had it.                           |
| state     | `pending`: lands in the declared minor after DEP-0020, with its `[breaking]` Changeset |

## Open questions

- **OQ2 — When do the library's component props come from
  `@astryxdesign/native`'s platform contracts?** (`human-api`) Options: now,
  under the `ios` and `android` conditions; or once core's portable entry
  ships. Recommendation: once the portable entry ships, with a check until then
  that the library's props match the generated contracts.
- **OQ3 — How does an app receive `@astryxdesign/native`'s Swift code?**
  (`checkable`) Options: the platform vendors the Swift sources it
  wraps; or the platform's native build depends on the Swift package directly.
- **OQ4 — Where are Astryx Stage's binaries published?** (`human-design`) Options: per
  OS and architecture packages on npm that the CLI installs; or release assets
  that the CLI downloads and verifies. Recommendation: release assets with
  checksums and signatures, because the binaries are large and npm's optional
  dependencies install every architecture's metadata.
- **OQ5 — How does the Astryx CLI run the package's commands?**
  (`human-api`; owners: imdreamrunner and josephfarina) `spec:AST-114`
  resolves the active base and checks each command against it before any
  command body runs (FR2, FR6). It adds no way for a package to add a
  command, and its adapters return data only (FR3). FR13 fixes the commands'
  names, options, and outcomes under either option; only the refusal code
  differs, as the second option says:
  - **A `commands` contribution.** The integration manifest declares each
    command with its `CommandDoc`, and the CLI calls the package's function
    under its output, exit-code, and write rules. The manifest's `cliCommand`
    key names the printed command prefix only.
  - **Platform steps.** `spec:AST-114` FR4's list gains steps for the
    commands' platform work, and the CLI owns the commands. The steps then
    start and stream processes, run until stopped, write many and binary
    files, and run before a project installs the package, which FR3's adapter
    rules do not allow. Under this option, a React Native command in a run on
    another base fails with FR8's `ERR_BASE_CAPABILITY`, not `ERR_BASE_COMMAND`.
- **OQ6 — Does a one-off package runner run `astryx create`?** (`human-api`;
  owners: imdreamrunner and josephfarina) `spec:AST-081` FR12 does not count a
  package runner's temporary install as an install root, and `spec:AST-114`
  FR2 reads `--base` only from the project, the package set that serves the
  run, or the computer. So
  `npx -p @astryxdesign/cli -p @astryxdesign/react-native astryx create my-app --base @astryxdesign/react-native`
  fails with `ERR_BASE_NOT_FOUND`. Inside a project that installs Core and
  not the package, `astryx create apps/mobile --base @astryxdesign/react-native`
  has the same need. Options:
  - **A named base resolves from the runner's install.** A package that
    `--base` names also resolves from the install root of the copy that
    answers, a package runner's temporary install included. The caller named
    the package, so the run reads only what it asked for. A second
    deprecation then covers `create` on the bin.
  - **The computer install stays the route.** `create` needs both packages
    installed for the computer, and the package's bin keeps `create` as
    the one-off route.
- **OQ7 — Is the Preview host's package published?** (`human-design`) The
  Preview host is its own host package (FR1, DEC-12). Options:
  - **Published with the set.** A third-party host app can run previewed
    projects the way the Astryx app does, and the host's own code is open to
    review; the package then carries the compatibility promise of a public
    package, and its inspector channel becomes public surface.
  - **Kept for the Astryx app.** The host evolves with the one app that uses
    it, with no promise to other hosts; a third-party host cannot run
    previewed projects.
- **OQ8 — Is the system sign-in session its own opt-in?** (`human-api`) The
  sign-in session is part of the package, and FR1 places it in `web`.
  Options:
  - **Its own capability.** An app that signs in without showing web content
    links no web view engine, and an app that shows web content links no
    sign-in dependency; an app that does both lists two capabilities.
  - **Part of `web`.** One capability covers everything browser-based, with
    one name to learn; every app that signs in carries the web view's native
    code and size.
