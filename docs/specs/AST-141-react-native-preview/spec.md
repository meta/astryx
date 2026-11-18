---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-141
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

# React Native: Preview in the Astryx app system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

Preview runs a project built with `@astryxdesign/react-native` on a real phone
without building or installing it. The Astryx app, the native iOS and Android
app for Astryx React Native, is the Preview host: a person opens a project
from a developer's computer or from a hosted bundle, and the project's own
JavaScript runs inside the app, apart from the app and from every other
project. The app also shows every component running natively, with the
example apps and the themes (FR13).

Preview conforms to Astryx React Native's contracts (`spec:AST-112`) and never
defines them. `@astryxdesign/react-native` depends on no Preview host: an app
builds and runs on its devices with no Preview, and it may use third-party
libraries and another router beside the package. This record owns the
`astryx rn preview …` commands, what a person does in the host, the
namespaces that keep a project apart, the Preview policy per module, and the
checks and preparation before a project's code runs. A Preview project meets
the same limits wherever it runs: Astryx Stage (`spec:AST-139`) applies this
record's namespaces and policy when it runs one.

## Why this exists

Checking a change on a phone otherwise needs a native build and an install
per change. Expo Go cannot load the platform's native code
(`spec:AST-112/FR11`). The Astryx app carries Astryx's native code, so a
project that uses only that code opens on a phone from a link or a QR code
and hot-reloads while the developer edits it. A reviewer opens a hosted
bundle from a link and tries the change on a phone. Because the code comes
from a link, the host confirms before it runs anything and keeps every
project away from the app's own identity and data.

## Who uses it

| Who                                    | What they do with Preview                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A developer building an Astryx app     | Scans a QR code from `astryx rn preview` and uses the project on a real phone while it hot-reloads.                 |
| An AI agent working on an Astryx app   | Prints the Preview link or writes a hosted bundle for a person, and checks the project against the host beforehand. |
| A reviewer, designer, or product owner | Opens a hosted bundle from a link and tries the change on a phone.                                                  |
| A person evaluating Astryx             | Browses every component, the example apps, and the themes in the Astryx app.                                        |
| Astryx's own maintainers               | Check that a project meets the same limits in the Astryx app on iOS and Android and in Astryx Stage.                |

## Non-goals

- How the Astryx app is implemented, built, and packaged, and how it runs a
  project internally. Only what a project, the CLI, a developer, and a person
  observe is in this record.
- The Astryx app's screen design beyond the features a person can reach.
- Astryx Stage, its commands, and its notes per module (`spec:AST-139`).
- Each native contract's behavior on iOS and Android. Its platform group
  record (`spec:AST-123` to `spec:AST-132`, and `spec:AST-135`) states it; this record states
  only what a Preview project reaches of it (FR4).
- The React Native commands outside the `astryx rn preview` group, and the
  rules every React Native command follows (`spec:AST-112/FR13`).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

### Opening a project

