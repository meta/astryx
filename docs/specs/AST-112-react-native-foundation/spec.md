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
code. Command-line tools create, check, and preview the app. The app gets Astryx's components,
themes, and icons, and native capabilities (storage, files, camera, media, web
content, documents, native controls) through one consistent API. The app
itself holds no hand-written native code, builds in a generated native
project, and links only the native capabilities it opts in.

Two apps work with these packages: the Astryx app on iOS and Android, for
previewing projects and browsing the components, and Astryx Stage, the
desktop app for macOS, Linux, and Windows, which renders an app built with
these packages with iOS and Android looks for development (FR12).

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
  FR9. Each capability documents its own methods, options, and reasons.
- The internals of Astryx Stage (FR12), beyond what an app and the
  CLI depend on.
- The Astryx app's design, features, and distribution.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Two package families.** The public set is:
  - `@astryxdesign/react-native`: the one package an app installs. It holds
    two layers and a configuration plugin:
    - The library layer: components, the app root (`AstryxAppRoot`), theming,
      the hooks an app uses, and the Astryx router (DEC-9). JavaScript and
      TypeScript only.
    - The platform layer, which holds every line of native code. Its core is
      always present: the result vocabulary (FR6), the capability shape
      (FR7), the types of every capability, the registry seams the
      capabilities plug into, the generic capabilities (storage, secure
      storage, files, network, cookies, permissions, haptics, clipboard,
      client identity), the gesture owner, gesture root, touch shield,
      presentation, menu, and action-sheet hosts, system symbols, system
      materials, and safe-area insets. Its optional capabilities are opt-in
      modules (FR3): `camera` (camera view, live code scanning, and code
      decoding from still images), `media` (audio and video playback), `web`
      (web view and sign-in session), `pdf` (document view), `controls`
      (native button, text field, date pickers, and the swipe-row,
      drag-snap, and zoom-pager views), and `navigation` (the native stack
      and tab hosts, DEC-9).
  - `@astryxdesign/react-native-cli`: the React Native experiment CLI, which
    installs the `astryx-rn` command (FR13).
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
    drives the platform's `navigation` hosts. Astryx also owns the native
    stack and tab containers, transitions, gestures, insets, and every bar,
    header, button, and search field, rendered by the system through the
    platform's hosts or drawn by the library (DEC-9).
  - The package takes no third-party navigation dependency, a router,
    react-native-screens, and react-native-safe-area-context included: its
    only peer dependencies outside Astryx are React and React Native. The one exception is the optional peers of the
    `./navigation-legacy` entry (FR5). Apart from that entry, a React
    Navigation adapter may exist only as a separate optional package, never
    as a dependency of the set; it drives the platform's `navigation` hosts and
    depends on no package that ships native navigation code,
    react-native-screens and react-native-safe-area-context included.
  - React Native command-line tools are development dependencies. An app's
    runtime never imports them, and `@astryxdesign/cli` never depends on them.
- **FR3 — An app opts in to each capability.** Each optional capability
  carries its own native module, system frameworks, dependencies, manifest
  components, and services, and the app's native build links them only when
  the app opts the capability in: on iOS a Podfile helper adds the
  capability's subspec, and on Android a Gradle property enables its source
  set. The configuration plugin writes both from the `capabilities` option the app passes to the plugin (FR4); an empty list links the core
  only. The native build records the list of capabilities it links, which the
  core reads.
  - An app that does not opt a capability in links none of its native code,
    frameworks, or dependencies. The capability's `isAvailable()` and
    `is<View>Available()` answer false, and each of its calls resolves
    `not-linked`.
  - `not-linked` applies to a capability missing from the build's list.
    `no-module` applies to a module that is missing although its capability
    is on the list, or on a binary that records no list (FR8).
  - The package's manifests declare no permission. The configuration plugin
    writes every permission the app needs (FR4).
