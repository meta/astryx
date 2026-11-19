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
written in JavaScript over a platform layer that holds its native code. Any
native build carries it, and an Expo app may add
`@astryxdesign/react-native-expo`, a lightweight wrapper with a configuration
plugin and declaration JSON (FR11). The Astryx CLI's React Native
commands create, check, and run the app (FR13). The app gets Astryx's
components, themes, icons, and native capabilities through one consistent
API. The package carries the native code that Astryx's components and
`create` templates use (FR20). An app on generated native projects gets its
native shell from the platform. The app links the native half of Astryx's
components by default, and links each device feature it opts in (FR3).

These packages are the React Native candidate of `spec:AST-082/FR12` for the
`ios` and `android` platforms. They follow `spec:AST-082`: dependencies under
FR13, the canary channel under FR15, the one-way read of core under FR16, and
shared icon names under FR17.

## Non-goals

- Push notifications and background work are out of scope for v0; apps get
  them from their host platform or a third-party SDK.
- Astryx Stage and Preview in the Astryx app are separate tools outside Astryx;
  Astryx specs, releases and docs don't require them.
- Adding Astryx React Native screens to an existing native iOS or Android app
  (brownfield) is not a v0 target.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — One package and an Expo adapter.** The package carries the native
  code that any Astryx component or `create` template uses; what goes in the
  package, in a module package, or outside Astryx follows FR20, and the group
  records (FR7) list each group's pieces. A separate package exists when it
  brings a third-party dependency; the Expo adapter is that case, so an app
  outside Expo installs no Expo code. The public set is:
  - `@astryxdesign/react-native`: the React Native platform package that
    `spec:AST-082` DEC-7 names, and the one package every app installs. It holds
    two layers, the per-capability host declarations (FR4), and the React
    Native commands it contributes to the Astryx CLI (FR13). It carries no Expo
    code:
    - The library layer: components, the app root (`AstryxAppRoot`), theming,
      the hooks an app uses, and the Astryx router (DEC-9). JavaScript and
      TypeScript only.
    - The platform layer, which holds every line of the package's native code:
      a core that links in every app, with the native half of the library's
      own components, and opt-in capabilities for device features (FR3,
      FR20).
  - `@astryxdesign/react-native-expo`: a lightweight wrapper for Expo apps, a
    configuration plugin plus the declaration JSON it applies at prebuild
    (FR4, FR11). Its peer dependencies are `@astryxdesign/react-native` and
    `expo`. It holds no component, no platform API, and no native code.

  FR1 gap: `@astryxdesign/react-native` carries the Expo configuration plugin.

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
    the reads of `@astryxdesign/core` that `spec:AST-082/FR16` allows; the
    shared contracts are built in (FR4). `@astryxdesign/core`
    and `@astryxdesign/cli` never depend on it (`spec:AST-082/FR14`).
  - The Astryx router holds the routing state and
    drives the platform's navigation hosts (`spec:AST-125`). Astryx also owns
    the native stack and tab containers, transitions, gestures, insets, and
    every bar, header, button, and search field, rendered by the system
    through the platform's hosts or drawn by the library (DEC-9). The router
    supports Astryx's screen header (`TopNav`), tab bar, and sheets.
  - An app may use another router, such as Expo Router, instead. Astryx
    components work inside it, and the app keeps that router's own navigation
    and chrome.
  - The package's only peer dependencies outside Astryx are React and React
    Native.
  - `@astryxdesign/react-native` brings all the native code Astryx needs and
    takes no third-party native dependency, so an Astryx upgrade reaches every
    app through the package alone (FR4); the Expo wrapper's `expo` peer, which its
    configuration plugin uses, is the one third-party dependency of the set
    (FR1). It owns its own recognizers (FR18) and
    measures its own safe-area insets.
  - Astryx components work beside third-party libraries in an app's own
    product code: react-native-gesture-handler,
    Reanimated, react-native-screens, react-native-safe-area-context, and
    haptics libraries included. A compatibility test runs Astryx components
    beside each of them on iOS and Android, and a release waits for it to pass.
    Astryx measures its own safe-area insets from the platform; they agree
    with any other inset provider the app uses, and the compatibility test
    checks that they agree.
  - Components animate with React Native's core `Animated` on the native
    driver, or in native hosts, so library motion runs on the UI thread with
    no JavaScript per frame; its feel follows `spec:AST-107` and
    `spec:AST-108`. The package takes no Reanimated dependency, so its motion
    needs nothing beyond React Native; an app may use Reanimated beside it.
  - `@astryxdesign/react-native` imports nothing from Expo or from
    `@astryxdesign/react-native-expo`, and declares neither as a dependency.
    `@astryxdesign/react-native-expo` reads only the package's declaration
    data (`./declarations/*`, FR5) and adds no capability.
  - The package's `./commands` entry (FR5, FR13) runs only in the Astryx CLI.
    An app's runtime never imports it, and `@astryxdesign/cli` never depends
    on the package.
