---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-140
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

# React Native platform code system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

The platform layer of `@astryxdesign/react-native` (`spec:AST-112/FR1`) holds
every line of the package's native code. This record owns the rules that all of
that code follows: how a native module or a native view is registered and
reached from JavaScript, what a result and a failure look like at the boundary,
what values cross it, how a native interface grows without breaking an older
binary, which thread each kind of work runs on, which tests prove a contract on
each platform, which parts depend on the JavaScript engine's binding, and how
Astryx's native code lives beside the native code of other libraries in the
same app.

A contributor who writes a native piece for any group of the platform
(`spec:AST-112/FR7`) follows these rules, and a reviewer checks a native change
against them. An app developer never sees them directly: an app reaches the
platform only through its JavaScript API (`spec:AST-112/FR5`).

While the package is canary-only (`spec:AST-112/FR14`), the rules here are the
platform's own conventions for its native layer, and no app relies on the
native interfaces they describe. The public promise for those interfaces is
set when the package leaves the canary channel (`spec:AST-082/FR15`).

## Why this exists

`spec:AST-112` describes the React Native foundation in terms that hold for any
JavaScript engine React Native hosts. The platform's native code needs more
specific rules than that record states: the binding to React Native, the shape
of every message across it, threads, and tests. Every platform group record
follows the same rules, so they live once, here, instead of in each group
record or in the neutral foundation record.

## Platform group records

Each group record specifies its own native pieces and follows this record for
the rules above.

| Record         | Group                                             | Links                                 |
| -------------- | ------------------------------------------------- | ------------------------------------- |
| `spec:AST-123` | Surfaces and glass                                | core                                  |
| `spec:AST-124` | Gestures and drag                                 | core                                  |
| `spec:AST-125` | Navigation hosts                                  | core                                  |
| `spec:AST-126` | Native controls                                   | core                                  |
| `spec:AST-127` | Icons and drawing                                 | core                                  |
| `spec:AST-128` | Menus and presentation                            | core                                  |
| `spec:AST-129` | Layout, text, and keyboard                        | core                                  |
| `spec:AST-130` | System modules, the platform info module included | core                                  |
| `spec:AST-131` | Web                                               | `web`                                 |
| `spec:AST-132` | Media and camera                                  | `media`, `camera`                     |
| `spec:AST-135` | Photos and documents                              | `photos`, `pdf`; image markup in core |

## Non-goals

- The methods, props, events, and reasons of any one native piece. Its group
  record owns them.
- The JavaScript API an app calls, its entries, and its capability shape:
  `spec:AST-112/FR5` and `spec:AST-112/FR7`.
- Which capabilities link by default and which an app opts in:
  `spec:AST-112/FR3`.
- Astryx Stage's internals beyond the contracts it implements:
  `spec:AST-112/FR12` and `spec:AST-139`.
- A second JavaScript engine or binding. This record keeps the contracts
  independent of the binding (FR8); it names no other engine.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — One native module or native view per contract, registered through
  the binding layer.**
  - A contract is one native module (an API JavaScript calls, with no UI of
    its own) or one native view (a UI element JavaScript renders, with props
    down and events up). A contract has one name and one kind on every
    platform: the same name is never a module on one platform and a view on
    another.
  - The binding layer is React Native's New Architecture. Each native module
    is a TurboModule and each native view a Fabric component, declared in a
    typed codegen spec inside the platform layer. React Native's code
    generation produces the native interfaces from those specs, and the core
    and each opted-in capability register through autolinking
    (`spec:AST-112/FR3`).
  - A contract's name is `Astryx` followed by a PascalCase noun, such as
    `AstryxHaptics` or `AstryxGlassView`. No two contracts share a name, and
    no contract takes a name that React Native or a platform SDK uses.
  - Each codegen spec opens with a header that names the contract's owner,
    platforms, first version, and stability, and lists its named features
    (FR5).
  - A member that exists on one platform only says so in its name or its
    tag, and the contract's header lists it under that platform.
  - Each contract has one JavaScript wrapper in the platform layer, and only
    that wrapper reads the contract's handle. The library layer and apps call
    the wrapper; no app-facing type carries a module handle, a view's native
    component, or a binding-layer type (`spec:AST-112/FR7`).

