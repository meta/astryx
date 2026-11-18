---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-137
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

# React Native platform: Diagnostics system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app built with `@astryxdesign/react-native` learns how it behaves on the
people's own devices without adding a native SDK. After a crash, the app reads
what happened on its next launch. Each day, it reads the measures the system
itself took of the app: scroll hitches, peak memory, and time to the first
frame. The developer reads both from typed objects whose calls never throw, and
decides what to show and what to send. The platform keeps this data on the
device and sends nothing.

A test reads what the screen showed on every frame of a gesture or a
transition, so a check holds at each frame and not only once motion settles.
That recorder is a test tool: a shipped app does not contain it.

This record details the diagnostics modules of the platform layer that
`spec:AST-112` defines: `AstryxCrashReports`, `AstryxDailyMetrics`, and the
test-only `AstryxFrameRecorder`. Every asynchronous call resolves the result
vocabulary of `spec:AST-112/FR6`, every module has the capability shape of
`spec:AST-112/FR7` and evolves under `spec:AST-112/FR8`, and Astryx Stage
implements each module as the contract developers build against
(`spec:AST-112/FR12`). What the binary contains, this run's launch time, and
the process's memory belong to `AstryxPlatformInfo` (`spec:AST-130/FR8`); this
record does not restate them.

## Why this exists

A native piece is part of the platform package when an app's alternative is an
open-source library that ships native code of its own
(`spec:AST-132/DEC-5`). Such a library takes the app out of the JavaScript-only
shape of `spec:AST-112/FR4` and away from what Preview and Astryx Stage can
run.

- `AstryxCrashReports`: crash SDKs report crashes well, and each one ships
  native code and sends to its own service. The platform keeps the crash
  records on the device and leaves the destination to the app (DEC-1, DEC-3).
- `AstryxDailyMetrics`: the system's own daily measures have no JavaScript
  surface, so reading them needs native code on any route (DEC-1).
- `AstryxFrameRecorder`: test tools read element frames between steps, not at
  every displayed frame of an animation, and per-frame reads need native
  code. It is test tooling, not app API (DEC-4, OQ2).

## Who uses it