- **FR4 — Native code lives only in the platform layer.**
  - The library layer contains no native code, and the package has no
    runtime dependency beyond `react`, `react-native`, the Astryx packages FR2
    allows, and the optional peers of `./navigation-legacy` (FR5).
  - An app holds no hand-written native code. Its iOS and Android projects are
    generated from the app's configuration. The package ships one
    configuration plugin. It always writes the core's host declarations (on
    Android, the network-state permission), and from the app's list of
    capabilities it writes the opt-in (FR3) and the host declarations each
    listed capability needs
    (permissions, usage descriptions, manifest entries, background modes),
    from data the package provides per capability. Every usage description
    has a default that the app can override, and the plugin writes nothing for
    a capability the app does not list.
  - An app-level native setting is configuration that a plugin writes into the
    generated project. JavaScript cannot read or change it at run time.
  - The platform layer ships its native code as source that the app's native
    build compiles; the core and each opted-in capability register through
    autolinking and React Native's code generation.
  - `@astryxdesign/native` is the single cross-platform contracts package of
    `spec:AST-082` (DEC-7). The React Native platform ships inside
    `@astryxdesign/react-native` with capabilities an app opts in (FR3),
    because each capability carries its own native code, permissions, and
    size, so an app links only what it uses. The package may consume
    `@astryxdesign/native`'s generated contracts (OQ2).
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
  - `./camera`, `./media`, `./web`, `./pdf`, and `./controls` are the optional
    capabilities' entries. `./navigation` is reserved for the `navigation`
    capability and the Astryx router and its navigators (FR2): the name is
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
  - The Astryx app's preview host calls both installers before a previewed
    project's code runs, so a project in preview has these globals without
    importing anything for them. Outside the preview host, the package
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
  - Internal entries hold the plumbing Astryx's own tools need (the host plumbing, the preview host of the Astryx app, Astryx Stage's simulation, and the documentation site's examples and coverage data). They have the status `spec:AST-017` FR21 gives Core's
    `./internal/*`: undocumented for apps, versioned with the package (FR14),
    limited by a package-boundary check, and outside the compatibility
    promise.
  - `./app.plugin.js` is the configuration plugin (FR4), and
    `./declarations/*` holds the per-capability host declarations it writes.
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
    cached) and `version(): number | null`, and `supports(feature)` where the
    capability has optional features. Every view has an
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
  - Every module reports `getConstants().version`, its behavior revision.
  - A member that exists on one platform only says so in its name or tag.
  - Every spec file has a header with its owner, platforms, first version, and
    stability, and every component spec has a version history.
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
  through the package's configuration plugin (FR4), with no manual native
  edits. It does
  not run in Expo Go, and no package requires an Expo runtime library
  (`spec:AST-082/FR13`). Expo's API shapes do not limit the platform's API.
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
- **FR13 — React Native commands live in an experiment CLI.**
  `@astryxdesign/react-native-cli` installs the `astryx-rn` command, the
  experiment space for React Native commands. It is canary-only, and its
  commands may change or disappear in any canary. The released command-line
  shape for React Native is OQ5.
  - Commands: `create` (a new app), `doctor` (the toolchain, the project, and
    the installed Astryx Stage), `generate` (the native projects from
    configuration), and commands that install, select, open, and run the
    desktop app, capture and inspect a rendering, and run scripted checks.
    Their names are proposals under OQ5 (for example `stage install | update
| use | list | open | run | shot | inspect | test | sweep`).
  - Astryx Stage's version is pinned per project in a configuration file the React
    Native command-line tool owns, never in `astryx.config`, whose keys
    `@astryxdesign/cli` validates.
    The install command verifies each binary's checksum and signature, and
    the first command that needs Astryx Stage installs the pinned version.
  - `--remote` runs an Astryx Stage command on a remote runner and returns the same
    result as a local run.
  - Its commands follow the output and exit-code rules of
    `architecture:cli-surface`: no question is ever asked, every `--json`
    emission is one envelope, codes are stable and append-only, and exit codes
    do not depend on the output mode. It shares flag style with
    `@astryxdesign/cli` and writes no key into `astryx.config`. A command therefore keeps its
    contract whichever released shape OQ5 settles.
  - `@astryxdesign/cli` contains no React Native commands, so a web project
    installs nothing for them.
- **FR14 — One React Native release train.** `@astryxdesign/react-native`
  releases on one version; its capabilities are opted in, never versioned
  apart. The experiment CLI versions on its own.
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

- New packages under `packages/`: `@astryxdesign/react-native` and the
  experiment CLI, each canary-only (FR14).
- `@astryxdesign/cli` is unchanged. The released command-line shape for React
  Native (OQ5) may change `architecture:cli-surface` when it is decided.
