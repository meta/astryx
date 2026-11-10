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
installing three kinds of package: a component library written in JavaScript,
a platform layer that holds every line of native code, and an extension of the
`astryx` command line that creates, checks, and previews the app. The app gets Astryx's components,
themes, and icons, and native capabilities (storage, files, camera, media, web
content, documents, native controls) through one consistent API. The app
itself holds no hand-written native code, builds in a generated native
project, and installs only the native capabilities it uses.

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
- macOS and Windows.
- The design of each capability's methods beyond the shared rules in FR6 to
  FR9. Each capability documents its own methods, options, and reasons.
- The internals of the development runtime in FR12, beyond what an app and the
  CLI depend on.
- Other packages, such as a host for running projects inside another app; they
  are not part of the public set this record defines.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Three package families.** The public set is:
  - `@astryxdesign/react-native`: the component library. Components, the app
    root (`AstryxAppRoot`), theming, and the hooks an app uses. JavaScript and
    TypeScript only.
  - `@astryxdesign/react-native-platform`: the platform core. The result
    vocabulary (FR6), the capability shape (FR7), the types of every
    capability, the registry seams the capability packages plug into, the
    generic capabilities (storage, secure storage, files, network, cookies,
    permissions, haptics, clipboard, client identity), the gesture owner,
    gesture root, touch shield, presentation, menu, and action-sheet hosts,
    system symbols, and system materials.
  - Capability packages, each one native unit:
    `@astryxdesign/react-native-platform-camera` (camera view, live code
    scanning, and code decoding from still images), `-media` (audio and video
    playback), `-web` (web view and sign-in session), `-pdf` (document view),
    and `-controls` (native button, text field, date pickers, and the
    swipe-row, drag-snap, and zoom-pager views).
  - `@astryxdesign/cli-react-native`: the optional extension of
    `@astryxdesign/cli` that adds the `rn` command group (FR13).
  - Outside the set, `@astryxdesign/react-native-cli` (`astryx-rn`) is an
    experiment space for commands that are not yet admitted (FR13).
- **FR2 — Dependencies point one way.**
  - The library takes the platform core as a peer dependency and calls it
    directly. The platform imports nothing from the library, in source or in
    tests.
  - A capability package depends on the platform core only. A need that
    crosses capabilities goes through a registration hook in the platform
    core, never through a dependency between capability packages.
  - The library reaches an optional capability package only through the
    platform core's guarded loader (`AstryxPlatform.capability(name)`), so an
    app without that package installs and bundles nothing of it.
  - None of these packages depends on another Astryx package at run time,
    other than these dependencies and the reads of `@astryxdesign/core` that
    `spec:AST-082/FR16` allows. `@astryxdesign/core` and `@astryxdesign/cli`
    never depend on them (`spec:AST-082/FR14`).
  - The CLI extension is a development dependency. An app's runtime never
    imports it, and `@astryxdesign/cli` never depends on it.
- **FR3 — Installing a package is the opt-in.** Each capability package
  carries its own native module, permissions, system frameworks, manifest
  entries, and services. An app that does not install it carries none of
  them. No build flag, environment variable, or configuration switch turns a
  capability on or off. The platform core requests no permission beyond
  network state.
- **FR4 — Native code lives only in the platform packages.**
  - The library contains no native code and has no runtime dependency beyond
    `react`, `react-native`, and the platform core.
  - An app holds no hand-written native code. Its iOS and Android projects are
    generated from the app's configuration. The platform core ships one
    configuration plugin, and each capability package provides its host
    declarations (usage descriptions, manifest entries, background modes) as
    data that the plugin writes into the generated project. A capability
    package ships no plugin of its own.
  - An app-level native setting is configuration that a plugin writes into the
    generated project. JavaScript cannot read or change it at run time.
  - Each platform package ships its native code as source that the app's
    native build compiles; it registers itself through autolinking and React
    Native's code generation.