| Native piece          | Kind                                                   | Astryx components that use it                                                                                   | What a person sees                                                                                                          |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AstryxCrashReports`  | native module (Turbo Native Module)                    | No Astryx component; app API only (`.` entry: `AstryxCrashReports`) (OQ1)                                       | Nothing by itself. On the launch after a crash, an app can show its own notice or offer to send a report the person allows. |
| `AstryxDailyMetrics`  | native module (Turbo Native Module)                    | No Astryx component; app API only (`.` entry: `AstryxDailyMetrics`) (OQ1)                                       | Nothing by itself. An app's diagnostics screen can show the last day's scroll hitches, peak memory, and launch time.        |
| `AstryxFrameRecorder` | native module (Turbo Native Module), test-only (Debug) | No Astryx component; test API only: the library's behaviour contract cases through `./testing`'s `recordFrames` | Nothing: a person never meets it. A failed check names the frame where a bar or a view moved out of place.                  |

## Non-goals

- What `AstryxPlatformInfo` reports: the binary's components, capabilities and
  feature rows, this run's process start and prewarm, memory, and bundle size
  (`spec:AST-130/FR8`). This record names only the feature row of FR6.
- JavaScript error reporting: the red box, `ErrorUtils`, and error boundaries
  are React Native's and React's. An uncaught JavaScript error that ends the
  process reaches this group only as the native crash it causes.
- Symbolication, grouping, upload, and dashboards. The app or its service owns
  them.
- Hang and termination diagnostics other than crashes (MetricKit's hang, CPU,
  and disk-write exception diagnostics), and Android's exit reasons (OQ3).
- Frame-rate measurement and performance budgets. The recorder reports
  positions per frame, not timing quality.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The group is three native modules.** Each is read with
  `TurboModuleRegistry.get`, only by its own wrapper (`spec:AST-112/FR8`), and
  its wrapper answers `no-module` where the module is absent, unless the
  module's own requirement names another answer for that platform (FR6:
  `os` for daily metrics on Android).

  | Contract              | Kind                                                   | Methods                                                       | Platforms                    |
  | --------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------- |
  | `AstryxCrashReports`  | native module (Turbo Native Module)                    | `getConstants` (`isEnabled`), `list`, `clear`, `crashForTest` | iOS; Astryx Stage            |
  | `AstryxDailyMetrics`  | native module (Turbo Native Module)                    | `getConstants`, `getLatest`                                   | iOS; Astryx Stage            |
  | `AstryxFrameRecorder` | native module (Turbo Native Module), test-only (Debug) | `getConstants` (`isRecordingAvailable`), `start`, `stop`      | iOS; Astryx Stage (iOS look) |
  - `AstryxCrashReports` and `AstryxDailyMetrics` are part of the platform's
    core (`spec:AST-112/FR1`), exported from the `.` entry (OQ1).
  - `AstryxFrameRecorder` is a test-only module. Only Debug builds contain
    it; a Release binary has no such module, and its handle is `null` there.
    It is reached only through `./testing` (`recordFrames`,
    `isFrameRecorderAvailable`), never through `.` (DEC-4, OQ2).

- **FR2 — Results never throw.**
  - Synchronous members (`isAvailable()`, `AstryxCrashReports.isEnabled()`,
    , `isFrameRecorderAvailable()`) read the
    constants and never throw; they answer `false` or `null` where the module
    or the constant is absent.
  - Every asynchronous call resolves `AstryxResult` and never rejects
    (`spec:AST-112/FR6`). Each module adds only these reasons to the common
    ones:

    | Module                | Module reasons                                                                                                  |
    | --------------------- | --------------------------------------------------------------------------------------------------------------- |
    | `AstryxCrashReports`  | `not-declared` (the app, or for `crashForTest` the test build, did not opt in)                                  |
    | `AstryxDailyMetrics`  | `os` (the operating system delivers no daily measures: Android), `unavailable` (the kept record cannot be read) |
    | `AstryxFrameRecorder` | `unavailable` (the binary cannot record), `busy`, `not-recording`                                               |

  - A domain outcome is a field of an `ok` result: `list` with no reports
    answers an empty list, and `latest` before any payload answers
    `metrics: null`.
  - In a Preview project's runtime, every `AstryxCrashReports` and
    `AstryxDailyMetrics` call answers `not-allowed`: a project cannot read the
    crashes or the measures of the app that hosts it. The frame recorder is
    never served to a Preview project, so it is absent there.
  - `recordFrames` is the group's one throwing call. It is a test step: where
    it cannot record (no module, a Release binary, Android, a recorder
    already armed, a native refusal), it throws an `unsupported-step` error,
    so a check fails as a runner gap and never passes with nothing checked.
    When the step under test outlives its own bound, or the native recording
    times out, it throws an error that names the step.
  - FR2 gap: on iOS, `list`, `clear`, and `crashForTest` answer `unsupported`,
    not `not-declared`, where the app or the test build did not opt in.

- **FR3 — `AstryxCrashReports` keeps the app's own crash reports on the
  device.**
  - It is off until the app opts in through the configuration plugin, which
    writes the app-level native setting (`spec:AST-112/FR4`). JavaScript
    cannot turn it on. Off, it installs nothing and creates no file:
    `isEnabled()` is false and `list` and `clear` answer `not-declared`.
  - On, the reporters install when the platform loads, before the app's first
    frame and before any JavaScript runs. Three sources each write one report
    per crash:
    - `metrickit`: each crash diagnostic the system delivers on a later
      launch, kept as the system's own JSON (exception type and code, signal,
      termination reason, and the call-stack tree as images and offsets).
      `time` is the start of the payload's window, the earliest the crash can
      have happened.
    - `exception`: an uncaught Objective-C exception, with its name, reason,
      and symbolicated call stack.
    - `signal`: a fatal signal (`SIGSEGV`, `SIGBUS`, `SIGABRT`, `SIGILL`,
      `SIGFPE`, `SIGTRAP`), with the signal and the raw return addresses. The
      next launch turns it into a report and marks each address in the app's
      own image with its offset, so the build's debug symbols resolve it.
  - `list()` answers every report, oldest first. A report has `id` (stable
    for its life on the device), `source`, `time` (epoch milliseconds),
    `version` and `build` (the app's, when it crashed), `signature` (one line
    that names the crash, such as `EXC_BAD_ACCESS (SIGSEGV)`), and `detail`,
    the source's whole report. The platform never shortens a report. `list`
    also answers `diagnostics`, one line that says whether the reporters are
    installed and whether each handler is still the platform's.
  - `clear(ids?)` removes the named reports, or every report when `ids` is
    absent or empty, and answers how many it removed. A cleared report never
    comes back: the module does not read a past system payload again.
  - A crash the process records itself (`exception` or `signal`) can arrive
    again on a later launch as a `metrickit` report. The two stay separate
    reports; an app that needs one per crash matches them by `time` and
    `signature`.
  - Reports are kept 14 days, by their `time`, and older ones are removed at
    launch. They live in the app's own container, excluded from the device
    backup. Only the app's own runtime reads or clears them (FR2).
  - Two crashes never share an `id`, and an `id` is a plain file name of the
    module's folder: `clear` never follows a path from JavaScript.

- **FR4 — The crash reporters coexist with every other reporter.**
  - The exception handler is chained: the platform keeps the handler that was
    installed before it, writes its report, then calls that handler.
  - The signal handler writes with async-signal-safe calls only, into a file
    opened at launch, on an alternate stack for the thread that loads the
    platform, so a stack overflow on that thread still reports. It then hands
    the crash on unchanged: the previous action comes back, and a hardware
    fault faults again under it. The system's own crash report, MetricKit,
    and any other reporter therefore see the original exception and fault
    address.
  - An exception that ends in an abort writes one report, not two.
  - The platform never removes or replaces another reporter's handler. When
    another library replaces the platform's handlers after launch, the
    `diagnostics` line says so.

- **FR5 — `crashForTest` crashes only a test build.**
  - `crashForTest(kind)` crashes the app on purpose, a moment after it
    answers `ok`, so a test proves the whole path from crash to report:
    `segv` (a write to an unmapped address), `abort`, or `exception` (an
    uncaught Objective-C exception).
  - Two gates hold it: the app opted in (FR3), and the build also declares
    the test trigger, which the configuration plugin writes only for a test
    build's profile. Otherwise it answers `not-declared` and does nothing.
  - The release checks fail a built app that declares the test trigger.

- **FR6 — `AstryxDailyMetrics` keeps the system's last day of measures.**
  - The platform adds one subscriber of its own to the system's metrics
    manager per process, when the platform loads. The system delivers every
    payload to every subscriber, so the app's own subscriber, or another
    library's, still receives everything; the platform never removes one.
  - Each payload that carries at least one of the three measures becomes one
    record, and only the record whose range ends last is kept, whatever order
    payloads arrive in. Nothing accumulates: the module keeps one small file,
    in the app's container, excluded from the device backup.
  - `latest()` answers `{ok: true, metrics}`, with `metrics: null` until a
    payload has arrived on this device. `metrics` has `beganAt` and `endedAt`
    (the payload's range, epoch milliseconds), `hitchMsPerS` (the scroll hitch
    time ratio: milliseconds of hitches per second of scrolling),
    `peakMemoryBytes`, `firstDrawMedianMs` (the median time to the first
    frame after a launch, the middle of the histogram bucket that holds the
    median count), and `appVersion` and `build` (the version the payload
    describes, which can be the one before an update). A measure the payload
    does not carry is `null`.
  - The system delivers payloads on a real device, about once a day. The iOS
    Simulator receives none, so `metrics` stays `null` there.
  - Android delivers no daily measures to the app on the device, so `latest()`
    answers `os` there. `AstryxPlatformInfo.supports('dailyMetrics.systemReport')`
    is the probe: true on iOS, false on Android and in Astryx Stage
    (`spec:AST-130/FR8`).
  - This run's own launch time and memory are `AstryxPlatformInfo`'s
    (`spec:AST-130/FR8`). `firstDrawMedianMs` is the system's figure over the
    day, not this run's.

- **FR7 — `AstryxFrameRecorder` records what the screen shows at every
  frame, for tests.**
  - `recordFrames(ids, during, {settleMs?, timeoutMs?})` arms the recorder,
    awaits `during` (a pan, a snap, a push), records `settleMs` more
    (default 500 ms) for animations it started, and resolves the samples.
    `timeoutMs` (default 30 seconds) bounds `during`.
  - A sample has `t` (milliseconds since the recording started), `navBar`
    (the frontmost navigation bar's frame, or `null` when none shows), and
    `frames` (each requested `testID`'s frame, or `null` on a frame where no
    such view is on screen). A frame is `{x, y, width, height}` in window
    points, as the screen shows it: read from the presentation layers, so the
    system's own animations (a large title's collapse, a push) appear at each
    frame, not where they end.
  - It records once per displayed frame, at the display's full rate while it
    runs, from the key window. A requested `testID` that is not on screen
    does not slow the frames it records.
  - One recording runs at a time (`busy`). A recording stops itself after 60
    seconds, so a test that never stops cannot keep recording until the next
    reload. `stop` then answers `ok` with the samples it took and
    `isTimedOut: true`, and `recordFrames` throws an error that names the
    step.
  - FR7 gap: a recording that stopped itself answers `stop` with the reason
    `timed-out`, not `ok` with `isTimedOut: true`.
  - `isFrameRecorderAvailable()` says whether this binary can record.

- **FR8 — Nothing leaves the device unless the app sends it.**
  - No module in the group makes a network request or hands data to another
    process. Crash reports, the daily record, and frame samples stay on the
    device, and the frame samples stay in memory until `stop` returns them.
  - A report's `detail` is never scrubbed by the platform, because a scrubbed
    report loses what a developer needs. An exception's reason and the
    system's composed messages can carry personal data, so an app that sends
    a report scrubs those fields itself. An app attributes a report by its
    `time` (for example against when its user signed in), because a report can
    come from before the current sign-in.
  - Because the platform sends nothing, the app's own privacy disclosures
    describe exactly what the app chooses to send.
  - Crash reports are off by default (FR3). The daily record runs in every app
    with nothing to opt into and keeps one record only (FR6, OQ1).
  - Every required-reason API the group calls is declared in the platform's
    privacy manifest with its reason.

- **FR9 — Threads and lifecycle.**
  - Installing the crash reporters and the metrics subscriber does no file
    walk on the launch path. Pruning old reports runs on a background queue.
  - `list`, `clear`, and `latest` do their file work off the main thread and
    off the JavaScript thread, and a read never sees a half-written record.
  - The frame recorder samples on the main thread, because the presentation
    layers live there, and only while it is armed.
  - A module torn down during a reload loses no report: reports and the daily
    record live in files, and the next runtime reads them.

- **FR10 — Every contract is at revision 1; later behaviour is a named
  feature.**
  - Every contract in the group is at revision 1 on every platform that has
    it, and a module added to a platform later starts there at revision 1.
    No contract carries a revision counter (`spec:AST-112/FR8`).
  - A behaviour added after revision 1 is a named feature,
    `<Contract>.<feature>`, that the binary lists in `AstryxPlatformInfo`'s
    `contractFeatures` constant (`spec:AST-130/FR18`). JavaScript checks it
    with `hasContractFeature` before it uses the behaviour, and without it
    keeps the revision-1 behaviour or answers `unsupported`, never a silently
    weaker path. The group has no named feature at revision 1.
  - Astryx Stage pairs with the package through the library's Stage version
    floor: the package names the oldest Astryx Stage that implements its
    contract set, and an older Astryx Stage refuses the project with the gaps
    listed.

- **FR11 — Astryx Stage simulates each module.**
  - `AstryxCrashReports`: present, with `isEnabled()` following the project's
    opt-in; `list` answers no reports and `crashForTest` answers
    `not-declared`, because Astryx Stage never crashes a project on purpose.
  - `AstryxDailyMetrics`: present, as on the iOS Simulator: `latest()`
    answers `metrics: null`, and the feature row of FR6 reads false.
  - `AstryxFrameRecorder`: present for the iOS look in the app's own runtime,
    sampled once per frame from Astryx Stage's own frame model, so a check
    sees what Astryx Stage draws at each frame. It is absent for the Android
    look and in a Preview project, as on those platforms.
  - FR11 gap: Astryx Stage has no `AstryxCrashReports` and no
    `AstryxDailyMetrics` module; their wrappers answer `no-module` there.

- **FR12 — Public platform API only.**
  - The native code of every module in the group uses public platform API
    only: MetricKit, the Foundation uncaught-exception handler, POSIX signal
    actions and the alternate signal stack, `backtrace`, the dynamic loader's
    image functions, the display link, Core Animation presentation layers,
    and UIKit's view and view-controller trees. The group needs no exception.

- **FR13 — Accessibility.**
  - The group has no view and exposes nothing to VoiceOver or TalkBack.
  - The frame recorder finds views by their `testID` (the accessibility
    identifier on iOS) and changes nothing that assistive technology reads.

### Platform support

| Contract              | iOS                                                                                                                                                            | Android                                                              | Astryx Stage                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `AstryxCrashReports`  | MetricKit crash diagnostics; a chained uncaught-exception handler; `sigaction` on an alternate stack; reports in the app's container, out of the device backup | No module: `isEnabled()` is false and calls answer `no-module` (OQ3) | Present, no reports, follows the opt-in (FR11)                   |
| `AstryxDailyMetrics`  | One `MXMetricManager` subscriber per process; one kept record in the app's container, out of the device backup                                                 | No module: `latest()` answers `os`; the feature row reads false      | Present, `metrics: null`, as on the Simulator (FR11)             |
| `AstryxFrameRecorder` | `CADisplayLink` on the main thread; presentation-layer frames in window points; Debug builds only                                                              | No module: `recordFrames` throws `unsupported-step` (OQ4)            | Frames from Astryx Stage's own frame model, iOS look only (FR11) |

- Supported feature/engine floor: the platform floor of `spec:AST-112` (iOS at
  React Native's minimum, Android API level 24, the New Architecture only).
  MetricKit delivers crash diagnostics on iOS 14 and later, below that floor.
- Unsupported behavior: an absent module answers `no-module` and its
  synchronous members answer `false` or `null` (FR2); Android answers `os`
  for daily measures (FR6); a missing named feature keeps the revision-1
  behaviour or answers `unsupported` (FR10).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`). A system payload
  (FR3's `metrickit`, FR6) needs a real device and a day of use.

## Current-state impact

- This record details `spec:AST-112`: FR1 (the core gains the crash reports
  and daily metrics modules), FR4 (the crash reports opt-in is an app-level
  native setting), FR5 (`./testing` holds `recordFrames` and
  `isFrameRecorderAvailable`), FR6 and FR7 (each module's results and
  probes), FR8 (the revision-1 baseline), FR12 (Astryx Stage's simulation),
  and FR15 (a system payload needs a real device).
- It reads `spec:AST-130/FR8` for the feature row of FR6 and for the run's
  launch and memory, and `spec:AST-130/FR18` for named features, and changes
  neither.
- It applies `spec:AST-132/DEC-5` (a native piece stays when the alternative
  needs native code) to this group.

## Verification

| Contract | Verification                                                                                                  | Representative states                                                                                     | Mutation or failure expectation                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The platform's spec rules check; the contracts list; a Release build's module table                           | each module's spec; a Debug and a Release iOS build                                                       | A module read with `getEnforcing` or outside its wrapper, a module missing from the contracts list, or a frame recorder in a Release binary                                                           |
| FR2      | Unit tests through the `./testing` doubles in absent, older, and current shapes; a Preview runtime            | each synchronous member; each call; a native throw; an undeclared opt-in; a Preview project               | A synchronous member throws, a call rejects or answers a reason outside its set, a Preview project reads a report, or `recordFrames` passes empty                                                     |
| FR3      | Unit tests of the wrapper; XCTest of records, pruning, and ids; Simulator runs with and without the opt-in    | opted out; opted in with no crash; each source; a report 15 days old; `clear` with and without ids        | An opted-out app creates a file, a report is shortened, an old report survives launch, a cleared report returns, or an id leaves the folder                                                           |
| FR4      | Simulator runs with another reporter installed before and after the platform                                  | a prior exception handler; a prior signal action; a replaced handler; a stack overflow on the main thread | A prior handler is not called, the system report loses the original exception, an abort writes two reports, or `diagnostics` misses a replacement                                                     |
| FR5      | `crashForTest` on a test build for each kind, then the next launch's `list`; the release check on a built app | each kind; no test trigger; a shipped build that declares the trigger                                     | A crash without both gates, no report on the next launch, or a shipped build with the trigger passing the release check                                                                               |
| FR6      | Unit tests of the wrapper; XCTest of the record and the median; a device after a day of use                   | no payload; two payloads out of order; a payload without one measure; Android; the Simulator              | An older day replaces a newer one, a missing measure reads as zero, Android answers anything but `os`, or another subscriber stops receiving                                                          |
| FR7      | Behaviour contract cases on the Simulator and in Astryx Stage; unit tests of `recordFrames`                   | a push; a large title's collapse; a missing `testID`; a second `start`; a step that never settles         | A sample at a resting position during an animation, a missing `testID` that slows the recorded frames, two recordings at once, a recording past 60 seconds, or a self-stopped `stop` that is not `ok` |
| FR8      | Network and process-boundary check of the group's native code; privacy manifest check                         | each module; each required-reason API the group calls                                                     | Any request or inter-process send from the group, a scrubbed or shortened `detail`, or a required-reason API missing from the manifest                                                                |
| FR9      | Launch timing with many kept reports; thread assertions in the native tests                                   | 14 days of reports at launch; `list` during scrolling; a reload                                           | A file walk on the launch path, file work on the main or JavaScript thread, or a report lost across a reload                                                                                          |
| FR10     | The platform's spec rules check; unit tests with a binary that lacks a feature; an older Astryx Stage         | each contract's revision; an older Astryx Stage                                                           | A revision other than 1, a feature used without its check, or an older Astryx Stage that runs the project                                                                                             |
| FR11     | Astryx Stage contract suites against the Simulator results                                                    | each module; the iOS and Android looks; a Preview project                                                 | An Astryx Stage answer differs from the Simulator's and its documentation does not name it                                                                                                            |
| FR12     | Review of each native change for private API; binary symbol check of a core build                             | a core iOS build                                                                                          | A private API call or a private symbol lookup in the group's native code                                                                                                                              |
| FR13     | Accessibility inspection of a screen while a recording runs                                                   | a recorded screen with VoiceOver on                                                                       | The recording changes an element's label, value, or order                                                                                                                                             |

## Decision log

### DEC-1 — Diagnostics stay in the platform package because the alternatives ship native code

**Reference:** `spec:AST-137/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Crash reporting and the system's daily measures need native code on every
route, and the libraries that provide them ship it. Under `spec:AST-132/DEC-5`
the platform package carries the modules, so an app reads its crashes and its
daily measures and stays JavaScript-only.

Rejected: leaving them to a third-party SDK, because the app then carries native
code of its own.

### DEC-2 — Crash reports are off until the app opts in natively

**Reference:** `spec:AST-137/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Signal and exception handlers change process-wide behaviour, must be in place
before JavaScript runs, and share the process with other reporters. The app
chooses them in its configuration, and the platform installs them at load and
hands every crash on unchanged.

Rejected: a JavaScript call that turns reporting on, because it runs too late to
see a crash at launch.

### DEC-3 — The platform keeps diagnostics on the device and sends nothing

**Reference:** `spec:AST-137/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

The app decides what leaves the device, where it goes, and how it is scrubbed.
The platform keeps whole reports and one daily record, so an app's disclosures
describe only what the app sends.

Rejected: a built-in upload, because the platform would then pick a destination
and collect data on every app's behalf.

### DEC-4 — The frame recorder is a Debug-only test tool

**Reference:** `spec:AST-137/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

Checks that must hold at every frame need per-frame positions, but a shipped
app has no use for them. Only Debug builds contain the module, tests reach it
through `./testing`, and a test that cannot record fails instead of passing.

Rejected: the recorder in Release binaries, because every shipped app would
carry a per-frame reader of its view tree.

## Open questions

- **OQ1 — Do crash reports and daily metrics stay core modules, or become an
  opt-in `diagnostics` capability?** (`human-design`) No Astryx component
  calls them. Options: keep both in the core (one binary shape for every app;
  crash reports already stay off behind their native opt-in, and the daily
  record costs one subscriber and one small file); or move both into an
  opt-in `diagnostics` capability (`spec:AST-112/FR3`), so an app that does
  not list it links neither MetricKit nor the handler code and its calls
  answer `not-linked`, at the cost of one more capability entry and opt-in
  step.
- **OQ2 — Where does the frame recorder ship?** (`human-design`) It serves
  only the library's behaviour contract cases. Options: a test-only module of
  the platform package reached through `./testing`, as FR1 states; or a
  separate test-tools package that an app's dependency set never contains,
  which also decides whether the behaviour contract cases are a public
  testing entry.
- **OQ3 — Does Android keep crash reports on the device?** (`human-design`)
  Options: no module on Android, as the platform table states; or a module at
  revision 1 on Android from a chained default uncaught-exception handler and
  the system's recorded exit reasons (Android 11 and later).
- **OQ4 — Does Android record frames for the behaviour cases?** (`checkable`)
  Options: iOS and Astryx Stage only, as the platform table states; or a
  frame-callback recorder on Android with the same samples.
