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

Two apps sit beside the React Native packages of `spec:AST-112`, and both run
an app's own JavaScript instead of a copy of it.

**Astryx Stage** is a desktop app for developers and their agents. It runs the
real JavaScript of an app built with `@astryxdesign/react-native` and renders
it with an iOS or Android look, with no simulator, emulator, or device. A
developer opens the app in a window and uses it by hand; an agent or a
continuous-integration job runs it headless and gets a picture, a step report,
the accessibility tree, logs, and timings as data. Stage implements the same
native contracts as the iOS and Android platform layer, so a screen that
renders and behaves in Stage is the screen the developer expects on a device,
and every place where it differs says so (`spec:AST-112/FR12`).

**The Astryx app** is the native iOS and Android app for Astryx React Native.
It shows every component running natively, with live examples, example apps,
and the themes. It is also the Preview host: a person opens a project from a
developer's computer or from a hosted bundle, and the project runs inside the
app on a real phone, without building or installing anything.

Preview is the same feature in both places. A project opened in the Astryx app
and the same project run in Astryx Stage start from the same bundle, check the
same native requirements, and get the same limits on what they may reach.

## Why this exists

| Tool                                              | What it does well                                                                                | The gap Astryx Stage and the Astryx app fill                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS Simulator and Android emulator                | The real system frameworks; the source of truth for native behavior (`spec:AST-112/FR15`).       | The Simulator needs a Mac, the emulator a virtual machine, and each needs a native build per change. Neither gives an agent a picture, the accessibility tree, and a step report as data in one command. Stage runs headless on macOS, Linux, and Windows and answers in a report.   |
| Expo Go and development builds                    | Open a project on a phone from a QR code; a development build carries the app's own native code. | Expo Go cannot load the platform's native code (`spec:AST-112/FR11`), and a development build is one more native build per app. The Astryx app already carries the whole platform, so a project that uses only Astryx's native pieces opens on a phone with no build at all.         |
| Storybook and web previews (React Native for Web) | Fast, browser-based review of components and screens.                                            | A web preview renders web components, not the native contracts: no system bars, sheets, menus, gestures, keyboard, or native accessibility tree. Stage runs the React Native renderer against the platform's own contracts, with the device's layout engine and the platform's look. |
| A hand-made gallery app per design system         | Shows components on a phone.                                                                     | The Astryx app is that gallery for every Astryx component, kept with the library, and the same binary hosts a developer's own project.                                                                                                                                               |

## Who uses it

| Who                                    | Astryx Stage                                                                                                          | The Astryx app                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A developer building an Astryx app     | Opens the app in a window beside the editor, switches iOS and Android looks, light and dark, text size, and RTL.      | Scans a QR code from `astryx preview` and uses the project on a real phone while it hot-reloads. |
| An AI agent working on an Astryx app   | Renders a route headless, taps through a scripted flow, reads the accessibility tree and logs, and checks the result. | None directly; the agent prints the Preview link for the person.                                 |
| A continuous-integration job           | Runs scripted checks and captures on Linux on every change, with stable reports and exit codes.                       | None.                                                                                            |
| A reviewer, designer, or product owner | Reads the pictures and reports an agent or a job attached.                                                            | Opens a hosted bundle from a link and tries the change on a phone.                               |
| A person evaluating Astryx             | None.                                                                                                                 | Browses every component, the example apps, and the themes on a native app.                       |
| Astryx's own maintainers               | Checks every platform contract against the Simulator and emulator, and every documentation example.                   | Checks components on devices; the app's examples are the documentation's examples.               |

## Non-goals

- The internals of Astryx Stage: how it runs JavaScript, lays out, and draws.
  Only what an app, the CLI, and a person observe is in this record.
- Each native contract's simulation in Stage. Each platform group record
  (`spec:AST-123` to `spec:AST-137`) states its contracts' behavior in Stage.
- The commands' names, flags, error codes, and output envelopes. They belong
  to `spec:AST-112/FR13`; this record states what the commands reach.
- How the Astryx app runs a project internally: its native host, its
  inspector channel, and its overlay window.
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
  with the React Native renderer, and lays it out with React Native's own
  layout rules. It renders with an iOS or an Android look. It runs on macOS,
  Linux, and Windows. It is a development tool: no app depends on it at run
  time (`spec:AST-112/FR12`).

  FR1 gap: Astryx Stage has no Windows build.

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
    can drive an open window.