- **FR2 — A missing native piece is a result, never a crash.**
  - A wrapper reads its module with React Native's optional lookup
    (`TurboModuleRegistry.get`), never the enforcing one. Importing any entry
    of the package never throws, whether the binary links the piece or not.
  - A call on a module the binary does not carry resolves `not-linked` when
    the app did not opt its capability in, and `no-module` otherwise
    (`spec:AST-112/FR3`).
  - A view the binary does not carry reports itself unavailable through its
    `is<View>Available()` probe, and the library draws its fallback instead of
    mounting it.
  - A probe answers from data the binary reports once, at start: the
    capabilities it links and the named features it has (FR5). It never
    calls native code that can fail.

- **FR3 — One result vocabulary across the boundary.**
  - Every asynchronous call in the platform resolves
    `AstryxResult<T, R>`: `{ok: true, …}` with its data, or
    `{ok: false, reason, message?}`. It never rejects. The one exception is
    the test step `recordFrames` of `./testing` (FR7).
  - `reason` comes from a closed set per capability plus the common reasons
    `no-module`, `not-linked`, `unsupported`, `cancelled`, and `error`.
    `no-module` means the platform's native side is absent; `not-linked`
    means the app did not opt the capability's native code in
    (`spec:AST-112/FR3`); `unsupported` means the binary predates the method,
    one of its options, or a value it was sent (FR5). A capability may add
    reasons of its own, such as `unsupported-option` where a platform cannot
    honor an option.
  - `cancelled` is the one failure that is not an error: the person declined
    or dismissed something. A caller branches on it and shows no error.
  - `message` is platform text for logs. It never carries a URL's query, a
    cookie, a key, or a token.
  - At the binding, a native method takes one request object and resolves one
    result object with `status` (`ok`, `cancelled`, or `error`), `reason`, and
    `message`. A domain outcome, such as "not found", is a field of an `ok`
    result. The wrapper maps that object onto `AstryxResult`.
  - Native code never throws or rejects across the binding. A native
    exception, a failed system call, or a missing system service inside a
    method resolves `error` with a reason; the wrapper also turns any
    rejection or throw that does reach it into `error`.
  - A call resolves exactly once. A native method whose work outlives its
    caller (an unmounted view, a hook's cancel) stops that work and drops its
    reply.
  - A call that waits on the system for an unbounded time has a time bound,
    and when the bound passes it resolves a failure whose reason says so
    (OQ2). A call that waits on the person, such as a picker or a sign-in
    sheet, has no time bound: it resolves when the person finishes or
    dismisses it.

- **FR4 — Only plain values cross the boundary.**
  - A request, a result, a prop, and an event carry the values codegen types:
    strings, numbers, booleans, arrays, and plain objects of those, with
    closed sets as string unions.
  - Bytes cross as a `file:` URI to a file in the app's own storage. A short,
    fixed-size value, such as a block of random bytes, may cross as a base64
    string.
  - No pointer, native object reference, or binding handle crosses. A native
    object that outlives one call, such as a web session or a recorder, lives
    on the native side, and JavaScript names it with an opaque string id.
    The id is valid only in the runtime that created it and only until it is
    released. A call with an unknown or released id resolves a failure; it
    never crashes.
  - An event carries one object. A subscription returns a function that
    removes it; after removal, or when the view unmounts, no further event
    arrives.

- **FR5 — Native interfaces only grow.**
  - Every contract is at revision 1: the shape its first published release
    carries. A contract carries no revision counter, and no module has the
    sole job of reporting one.
  - Behavior added after revision 1 is a new optional method, a new optional
    prop, or a new value in a closed set, and it is a named feature,
    `<Contract>.<feature>`. The binary reports the features it has through
    the platform info module (`spec:AST-130`), on both platforms with the
    same name, with `isSupported` false and a note on a platform that lacks
    one.
  - JavaScript checks a feature before it uses the behavior, and never sends
    a value the binary does not report. On a binary without the feature,
    JavaScript keeps the revision-1 behavior, draws its fallback, or answers
    `unsupported`, so an older binary is never silently wrong. A binary that
    receives a value it does not know answers `unsupported` or
    `unsupported-option`; it never crashes.
  - No published interface changes: a shipped method's name, arguments, and
    result, and a shipped prop's name, type, and meaning, stay as they are.
    A shipped member stays in the native interface; JavaScript may stop
    calling it.
  - The package records the interface of every contract that each release
    carries. A check compares each codegen spec with that record and fails
    on a changed or removed member, a new required member, a new member
    without a named feature, or a missing header.

  FR5 gap: modules report a behavior revision number
  (`getConstants().version`) instead of named features, several contracts
  report revisions above 1, and some report different revisions on iOS and
  Android.

- **FR6 — UI on the UI thread, motion without JavaScript per frame, long work
  off the main thread.**
  - Creating, changing, laying out, and removing a native view, and presenting
    or dismissing system UI, run on the platform's main thread on iOS and its
    UI thread on Android.
  - The library's motion runs on the UI thread: through the native driver of
    React Native's `Animated`, or inside a native host that drives the motion
    itself, such as a spring, a drag with snap points, or a navigation
    transition. No transition or gesture runs JavaScript on each frame, and a
    busy JavaScript thread drops no frame of one.
  - Work that can take long, such as file, storage, and network work,
    decoding, rendering a page, and cryptography, runs off the main thread.
    A method that runs on the main thread never waits on that work, on a lock
    that work holds, or on the JavaScript thread.
  - A synchronous method is a cheap read of data the binary already holds,
    such as a probe or a constant. It never does file or network work.
  - Results and events reach JavaScript on the JavaScript side, through the
    binding. Native code never runs JavaScript on the main thread or on a
    background thread.

- **FR7 — Each contract has a conformance suite that every implementation
  passes.**
  - Each contract has one shared conformance suite, written against the
    contract: its methods, props, events, results, reasons, and named
    features. The same suite runs on iOS and on Android, and against the
    contract's JavaScript double in the package's `./testing` entry
    (`spec:AST-112/FR5`). Astryx Stage runs it too (`spec:AST-112/FR12`).
  - The JavaScript double answers in the contract's absent, older, and
    current shapes, and passes the same suite as the native code, so a unit
    test that uses it matches a device.
  - A change to a contract's native behavior comes with the conformance cases
    that prove it in the same change. A new named feature adds cases for a
    binary with it and a binary without it.
  - A native claim meets the real-device bar of `spec:AST-112/FR15`; a passing
    build is not evidence of behavior.
  - The library's behavior suite checks what the screen shows at every frame
    of a gesture or a transition, not only once motion settles, through the
    frame recorder below. The recorder is a test tool: a shipped app does not
    contain it (DEC-7).
    - `AstryxFrameRecorder` is a test-only native module with
      `getConstants` (`isRecordingAvailable`), `start`, and `stop`, on iOS.
      Only Debug builds contain it; a Release binary has no such module, and
      its handle is `null` there. Tests reach it only through `./testing`
      (`recordFrames` and `isFrameRecorderAvailable`), never through `.`.
      Its own reasons are `unavailable` (the binary cannot record), `busy`,
      and `not-recording`.
    - `recordFrames(ids, during, {settleMs?, timeoutMs?})` arms the recorder,
      awaits `during` (a pan, a snap, a push), records `settleMs` more
      (default 500 ms) for animations it started, and resolves the samples.
      `timeoutMs` (default 30 seconds) bounds `during`.
    - `recordFrames` is a test step, and the one call of the package that
      throws instead of resolving a result (FR3). Where it cannot record (no
      module, a Release binary, Android, a recorder already armed, a native
      refusal), it throws an `unsupported-step` error, so a check fails as a
      runner gap and never passes with nothing checked. When the step under
      test outlives its bound, or the native recording times out, it throws
      an error that names the step.
    - A sample has `t` (milliseconds since the recording started), `navBar`
      (the frontmost navigation bar's frame, or `null` when none shows), and
      `frames` (each requested `testID`'s frame, or `null` on a frame where no
      such view is on screen). A frame is `{x, y, width, height}` in window
      points, as the screen shows it: read from the presentation layers, so
      the system's own animations (a large title's collapse, a push) appear
      at each frame, not where they end.
    - It records once per displayed frame, at the display's full rate, from
      the key window, sampling on the main thread because the presentation
      layers live there, and only while it is armed. A requested `testID`
      that is not on screen does not slow the frames it records.
    - One recording runs at a time (`busy`). A recording stops itself after
      60 seconds, so a test that never stops cannot keep recording until the
      next reload. `stop` then answers `ok` with the samples it took and
      `isTimedOut: true`, and `recordFrames` throws an error that names the
      step.
    - The samples stay on the device and in memory until `stop` returns
      them: no network request and no hand-off to another process.
    - It finds views by their `testID` (the accessibility identifier on iOS)
      and changes nothing that assistive technology reads.
    - `isFrameRecorderAvailable()` says whether this binary can record; it
      reads the constants and never throws, answering `false` where the
      module or the constant is absent.

  FR7 gap: a frame recording that stopped itself answers `stop` with the
  reason `timed-out`, not `ok` with `isTimedOut: true`.

- **FR8 — The contracts do not depend on the binding.**
  - Engine-specific: the binding layer. That is the codegen specs, the
    registration through autolinking and React Native's code generation, the
    lookup of FR2, and the binding's own delivery of calls, events, and
    threads.
  - Engine-neutral: each contract's name, kind, platforms, members, value
    types, results and reasons, and named features; the result vocabulary
    (FR3); the values that cross (FR4); the evolution rules (FR5); the
    threading outcomes (FR6); and the conformance suites (FR7).
  - Each contract has a description in an engine-neutral form, and its codegen
    spec matches it. A check fails when they differ. Another host, such as
    Astryx Stage, implements a contract from the same description and passes
    the same suite.
  - No contract name, member, reason, or app-facing type names a
    binding-layer concept.

- **FR9 — Astryx's native code coexists with the native code an app adds.**
  - The platform takes no third-party native dependency
    (`spec:AST-112/FR2`), and an app may add react-native-gesture-handler,
    Reanimated, react-native-screens, react-native-safe-area-context, or
    another library with native code beside it without conflict.
  - Every class, type, C symbol, and category or extension method that
    Astryx's native code adds to the Objective-C runtime carries the `Astryx`
    prefix. Android code lives in the package's own namespace, and its
    resources carry an `astryx` prefix.
  - Astryx's native code replaces no method of a system class, a React
    Native class, or another library's class: no method swizzling, no method
    exchange, and no subclass installed in place of a shared class.
  - It takes no app-wide singleton. It never replaces the application's
    delegate, a window's root, or the delegate or data source of an object it
    does not own, and it sets no app-wide appearance proxy. An app-wide
    setting that a piece must change, such as the audio session's category,
    changes only while that piece is active, and the piece's group record
    names it.
  - It observes system notifications without consuming them, and its
    gesture recognizers join each platform's arbitration
    (`spec:AST-112/FR18`) instead of taking touches outside Astryx's views.
  - Native code calls public platform API only (`spec:AST-112/DEC-15`). Where
    a group record names an exception, the binary reports a self-check for it
    through the platform info module, and the piece falls back to its public
    path when the check fails.

### Platform support

- Supported feature/engine floor: the floor of `spec:AST-112`: iOS at React
  Native's own minimum and Android API level 24, on React Native's New
  Architecture only.
- Unsupported behavior: a piece a binary lacks answers `not-linked`,
  `no-module`, or `unsupported` (FR2, FR3, FR5); a view a binary lacks reports
  itself unavailable and the library draws its fallback.
- Browser evidence: none. Native claims are proven on the Simulator, the
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- `spec:AST-112` keeps the engine-neutral foundation and points to this record
  for the result vocabulary, the additive evolution of native interfaces, the
  registration of the core and each capability, how native modules and views
  reach JavaScript, the native-layer conformance tests, and the split between
  engine-specific and engine-neutral code.
- Every platform group record listed above follows this record and adds only
  its own pieces.
- The package's contributor documentation for native code states these rules.

## Verification

| Contract | Verification                                                                                                                                                           | Representative states                                                                                                                                                                                       | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Spec rules check over every codegen spec; package-boundary check of handle reads                                                                                       | a module; a view; a platform-only member; a name React Native uses; a Debug and a Release module table                                                                                                      | A name without the prefix, one name of two kinds, a missing header, an unmarked platform-only member, a handle read outside its wrapper, or a frame recorder in a Release binary                                                                                                                                                                                                                                                                                                  |
| FR2      | Unit tests through `./testing` doubles of an absent module; an app that does not opt a capability in                                                                   | every entry imported with no native side; an opted-out capability; a missing view                                                                                                                           | An import that throws, a call that answers a reason other than `not-linked` or `no-module`, or a missing view that mounts                                                                                                                                                                                                                                                                                                                                                         |
| FR3      | Unit tests of every asynchronous call through `./testing` doubles; native tests that throw inside a method                                                             | absent, older, and current module; a missing option; a native throw; a cancel; an unmount; a time bound                                                                                                     | A call rejects, resolves twice, answers a reason outside its set, a native throw crosses the binding, or a `message` carries a query, cookie, key, or token                                                                                                                                                                                                                                                                                                                       |
| FR4      | Spec rules check of value types; conformance cases of ids and subscriptions                                                                                            | a byte result; a released id; an unknown id; a removed subscription                                                                                                                                         | A non-plain value in a spec, bytes in an array, a crash on an unknown id, or an event after removal                                                                                                                                                                                                                                                                                                                                                                               |
| FR5      | The interface check against the recorded release interfaces; unit tests of each named feature with an older double                                                     | a new method; a new prop; a new union value; a binary without a feature                                                                                                                                     | A changed or removed shipped member, a new member without a named feature, a revision counter, or JavaScript that uses a feature or value the binary does not report                                                                                                                                                                                                                                                                                                              |
| FR6      | Gesture and transition runs on the Simulator, the emulator, and devices with a busy JavaScript thread; main-thread checker runs                                        | a drag; a sheet; a navigation transition; a file read from the main thread                                                                                                                                  | A dropped frame while JavaScript is busy, JavaScript per frame, a view change off the main thread, or main-thread file or network work                                                                                                                                                                                                                                                                                                                                            |
| FR7      | The conformance suites on iOS, Android, Astryx Stage, and the JavaScript double; the frame recorder's behavior cases on the Simulator and unit tests of `recordFrames` | each contract; a binary with and without each feature; a push; a large title's collapse; a missing `testID`; a second `start`; a step that never settles; a Release binary; VoiceOver on during a recording | An implementation that fails its suite, a double that passes a case the device fails, a native behavior change without cases, a sample at a resting position during an animation, a missing `testID` that slows the recorded frames, two recordings at once, a recording past 60 seconds, a self-stopped `stop` that is not `ok`, a recorder in a Release binary, a `recordFrames` that passes without recording, or a recording that changes an element's label, value, or order |
| FR8      | Check of each codegen spec against its engine-neutral description; source check of contract names and types                                                            | each contract                                                                                                                                                                                               | A spec that differs from its description, or a binding-layer name in a contract or an app-facing type                                                                                                                                                                                                                                                                                                                                                                             |
| FR9      | Symbol and runtime checks of the built binaries; the compatibility apps of `spec:AST-112/FR2` on iOS and Android                                                       | a binary with each listed library beside Astryx; an exception's self-check that fails                                                                                                                       | An unprefixed symbol, a swizzled or exchanged method, a replaced delegate or appearance proxy, a conflict with a listed library, or a failed self-check without the public fallback                                                                                                                                                                                                                                                                                               |

## Decision log

### DEC-1 — Platform code has its own record

**Reference:** `spec:AST-140/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The foundation record describes what an app gets in terms that hold for any
JavaScript engine React Native hosts. The rules for the native code itself
depend on the binding and apply to every platform group, so one record owns
them and every group record follows it.

Rejected: the rules inside `spec:AST-112`, because they tie the neutral
foundation record to one binding.

### DEC-2 — Failures are data at the binding too

**Reference:** `spec:AST-140/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A native method resolves one result object, so a failure keeps its typed
reason from the native side to the caller, and no unhandled rejection or
native exception ends a call.

Rejected: native methods that reject and wrappers that map rejections, because
a rejection's reason is untyped and a missed one is lost.

### DEC-3 — Native interfaces only grow

**Reference:** `spec:AST-140/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A binary and the JavaScript that runs on it do not always come from the same
release: a host that runs other projects, Astryx Stage, and an app that
updates its JavaScript apart from its binary all pair newer JavaScript with an
older binary. An interface that only grows, with each addition a named
feature, keeps every pairing working or failing loudly. Why the features carry
names and no counter is `spec:AST-112/DEC-14`.

Rejected: breaking changes behind a major version of the interface, because
an older binary in the field cannot be upgraded with the JavaScript.

### DEC-4 — Motion runs on the UI thread

**Reference:** `spec:AST-140/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A gesture or a transition that waits on JavaScript stutters whenever the
JavaScript thread is busy, which is when an app renders. Running motion on the
UI thread keeps it at the display's rate.

### DEC-5 — Conventions while canary-only

**Reference:** `spec:AST-140/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Apps reach the platform only through its JavaScript API, so while the package
is canary-only its native interfaces serve the package itself, and these rules
are the platform's conventions. The promise made to apps and other hosts about
those interfaces is set when the package leaves the canary channel.

### DEC-6 — Coexistence by prefix and by restraint

**Reference:** `spec:AST-140/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An app adds other native libraries beside Astryx, and they share one process,
one Objective-C runtime, and one set of app-wide objects. Prefixed names and
no replaced methods or singletons keep Astryx's code from colliding with them
or changing their behavior.

Rejected: swizzling a system or React Native class to get app-wide behavior,
because it changes every other library's behavior and breaks when another
library does the same.

### DEC-7 — The frame recorder is a Debug-only test tool

**Reference:** `spec:AST-140/DEC-7`
**Decider:** imdreamrunner, 2026-11-17

Checks that must hold at every frame need per-frame positions, but a shipped
app has no use for them. Only Debug builds contain the module, tests reach it
through `./testing`, and a test that cannot record fails instead of passing.

Rejected: the recorder in Release binaries, because every shipped app would
carry a per-frame reader of its view tree.

## Open questions

- **OQ1 — Does the package publish each contract's engine-neutral
  description?** (`human-api`) Options:
  - **Published.** The descriptions ship in the package as data, so another
    host reads the contracts it must implement; their format then becomes part
    of the package's surface.
  - **Internal.** The descriptions stay in the repository as the source of the
    checks of FR5 and FR8, and Astryx Stage reads them from there.
- **OQ2 — Is a reached time bound a common reason?** (`human-api`) Options:
  - **A common `timeout` reason.** Every capability answers the same reason,
    and a caller handles it once.
  - **A reason per capability.** Each capability names its own, such as
    `scan-timeout`, and the common set stays as it is.
- **OQ3 — Does Android record frames for the behavior suite?** (`checkable`)
  Options: iOS only, as FR7 states, with `recordFrames` throwing
  `unsupported-step` on Android; or a frame-callback recorder on Android with
  the same samples.