- `@astryxdesign/react-native` versions on its own, outside the fixed package
  group of `spec:AST-017` FR46, and the repository's canary release gives it
  its own declared version (FR14); the experiment CLI versions on its own.
- `spec:AST-017` FR21 extends the status of Core's `./internal/*` to the
  package's internal entries (FR5).
- `spec:AST-082` DEC-7 gains one sentence: the React Native candidate's native
  code lives in the platform layer of `@astryxdesign/react-native` (`spec:AST-112` FR4), and
  `@astryxdesign/native` stays the single cross-platform contracts package.
- The package-boundary check gains the FR2 rules: no import from the library layer in
  the platform layer, no import of a capability from the platform's core outside its loader or from another capability, no dependency on a third-party navigation package (react-native-screens and react-native-safe-area-context included) other than the optional peers of `./navigation-legacy`, no peer dependency outside Astryx other than React, React Native, and the optional peers of `./navigation-legacy`, and no dependency on these packages from core or the CLI.

## Verification

| Contract | Verification                                                                                                                                                                                  | Representative states                                                                                                                                                                                                                                                                                                                                                                                    | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Package manifest check of names and entries; the canary release's package list                                                                                                                | each package in the public set; each capability entry                                                                                                                                                                                                                                                                                                                                                    | A package missing from the set, a set package missing from the canary release, or a capability without its entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR2      | Package-boundary, source, and dependency check                                                                                                                                                | the platform's source and tests; the library and platform layers; the core and each capability; the package's dependencies                                                                                                                                                                                                                                                                               | An import from the library in the platform, a capability import in the core outside its loader, an import between capabilities, a dependency on a third-party navigation package (react-native-screens and react-native-safe-area-context included) other than the optional peers of `./navigation-legacy`, or a peer dependency outside Astryx other than React, React Native, and the optional peers of `./navigation-legacy`                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR3      | Built app with the core only, compared with one per opted-in capability: binary symbols and the merged manifest; unit tests of each capability's `isAvailable()` and a call's reason          | a capability's native module, frameworks, dependencies, permissions; an opted-out capability; a missing module of an opted-in one; a binary that records no list                                                                                                                                                                                                                                         | An app that did not opt a capability in links any of its native code or declarations, `isAvailable()` answers true for it, a call resolves a reason other than `not-linked`, or a missing module of an opted-in capability, or one on a binary that records no list, resolves a reason other than `no-module`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR4      | `npm pack` file list; a generated sample app's project from configuration with a capability list                                                                                              | the package's files; the sample's iOS and Android projects; a default and an overridden usage description                                                                                                                                                                                                                                                                                                | Native code outside the platform layer, the package manifests declare a permission, the sample needs a manual native edit, the generated project lacks the core's declarations, or it writes a usage description other than the default or the app's override                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR5      | `exports` map and public-entry name check; package-boundary check of the internal entries' imports; source check of global reads; unit tests of the installers; a previewed project's runtime | `.`, `./storage`, `./network`, `./theme`, `./styles`, `./i18n`, each capability entry, `./navigation-legacy`, `./testing`, `./testing/jest-setup`, the internal entries, `./app.plugin.js`, `./declarations/*`; a runtime without the secure random generator; a runtime with only one of the two `crypto` functions; a runtime without a global `fetch`; an installer called twice; a previewed project | A private name on `.`, a deep import resolving, an app importing an internal entry, a router or optional capability exported from `.`, another entry importing `./navigation-legacy`, a `./navigation` entry that does not hold the router, a module with side effects other than the Jest setup, an import other than the Jest setup that installs a global, package code other than the crypto installer that reads the global `crypto`, package code that depends on `fetch`'s redirect modes, a non-secure random fill, a crypto installer that replaces a `crypto` function the runtime provides, an installer that reports nothing or changes anything on a second call, a `fetch` that follows a redirect under `redirect: 'error'` or `'manual'` after its installer ran, or a previewed project that starts without the globals |
| FR6      | Unit tests of every asynchronous call through `./testing` mocks                                                                                                                               | absent, older, and current module; a missing option; a native throw; cancel                                                                                                                                                                                                                                                                                                                              | A call rejects, or answers a reason outside its set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR7      | Unit tests of each capability's probes, permissions, and hook cleanup                                                                                                                         | an older binary; a view mounted without permission; unmount                                                                                                                                                                                                                                                                                                                                              | A silent no-op, a prompt on mount, or work that outlives its component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR8      | Spec rules check in the platform                                                                                                                                                              | a new method; a component spec; a platform-only member                                                                                                                                                                                                                                                                                                                                                   | A changed shipped method, a missing header, or a new method without `status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR9      | Source check of platform public types; library tests of the mappings and the default hosts                                                                                                    | an icon name; a feedback moment; a theme change                                                                                                                                                                                                                                                                                                                                                          | Astryx vocabulary in a generic capability type, or the app root without hosts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR10     | Token comparison between the library and core's theme; review of shared native controls                                                                                                       | every token; each component with a shared native control                                                                                                                                                                                                                                                                                                                                                 | A token value that differs from core's, or a second native control drawn beside a shared one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR11     | Prebuild and EAS Build of the sample app                                                                                                                                                      | the sample with every capability opted in                                                                                                                                                                                                                                                                                                                                                                | The build needs a manual native edit, or a package requires an Expo runtime library                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR12     | Scripted checks of each capability in Astryx Stage, the simulator, and the emulator                                                                                                           | each public API                                                                                                                                                                                                                                                                                                                                                                                          | An Astryx Stage result differs from iOS and Android and the documentation does not name it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR13     | CLI contract tests of each `astryx-rn` command: JSON envelopes, exit codes, Astryx Stage's checksum and signature refusal, `--remote` parity; a dependency check of `@astryxdesign/cli`       | each command; a tampered binary; a web project                                                                                                                                                                                                                                                                                                                                                           | An exit code that depends on `--json`, a tampered binary runs, or `@astryxdesign/cli` contains or depends on React Native commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR14     | Canary and release-candidate dry run                                                                                                                                                          | a release of the package                                                                                                                                                                                                                                                                                                                                                                                 | A release without a changelog or the tarball's hash, a capability versioned apart, or a release candidate or canary that carries a version other than the package's own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR15     | Review of each native change's evidence; documentation drift check                                                                                                                            | a native behavior change; a renamed API                                                                                                                                                                                                                                                                                                                                                                  | A native claim backed only by a build or by anything other than the Simulator, the emulator, a device, or Astryx Stage, or documentation that no longer matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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