- **FR5 — The public surface is deliberate.** Each package declares its entries
  in its `exports` map, and an import outside the map is unsupported.
  - `.` is the app API.
  - `./testing` is the testing surface: mocks of every native module in its
    absent, older, and current shapes, event emitters, and a Jest setup file.
    It is public and documented.
  - `./host` holds the plumbing a host library needs, such as the library's
    hosts. It carries no compatibility promise; an app imports from `.`.
  - `./app.plugin.js`, on the platform core only, is the configuration plugin
    (FR4).
  - `.` exports nothing named `*ForTesting`, `reset*`, `SIMULATED_*`, or
    `*_NAME`.
  - A renamed or removed public name stays exported, marked `@deprecated`, for
    one minor version.
- **FR6 — One result vocabulary.** Every asynchronous call in the platform
  packages resolves `AstryxResult<T, R>`: `{ok: true, …}` with its data, or
  `{ok: false, reason, message?}`. It never rejects.
  - `reason` comes from a closed set per capability plus the common reasons
    `no-module`, `unsupported`, `cancelled`, and `error`.
  - `cancelled` is the one failure that is not an error: the person declined
    or dismissed something. A caller branches on it and shows no error.
  - `message` is platform text for logs. It never carries a URL's query, a
    cookie, a key, or a token.
- **FR7 — One capability shape.**
  - Every capability object has `isAvailable(): boolean` (synchronous, cheap,
    cached) and `version(): number | null`, and `supports(feature)` where the
    capability has optional features. Every view has an
    `is<View>Available()` probe.
  - A path a platform or an older binary does not support answers
    `unsupported` or `unsupported-option`. It is never a silent no-op and
    never a quietly weaker behavior.
  - Permissions are explicit: `AstryxPermissions.get` and `request`, and a
    `use<Capability>Permission()` hook. Mounting a view never prompts.
  - Hooks own lifecycle: they cancel their work on unmount and return stable
    callbacks. Root tags, module handles, and native versions never appear in
    app-facing types.
  - Names follow React Native's own conventions: `source={{uri}}`, `ref`,
    `on<Event>(event)` with one object argument, `is` and `has` booleans, and
    string unions for closed sets. A call takes its subject first and one
    options object, with defaults for every option.
- **FR8 — Native interfaces evolve additively.** Every TurboModule and native
  component spec in the platform packages follows these rules, and a check in
  each package enforces them:
  - A module is read with `TurboModuleRegistry.get`, never `getEnforcing`; an
    absent module answers `no-module`.
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
- **FR11 — Expo builds are supported; Expo Go is not a target.** The platform
  packages build in a prebuild or development-build project and in EAS Build
  through the platform core's configuration plugin (FR4), with no manual native
  edits. They do
  not run in Expo Go, and no package requires an Expo runtime library
  (`spec:AST-082/FR13`). Expo's API shapes do not limit the platform's API.
- **FR12 — Astryx Stage is the contract developers build against.** Astryx
  Stage is a development runtime, distributed as prebuilt binaries, that runs a
  React Native Astryx app headless or in a window for previews, scripted
  checks, and agent loops.
  - Every public platform API has a Stage implementation whose behavior
    matches iOS and Android, or a documented gap.
  - Each capability's documentation states its Stage behavior as the
    contract and notes where iOS and Android differ.
  - Stage is a development tool. An app never depends on it at run time.