- **FR3 — Astryx's components link by default; an app opts in to each device
  feature.** The core, with the native half of every library component, links
  with the library, in every app. Each opt-in capability is a device feature an app chooses, and
  it carries its own native module, system frameworks, dependencies, manifest
  components, services, and the permission, usage string, or heavy dependency
  that comes with the feature. The app's native build links a capability only
  when the app opts it in: on iOS a Podfile helper adds the capability's
  subspec, and on Android a Gradle property enables its source set. The app
  lists its capabilities in its configuration, and the generator of its native
  project (`astryx rn shell`, or the Expo package's plugin) writes both from that
  list (FR4), as `astryx rn apply` does into the projects of an app that keeps
  its own; an empty list links the core only. The native build records the list of capabilities it links, which the
  core reads. A minimal mode is an explicit opt-out of the default set.
  - Linking is not build policy. The capability list never changes the
    JavaScript engine or how React Native's core is built. Those are separate,
    explicit settings: a generated app states them in its configuration, and
    an app whose native projects are its own sets them itself, with no silent
    default.
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

- **FR4 — Native code lives in the platform layer.**
  - The library layer contains no native code, and the package has no
    runtime dependency beyond `react`, `react-native`, and the Astryx packages
    FR2 allows.
  - An app on generated projects holds no hand-written Astryx native code,
    and none in its native shell. Its iOS and Android projects are generated from the app's configuration: by `astryx rn shell` (FR13), or by
    Expo's prebuild through `@astryxdesign/react-native-expo`'s configuration
    plugin (FR11). Generated projects are a supported path, and the Expo
    wrapper is optional. Both write the same host declarations, from
    build-system-neutral data that `@astryxdesign/react-native` provides per
    capability (`./declarations/*`, FR5) and that `astryx rn apply` also writes
    into an app's own projects. They always write the core's host declarations, and from the app's list of capabilities they
    write the opt-in (FR3) and the host declarations each listed capability
    needs (permissions, usage descriptions, manifest entries, background
    modes). Every usage description has a default that the app can override,
    and nothing is written for a capability the app does not list.
  - Native projects come from the build system. Generated native projects are
    the default path, and a JavaScript-only app is the recommended one.
  - An app may add third-party native packages, which autolink, and native
    code of its own, as a declared tier that upgrades carry through: the app
    declares that code in its configuration, and `astryx rn shell` and the Expo
    wrapper keep it when they generate the native projects again. Native code
    an app adds beyond the package is the app's.
  - An existing app that keeps its own native projects adopts the package
    without generated ones. It lists its capabilities in the `astryx` field of
    its `package.json`, as a generated app does, and `astryx rn apply` (FR13)
    writes the opt-in (FR3) and the same host declarations into its own `ios/`
    and `android/` projects. Its own native code stays its own, and Astryx's
    native code still reaches it only through the package.
  - An app-level native setting is configuration that the generated project
    carries. JavaScript cannot read or change it at run time.
  - All of the set's native code lives in the platform layer, the app's
    lifecycle hookup included. The core exposes one neutral host entry for the
    app lifecycle, the app-delegate and application lifecycle calls and the
    launch hooks, which any native project calls. The core is
    Expo-neutral: it holds no Expo types, no Expo modules API, no Expo-named
    API and no Expo-specific code path; React Native-specific code is the
    core's job. Each
    app shell, whether the generated one, an Expo app through the Expo
    package's configuration plugin, or a hand-made native project, reaches the
    same lifecycle entry. At prebuild, the Expo package's configuration
    plugin writes the calls to that entry into the generated `AppDelegate` and
    `MainApplication`; `astryx rn shell` writes them into the projects it
    generates; and an app with its own native projects calls the entry itself.
    `@astryxdesign/react-native-expo` carries no native code (FR1, FR11).
  - The platform layer ships its native code as source that the app's native
    build compiles; how the core and each opted-in capability register and
    reach JavaScript is `spec:AST-140/FR1`'s.
  - The platform layer carries all the native code Astryx needs; it takes no
    third-party native dependency (FR2).
  - The platform's native code calls public platform API only. A capability
    or group record that needs an exception names the API and the reason.
  - The React Native platform ships inside
    `@astryxdesign/react-native`, with the native half of Astryx's components
    linked by default and each device feature linked when an app opts it in
    (FR3), because each device feature carries its own native code,
    permissions, and size.
  - The platform derives from the shared contracts: a private workspace
    package in this repository, `packages/contracts`, never published
    (DEC-19). Core's types and React Native's types build them in; the Swift
    and Kotlin generated from them are committed, and a CI check fails when
    they drift. No published package depends on the contracts package, and
    web pages gain 0 bytes from it. `@astryxdesign/native` is deprecated: the
    shared contracts replace it (DEC-19).
- **FR5 — The public surface is deliberate.** Each package declares its entries
  in its `exports` map, and an import outside the map is unsupported. While the
  package is canary-only, its public entries, `./testing` included, may change
  in any canary (FR8, FR14).
  - How native modules and native components are exposed to JavaScript is
    `spec:AST-140/FR1`'s; this requirement owns the package's entries.
  - `.` is the app API: the library layer's components, themes, and hooks,
    and the platform core's always-present objects and result vocabulary. It
    holds no router and no optional capability's objects or views.
  - App-facing components are Core components: their props are the core
    contract plus a platform contract (`spec:AST-082/FR3`, `spec:AST-082/FR5`
    to `spec:AST-082/FR8`). Platform props are typed per platform under
    `spec:AST-082`'s platform-props rules: its `shared` condition, its base
    props, and its prop names and docs; their types derive from the shared
    contracts (FR4). A `presentation` or `render`
    choice is a platform prop. The native controls and hosts are internal
    implementation behind those components; no entry exports one as a
    separate public view.
  - `./storage` (storage) and `./controls` (below) hold the rest of the core's app API; the navigation hosts are
    reached through the Astryx router (FR2).
  - `./theme`, `./styles`, and `./i18n` hold the theme objects, the style
    helpers, and the strings.
  - `./camera`, `./media`, `./photos`, and `./web` are the opt-in capabilities'
    entries. `./controls`, part of the core,
    holds the library's components whose native half is a native control or a
    gesture view (`spec:AST-126`, `spec:AST-124`); the controls and views
    themselves stay internal. `NavigationStack`, with `Screen`, `useScreenScrollProps()`, and the stack
    navigator over the navigation hosts (FR2), starts in the React Native lab
    under `./unstable/*` and moves to `./navigation` when web's
    `NavigationStack` leaves Lab (FR23, DEC-20).
  - Apart from the Jest setup file, no entry installs a global when it is
    imported (DEC-10).
  - The package's own code reads no global `crypto` and does not depend on
    `fetch`'s `redirect: 'error'` or `redirect: 'manual'` modes.
  - `./testing` is the testing surface: mocks of every native module in its
    absent, older, and current shapes, event emitters, the Debug-only frame
    recorder (`recordFrames` and `isFrameRecorderAvailable`,
    `spec:AST-140/FR7`), and a Jest setup file
    (`./testing/jest-setup`), the package's only module with side effects. It
    is public and documented.
  - The package has three API tiers. Public entries carry the compatibility
    promise (FR14). One `./unstable/*` namespace holds names that may change
    in any release; each carries `@experimental` in its declaration and
    `stability: 'experimental'` in its documentation (`spec:AST-017` FR21,
    FR22), since the path alone conveys no status. Everything else is
    not exported. Every public addition is reviewed.
    The documentation site's examples
    and coverage data are generated from the package's source when the site
    builds (FR15), so no entry exports them.
  - `./commands` is the Node-only entry that exports one function per
    command of FR13, with its reference docs and tests (`spec:AST-042` FR2).
    No other entry imports it.
  - `./declarations/*` holds the per-capability host declarations that
    `astryx rn shell`, `astryx rn apply`, and the Expo package's plugin write (FR4).
  - `@astryxdesign/react-native-expo` exports its configuration plugin as
    `./app.plugin.js`, so an Expo app names that package in its plugin list.
    `@astryxdesign/react-native` exports no `./app.plugin.js`.
  - `.` exports nothing named `*ForTesting`, `reset*`, `SIMULATED_*`, or
    `*_NAME`.
  - Each release's changelog lists every renamed or removed name or entry
    (FR14).
- **FR6 — One result vocabulary.** Every asynchronous call in the platform
  resolves one result shape with a closed set of reasons and never rejects;
  a person's cancel is not an error, and a message never carries a secret.
  `spec:AST-140/FR3` owns the shape, the common reasons, and their rules. The
  one exception is `./testing`'s Debug-only `recordFrames`, a test step that
  throws instead of resolving (`spec:AST-140/FR7`).
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
    request that presents system UI (the file picker) may take an
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
    | Photos                     | `spec:AST-135` | `photos`          |
- **FR8 — Contracts grow by named features.** A shipped native interface
  never changes; new behavior is additive and named, so an older binary is
  never silently wrong. A contract's baseline is its shape in the first release
  that carries it after the package leaves the canary channel, release
  candidates included, and later behavior is a named feature (DEC-14). `spec:AST-140/FR5` owns the rules
  and the check that enforces them.
  - FR6, FR7, and FR8 are internal conventions while the package is
    canary-only, and they may change in any canary; the public promise is
    decided when the package leaves the canary channel (FR14). The API shape
    follows the web's current conventions
    (`architecture:public-component-api`) and changes when they change.

- **FR9 — The library speaks Astryx; the platform speaks the platform.** The
  platform's public types use platform vocabulary, except the native controls,
  whose appearance is Astryx's design language. The library maps Astryx
  vocabulary onto the platform: icon names onto system symbols
  (`spec:AST-082/FR17`), feedback moments onto haptic kinds, and the theme onto
  native appearance through `defineNativeTheme` (`spec:AST-082/FR10`), which
  carries native-only visual intent on top of the defined theme. `AstryxAppRoot` wires the platform's hosts by default and
  takes `nativeHosts` options; `NativeHostsProvider` composes the same hosts
  for an app that builds its own root.
- **FR10 — The packages build on core and on the shared native code.**
  - Tokens, themes, and icon names come from `@astryxdesign/core`'s one theme
    definition (`spec:AST-082/FR10`), read under `spec:AST-082/FR16`. The React
    Native packages never define a second token set.
  - Components keep core's names and core contracts (`spec:AST-082/FR3`).
  - The platform's native controls are its own, typed from the Swift and
    Kotlin that the shared contracts generate (FR4).
- **FR11 — The build system is the app's; Expo Go is not a target.** The
  platform's host declarations are build-system-neutral data, and the core's
  app-lifecycle entry is neutral too (FR4), so an app builds with whatever
  native build it chooses, and nothing in the platform depends on one.
  - `@astryxdesign/react-native-expo` is a lightweight wrapper: a
    configuration plugin that, at prebuild, applies the declaration JSON (FR4)
    and writes the calls to the core's app-lifecycle entry into the generated
    `AppDelegate` and `MainApplication`. It carries no native code and adds no
    behavior of its own.
  - The platform does not run in Expo Go, which cannot load the package's
    native code.
  - `@astryxdesign/react-native` requires no Expo library
    (`spec:AST-082/FR13`); `expo` is a peer dependency of
    `@astryxdesign/react-native-expo` only, which an app outside Expo never
    installs. Expo's API shapes do not limit the platform's API.
- **FR13 — React Native commands are one `astryx rn` group.** The React
  Native extension of the Astryx CLI (`@astryxdesign/cli`) contributes one
  command group, `rn`, and a developer or an agent runs its commands as
  `astryx rn <command>`. In an app, that is `npx astryx rn <command>`, or the
  package manager's runner, such as `pnpm exec astryx rn <command>`, because
  the app installs the CLI (below). The record, the package's docs, its
  templates, and its agent text write each command bare, as
  `astryx rn <command>`, and the CLI prints it with the app's runner prefix.
  `@astryxdesign/cli` holds no React Native command; the group reaches the
  CLI through the CLI's command extension point (OQ5).
  - The package is a base (`spec:AST-114` FR3): its integration manifest
    declares `base`. In an app that installs it and no Core, every run reads
    it with no flag (`spec:AST-114` FR2). In a project that installs both,
    `astryx rn` reads the package as its base, and the shared commands below
    take `--base @astryxdesign/react-native`.
  - An app installs `@astryxdesign/cli` as a development dependency. The
    package declares `@astryxdesign/cli` as an optional peer dependency whose
    lowest version is the first release that runs the group, and
    `astryx rn create` writes the CLI into the new app's `devDependencies` at
    that range. An app that adopts the package without `astryx rn create`
    installs both packages.
  - The group's commands, each with the one job it does:

    | Command                                      | Its one job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
    | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `astryx rn create <path>`                    | Writes a new React Native app into an empty folder from an app template (`--template <name>`, default `starter`; `--list` lists the templates). With `--install-deps` it also installs the dependencies; otherwise it prints the install command for the app's package manager. `astryx rn run` generates the native projects when they are missing.                                                                                                                                                                                                                                                         |
    | `astryx rn shell`                            | Writes the app's generated `ios/` and `android/` projects from `astryx.shell` in its `package.json`. `--check` compares instead of writing, `--ensure` writes a platform that has no generated files and checks the others (`--check` and `--ensure` together fail with `ERR_INVALID_OPTION`), `--entry-only` writes only the generated entry files and touches no native folder, and `--profile <name>` applies a profile of the configuration. `astryx rn shell save-lock` keeps the iOS pod lock for the next generation.                                                                                 |
    | `astryx rn apply`                            | Writes the capability opt-in (FR3) and the host declarations (FR4) into the native projects of an app that keeps its own, with no `astryx.shell`. `--check` compares instead of writing.                                                                                                                                                                                                                                                                                                                                                                                                                     |
    | `astryx rn run ios`, `astryx rn run android` | Puts the app on a simulator, an emulator, or a device. The steps of its plan are: generate or check the native project, check the machine, build, start the dev server for a debug build, install, and launch. `--target <name\|id>` names the simulator, emulator, or connected device, by name or identifier (default: the booted one, else the newest). `--release` builds the release configuration, `--with-dev-server` and `--skip-dev-server` change the dev-server default (together they fail with `ERR_INVALID_OPTION`), `--skip-launch` stops after the install, and `--dry-run` prints the plan. |
    | `astryx rn doctor`                           | An alias that runs the shared `astryx doctor` with the package as its base.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

    No command passes arguments through to another tool.

  - Two commands stay shared, outside the group:
    - `astryx doctor` keeps its job. In a run on the package, its report
      includes the toolchain (Xcode, CocoaPods, the JDK, the Android SDK, the
      dev-server port) and the app (generated projects, the pod lock, applied
      declarations).
    - `astryx docs react-native` prints the package's docs topic.
  - Each command of the group is a thin layer over one function that the
    package's `./commands` entry exports (FR5, `spec:AST-042` FR1). The group
    is one new top-level command, `rn`, and it meets `spec:AST-042` FR4: it
    answers "how do I build, check, and run a React Native app on Astryx?",
    which no existing command answers, because `init`, `build`, and
    `experimental theme preview app` work on web projects and pages; its one
    job is the React Native app's lifecycle; and its results are data. Each
    subcommand stays inside that job:

    | Subcommand        | The question it answers                                                             | Why an option on another subcommand cannot answer it                                                                                                                                                      | Function                        | Its result as data                                    |
    | ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
    | `create`          | How do I start a React Native app on Astryx?                                        | Every other subcommand needs an app that exists.                                                                                                                                                          | `create`                        | The app's folder, its files, and the next commands    |
    | `shell`           | Are this app's generated native projects what its configuration generates?          | `apply` changes files the app owns, in place; `shell` replaces generated projects whole.                                                                                                                  | `shell`                         | The written or differing paths                        |
    | `shell save-lock` | Should the next generation keep this app's current iOS pod lock?                    | `shell` writes projects and `save-lock` writes nothing else, so an option on `shell` would make one run do two jobs.                                                                                      | `shellSaveLock`                 | The saved lock path                                   |
    | `apply`           | Do the native projects this app keeps carry the declarations its capabilities need? | `shell` owns generated projects only.                                                                                                                                                                     | `apply`                         | The changed or differing files                        |
    | `run`             | How do I see this app on a simulator, an emulator, or a device?                     | No other subcommand builds or launches.                                                                                                                                                                   | `run`                           | The plan, each step's result, and the launched target |
    | `doctor`          | Is this machine and this app ready to build and run a React Native app?             | It is an alias, not a new job: it runs `astryx doctor` with the package as its base, so `astryx doctor --base @astryxdesign/react-native` answers the same and the group keeps the question in one place. | `doctor` (the shared command's) | `doctor`'s issue report                               |

  - Flags keep the Astryx CLI's names and meanings (`spec:AST-042` FR5).
    `--json` and `--base` are the CLI's global flags. `astryx rn shell`,
    `astryx rn apply`, and `astryx doctor` act on every platform the app has
    unless `--platform ios|android` names one, and `astryx rn run` takes its
    platform as its argument. `--check` compares instead of writing.
    `--dry-run` prints the plan and changes nothing. `--dev-server-port <n>`
    names the port of the dev server a command starts or probes.
    `astryx rn create --display-name <words>` is the app's name on the home
    screen.
    `astryx rn create --package-spec <version|tarball>` names what the app
    depends on. The app is the project that encloses the working folder; no
    command takes a folder option for it, because the run's release and base
    come from that folder (`spec:AST-081` FR2, `spec:AST-114` FR2).
  - The commands read no Astryx-owned environment variable
    (`spec:AST-017` FR14). Every setting is an option or a `package.json`
    field. React Native's own variables, such as `RCT_METRO_PORT`, keep their
    meaning.
  - Every command follows `architecture:cli-surface`. It asks no question
    (INV1). With `--json` it prints one envelope (INV2). Its text output is
    plain text (INV4). It exits 0 or 1, the same in text and JSON (INV8), and
    its outcomes differ by `code` (INV3):

    | Outcome                                                                                               | Code                                                                 |
    | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
    | A wrong or missing argument or option                                                                 | `ERR_INVALID_ARGUMENT`, `ERR_INVALID_OPTION`, `ERR_MISSING_ARGUMENT` |
    | No app encloses the working folder                                                                    | `ERR_PROJECT_REQUIRED`                                               |
    | A tool the command needs is missing: Xcode, CocoaPods, the JDK, or the Android SDK                    | `ERR_DEP_MISSING`                                                    |
    | `astryx rn create` names a folder that is not empty                                                   | `ERR_FILE_EXISTS`                                                    |
    | `astryx rn create --template` names no app template                                                   | `ERR_UNKNOWN_TEMPLATE`                                               |
    | `astryx rn run --target` names no simulator, emulator, or device                                      | `ERR_NOT_FOUND`                                                      |
    | The dev-server port a command starts on is in use                                                     | `ERR_DEV_SERVER_PORT_IN_USE`                                         |
    | A download fails                                                                                      | `ERR_FETCH_FAILED`                                                   |
    | `astryx rn shell --check` or `--ensure` finds generated files that differ                             | `ERR_SHELL_STALE`                                                    |
    | `astryx rn apply --check` finds files to change                                                       | `ERR_APPLY_STALE`                                                    |
    | A build or an install step fails; the envelope's `log` member holds the log's path and its last lines | `ERR_RUN_BUILD_FAILED`                                               |
    | `astryx rn` runs where the React Native package is not installed                                      | `ERR_BASE_COMMAND`                                                   |

  - A command that keeps running (`astryx rn run` while it holds the dev
    server) says so in its summary, so help and the manifest carry it. It
    writes its result once, when it is ready, and then closes standard
    output; under `--json` that result is one envelope with `running`
    (whether the process stays) and the process's `pid`, `port`, and `url`
    where it has them. Progress and the output of every process it starts go
    to standard error. Stopping it with SIGINT or SIGTERM exits 0.
  - The commands' own writes stay inside the app (INV10), with one exception:
    `astryx rn create` writes the new app's folder inside the working folder.
    The tools a command starts (Xcode, Gradle, CocoaPods) keep their own
    caches.
  - `astryx rn create` runs before any project installs the package. After a
    computer install of both packages,
    `npm install -g @astryxdesign/cli @astryxdesign/react-native`, the
    command `astryx rn create my-app` runs in a folder outside any project.
    Inside a project, the project installs `@astryxdesign/react-native` first,
    and `astryx rn create` then needs no computer install. A one-off package
    runner without a computer install is OQ6.
  - `rn` is the one name the CLI reserves for the group. Where the package is
    not installed, `astryx rn` is hidden from help and still recognized, as
    `spec:AST-114` FR7 and FR8 do for a step. Running any `astryx rn` command
    there writes nothing, exits 1 with `ERR_BASE_COMMAND`, and prints one
    line:

        Error: astryx rn is the React Native command group from @astryxdesign/react-native, which this project does not install.

    Outside a project the line ends "which is not installed on this
    computer". The suggestion is the install command for that place: the
    project's package manager inside a project, and
    `npm install -g @astryxdesign/cli @astryxdesign/react-native` outside
    one. `astryx rn --help` prints the same
    line and exits 1, and `astryx manifest` lists `rn` by name with
    `available: false`.

  - An integration that builds on the package (`spec:AST-114` FR9) adds
    commands to the `rn` group the same way the package adds its own.
  - The commands start and stream long-running processes (the dev server,
    Xcode and Gradle). They write many files, binary files included
    (generated native projects, template images and fonts). The extension
    point that OQ5 shapes carries each of these, and it also carries the
    commands' `CommandDoc`s, their error codes, their JSON response types,
    their output blocks (INV23), their write confinement (INV10), and their
    `outsideProject` values (`spec:AST-081` FR4).
  - `astryx doctor`'s React Native items come from one step that the
    package's adapter serves, appended to `spec:AST-114` FR4's list as
    `setup.checks`: findings in `doctor`'s issue format, with the statuses
    `pass`, `warn`, `fail`, and `info`. `astryx doctor` takes
    `--platform ios|android` and `--dev-server-port <n>`; each declares
    `requires: [setup.checks]` (`spec:AST-114` FR5).
  - No command writes a key into `astryx.config`. `@astryxdesign/cli`
    contains no React Native command code, so a web project installs nothing
    for these commands.

  FR13 gap: the CLI has no command extension point, so `astryx rn` does not
  exist, and the package carries a command of its own,
  `astryx-react-native <command>`.

- **FR14 — One React Native release train.** `@astryxdesign/react-native`
  releases on one version, and its capabilities and commands (FR13) release
  with it.
  `@astryxdesign/react-native-expo` releases on the same version, from the same tagged commit, under the rules below; its peer dependency on `@astryxdesign/react-native` is a normal version range.
  - While it is canary-only, the package versions on its own, outside the
    repository's fixed package group (`spec:AST-017` FR46): the version in its
    `package.json` is its own next planned release. It joins the
    release group in a planned minor once a platform is supported
    (`spec:AST-082/FR15`).
  - A release starts as release candidates, `<version>-rc.<n>`, each cut from
    a tagged commit. A fix after a release candidate ships as the next release
    candidate, and a fix after the release ships as a patch release.
  - While it is canary-only, the package publishes only on the canary channel, under `spec:AST-082/FR15`: its release candidates and releases, and canaries that carry its own declared version with `-canary.<commit>`.
  - Before 1.0, a minor version may change the API. Each release has a
    changelog with migration steps for every rename and removal, and a
    release records the packed tarball with its hash.
- **FR15 — Evidence matches the claim.**
  - Evidence for native behavior comes from the iOS Simulator, the Android
    emulator, and devices. The Simulator and the emulator are the source of
    truth during development; every change to native behavior is checked
    there.
  - A passing build is not evidence of behavior. A claim about camera,
    haptic feel, screen-reader behavior, or performance needs a real device.
  - The platform's tests cover each native module in its absent, older, and
    current shapes through `./testing`; `spec:AST-140/FR7` owns the native-layer
    conformance tests.
  - Each package's documentation is generated from the same data as the code
    (its contracts, props, and features), split by capability, and a check
    fails when it drifts. A prop shared with the web library carries
    per-platform wording where the platforms differ.

- **FR16 — Web parity is the goal.** A React Native component implements a
  Core component and its core contract (`spec:AST-082/FR3`). Where a React
  Native–only component with no Core counterpart starts is OQ7. Where a
  component falls short of its contract, the gap is a line in that component's own record.
- **FR17 — Each piece has a place and evidence.**
  - JavaScript lives in the library layer, and native code in the platform
    layer: in the core, with the native half of every library component, or
    in an opt-in capability when it carries a permission, a usage string, or a
    heavy dependency (FR3, FR20).
  - A piece enters with a ledger entry that names its source requirement, its
    target, why it belongs in the package, and its done criteria. The group
    records of FR7 are these entries.
  - A piece is done when it derives from the shared contracts, passes the
    conformance tests that every platform runs, and meets FR15's real-device
    bar.
- **FR18 — Astryx's gestures join each platform's arbitration.**
  - The gesture module registers Astryx's recognizers with each platform's
    arbitration: on iOS, recognizer relationships such as require-to-fail and
    simultaneous recognition; on Android, touch interception.
  - It exposes a handle per recognizer, so other recognizers, those of
    react-native-gesture-handler included, can declare their relationship to
    it; `spec:AST-124` specifies the gesture handle API.
  - It runs natively, independent of the JavaScript runtime.
  - Gesture behavior and feel follow `spec:AST-094`, `spec:AST-107`, and
    `spec:AST-108`.
  - Astryx owns its own recognizers, and the app owns its other gestures.
- **FR19 — Accessibility follows the core contract on every native surface.**
  - Every native host and control exposes its core contract's semantics under
    VoiceOver and TalkBack: names, roles, states, focus order, and
    announcements (`spec:AST-082/FR3`, `spec:AST-082/FR12`).
  - Touch target size and the system text-size setting follow
    `spec:AST-082/FR11`.
  - Native transitions and gestures follow the reduced-motion preference.
  - A screen-reader claim needs a real device (FR15).

- **FR20 — Each native piece has one home.** `@astryxdesign/react-native`
  ships all native code that any Astryx component or any of Astryx's own
  `create` templates uses, so no Astryx component needs a third-party library.
  A native piece goes to one of three homes:
  - **In `@astryxdesign/react-native`**, when an Astryx component or template
    uses it: in the core, or as an opt-in capability when it carries a
    permission, a usage string, or a heavy dependency (FR3, DEC-13), as
    `camera` and `photos` do.
  - **In a module package of its own**, when Astryx owns a native module that
    no component uses but several apps share. It follows this record's
    platform-layer rules (FR2 to FR8, FR15) and releases with the package
    (FR14).
  - **Outside Astryx**, otherwise: an app uses its host platform's
    implementation or the libraries it chooses, and Astryx components work
    beside them (FR2).
  - A piece moves into the core package only when a component or template
    starts to use it, and leaves it when none does. The core never holds a
    module because one app needs it, and no Astryx package depends on a
    module package.
  - The core carries what drawing components need. The app-shell pieces, the
    native classes and launch steps of an app's shell, are not capabilities and
    are not in the capability list (FR3): `astryx rn shell` writes them into a
    generated app's native projects, and an app with its own native projects
    keeps its own (FR4). The build
    generates a size table per capability, and a check fails when the table is
    missing a capability.
- **FR21 — Who draws is `render`; glass and materials are a look.**
  - `render` names who draws an element's pixels, on every component that can
    be drawn either way. `system`: the platform draws it, such as a
    host-presented bar or tab bar, a platform control, or a system menu's or
    sheet's chrome. `drawn`: Astryx draws it in React. `auto`: the
    component's own default, per platform where the platforms differ. The
    value is `system`, never `native`.
  - Glass and materials are not `render` values. `surface` (`glass`,
    `material`, or `plain`) says which kind of surface an element is, and the
    native theme's `material` member (`opaque` or `translucent`,
    `spec:AST-082` FR10) decides how that surface looks.
  - On `Button` and `IconButton`, `surface` is a situational appearance
    choice made per call site, whatever the button's `render` value: each use
    picks the surface that fits where the button sits. A drawn button draws
    that surface, and a system-drawn button shows it as the platform's
    matching button style.
  - The public API expresses glass and materials through component props
    (`surface` and presentation) and through native theme intent in
    `defineNativeTheme`, with `platforms.ios` and `platforms.android`
    entries. No public JavaScript glass
    or material component exists. The platform layer keeps native glass and
    material components as internal implementation: on iOS the system's glass,
    and on Android a drawn or Material surface.

  FR21 gap: the code spells the axis two ways, navigators
  `render: 'system' | 'drawn'` and components `presentation: 'native' | …`,
  and uses a fixed default, `drawn`, where the native theme's `render.default`
  goes.

- **FR22 — Contracts are engine-neutral.** The contracts and the conformance
  tests assume no particular JavaScript engine or renderer where one is not
  essential, and each native module is specified at an interface that another
  engine could host. `spec:AST-140/FR8` owns which parts of the platform code are
  engine-specific and which are neutral. React Native's
  New Architecture is today's floor (Platform support), because its native
  component and module interfaces are the ones the platform implements.
- **FR23 — NavigationStack starts in the lab.** The React Native
  `NavigationStack`, with `Screen`, `useScreenScrollProps()`, and the stack
  navigator, starts in the package's lab folder, `packages/react-native/lab/`,
  exported only under `./unstable/*` (FR5), and moves to `./navigation` when
  web's `NavigationStack` leaves Lab (DEC-20). It follows the web's Lab-to-Core
  lifecycle (`spec:AST-017` FR27), as amended in Current-state impact. A pull
  request that changes the lab folder runs CI as any mixed pull request does
  (`spec:AST-030` FR13).

### Platform support

- Supported feature/engine floor: iOS at React Native's own minimum and Android
  API level 24, on React Native's New Architecture only, with the React and
  React Native versions each package declares as peers. How the native code
  registers with React Native's renderer and module system is
  `spec:AST-140`'s.
- Unsupported behavior: a capability a binary lacks answers `not-linked`,
  `no-module`, or `unsupported` (FR3, FR6, FR7); a view a binary lacks reports itself unavailable
  and the library draws its fallback; Expo Go and the old architecture are not
  supported (FR11).
- Browser evidence: none. Native claims are proven on the Simulator, the
  emulator, and devices (FR15).

### Platform asks

Astryx asks React Native for the platform pieces below. No requirement of this
record depends on an ask whose owner has not agreed to it.

| Ask                                         | Owner             | Status        | What it unblocks                                                                 | Astryx's interim                                                  | Exit plan                                                                                                     |
| ------------------------------------------- | ----------------- | ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Native gesture arbitration across libraries | React Native core | not discussed | One arbitration that Astryx's recognizers and other libraries' recognizers share | The gesture module's per-recognizer handles (FR18)                | Astryx registers its recognizers through the platform's arbitration and keeps its handles as a thin layer     |
| Haptics                                     | React Native core | not discussed | Feedback moments without a module of Astryx's own                                | The core's haptics capability (`spec:AST-130`, FR9)               | The capability calls the platform's haptics API; no shape is frozen at 0.x, so its API follows the platform's |
| One source of safe-area insets              | React Native core | not discussed | Insets that every library reads the same way                                     | The core's safe-area insets (FR2, FR3)                            | The core reads the platform's insets; no shape is frozen at 0.x, so its API follows the platform's            |
| Keyboard tracking                           | React Native core | not discussed | Layouts that follow the keyboard frame by frame on the UI thread                 | The keyboard pieces of the layout, text, and keyboard group (FR7) | The group reads the platform's keyboard frames; no shape is frozen at 0.x, so its API follows the platform's  |

## Current-state impact

- Two new packages under `packages/`: `@astryxdesign/react-native` and
  `@astryxdesign/react-native-expo`, canary-only (FR1, FR14).
- `@astryxdesign/cli` runs the commands that `@astryxdesign/react-native` and
  the integrations that build on it add under `astryx rn` (FR13) through the
  mechanism OQ5 settles, and `architecture:cli-surface` gains that mechanism. The CLI
  holds no React Native command code.
- `spec:AST-114` reads the package as a base. Its FR4 list gains the
  `setup.checks` step, and its FR5 table gains `doctor`'s `--platform` and
  `--dev-server-port`, each requiring that step (FR13).
- `spec:AST-017` FR27 keeps the React Native `NavigationStack`, with `Screen`,
  `useScreenScrollProps()`, and the stack navigator, in the lab folder of
  `@astryxdesign/react-native` instead of the Lab package until web's
  `NavigationStack` leaves Lab (FR23, DEC-20).
- `spec:AST-114` FR2's resolution order gains one rule for the reserved `rn`
  group: `astryx rn` reads `@astryxdesign/react-native` as its base as if
  `--base` named it where FR2 may read it: inside a project, only the
  project's own install, a project that also installs Core included, as
  `spec:AST-081` FR12 allows; outside a project, the package set that serves
  the run or the computer's install. Where neither has the package,
  `astryx rn` refuses with `ERR_BASE_COMMAND`. Its DEC-5, which reaches a base other than
  Core only through `--base`, gains that exception (FR13).
- `spec:AST-114` FR6's check, FR7's help and manifest, and FR8's refusal also
  cover the reserved `rn` group: `ERR_BASE_COMMAND`, checked after
  `ERR_BASE_NOT_FOUND` and `ERR_BASE_AMBIGUOUS` and before any `requires`.
  The CLI reserves the name `rn`, so it needs no list of React Native command
  names.
- `spec:AST-042` FR1 and FR2 extend to the functions that any package or
  integration exports for the commands it adds under `astryx rn` (FR13),
  with their docs and tests, and FR4's admission covers FR13's one new
  top-level command, `rn`, and its subcommands.
- `architecture:cli-surface`: INV3 registers FR13's new codes,
  `ERR_BASE_COMMAND` included; INV2 and INV9 admit a command that keeps
  running, writes its one result, and closes standard output; INV2's error
  envelope gains the `log` member of `ERR_RUN_BUILD_FAILED`; INV10 gains the new app's folder as a write root.
- While canary-only, `@astryxdesign/react-native` and
  `@astryxdesign/react-native-expo` version on their own, outside the fixed
  package group of `spec:AST-017` FR46, and the repository's canary release
  gives them their own declared version; they join the release group once a
  platform is supported (FR14, `spec:AST-082/FR15`).
- `spec:AST-140` owns the platform code's shared rules: how native pieces
  register and reach JavaScript (FR1), a missing piece (FR2), the result
  vocabulary across the boundary (FR3), the values that cross (FR4), additive
  evolution of native interfaces (FR5), threading (FR6), the native-layer
  conformance tests (FR7), which parts are engine-specific (FR8), and
  coexistence (FR9). This record's FR4 to FR6, FR8, FR15, and FR22 point
  there.
- The package's `./unstable/*` names are experimental under `spec:AST-017`
  FR21 and FR22 (FR5).
- The group records `spec:AST-123` to `spec:AST-132` and `spec:AST-135`
  detail FR3's linking and
  FR7's shape for each group of the platform (FR7).
- `spec:AST-082` FR10's `defineNativeTheme` configuration gains one member,
  `render.default: 'auto' | 'system' | 'drawn'`; `auto` keeps each
  component's own per-platform default (FR21).
- `spec:AST-082` DEC-2 gains one sentence, with **Decider:** cixzhang,
  2026-11-18: `surface` on `Button` and `IconButton` is a situational,
  per-call-site appearance choice, and the look of that surface stays the
  native theme's `material` member (FR21).
- `spec:AST-082` DEC-2 also gains, as a proposal of this record: a component's
  `render` prop is a presentation choice under its DEC-6, not a visual
  (FR21).
- `spec:AST-082` DEC-7's existing sentence on where the React Native
  candidate's native code lives names its home: the platform layer of
  `@astryxdesign/react-native` (`spec:AST-112` FR1, FR4), and the shared
  contracts become the private workspace package `packages/contracts`, built
  into each package and never published, and `@astryxdesign/native` is
  deprecated (`spec:AST-112` FR4, DEC-19).
- `spec:AST-082` FR5, FR6, FR9, FR10, FR15, FR16, and FR19, and
  `spec:AST-093`, which name `@astryxdesign/native` as the home of the platform
  contracts, their documentation, the Swift and Kotlin bindings, the `ios`,
  `android`, and `shared` type conditions, and `defineNativeTheme`, move the
  platform contracts to the shared contracts (DEC-19). Which published package
  carries the public type conditions and the other non-contract parts after
  the deprecation is OQ8.
- The package-boundary check gains the FR2 rules: no import from the library layer in
  the platform layer, no import of Expo or of `@astryxdesign/react-native-expo` in `@astryxdesign/react-native`, no import of a capability from the platform's core outside its loader or from another capability, no third-party native or navigation dependency, no peer dependency outside Astryx other than React and React Native, and no dependency on these packages from core or the CLI.

## Verification

| Contract | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                      | Representative states                                                                                                                                                                                                                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Package manifest check of names, entries, and dependencies; the canary release's package list; a source check of `@astryxdesign/react-native` for Expo code                                                                                                                                                                                                                                                                                       | each package in the public set; each capability entry; `@astryxdesign/react-native-expo`'s peers                                                                                                                                                                                                                                                               | A package missing from the set, a set package missing from the canary release, a capability without its entry, Expo code in `@astryxdesign/react-native`, or an Expo package that carries native code or whose peers are other than `@astryxdesign/react-native` and `expo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR2      | Package-boundary, source, and dependency check; a compatibility test of Astryx components beside third-party libraries on iOS and Android                                                                                                                                                                                                                                                                                                         | the platform's source and tests; the library and platform layers; the core and each capability; the package's dependencies; `@astryxdesign/react-native-expo`; an app that uses react-native-gesture-handler, Reanimated, react-native-screens, react-native-safe-area-context, and a haptics library; an app with and without another inset provider          | An import from the library in the platform, a capability import in the core outside its loader, an import between capabilities, a third-party native or navigation dependency in `@astryxdesign/react-native`, a third-party dependency of `@astryxdesign/react-native-expo` other than `expo`, a peer dependency outside Astryx other than React and React Native, an import of Expo or of `@astryxdesign/react-native-expo` in `@astryxdesign/react-native`, a conflict beside a third-party library, a release that ships with a failing compatibility test, or Astryx insets that disagree with another inset provider the app uses                                                                                                              |
| FR3      | Built app with the core only, compared with one per opted-in capability: binary symbols and the merged manifest; unit tests of each capability's `isAvailable()` and a call's reason                                                                                                                                                                                                                                                              | the native half of each library component; a capability's native module, frameworks, dependencies, permissions; an opted-out capability; a missing module of an opted-in one; a binary that records no list                                                                                                                                                    | A core-only app that lacks a library component's native half, an app that did not opt a capability in links any of its native code or declarations, `isAvailable()` answers true for it, a call resolves a reason other than `not-linked`, or a missing module of an opted-in capability, or one on a binary that records no list, resolves a reason other than `no-module`                                                                                                                                                                                                                                                                                                                                                                          |
| FR4      | `npm pack` file list; a sample app's projects generated by `astryx rn shell` and by Expo's prebuild from configuration with a capability list; an existing app's own projects after `astryx rn apply` with the same list; a source check of the platform's native calls; the contracts drift check; a dependency check of every published package; a web page's bundle size; a source check of the core for framework-specific names and branches | the package's files; the sample's iOS and Android projects from each generator; an app's own projects before and after `astryx rn apply`; a default and an overridden usage description; a call outside public platform API; the committed Swift and Kotlin against `packages/contracts`                                                                       | Native code outside the platform layer, the package manifests declare a permission, the sample needs a manual native edit, `astryx rn shell`, Expo's prebuild, and `astryx rn apply` write different declarations or opt-ins, `astryx rn apply` writes Astryx native code into the app, the generated project lacks the core's declarations, it writes a usage description other than the default or the app's override, a call outside public platform API with no exception named in its record, committed Swift or Kotlin that differs from what the contracts generate, a published package that depends on `packages/contracts`, a web page that gains bytes from it, or an Expo-named symbol or an Expo-specific branch in the core            |
| FR5      | `exports` map and public-entry name check; package-boundary check of `./unstable/*` imports; source check of global reads                                                                                                                                                                                                                                                                                                                         | `.`, `./storage`, `./theme`, `./styles`, `./i18n`, each capability entry, `./testing`, `./testing/jest-setup`, `./unstable/*`, `./declarations/*`, the Expo package's `./app.plugin.js`                                                                                                                                                                        | A private name on `.`, a deep import resolving, an entry outside the three tiers, an `./unstable/*` name without `@experimental` in its declaration or `stability: 'experimental'` in its docs, a public addition without review, a router or optional capability exported from `.`, a `./navigation-legacy` entry, a router, `NavigationStack`, `Screen`, or stack navigator in a stable entry while web's `NavigationStack` is in Lab, a `./app.plugin.js` in `@astryxdesign/react-native`, a module with side effects other than the Jest setup, an import other than the Jest setup that installs a global, package code that reads the global `crypto`, package code that depends on `fetch`'s redirect modes, or an entry that changes `fetch` |
| FR6      | Unit tests of every asynchronous call through `./testing` mocks                                                                                                                                                                                                                                                                                                                                                                                   | absent, older, and current module; a missing option; a native throw; cancel                                                                                                                                                                                                                                                                                    | A call rejects, or answers a reason outside its set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR7      | Unit tests of each capability's probes, permissions, and hook cleanup                                                                                                                                                                                                                                                                                                                                                                             | an older binary; a view mounted without permission; unmount                                                                                                                                                                                                                                                                                                    | A silent no-op, a prompt on mount, or work that outlives its component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR8      | The additive-evolution check of `spec:AST-140/FR5`                                                                                                                                                                                                                                                                                                                                                                                                | a new behavior on a shipped interface; an older binary                                                                                                                                                                                                                                                                                                         | A shipped interface that changes, or an older binary that is silently wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR9      | Source check of platform public types; library tests of the mappings and the default hosts                                                                                                                                                                                                                                                                                                                                                        | an icon name; a feedback moment; a theme change                                                                                                                                                                                                                                                                                                                | Astryx vocabulary in a generic capability type, or the app root without hosts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR10     | Token comparison between the library and core's theme; a name check of each component against core; a type check of the native controls against the contracts' generated Swift and Kotlin                                                                                                                                                                                                                                                         | every token; each component; each native control                                                                                                                                                                                                                                                                                                               | A token value that differs from core's, a component name that differs from core's, or a native control whose types differ from the contracts'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR11     | The sample app built with `astryx rn shell` projects, with Expo's prebuild through `@astryxdesign/react-native-expo`, and with an app's own projects; a launch test per platform of the calls to the core's app-lifecycle entry; a source check of the core for Expo types and Expo modules API                                                                                                                                                   | the sample with every capability opted in; each build system                                                                                                                                                                                                                                                                                                   | A build that needs a manual native edit, one build system that writes declarations or lifecycle calls the others do not, `@astryxdesign/react-native` requiring an Expo library or holding Expo types or Expo modules API, native code or behavior in the Expo package beyond its plugin and declaration JSON, or a lifecycle entry that is not called at launch                                                                                                                                                                                                                                                                                                                                                                                     |
| FR13     | CLI contract tests of each `astryx rn` command, run as `astryx rn <command>`: JSON envelopes, exit codes, each code in FR13's table, the refusal where the package is not installed; a source check for Astryx-owned environment variables; a dependency check of `@astryxdesign/cli`                                                                                                                                                             | each command; `astryx rn doctor` beside `astryx doctor --base @astryxdesign/react-native`; a long-running command stopped by SIGINT; `astryx rn create` after a computer install; `astryx rn create` inside a project that installs Core; a web project; a project that installs Core and the package; a project without the package on a computer that has it | An exit code that depends on `--json` or is neither 0 nor 1, a question asked, output on standard output after a long-running command's result, an Astryx-owned environment variable read, `astryx rn` in a web project read as unknown, `astryx rn doctor` and `astryx doctor` that report differently, `astryx rn` that reads a computer install inside a project, or `@astryxdesign/cli` that contains or depends on React Native command code                                                                                                                                                                                                                                                                                                    |
| FR14     | Canary and release-candidate dry run                                                                                                                                                                                                                                                                                                                                                                                                              | a release of the package set                                                                                                                                                                                                                                                                                                                                   | A release without a changelog or the tarball's hash, a capability versioned apart, a package of the set on another version, or a release candidate or canary that carries a version other than the package's own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR15     | Review of each native change's evidence; documentation drift check                                                                                                                                                                                                                                                                                                                                                                                | a native behavior change; a renamed API                                                                                                                                                                                                                                                                                                                        | A native claim backed only by a build or by anything other than the Simulator, the emulator, or a device, or documentation that no longer matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR16     | Review of each component's record against its core contract                                                                                                                                                                                                                                                                                                                                                                                       | each React Native component                                                                                                                                                                                                                                                                                                                                    | A component that differs from its core contract with no gap line in its record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR17     | Review of the group records' ledger entries; the shared conformance tests on each platform                                                                                                                                                                                                                                                                                                                                                        | a new piece; a piece called done                                                                                                                                                                                                                                                                                                                               | A piece with no ledger entry, or one called done without the conformance tests or the real-device evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR18     | Gesture tests on the Simulator, the emulator, and devices, beside a second gesture library                                                                                                                                                                                                                                                                                                                                                        | an Astryx recognizer beside a react-native-gesture-handler recognizer; a busy JavaScript thread                                                                                                                                                                                                                                                                | A relationship that cannot be declared, an Astryx recognizer that does not follow a declared relationship, or a gesture that waits on JavaScript                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR19     | VoiceOver and TalkBack checks on devices; runs at the largest text size and with reduced motion                                                                                                                                                                                                                                                                                                                                                   | each native host and control                                                                                                                                                                                                                                                                                                                                   | A missing name, role, state, or announcement, a wrong focus order, a target below the platform minimum, text that ignores the text-size setting, or motion that ignores reduced motion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR20     | Dependency check of every Astryx component and `create` template; a generated app, an Expo app, and an app with its own native projects built with the core only; the build's size table                                                                                                                                                                                                                                                          | each component and template; each of the three kinds of app; each capability                                                                                                                                                                                                                                                                                   | A component or template that needs a third-party library, a native capability in the package that no Astryx component or template uses, app-shell pieces in an app with its own native projects or missing from a generated app, or a size table that lacks a capability                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR21     | `exports` map check; a capture of each component that takes `render`, with `system`, `drawn`, and `auto` on both platforms; a theme with `platforms.ios` and `platforms.android` glass intent on both platforms                                                                                                                                                                                                                                   | each `render` value; each `surface` value on `Button` and `IconButton`, drawn and system-drawn; a native theme `material` entry                                                                                                                                                                                                                                | A public JavaScript glass or material component, a `render` value that draws with the wrong side, a drawn button that ignores its `surface`, a system-drawn button whose platform style does not match its `surface`, a surface whose look ignores the theme's `material`, or a look that the props and the native theme cannot express                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR22     | Review of each native module's interface; the conformance tests on the engines React Native supports                                                                                                                                                                                                                                                                                                                                              | each native module; each engine                                                                                                                                                                                                                                                                                                                                | A contract or test that depends on one engine, or an interface that names one engine's internals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR23     | Review of where `NavigationStack`, `Screen`, `useScreenScrollProps()`, and the stack navigator are exported; the CI lane of a pull request that changes the lab folder                                                                                                                                                                                                                                                                            | each of the four names; a pull request that changes only `packages/react-native/lab/`; web's `NavigationStack` leaving Lab                                                                                                                                                                                                                                     | One of the four names in a stable entry while web's `NavigationStack` is in Lab, one outside `./unstable/*` while in the lab, or a lab pull request on the Lab-only lane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

### DEC-2 — One package with opt-in capabilities

**Reference:** `spec:AST-112/DEC-2`
**Decider:** imdreamrunner, 2026-11-09

An app installs one package and imports everything from it: the components
and the native platform layer. An app that stores data does not ship a camera
permission, a media service, or their frameworks: it links each device feature
only when it opts it in (DEC-13), and its generated native project carries the
opt-in and the declarations, so an app never edits a native project by hand.

### DEC-3 — Astryx's native code comes from the platform

**Reference:** `spec:AST-112/DEC-3`
**Decider:** imdreamrunner, 2026-11-09

The platform brings all of Astryx's native code, and generated native projects
are the default path, so an Astryx upgrade reaches every app through its
dependencies and no app carries Astryx native code that drifts from the
platform. An existing app that keeps its own native projects receives the same
declarations through `astryx rn apply`. An app's own native code and
third-party native packages are the app's: a declared tier that upgrades carry
through, so a JavaScript-only app stays the recommended path without being the
only one.

### DEC-4 — Results, never rejections

**Reference:** `spec:AST-112/DEC-4`
**Decider:** imdreamrunner, 2026-11-09

Every failure is data in one shape with a closed reason, so a caller handles it
with a type-checked branch, and a cancel is told apart from an error. A test
step is the exception: `./testing`'s `recordFrames` throws, so a failed test
stops at the step (`spec:AST-140/FR7`). While the package is canary-only, the
result shape is an internal convention that may change in any canary (FR8).

### DEC-5 — Build-system-neutral, not Expo Go

**Reference:** `spec:AST-112/DEC-5`
**Decider:** imdreamrunner, 2026-11-09

The host declarations are build-system-neutral data, so any native build can
carry the platform; the Expo package's shape is DEC-11's. Expo Go cannot load
the package's native code, and an API limited to what every Expo
module offers would cap the platform.

### DEC-6 — React Native commands are one `astryx rn` group

**Reference:** `spec:AST-112/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An agent learns one command, one help, and one output and error-code
contract, so the package's commands run as `astryx rn <command>` under the
CLI's rules. One reserved group name keeps them apart from the web commands
(`init`, `build`, `doctor`) and says, in the command itself, that the work is
React Native's. The package ships them, so a web project installs nothing for
them, and they release with the package.

### DEC-8 — One release train, canary first

**Reference:** `spec:AST-112/DEC-8`
**Decider:** imdreamrunner, 2026-11-09

The library and platform layers change together, so they ship in one package
on one version, released through release candidates. It stays on
the canary channel until a platform is supported under `spec:AST-082/FR15`,
and then joins the release group.

### DEC-9 — Astryx owns navigation, routing included

**Reference:** `spec:AST-112/DEC-9`
**Decider:** imdreamrunner, 2026-11-09

Gestures, bars, safe areas, and routing meet in the native stack, so Astryx
owns all of it: the package's router, the platform's navigation hosts, part of the default-linked core, hold the native
stack and tab containers with their transitions and gestures, the core holds safe-area insets, and
every bar, header, button, and search field is the system's, through the
platform's hosts, or drawn by the library. The packages take no third-party navigation dependency, and an app that navigates with Astryx's router runs no
third-party native code for navigation.

An app may route with another router, such as Expo Router. Astryx components
work inside it, and the app keeps that router's own navigation, chrome, and
behavior.

Astryx owns its own recognizers and measures its own insets, and Astryx
components work beside third-party libraries in the same app (FR2, FR18).

### DEC-10 — Importing the package changes no globals

**Reference:** `spec:AST-112/DEC-10`
**Decider:** imdreamrunner, 2026-11-10

An app's behavior does not depend on the order of its imports, and the package
runs in a runtime whose globals it does not control. The package's own code
calls its platform directly instead of relying on the global `crypto` or on
`fetch`'s redirect modes, and it installs no global. The testing surface's Jest
setup, the one module with side effects, follows `spec:AST-140/FR7`. How the
platform's native code reaches JavaScript is `spec:AST-140/FR1`'s.

### DEC-11 — The Expo package is a lightweight wrapper

**Reference:** `spec:AST-112/DEC-11`
**Decider:** cixzhang, 2026-11-18

The Expo piece stays a thin wrapper, so the main package owns lifecycle
hookup through one neutral app-lifecycle entry that any native project calls.
`@astryxdesign/react-native-expo` holds the configuration plugin, which depends
on Expo's APIs, applies the declaration JSON, and writes the calls to that
entry into the generated `AppDelegate` and `MainApplication`; it carries no
native code. An app outside Expo installs no Expo code, and the package's peers
outside Astryx stay React and React Native.

### DEC-13 — The library's own native pieces link by default

**Reference:** `spec:AST-112/DEC-13`
**Decider:** imdreamrunner, 2026-11-17

A library component with a native half is complete only when that half links,
so the native half of every library component links in every app: controls,
navigation hosts, gestures and drag, surfaces, menus, icons, and layout and
keyboard. A device feature brings a permission, a usage string, or a
library's size that an app must choose to carry, so camera, media, photos,
and web stay opt-in. A component that uses an opt-in capability works without
it through the system's own picker or its fallback, as the file input's photo
source falls back to the system photo picker, which needs no permission.

### DEC-14 — Contracts grow by named features

**Reference:** `spec:AST-112/DEC-14`
**Decider:** imdreamrunner, 2026-11-17

A contract's baseline is its shape in the first release that carries it after
the package leaves the canary channel, release candidates included. Behavior added after that baseline is a named
feature. A named feature says which behavior a binary has, so JavaScript asks
for the behavior it is about to use and an older binary answers with a fallback
or a loud refusal. A canary release is not
a baseline: while the package is canary-only, a contract is not a frozen shape
and may change in any canary (FR8, FR14).

### DEC-15 — Native code uses public platform API only

**Reference:** `spec:AST-112/DEC-15`
**Decider:** imdreamrunner, 2026-11-17

An app built with these packages passes store review and keeps working across
OS updates only when its native code uses public API. A record that needs an
exception names it and the reason, so each one is visible and reviewed.

### DEC-16 — The package covers Astryx's own needs

**Reference:** `spec:AST-112/DEC-16`
**Decider:** imdreamrunner, 2026-11-17

No Astryx component needs a third-party library, so the package ships every
native piece that Astryx's components and `create` templates use, and nothing
else. A capability no Astryx component uses stays outside the core package, so
no app carries its native code: Astryx may own it in a module package of its
own when several apps share it, and otherwise an app uses its host platform's
implementation or an open-source library for it (FR20).

### DEC-17 — Push notifications and background work are out of scope for v0

**Reference:** `spec:AST-112/DEC-17`
**Decider:** cixzhang, 2026-11-18

Astryx React Native v0 covers the app's interface and its device features, so
push notifications and background work are out of scope for v0, and an app
gets them from its host platform or a third-party SDK.

### DEC-18 — Astryx Stage and Preview are separate tools

**Reference:** `spec:AST-112/DEC-18`
**Decider:** cixzhang, 2026-11-18

Astryx Stage and Preview in the Astryx app are separate tools outside Astryx,
and Astryx specs, releases and docs don't require them.

### DEC-19 — The contracts are internal and built into each package

**Reference:** `spec:AST-112/DEC-19`
**Decider:** cixzhang, 2026-11-18

Each package stays self-contained while every platform derives from one
contract. The contracts are a private workspace package, `packages/contracts`,
never published: Core's and React Native's types build them in, and the
generated Swift and Kotlin are committed with a CI drift check, so no published
package depends on it and web pages gain 0 bytes. `@astryxdesign/native` is
deprecated, since the shared contracts replace it.

### DEC-20 — NavigationStack starts in the React Native lab

**Reference:** `spec:AST-112/DEC-20`
**Decider:** cixzhang, 2026-11-18

Web's `NavigationStack` is still in Lab, so the React Native `NavigationStack`,
with `Screen`, `useScreenScrollProps()`, and the stack navigator, starts in the
React Native lab under `./unstable/*` and moves to `./navigation` when web's
`NavigationStack` leaves Lab.

## Open questions

- **OQ2 — What is the shared contracts' source-of-truth form?**
  (`human-api`) The contracts package is private and built into each package
  (FR4, DEC-19); the form its source takes is open. Options: a
  language-neutral schema, from which TypeScript, Swift, and Kotlin are
  generated; or TypeScript, from which Swift and Kotlin are generated.
- **OQ3 — How does the package ship the contracts' generated Swift and
  Kotlin?** (`checkable`) Options: as source inside the platform layer, which
  the app's native build compiles; or as a prebuilt library per platform.
- **OQ5 — How is the CLI's command extension point shaped?**
  (`human-api`; owners: imdreamrunner and josephfarina) `spec:AST-114`
  resolves the active base and checks each command against it before any
  command body runs (FR2, FR6). It adds no way for a package to add a
  command, and its adapters return data only (FR3). FR13 fixes where the
  commands go, `astryx rn`, and their names, options, and outcomes. Options:
  - **A `commands` contribution.** The integration manifest declares the
    group and each command with its `CommandDoc`, and the CLI calls the
    package's function under its output, exit-code, and write rules. The
    manifest's `cliCommand` key names the printed command prefix only.
  - **Platform steps.** The CLI owns the `rn` group, and `spec:AST-114` FR4's
    list gains steps for its platform work. The steps then start and stream
    processes, run until stopped, write many and binary files, and run before
    a project installs the package, which FR3's adapter rules do not allow.
- **OQ6 — Does a one-off package runner run `astryx rn create`?** (`human-api`;
  owners: imdreamrunner and josephfarina) `spec:AST-081` FR12 does not count a
  package runner's temporary install as an install root, and `spec:AST-114`
  FR2 reads `--base` only from the project, the package set that serves the
  run, or the computer. So
  `npx -p @astryxdesign/cli -p @astryxdesign/react-native astryx rn create my-app`
  finds no React Native base and fails. Inside a project that installs Core
  and not the package, `astryx rn create apps/mobile` has the same need. Options:
  - **The group's package resolves from the runner's install.** The package
    that `astryx rn` names, like a package that `--base` names, also resolves
    from the install root of the copy that answers, a package runner's
    temporary install included. The caller named
    the package, so the run reads only what it asked for.
  - **The computer install stays the route.** `astryx rn create` needs both
    packages installed for the computer, or the project's own install.
- **OQ7 — Where does a React Native–only component with no Core counterpart
  start?** (`human-api`) Options: in the React Native lab under `./unstable/*`,
  graduating once it has a Core contract; or in Core's Lab package with a core
  contract first.
- **OQ8 — Where do `@astryxdesign/native`'s non-contract parts live after its
  deprecation?** (`human-api`) The native theme definition
  (`defineNativeTheme`), the Swift binding, and the public `ios`, `android`,
  and `shared` type conditions that consumer configuration depends on
  (`spec:AST-082` FR5) need a published home once the contracts move into
  `packages/contracts` (DEC-19). Options: a new
  published native package; `@astryxdesign/core`; or each platform package.