- **FR3 — The render options are the device's settings.** A run takes a
  platform profile (iOS-style or Android-style, with operating-system version
  presets), a device size, an orientation, light or dark appearance,
  right-to-left layout, a text size, the accessibility settings the platform
  contracts read (such as Reduce Motion, Reduce Transparency, Bold Text, and
  Increase Contrast), animation speed, network conditions, and a start route.
  The theme is the app's: Stage adds no theme default of its own.
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
- **FR6 — Stage implements the platform's native contracts and declares
  them.**
  - Stage implements each native contract (view, module, and protocol) of the
    platform layer that the group records `spec:AST-123` to `spec:AST-137`
    define, with behavior that matches iOS and Android; a divergence is a
    defect that the contract's documentation names (`spec:AST-112/FR12`).
  - Stage declares the contracts it implements: each contract by name and the
    spec hash it implements, with Stage's own version.
  - A project's package records each native contract's spec hash and the
    oldest Stage version that implements that contract set (the version
    floor). Stage pairs with a project by those hashes and that floor; it
    reads no revision counter.
  - Before any of the project's JavaScript runs, a Stage below the floor, or
    one that lacks a contract the project's package declares, refuses the
    project. The refusal lists each missing contract and names the Stage
    version that has them. It never renders with a silent fallback. A newer
    Stage renders a project on an older package.
- **FR7 — The Astryx CLI runs Stage.** `astryx stage …` captures, runs
  scripted checks, reads the accessibility tree, opens the window, installs
  the pinned Stage, and says which Stage the commands use and where it comes
  from (`spec:AST-112/FR13`). The project pins the Stage version its commands
  use; the install verifies each binary, and a binary that fails the check
  never runs. A developer may name another Stage binary for engine work, and
  the commands report that source.

### The Astryx app

- **FR8 — The app shows Astryx React Native running natively.** It shows every
  component of `@astryxdesign/react-native` with live examples, searchable by
  name; example apps built only with Astryx; and the themes, with light, dark,
  and system appearance. The examples are the documentation's examples.
- **FR9 — The app is a Preview host on iOS and Android.** A person opens a
  project in the app in three ways: by scanning a QR code (with the app's
  scanner, from a photo, or with the system camera), by opening a Preview link,
  or by typing an address. The project comes from:
  - a developer's computer: the project's dev server on the local network,
    which `astryx preview` prints as a link and a QR code; or
  - a hosted bundle: a bundle that `astryx preview bundle` writes, served
    over HTTPS from any host (`spec:AST-112/FR13`).
- **FR10 — No project code runs without the person's confirmation.** A
  scanned code and a Preview link opened from outside the app show a
  confirmation first, with the project's name and the address it comes from,
  and whether that address is this device, the local network, or the
  internet. Nothing is fetched or run until the person confirms. An address
  the person types counts as their choice. A project the app lists as opened
  before asks again. A link cannot carry a confirmation.
- **FR11 — A Preview project runs apart from the app.**
  - The project runs in its own JavaScript runtime inside the app, with the
    platform's native pieces that the app carries.
  - It never reaches the app's own identity, stored data, or sign-in.
  - A capability that the host's policy refuses for a project answers
    `not-allowed` (`spec:AST-112/FR6`); it is never a silent no-op.
  - Astryx Stage applies the same reach rules when it runs a Preview project,
    so a project meets the same limits in Stage and on a phone.
- **FR12 — The host checks a project before its code runs.**
  - A project declares what it requires from the host. Before the project's
    main module runs, the host compares that with the native pieces and
    versions it carries; a project that needs one the host lacks is refused
    with a screen that names what is missing. `astryx preview check` answers
    the same question on the developer's computer (`spec:AST-112/FR13`).
  - The host runs source bundles only. A precompiled bytecode bundle is
    refused before it runs, because it is tied to one engine build.
- **FR13 — An encrypted hosted bundle keeps its key on the phone.** For an
  encrypted bundle, the key travels only in the part of the link after `#`,
  which is never sent to the server. The app verifies the integrity of every
  part of the bundle before any of its code runs, keeps the decrypted bundle in
  memory only, and writes nothing decrypted to the device. An encrypted project
  is never kept in the list of opened projects. Any failed check refuses the
  project with one line saying why.
- **FR14 — A running project can always be left and reloaded.** While a
  project runs, the person can return to the app and reload the project. A
  failure to open shows what happened, the address when the server did not
  answer, and a retry where a retry can help. The app lists the projects a
  person opened, except encrypted ones; removing one also removes the data
  that project stored on the device.
- **FR15 — Preview is part of the Astryx app.** The native pieces that run a
  separate project inside the app are part of the Astryx app.
  `@astryxdesign/react-native` keeps only the project side of Preview: what a
  previewed project may reach, its manifest, and its types
  (`spec:AST-112/FR1`). A project carries no Preview code of its own: the app
  prepares the project's runtime before the project's code runs
  (`spec:AST-112/FR5`).

### Evidence