- **FR13 — React Native commands extend the core CLI.** React Native commands
  are the `rn` command group of `@astryxdesign/cli` (`astryx rn <command>`),
  contributed by the optional integration package
  `@astryxdesign/cli-react-native`.
  - **Extension point.** An integration's root manifest may declare
    `commands`: one command group, named by its namespace, and the modules that
    implement its subcommands. The core CLI finds it as it finds every other
    contribution: inside a project from the project's own integrations (its
    declared dependencies that ship an integration manifest), and outside a
    project from the computer-level integrations installed beside the running
    CLI (`spec:AST-081/FR12`), so `astryx rn create` runs from a global or
    package-set install that includes the extension. An integration whose peer
    range for `@astryxdesign/cli` excludes the running release contributes no
    commands, and `astryx doctor` says why.
  - **One contract.** The core CLI parses arguments, prints help, and owns the
    `--json` envelope, error codes, and exit codes of extension commands; an
    extension command returns its data or its error through the CLI's
    programmatic interface (`spec:AST-042/FR1`). Extension commands therefore
    keep every `architecture:cli-surface` invariant: no question is ever
    asked, every `--json` emission is one envelope, codes are stable and
    append-only, and exit codes do not depend on the output mode.
  - **Boundaries.** One integration claims a namespace; a second claimant
    contributes no commands and `astryx doctor` reports the conflict. An
    extension never adds, replaces, or changes a core command or option.
  - **Optional.** Only React Native projects declare the extension, so a web
    project installs and loads nothing of it. Without the extension,
    `astryx rn` exits with an error whose code is stable and whose message
    names the package to install.
  - **Commands:** `create` (a new app), `doctor` (the toolchain, the project,
    and the installed Stage), `generate` (the native projects from
    configuration), and `stage install | update | use | list | open | run |
shot | inspect | test | sweep`. Each is admitted under `spec:AST-042`.
  - Stage versions are pinned per project in the project's configuration.
    `stage install` verifies each binary's checksum and signature, and the
    first command that needs Stage installs the pinned version.
  - `--remote` runs a Stage command on a remote runner and returns the same
    result as a local run.
  - **Experiment space.** `@astryxdesign/react-native-cli` installs the
    `astryx-rn` command, where React Native commands incubate before
    admission. It is canary-only and outside the release train (FR14): its
    commands may change or disappear in any canary. It is a separate program,
    not a door of `spec:AST-081/FR1`, and its commands follow the same output
    and exit-code rules, so a command moves into the extension without changing
    its contract and then leaves the experiment package. Documentation and the
    files `create` writes name `astryx rn`, never `astryx-rn`.
- **FR14 — One React Native release train.** All the packages in FR1 carry the
  same version and release together, in a release group separate from core's.
  Each package requires the others at exactly that version. The platform
  core's loader refuses a capability package of another version and reports
  both versions, so packages from two releases never run together.
  They publish on the canary channel only, under `spec:AST-082/FR15`, and join
  the stable channel in a planned minor once a platform is supported. Before
  1.0, a minor version may change the API; each release has a changelog per
  package with migration steps for every rename and removal, and a release
  records the packed tarballs with their hashes.
- **FR15 — Evidence matches the claim.**
  - The iOS Simulator and the Android emulator are the source of truth for
    native behavior during development. Every change to native behavior is
    checked there and in Stage.
  - A web rendering of the React Native app is a smoke check only. It is never
    evidence for native behavior.
  - A passing build is not evidence of behavior. A claim about camera,
    haptic feel, or performance needs a real device.
  - Every platform package's tests cover each native module in its absent,
    older, and current shapes through `./testing`.
  - API blocks in each package's documentation are generated from source, and
    a check fails when they drift.

### Platform support

- Supported feature/engine floor: iOS at React Native's own minimum and Android
  API level 24, on React Native's New Architecture (Fabric and TurboModules)
  only, with the React and React Native versions each package declares as
  peers.
- Unsupported behavior: a capability a binary lacks answers `no-module` or
  `unsupported` (FR6, FR7); a view a binary lacks reports itself unavailable
  and the library draws its fallback; Expo Go and the old architecture are not
  supported (FR11).
- Browser evidence: none. Native claims are proven on the simulator, the
  emulator, Stage, and devices (FR15); a web rendering is a smoke check only.

## Current-state impact

- New packages under `packages/`: the library, the platform core, the five
  capability packages, the CLI extension, and the experiment CLI, each
  canary-only (FR14).
- `architecture:cli-surface` gains the extension point of FR13: the
  `commands` contribution of an integration manifest, loaded with the
  integration's other contributions, and the `rn` command group of
  `@astryxdesign/cli-react-native`. The integration manifest gains the
  `commands` key. No command-contribution mechanism exists in the core CLI
  until this ships; the manifest's `cliCommand` key names the printed command
  prefix only.
- The changesets configuration gains a fixed release group for the React
  Native packages (FR14).