An app installs one package and imports everything from it: the components,
the native platform layer, and the configuration plugin. An app that stores
data does not ship a camera permission, a media service, or their frameworks:
it links only the capabilities it opts in, and the plugin writes the opt-in
and the declarations, so an app never edits a native project by hand.

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

Cloud and prebuild builds are a goal, so the platform carries a
configuration plugin. Expo Go cannot load the packages' native code, and an API limited to
what every Expo module offers would cap the platform.

Rejected: an adapter package for Expo's module system, because it adds a second
interface to keep in step without enabling any build.

### DEC-6 — React Native commands start in an experiment CLI

**Reference:** `spec:AST-112/DEC-6`
**Decider:** imdreamrunner, 2026-11-09

React Native commands change quickly while the packages are canary-only, so they
start in `astryx-rn`, a separate experiment program, and stay out of
`@astryxdesign/cli`. The released command-line shape is OQ5.

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
- **OQ5 — What is the released command-line shape for React Native?**
  (`human-api`; owners: imdreamrunner and josephfarina) Options:
  - **An extension of the core CLI.** An optional integration package (name
    proposed: `@astryxdesign/cli-react-native`) contributes an `rn` command
    group to `@astryxdesign/cli` (`astryx rn …`) through a new `commands`
    contribution in the integration manifest, loaded like other contributions:
    from the project's integrations inside a project, and from computer-level
    integrations outside one (`spec:AST-081/FR12`). Gains: one command, one
    help, output, and error-code contract, enforced by the core CLI. Costs:
    the core CLI needs a command extension point
    (the manifest's `cliCommand` key names the printed command prefix only),
    and React Native commands release on the core CLI's peer range.
  - **A separate CLI.** `astryx-rn` itself becomes the released program,
    optionally with `astryx rn` forwarding to it. Gains: no change to the core
    CLI, and an independent release cadence. Costs: a second help, output, and
    error-code surface to keep in step, and two command names in
    documentation.
  - **Commands inside `@astryxdesign/cli`.** Gains: one package, no extension
    point. Costs: every web project installs React Native commands.