- **FR16 — Stage and Preview are development evidence.** A Stage result and a
  Preview run show what the app does on the platform's contracts. A claim
  about native behavior is still checked on the Simulator, the emulator, or a
  device (`spec:AST-112/FR15`), and Stage is kept matched to them.

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

- `spec:AST-112` Non-goals keep Stage's internals and the Astryx app's design
  out of that record; this record owns the observable behavior of both apps
  and of Preview.
- `spec:AST-112/FR1` and `spec:AST-112/DEC-12`: the native pieces that run
  a Preview project are part of the Astryx app (FR15), and
  `@astryxdesign/react-native` keeps the project side.
- `spec:AST-112/FR13`'s remote runs follow the answer to OQ8, and its
  `astryx stage install` follows OQ6 for where binaries come from, with
  `spec:AST-112/OQ4`.
- Each platform group record (`spec:AST-123` to `spec:AST-137`) states its
  contracts' behavior in Stage and pairs through FR6's spec hashes and version
  floor.

## Verification

| Contract | Verification                                                                                                | Representative states                                                                 | Mutation or failure expectation                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The same bundle rendered in Stage and on the Simulator and emulator; layout comparison                      | a sample app; each platform profile                                                   | A layout that differs from the device's with no entry in the report                                                         |
| FR2      | Report contract tests of each headless verb; a scripted check that fails a step                             | capture; scripted check; accessibility tree; a JavaScript exception; an unknown route | A failed run that reports success, or a picture of nothing reported as ready                                                |
| FR3      | Captures per option compared with the Simulator and emulator                                                | each profile; dark; RTL; largest text size; Reduce Motion                             | An option that changes nothing, or a theme default that Stage adds                                                          |
| FR4      | Runs from a dev server with an edit, from a production bundle, and from a sample                            | hot reload with state; one-shot bundle                                                | An edit that loses the app's state on hot reload, or a bundle that runs differently from the dev server's                   |
| FR5      | A project with an unknown native view and module; a run on a desktop without a system web view              | each kind of simulated entry                                                          | A missing native piece that the report does not name                                                                        |
| FR6      | Stage's declared contract set compared with the package's; a Stage below the floor; a changed spec hash     | an older package; a newer package; one missing contract                               | A Stage that runs a project it lacks a contract for, a refusal without the list, or JavaScript that runs before the refusal |
| FR7      | CLI contract tests of `astryx stage`; a tampered binary                                                     | the pinned version; a named binary                                                    | A tampered binary that runs, or a named binary that `astryx stage which` does not report                                    |
| FR8      | A walk of every component page and example app on the Simulator and emulator                                | each component; each example app; each appearance                                     | A component without live examples, or an example that differs from the documentation's                                      |
| FR9      | Opening a project by each way in, from a dev server and from a hosted bundle, on iOS and Android            | QR code; photo; link; typed address; dev server; hosted bundle                        | A way in that does not open the project                                                                                     |
| FR10     | Links and codes from outside the app; a link that claims a confirmation                                     | local network; internet; typed; opened before                                         | Any request or code that runs before the person confirms                                                                    |
| FR11     | A project that reads the app's data, identity, and sign-in; a refused capability; the same project in Stage | each refused capability                                                               | A project that reads anything of the app's, a refusal that is a silent no-op, or a Stage run with other limits              |
| FR12     | A project that requires a piece the host lacks; a bytecode bundle; `astryx preview check`                   | a missing native piece; an older host                                                 | A project's main module that runs on a failed check, or a bytecode bundle that runs                                         |
| FR13     | Encrypted bundles with a bad key, a changed part, and a redirect; the server's request log                  | a valid link; each failed check                                                       | A key that reaches the server, code that runs before every check passes, or decrypted bytes written to the device           |
| FR14     | Reload and return while a project runs; a dev server that stops; removing a listed project                  | a running project; an unreachable address; an encrypted project                       | A project that cannot be left, an encrypted project in the list, or stored data left after removal                          |
| FR15     | A dependency check of `@astryxdesign/react-native`; a project with no Preview code                          | the Astryx app's build; a plain project                                               | The app's native Preview pieces in `@astryxdesign/react-native`, or a project that needs Preview code to run                |
| FR16     | Review of each native change's evidence                                                                     | a native behavior change                                                              | A native claim backed only by Stage or Preview                                                                              |

## Decision log

### DEC-1 — Stage runs the app's JavaScript against the platform's contracts

**Reference:** `spec:AST-139/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Developers and agents need to see what the app does on iOS and Android without
a device. Stage runs the app's own bundle with the React Native renderer and
implements the same native contracts as the platform layer, so the screen,
the accessibility tree, and the behavior come from the app's real code.

Rejected: a web preview through React Native for Web, because it renders web
components instead of the native contracts.

### DEC-2 — A missing contract is a refusal, not a fallback

**Reference:** `spec:AST-139/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A picture that silently leaves out a native piece misleads the person or agent
who trusts it. Stage pairs with a project by spec hash and a version floor and
refuses, with the list, when it lacks what the project needs. Known
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