- The package-boundary check gains the FR2 rules: no import from the library in
  the platform, no dependency between capability packages, and no dependency on
  these packages from core or the CLI.
- `@astryxdesign/native` keeps its contracts, bindings, and native theme
  configuration. How this record's packages relate to `spec:AST-082/DEC-7` is
  OQ1.

## Verification

| Contract | Verification                                                                                                                                                                                                               | Representative states                                        | Mutation or failure expectation                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Package manifest check of names, entries, and the release group                                                                                                                                                            | each package in the public set                               | A package missing from the set, or one outside it in the group                                                                        |
| FR2      | Package-boundary and source check                                                                                                                                                                                          | the platform's source and tests; each capability package     | The platform imports the library, or one capability package depends on another                                                        |
| FR3      | Generated native project of an app with the core only, compared with one per capability package                                                                                                                            | permissions, frameworks, manifest entries, services          | An app without a capability package carries any of its declarations                                                                   |
| FR4      | `npm pack` file lists; a generated sample app's project from configuration                                                                                                                                                 | the library's files; the sample's iOS and Android projects   | The library ships native code, a capability package ships a plugin, or the sample needs a manual native edit                          |
| FR5      | `exports` map and public-entry name check                                                                                                                                                                                  | `.`, `./testing`, `./host`, `./app.plugin.js`                | A private name on `.`, or a deep import resolving                                                                                     |
| FR6      | Unit tests of every asynchronous call through `./testing` mocks                                                                                                                                                            | absent, older, and current module; a native throw; cancel    | A call rejects, or answers a reason outside its set                                                                                   |
| FR7      | Unit tests of each capability's probes, permissions, and hook cleanup                                                                                                                                                      | an older binary; a view mounted without permission; unmount  | A silent no-op, a prompt on mount, or work that outlives its component                                                                |
| FR8      | Spec rules check in each platform package                                                                                                                                                                                  | a new method; a component spec; a platform-only member       | A changed shipped method, a missing header, or a new method without `status`                                                          |
| FR9      | Source check of platform public types; library tests of the mappings and the default hosts                                                                                                                                 | an icon name; a feedback moment; a theme change              | Astryx vocabulary in a generic capability type, or the app root without hosts                                                         |
| FR10     | Token comparison between the library and core's theme; review of shared native controls                                                                                                                                    | every token; each component with a shared native control     | A token value that differs from core's, or a second native control drawn beside a shared one                                          |
| FR11     | Prebuild and EAS Build of the sample app                                                                                                                                                                                   | the sample with every capability package                     | The build needs a manual native edit, or a package requires an Expo runtime library                                                   |
| FR12     | Scripted checks of each capability on Stage, the simulator, and the emulator                                                                                                                                               | each public API                                              | A Stage result differs from iOS and Android without a documented gap                                                                  |
| FR13     | CLI contract tests of the extension point and each `rn` command: loading inside and outside a project, peer-range refusal, a namespace conflict, JSON envelopes, exit codes, the missing-extension error, checksum refusal | each command; no extension; two claimants; a tampered binary | A web project loads extension code, an extension replaces a core command, an exit code depends on `--json`, or a tampered binary runs |
| FR14     | Release dry run; a loader test with a capability package of another version                                                                                                                                                | a release of every package; a mixed install                  | Packages with different versions, a mixed install that runs, or a release without a changelog or hashes                               |
| FR15     | Review of each native change's evidence; documentation drift check                                                                                                                                                         | a native behavior change; a renamed API                      | A native claim backed only by a web rendering or a build, or documentation that no longer matches                                     |

## Decision log

### DEC-1 — The platform is a layer for Astryx, below the library

**Reference:** `spec:AST-112/DEC-1`
**Decider:** imdreamrunner, 2026-11-09

The platform owns the native contract and first-class capability objects; the
library calls them directly and keeps the Astryx mapping. Apps call the same
objects for capabilities the library does not cover. Dependencies point from
the library to the platform only, so the native API stays clean and the
library can change without touching native code.

Rejected: a design-system-neutral platform built for standalone use, because
it would duplicate the mapping the library owns.