- **FR1 — The Astryx app is a Preview host on iOS and Android.** A person
  opens a project in the app in three ways: by scanning a QR code (with the
  app's scanner, from a photo, or with the system camera), by opening a
  Preview link, or by typing an address. The project comes from:
  - a developer's computer: the project's dev server on the local network,
    which `astryx rn preview` prints as a link and a QR code; or
  - a hosted bundle: a bundle that `astryx rn preview bundle` writes, served
    over HTTPS from any host (FR11).
- **FR2 — No project code runs without the person's confirmation.** A
  scanned code and a Preview link opened from outside the app show a
  confirmation first, with the name the link carries and the address it comes
  from, and whether that address is this device, the local network, or the
  internet. Nothing is fetched or run until the person confirms. An address
  the person types counts as their choice. A project the app lists as opened
  before asks again. A link cannot carry a confirmation.
- **FR3 — A running project can always be left, reloaded, and switched.**
  While a project runs, the person can return to the app and reload the
  project. A failure to open shows what happened, the address when the server
  did not answer, and a retry where a retry can help. The app lists the
  projects a person opened, except encrypted ones (FR8), and opens any of
  them again with the confirmation of FR2. Removing one from the list also
  removes the data that project stored (FR4).

### A project runs apart

- **FR4 — A Preview project runs apart from the app and from other
  projects.**
  - The project runs inside the app in its own JavaScript runtime, separate
    from the app's own code and from every other project, with the platform
    capabilities that the app has, as the Preview policy allows (FR5).
  - Every module decides the calling runtime's namespace natively, never from
    JavaScript: `app` for the app's own runtime and one of its own for each
    project. Stored data, cache files, web view sessions and page storage,
    and players belong to the namespace that made them; a project never reads
    or acts on the app's or another project's. A runtime with no namespace
    answers `no-namespace`.
  - It never reaches the app's own identity, stored data, files, players,
    or the person's photo library, and it cannot change the app's
    appearance, bars, or lock-screen controls.
  - A call that the host's policy refuses for a project answers
    `not-allowed`, a reason the host adds to every capability's set
    (`spec:AST-112/FR6`); it is never a silent no-op. The other reasons that
    FR5's table names are the host's too, on the modules it names them for.
  - Removing a project from the app's list removes everything it stored, in
    every store of the package, its web view data included where the web
    capability is linked. `AstryxStorage.clearProjectData(bundleUrl)` is that call, made by the
    host in the app's runtime: it answers the cleared namespace and whether
    the web data went. A project's own call, or the app's own bundle URL,
    answers `not-allowed`; a value that is not a URL answers `invalid-url`.
  - Every host that runs a Preview project applies these namespaces and
    FR5's policy, Astryx Stage included (`spec:AST-139`), so a project meets
    the same limits on a phone and on a desktop.
- **FR5 — The Preview policy per module.** A module the table does not name
  answers a project as it answers the app, within the app's own permissions.

  | Module (claim)                                                                              | What a Preview project gets                                                                                                                                                                                                                                                                                                                                                                            |
  | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `AstryxAppearance` (`spec:AST-130/FR4`)                                                     | `getOverride()` answers `'system'`, `getRunOverride()` answers `null`, and `setOverride` answers `not-allowed`.                                                                                                                                                                                                                                                                                        |
  | `AstryxPlatformInfo`, launch info (`spec:AST-130/FR8`)                                      | No `launch` and an empty `installedAt`; the memory and bundle-size reads answer `not-allowed`.                                                                                                                                                                                                                                                                                                         |
  | `AstryxStorage` (`spec:AST-130/FR14`)                                                       | Its own namespace (FR4); `clearProjectData` answers `not-allowed`.                                                                                                                                                                                                                                                                                                                                     |
  | `AstryxClipboard` (`spec:AST-130/FR7`)                                                      | Each read asks as the device does; a refused read or write answers `not-allowed`.                                                                                                                                                                                                                                                                                                                      |
  | `AstryxBack`, `AstryxLaunch` (`spec:AST-130/FR11`, `spec:AST-130/FR12`)                     | Change nothing.                                                                                                                                                                                                                                                                                                                                                                                        |
  | `AstryxAudio`, `AstryxVideoView` (`spec:AST-132/FR3`, `spec:AST-132/FR7`)                   | Players open beside the app's. A `playerId` another runtime holds answers `busy`; a runtime's `close` or teardown frees only its own players; a video view draws only its own runtime's player. The player that started last, in any runtime, owns the Now Playing card and remote commands, and one runtime's teardown never removes another's. A file outside its own folders answers `not-allowed`. |
  | `AstryxPhotoLibrary`, `AstryxPhotoThumbnailView` (`spec:AST-135/FR3` to `spec:AST-135/FR6`) | Not allowed. Every library call answers `not-allowed`, and the thumbnail view reports `not-allowed` and draws nothing: the person's photo library is the app's alone.                                                                                                                                                                                                                                  |
  | The system photo picker, `AstryxFilePicker` (`spec:AST-130/FR13`)                           | Allowed. The iOS system picker and the Android Photo Picker expose no library, and only the items the person picks reach the project, copied into its own cache as picker results.                                                                                                                                                                                                                     |
  | `AstryxCameraView` (`spec:AST-132/FR9`)                                                     | The camera's consent in the app; without it, the permission reports `denied`.                                                                                                                                                                                                                                                                                                                          |
  | `AstryxPasteControl` (`spec:AST-126/FR8`)                                                   | Never served; `PasteButton` draws its fallback, which reads the clipboard under the clipboard's consent.                                                                                                                                                                                                                                                                                               |
  | `AstryxIconView`, `AstryxIcons` (`spec:AST-127/FR1`, `spec:AST-127/FR2`)                    | A bundled mask, a `data:` URI, or a file it may read; a remote mask goes through `Image`, under its own image loading and network rules, and never as a mask the app's runtime downloaded. `prefetch` answers `not-allowed`.                                                                                                                                                                           |
  | `AstryxSystemMenu` (`spec:AST-128/FR3`)                                                     | No preview card.                                                                                                                                                                                                                                                                                                                                                                                       |
  | Navigation hosts and `AstryxRouter` (`spec:AST-125/FR2`, `spec:AST-125/FR12`)               | The Preview chrome shows the host root's routes and opens paths through the router's snapshot (FR6). A navigator whose native host is missing shows an in-place message, announced as an alert, and a development error; never a blank screen.                                                                                                                                                         |
  | `./safe-area-context` (`spec:AST-129/FR5`)                                                  | A project that imports `react-native-safe-area-context` gets this entry and renders.                                                                                                                                                                                                                                                                                                                   |

### Before a project's code runs

- **FR6 — The host prepares a project before its code runs.**
  - Before a project's main module runs, the host checks it (FR7), gives it
    its runtime and namespace (FR4), and installs the prelude: the globals of
    both installers of `spec:AST-112/FR5` (`crypto.getRandomValues` and
    `crypto.randomUUID` from the system's secure generator, and `fetch` with
    `redirect: 'error'` and `redirect: 'manual'`). The project imports
    nothing for them, and the host installs no other global.
  - The host root is the router root that the host names, else the
    outermost root that mounted first and is still mounted. The Preview
    chrome and the inspector read one serialisable snapshot of it, whose
    `revision` names its shape, and open paths through the app's own
    linking. They reach the app's routes only when the host asks for them;
    an app's own mount never offers its routes to a host (`spec:AST-125/FR2`).
- **FR7 — The host checks a project before its code runs.**
  - A project declares what it requires from the host. Before the project's
    main module runs, the host compares that with the native components,
    modules, versions, and named features it has; a project that needs one
    the host lacks is refused with a screen that names what is missing.
    `astryx rn preview check` answers the same question on the developer's
    computer (FR11).
  - The host runs source bundles only. A precompiled bytecode bundle is
    refused before it runs.
- **FR8 — An encrypted hosted bundle keeps its key on the phone.** For an
  encrypted bundle, the key travels only in the part of the link after `#`,
  which is never sent to the server. The app verifies the integrity of every
  part of the bundle before any of its code runs, keeps the decrypted bundle
  in memory only, and writes nothing decrypted to the device. An encrypted
  project is never kept in the list of opened projects, and the data it
  stores lasts only while it is open. Any failed check refuses the project
  with one line saying why.
- **FR9 — Preview is part of the Astryx app.** Opening and running a project
  is a feature of the Astryx app, which carries its own native pieces for it.
  `@astryxdesign/react-native` keeps only the project side of Preview: the
  types and manifest shape that a previewed project uses
  (`spec:AST-112/FR1`), and it imports nothing from a host. A project carries
  no Preview code of its own: the host sets up what the project needs before
  the project's code runs (FR6).

### The inspector

- **FR10 — The inspector picks an element without touching the project.**
  The app's inspector picks an element on a running Preview project's screen
  and shows the component under it. While the inspector is picking, every
  touch goes to the inspector and none reaches the project. When picking
  ends, the project receives touches again.

### The commands

- **FR11 — `astryx rn preview` makes what a Preview host opens.**
  `@astryxdesign/react-native` contributes the group to the Astryx CLI with
  its other commands, and the group follows their rules
  (`spec:AST-112/FR13`): it asks no question, prints one envelope under
  `--json`, prints plain text otherwise, exits 0 or 1 the same in text and
  JSON, and its outcomes differ by `code`.

  | Command                    | Its one job                                                                                                                                                                                                                                                                                                                                                                                       |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `astryx rn preview`        | Prints the link with which a Preview host opens the project from this computer's dev server, and whether a dev server answers. It never starts one; `--start` starts the dev server and keeps running. `--link-only` probes nothing, `--dev-server-url <url>` names a running dev server, `--display-name <words>` is the name the link carries, and `--qr-png <file>` writes the link's QR code. |
  | `astryx rn preview check`  | Compares the project's requirements with what a Preview host provides (FR7), and lists each requirement the host lacks.                                                                                                                                                                                                                                                                           |
  | `astryx rn preview bundle` | Writes a preview bundle per platform, with its manifest, for any HTTPS host. `--single-file` writes one file per platform, and `--encrypt --public-url <url>` writes it encrypted, with the key only in the link (FR8).                                                                                                                                                                           |
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
  - The group answers: how does a Preview host open this project?
    `template --cdn` writes a web page, and no command makes what a Preview
    host opens. Its function is `preview` in the package's `./commands`
    entry, and its result is links, URLs, and host-check items.
  - Outcomes beyond the shared ones of `spec:AST-112/FR13`:

    | Outcome                                                                                                                                                    | Code                               |
    | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
    | A named dev server does not answer                                                                                                                         | `ERR_DEV_SERVER_UNREACHABLE`       |
    | `preview check` finds a requirement the Preview host does not provide                                                                                      | `ERR_PREVIEW_HOST_MISSING`         |
    | `preview share` finds a file that its deny rules refuse                                                                                                    | `ERR_PREVIEW_SHARE_DENIED`         |
    | `preview share` uses a carrier that no `--accept-carrier` names; the suggestions name the same run with `--accept-carrier <name>` and each carrier's terms | `ERR_PREVIEW_CARRIER_NOT_ACCEPTED` |

### The Astryx app's catalog

- **FR13 — The app shows Astryx React Native running natively.** Beside
  Preview, the Astryx app shows every component of
  `@astryxdesign/react-native` with live examples, searchable by name;
  example apps built only with Astryx; and the themes, with light, dark, and
  system appearance. The examples are the documentation's examples.

### Evidence

- **FR12 — A Preview run is development evidence.** A Preview run shows what
  the project does on the platform's contracts on a phone. A claim about
  native behavior is checked on the Simulator, the emulator, or a device
  (`spec:AST-112/FR15`); a Preview run alone does not back it.

### Platform support

- Supported feature/engine floor: the Astryx app runs on iOS and Android at
  the platform floor of `spec:AST-112`; encrypted hosted bundles need
  Android 11 or later on Android.
- Unsupported behavior: on a device without a camera, the scanner offers the
  typed address. A project that needs a native piece the host lacks is
  refused before its code runs (FR7).
- Browser evidence: none. Preview claims are checked on the Simulator, the
  emulator, and devices.

## Current-state impact

- `spec:AST-112` names this record for the Astryx app's Preview and the
  `astryx rn preview …` commands; its library layer keeps the types and
  manifest shape a previewed project uses (`spec:AST-112/FR1`), and its
  installers (`spec:AST-112/FR5`) are what the prelude installs (FR6).
- `spec:AST-139` runs a Preview project under this record's namespaces and
  policy (FR4, FR5).
- `architecture:cli-surface` INV10 admits a file that `--qr-png` names by an
  absolute path, as DEC-16 does for `experimental render --out`.
  `spec:AST-114` FR5's table gains `doctor`'s `--scope`, which requires
  `setup.checks`.
- Each platform group record (`spec:AST-123` to `spec:AST-132`, and `spec:AST-135`) states its
  contracts; this record states what a Preview project reaches of them (FR5).

## Verification

| Contract | Verification                                                                                                                | Representative states                                                                                | Mutation or failure expectation                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Opening a project by each way in, from a dev server and from a hosted bundle, on iOS and Android                            | QR code; photo; link; typed address; dev server; hosted bundle                                       | A way in that does not open the project                                                                                                                            |
| FR2      | Links and codes from outside the app; a link that claims a confirmation                                                     | local network; internet; typed; opened before                                                        | Any request or code that runs before the person confirms                                                                                                           |
| FR3      | Reload, return, and opening another listed project while a project runs; a dev server that stops; removing a listed project | a running project; an unreachable address; an encrypted project                                      | A project that cannot be left, an encrypted project in the list, or stored data left after removal                                                                 |
| FR4      | The app and two projects that read and write each store; a refused capability; a removed project; the same in Astryx Stage  | each store; each refused capability; `clearProjectData` from a project and with the app's bundle URL | One namespace that reads another's data, a refusal that is a silent no-op, a removed project that leaves data, or a Stage run with other limits                    |
| FR5      | Device and Stage runs of a project that calls each module in the table                                                      | each row of FR5's table; a photo picked through the system picker                                    | A project that changes the app's appearance, reads its launch facts, takes the app's players, reads the photo library, or gets a picked item outside its own cache |
| FR6      | A project that uses the prelude's globals without importing them; the Preview chrome and the inspector over a project       | a project; an app with two routers                                                                   | A project that starts without the globals, a global the host adds beyond the prelude, or an app's routes offered without the host asking                           |
| FR7      | A project that requires a piece the host lacks; a bytecode bundle; `astryx rn preview check`                                | a missing native piece; an older host                                                                | A project's main module that runs on a failed check, or a bytecode bundle that runs                                                                                |
| FR8      | Encrypted bundles with a bad key, a changed part, and a redirect; the server's request log                                  | a valid link; each failed check; data written while open                                             | A key that reaches the server, code that runs before every check passes, decrypted bytes written to the device, or data kept after the project closes              |
| FR9      | A dependency check of `@astryxdesign/react-native`; a project with no Preview code                                          | the Astryx app's build; a plain project                                                              | The app's native Preview pieces in `@astryxdesign/react-native`, or a project that needs Preview code to run                                                       |
| FR10     | Inspector picking over a project that counts its touches, on iOS and Android                                                | picking on; picking ended                                                                            | A touch that reaches the project while picking, a project that gets no touches after picking ends, or an inspector that names the wrong component                  |
| FR11     | CLI contract tests of `astryx rn preview`: envelopes, exit codes, each code in FR11's table; a share without terms          | a link; a QR PNG; a plain and an encrypted bundle; a share with a denied file                        | A share that runs without accepted terms, a key outside the link's fragment, or a QR code printed as text                                                          |
| FR12     | Review of each native change's evidence                                                                                     | a native behavior change                                                                             | A native claim backed only by a Preview run                                                                                                                        |
| FR13     | A walk of every component page and example app on the Simulator and emulator                                                | each component; each example app; each appearance                                                    | A component without live examples, or an example that differs from the documentation's                                                                             |

## Decision log

### DEC-1 — Preview asks before any project code runs

**Reference:** `spec:AST-141/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A Preview project runs inside an app that has camera access and reaches the
local network. Nothing is fetched or run until the person confirms, with the
address in view, and a link cannot carry that confirmation.

Rejected: running a project as soon as its code is scanned, because any code
on a poster or a web page would then run on the phone.

### DEC-2 — A Preview project never reaches the app's identity or data

**Reference:** `spec:AST-141/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A project opened from a link is code the app did not ship, running in the same
app as the app's own code. Each module derives the calling runtime's namespace
natively, so stored data, cache files, and players belong to the runtime that
made them, and a call the policy refuses answers
`not-allowed`. Opening a project cannot read or act as the app, or take its
lock-screen controls away. The person's photo library is the app's alone; a
project reaches the photos the person chooses through the system photo
picker.

Rejected: a namespace argument from JavaScript, because a project could name
the app's.

### DEC-3 — Preview is part of the Astryx app

**Reference:** `spec:AST-141/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Running a separate React Native project inside an app is the job of a Preview
host, so the Astryx app carries its own native pieces for it.
`@astryxdesign/react-native` keeps only what every previewed project needs:
its manifest shape and its types.

Rejected: a `preview` capability that an app opts into, because no app other than a host needs it, and every app's package would carry its code.

### DEC-4 — Astryx React Native stays neutral of Preview

**Reference:** `spec:AST-141/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

The package's contracts serve every app, with or without a development tool.
Preview is a separate feature that follows those contracts: the package
depends on no host, and an app may use third-party libraries and another
router beside the package. Preview covers Astryx's contracts and names what
it does not cover (FR7).

Rejected: Preview rules inside the package's records, because every contract
would then carry a development tool's requirements.

### DEC-5 — One Preview policy in every host

**Reference:** `spec:AST-141/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

A project checked in Astryx Stage and opened on a phone has to meet the same
limits, or a check on one says nothing about the other. This record owns the
namespaces and the per-module policy, and every host that runs a Preview
project, Astryx Stage included, applies them.

## Open questions

- **OQ1 — How does a project with its own native library open in Preview?**
  (`human-design`) An app may add its own native component or module, or a
  third-party library with native code, a router's included. The Astryx app
  carries only Astryx's native code, so it does not run that native code.
  Options:
  - **A refusal at the host check.** The host refuses the project and names
    the library (FR7). Simple and honest; the screens that use the library
    cannot be checked in Preview.
  - **A JavaScript simulation that the library ships.** The library provides
    a simulation of its view and module, in the shape of the `./testing`
    doubles (`spec:AST-112/FR5`), that the host may load. The project opens;
    the simulation is not the real behavior on a phone and can drift from
    the native code.
  - **A declared contract with data only.** The library declares its contract
    and static answers or pictures for the host to show. No code runs; it
    covers only simple, static pieces.
- **OQ2 — What more may a Preview project reach?** (`human-design`) FR4 and
  FR5 fix the namespaces and the per-module policy. Open: whether storage is
  per project or per project and per source address; cookies and web view
  data (per project, or none); network (any host, the local network only for
  dev servers, or a declared list); sign-in; permissions beyond the camera (the system prompt once for the app with a
  per-project consent in the app, or no permission-gated capability for
  projects); and web content. A wider reach makes more apps previewable; each
  widening is a capability that code from a link can use on the person's
  phone.
- **OQ3 — How does a person know who served a project?** (`human-design`)
  The confirmation shows the address and the name the link carries, which
  the person cannot verify. Options: pair the app with the developer's
  computer once, so a dev server link from another machine on the same
  network is refused; sign hosted bundles, so the confirmation can name the
  author and a changed bundle is refused; or keep the address and encryption
  only. Pairing and signing each add a key to manage; without them, anyone
  who can get a person to scan and confirm can serve that person code.
  Whether plain hosted bundles may be kept for offline use belongs to the
  same question.
- **OQ4 — Does the Astryx app ship publicly, and where?** (`human-design`)
  Options: the App Store and Google Play; a public beta channel; or build from
  source only. Store review rules on running downloaded code (App Store Review
  Guidelines 2.5.2, Google Play's policy on code loaded at run time) may
  require Preview to be limited or left out of a store build, which would
  split the documentation app from the Preview host. The app's own minimum
  operating-system versions belong to the same question.