A project opened from a link is code the app did not ship. It runs in its own
runtime and gets `not-allowed` for anything the host's policy refuses, so
opening a project cannot read or act as the app. The finer rules for storage,
network, and permissions are OQ4.

### DEC-5 — Stage runs on macOS, Linux, and Windows

**Reference:** `spec:AST-139/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Developers build Android apps on all three desktops, and an agent or a job
runs wherever the developer's tools run. Stage has the window and the
headless mode on each.

### DEC-6 — Preview is part of the Astryx app

**Reference:** `spec:AST-139/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

Running a project from a link is what the Astryx app does, so the native
pieces that run it are the app's. `@astryxdesign/react-native` keeps only
what every previewed project needs: the rules of what it may reach, its
manifest, and its types.

## Open questions

- **OQ1 — How does an app's own native library work with Stage and with
  Preview?** (`human-design`) An app may add its own native component or
  module, or a third-party library with native code. Stage implements only the
  platform's declared contracts, and the Astryx app carries only the
  platform's native code, so neither runs that native code. Options:
  - **A visible stand-in only.** Stage lays out the view as a labelled box and
    the module's calls answer `no-module`; the Astryx app refuses the project
    at the host check (FR12). Simple and honest; the screens that use the
    library cannot be checked in Stage or Preview.
  - **A JavaScript simulation that the library ships.** The library provides a
    simulation of its view and module, in the shape of the `./testing` doubles
    (`spec:AST-112/FR5`), that Stage loads and Preview may load. Works on every
    desktop with no native build; the simulation can drift from the real
    native code, and a Preview simulation is not the real behavior on a phone.
  - **A native extension for Stage.** The library ships a desktop build of its
    native side against a versioned binary interface that Stage loads. Closest
    to the real behavior; each library builds and signs per desktop operating
    system and architecture, Stage gains a binary interface to keep stable,
    and loading third-party native code in a Preview project is a new trust
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
- **OQ3 — How does Stage track and declare the contracts it implements?**
  (`human-design`) FR6 fixes the pairing by spec hash and version floor.
  Options for the declaration and its exceptions:
  - **A published manifest per Stage release** that lists each contract and
    the spec hash it implements, read by `astryx doctor` and
    `astryx stage which`. One table to compare; every spec change needs a
    Stage release.
  - **Named features on top of the hashes**, so a Stage can implement part of
    a contract and declare which parts. Finer pairing; two vocabularies to
    keep in step with the platform's named features.
  - **Documented divergences in the manifest**: a contract Stage implements
    with a known difference carries the difference in the manifest, and the
    report repeats it. Honest and testable; the list must only shrink, or it
    hides defects.
- **OQ4 — What may a Preview project reach?** (`human-design`) FR11 and DEC-4
  fix the boundary with the app. Open: storage (one namespace per project, or
  per project and per source address); cookies and web data (per project, or
  none); network (any host, the local network only for dev servers, or a
  declared list); permissions (the system prompt once for the app with a
  per-project consent in the app, or no permission-gated capability for
  projects); and which capabilities a project may use at all (camera,
  microphone, photos, files, web content). A wider reach makes more apps
  previewable; each widening is a capability that code from a link can use on
  the person's phone.
- **OQ5 — How does a person know who served a project?** (`human-design`)
  The confirmation shows the address and the name the project claims, which
  the person cannot verify. Options: pair the app with
  the developer's computer once, so a dev server link from another machine on
  the same network is refused; sign hosted bundles, so the confirmation can
  name the author and a changed bundle is refused; or keep the address and
  encryption only. Pairing and signing each add a key to manage; without them,
  anyone who can get a person to scan and confirm can serve that person code.
  Whether plain hosted bundles may be kept for offline use belongs to the same
  question.
- **OQ6 — How is Stage distributed and versioned?** (`human-design`;
  `spec:AST-112/OQ4` owns where binaries are published) Options:
  - **Development-dependency packages**: a small launcher package and a
    package per operating system and architecture, so the project's lockfile
    pins the version. Uses the package manager's cache and offline install;
    large binaries in the registry.
  - **Release archives** per operating system and architecture, with a
    checksum manifest and a signature, which the CLI installs and the project
    pins in a file. Smaller installs; a second download path to secure.
  - Open in both: code signing and notarization on macOS, a signing scheme on
    Linux, a built-in updater or none, and which architectures are supported
    (macOS on Intel, Linux and Windows on ARM).
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
  brings FR13's checks to Stage.