### DEC-2 — One package per native capability

**Reference:** `spec:AST-112/DEC-2`
**Decider:** imdreamrunner, 2026-11-09

An app that stores data does not ship a camera permission, a media service, or
their frameworks. Installing a package is the opt-in, which autolinking and
prebuild already support without any switch.

Rejected: one package with build flags, because every app would carry every
declaration unless each build remembered to turn it off.

### DEC-3 — Apps hold no native code

**Reference:** `spec:AST-112/DEC-3`
**Decider:** imdreamrunner, 2026-11-09

The platform packages bring all native code; an app's native projects are
generated from configuration with the platform core's plugin. An Astryx upgrade then
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

Cloud and prebuild builds are a goal, so the platform core carries a
configuration plugin. Expo Go cannot load the packages' native code, and an API limited to
what every Expo module offers would cap the platform.

Rejected: an adapter package for Expo's module system, because it adds a second
interface to keep in step without enabling any build.

### DEC-6 — React Native commands are an optional extension of the core CLI

**Reference:** `spec:AST-112/DEC-6`
**Decider:** imdreamrunner, 2026-11-09

People who build with Astryx keep one command, `astryx`, with one help, output,
and error-code contract. React Native commands load only where a project or an
install declares the extension, so web projects install nothing for them. A
separate experiment program lets a command change quickly before admission
without putting unstable surface into the released CLI.

Rejected: React Native commands built into `@astryxdesign/cli`, because every
web project would install them; a released `astryx-rn` that `astryx rn`
forwards to, because two programs would keep two help, output, and error-code
surfaces in step.

### DEC-7 — Stage behavior is the contract developers read

**Reference:** `spec:AST-112/DEC-7`
**Decider:** imdreamrunner, 2026-11-09

Developers build against Stage, so its behavior is what they rely on. Astryx's
own development checks the simulator and emulator as the source of truth and
keeps Stage matched to them. A missing or divergent Stage path is a defect.

### DEC-8 — One release train, canary first

**Reference:** `spec:AST-112/DEC-8`
**Decider:** imdreamrunner, 2026-11-09

The library, the platform packages, and the CLI extension change together, so
they share
one version and release together. They stay on the canary channel until a
platform is supported under `spec:AST-082/FR15`.

## Open questions

- **OQ1 — How do these packages relate to `spec:AST-082/DEC-7`?**
  (`human-api`) DEC-7 places native implementations in `@astryxdesign/native`.
  Options: amend DEC-7 so the React Native candidate ships in the packages of
  FR1, with `@astryxdesign/native` keeping the contracts, the Swift and Kotlin
  bindings, and native theme configuration; or move the React Native library
  and platform into `@astryxdesign/native` as entries. Recommendation: amend
  DEC-7, because the React Native packages need their own native build units
  (FR3) and their own release train (FR14).
- **OQ2 — When do the library's component props come from
  `@astryxdesign/native`'s platform contracts?** (`human-api`) Options: now,
  under the `ios` and `android` conditions; or once core's portable entry
  ships. Recommendation: once the portable entry ships, with a check until then
  that the library's props match the generated contracts.
- **OQ3 — How does an app receive `@astryxdesign/native`'s Swift code?**
  (`checkable`) Options: the platform package vendors the Swift sources it
  wraps; or the platform's native build depends on the Swift package directly.
- **OQ4 — Where are Stage binaries published?** (`human-design`) Options: per
  OS and architecture packages on npm that the CLI installs; or release assets
  that the CLI downloads and verifies. Recommendation: release assets with
  checksums and signatures, because the binaries are large and npm's optional
  dependencies install every architecture's metadata.
- **OQ5 — Where does the core CLI's command extension point live?**
  (`human-api`, owner of `architecture:cli-surface`) Options: a `commands`
  contribution in the existing integration manifest (FR13), reusing its
  discovery, validation, provider identity, peer-range gating, and
  computer-level loading; or a separate CLI plugin manifest with its own
  discovery. Recommendation: the integration manifest, because every rule a
  command extension needs already applies to integrations.
