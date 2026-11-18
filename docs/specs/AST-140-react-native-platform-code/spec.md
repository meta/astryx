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
the rules above. Which pieces link in every app and which an app opts in is
`spec:AST-112/FR3`, and `spec:AST-112/FR7` lists the groups.

| Record         | Group                                             |
| -------------- | ------------------------------------------------- |
| `spec:AST-123` | Surfaces and glass                                |
| `spec:AST-124` | Gestures and drag                                 |
| `spec:AST-125` | Navigation hosts                                  |
| `spec:AST-126` | Native controls                                   |
| `spec:AST-127` | Icons and drawing                                 |
| `spec:AST-128` | Menus and presentation                            |
| `spec:AST-129` | Layout, text, and keyboard                        |
| `spec:AST-130` | System modules, the platform info module included |
| `spec:AST-131` | Web                                               |
| `spec:AST-132` | Media and camera                                  |
| `spec:AST-135` | Photos                                            |

## Non-goals

- The methods, props, events, and reasons of any one native piece. Its group
  record owns them.
- The JavaScript API an app calls, its entries, and its capability shape:
  `spec:AST-112/FR5` and `spec:AST-112/FR7`.
- Which capabilities link by default and which an app opts in:
  `spec:AST-112/FR3`.
- Astryx Stage's behavior. Astryx Stage conforms to these contracts
  (`spec:AST-139`).
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
    typed codegen spec inside the platform layer, and the core and each
    opted-in capability register through autolinking (`spec:AST-112/FR3`).
    An app's native build depends on this binding: autolinking is how the
    build finds the platform's native code and generates its interfaces, so
    an app links Astryx with no manual native edit (`spec:AST-112/FR4`).
  - A contract's name is `Astryx` followed by a PascalCase noun, such as
    `AstryxHaptics` or `AstryxGlassView`. No two contracts share a name, and
    no contract takes a name that React Native or a platform SDK uses.
  - A member that exists on one platform only says so in its name or its
    tag.
  - The library layer and apps reach a contract only through the platform's
    JavaScript API (`spec:AST-112/FR5`). No app-facing type carries a module
    handle, a view's native component, or a binding-layer type
    (`spec:AST-112/FR7`).

- **FR2 — A missing native piece is a result, never a crash.**
  - Importing any entry of the package never throws, whether the binary
    links the piece or not: the platform looks a module up in a way that
    answers its absence instead of failing.
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
    or dismissed something, or the caller went away. A caller branches on it
    and shows no error.
  - `message` is platform text for logs. It never carries a URL's query, a
    cookie, a key, or a token.
  - At the binding, a native method takes one request object and resolves one
    result object with `status` (`ok`, `cancelled`, or `error`), `reason`, and
    `message`. A domain outcome, such as "not found", is a field of an `ok`
    result. The platform maps that object onto `AstryxResult`. Every host of
    the contracts implements its methods in this shape (FR8), so the same
    JavaScript runs on each.
  - Native code never throws or rejects across the binding. A native
    exception, a failed system call, or a missing system service inside a
    method resolves `error` with a reason; the platform also turns any
    rejection or throw that does reach it into `error`.
  - A call resolves exactly once. When its caller goes away (an unmounted
    view, a hook's cancel), the call resolves `cancelled`, the native side
    stops that work, and a late native reply is dropped.
  - A call that waits on the system for an unbounded time has a time bound,
    and when the bound passes it resolves a failure whose reason says so
    (OQ2). A call that waits on the person, such as a picker or a sign-in
    sheet, has no time bound: it resolves when the person finishes or
    dismisses it.

- **FR4 — Only plain values cross the boundary.**
  - A request, a result, a prop, and an event carry the values codegen types:
    strings, numbers, booleans, arrays, and plain objects of those, with
    closed sets as string unions, and in a request the `ArrayBuffer` below.
  - Bytes that JavaScript already holds may cross to native as an
    `ArrayBuffer` in a request, such as bytes an app hands over for analysis.
  - Bytes that native code produces cross as a `file:` URI to a file in the
    core's cache. A short, fixed-size value, such as a block of random bytes,
    may cross as a base64 string.
  - No size limit refuses or cuts bytes in either direction. A large value is
    handled by its shape: native code reads an `ArrayBuffer` in place and
    writes what it produces to the file.
  - No pointer, native object reference, or binding handle crosses. A native
    object that outlives one call, such as a web session or a recorder, lives
    on the native side, and JavaScript names it with an opaque string id.
    The id is valid only in the runtime that created it and only until it is
    released. A call with an unknown or released id resolves a failure; it
    never crashes.
  - An event carries one object. A subscription returns a function that
    removes it; after removal, or when the view unmounts, no further event
    arrives.

- **FR5 — Native interfaces only grow, by named features.**
  - A contract has no revision number. Its baseline is the shape the first
    release of the package that carries it has, a release candidate included
    (`spec:AST-112/FR14`); a canary build does not fix it. No contract
    carries a revision counter, and no module has the sole job of reporting
    one.
  - Every behavior added after the baseline is a new optional method, a new
    optional prop, or a new value in a closed set, and it is a named feature,
    `<Contract>.<feature>`. Each contract's named features live in one list,
    the contract's own; the binary's report, the typed names below, and the
    documentation all come from it.
  - The binary reports the features it has through the platform info module
    (`spec:AST-130`), on both platforms with the same name, with
    `isSupported` false and a note on a platform that lacks one.
  - JavaScript checks a feature by a typed name generated from that list, so
    an unknown or misspelt feature fails type checking. It checks a feature
    before it uses the behavior, and never sends a value the binary does not
    report. On a binary without the feature, JavaScript keeps the baseline
    behavior, draws its fallback, or answers `unsupported`, so an older
    binary is never silently wrong. A binary that receives a value it does
    not know answers `unsupported` or `unsupported-option`; it never crashes.
  - Every change to a contract's spec states either the named features it
    adds or that it changes no behavior.
  - No published interface changes: a shipped method's name, arguments, and
    result, and a shipped prop's name, type, and meaning, stay as they are.
    A shipped member stays in the native interface; JavaScript may stop
    calling it.
  - A binary of any earlier release and the JavaScript of a later release
    work together: every behavior the JavaScript uses on that binary is
    either in the contract's baseline or a feature the binary reports. A
    host that runs other projects and an app that updates its JavaScript
    apart from its binary both depend on that pairing (DEC-3).

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
    (`spec:AST-112/FR5`).
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
    - Tests reach the recorder only through `./testing`
      (`recordFrames` and `isFrameRecorderAvailable`), never through `.`.
      Only Debug builds on iOS contain it (OQ3); a Release binary does not.
    - `recordFrames(ids, during, {settleMs?, timeoutMs?})` arms the recorder,
      awaits `during` (a pan, a snap, a push), records `settleMs` more
      (default 500 ms) for animations it started, and resolves the samples.
      `timeoutMs` (default 30 seconds) bounds `during`.
    - `recordFrames` is a test step, and the one call of the package that
      throws instead of resolving a result (FR3). Where it cannot record (a
      binary without the recorder, a Release binary, Android, a recording
      already running, a native refusal), it throws an `unsupported-step`
      error, so a check fails as a runner gap and never passes with nothing
      checked. When the step under test outlives its bound, or the recording
      stops itself, it throws an error that names the step.
    - A sample has `t` (milliseconds since the recording started), `navBar`
      (the frontmost navigation bar's frame, or `null` when none shows), and
      `frames` (each requested `testID`'s frame, or `null` on a frame where no
      such view is on screen). A frame is `{x, y, width, height}` in window
      points, where the screen shows it on that frame, so the system's own
      animations (a large title's collapse, a push) appear at each frame, not
      where they end.
    - It records once per displayed frame, at the display's full rate, and
      only while it is armed. A requested `testID` that is not on screen does
      not slow the frames it records.
    - One recording runs at a time. A recording stops itself after 60
      seconds, so a test that never stops cannot keep recording until the
      next reload.
    - The samples stay on the device and in memory until the recording
      returns them: no network request and no hand-off to another process.
    - It finds views by their `testID` (the accessibility identifier on iOS)
      and changes nothing that assistive technology reads.
    - `isFrameRecorderAvailable()` says whether this binary can record. It
      never throws, and answers `false` where the recorder is absent.

- **FR8 — The contracts do not depend on the binding.**
  - Engine-specific: the binding layer. That is the codegen specs, the
    registration through autolinking and React Native's code generation, the
    module lookup of FR2, and the binding's own delivery of calls, events,
    and threads (`spec:AST-112/FR22`).
  - Engine-neutral: each contract's name, kind, platforms, members, value
    types, results and reasons, and named features; the result vocabulary
    (FR3); the values that cross (FR4); the evolution rules (FR5); the
    threading outcomes (FR6); and the conformance suites (FR7).
  - Each contract has a description in an engine-neutral form: its owner,
    platforms, first version, stability, members (with each platform-only
    member under its platform), and named features. Its codegen spec matches
    it, and a check fails when they differ. Any other host of the
    contracts depends on that description: it implements each contract from
    it and passes the same suite, which a codegen spec alone, tied to one
    binding, would not allow.
  - No contract name, member, reason, or app-facing type names a
    binding-layer concept.
  - The contracts a project needs form its contract manifest, which every
    host that runs the project reads. The manifest is forward compatible: it
    carries a top-level `requires` list, and a host that meets a requirement
    it does not know refuses the project and names the host version that
    knows it. The host checks this itself, not only the package's commands.
  - Listing what an app links (`spec:AST-112/FR3`) never changes the app's
    JavaScript engine or how React Native's core is built. Those are
    separate settings: a generated app states them, and an app that keeps
    its own native projects sets them itself, with no default chosen for it.

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

- **FR10 — Native code outside the package plugs in through a declared role.**
  - A package with native code that works with the platform declares one
    role: an extension, which adds native pieces under the rules of this
    record, or a host, which embeds the platform in an app's lifecycle or
    runs other projects, such as the Expo wrapper (`spec:AST-112/FR11`).
  - A host implements a named, versioned host interface, and the app's
    native build checks that implementation at compile time on iOS and on
    Android, so a host that does not match fails to build instead of failing
    at run time.
  - A host package depends on `@astryxdesign/react-native` at one exact
    version.
  - Native code goes in a separate package only for a different audience,
    for binaries with their own release cadence, or for a native dependency
    the core must not carry; otherwise it is part of the platform.

### Platform support

- Supported feature/engine floor: the floor of `spec:AST-112`: iOS at React
  Native's own minimum and Android API level 24, on React Native's New
  Architecture only.
- Unsupported behavior: a piece a binary lacks answers `not-linked`,
  `no-module`, or `unsupported` (FR2, FR3, FR5); a view a binary lacks reports
  itself unavailable and the library draws its fallback.
- Browser evidence: none. Native claims are proven on the Simulator, the
  emulator, and devices (`spec:AST-112/FR15`).

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

| Contract | Verification                                                                                                                                                                                                                                                                                                        | Representative states                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Spec rules check over every codegen spec; package-boundary check of the public types; a Debug and a Release iOS build's module tables                                                                                                                                                                               | a module; a view; a platform-only member; a name React Native uses; a Release binary                                                                                                                          | A name without the prefix, one name of two kinds, an unmarked platform-only member, an app-facing type that carries a handle or a binding-layer type, a build that needs a manual native edit to link the platform, or a frame recorder in a Release binary                                                                                                                                                                               |
| FR2      | Unit tests through `./testing` doubles of an absent module; an app that does not opt a capability in                                                                                                                                                                                                                | every entry imported with no native side; an opted-out capability; a missing view                                                                                                                             | An import that throws, a call that answers a reason other than `not-linked` or `no-module`, or a missing view that mounts                                                                                                                                                                                                                                                                                                                 |
| FR3      | Unit tests of every asynchronous call through `./testing` doubles; native tests that throw inside a method                                                                                                                                                                                                          | absent, older, and current module; a missing option; a native throw; a cancel; an unmount that resolves `cancelled`; a time bound                                                                             | A call rejects, resolves twice, answers a reason outside its set, a native throw crosses the binding, or a `message` carries a query, cookie, key, or token                                                                                                                                                                                                                                                                               |
| FR4      | Spec rules check of value types; conformance cases of bytes, ids, and subscriptions                                                                                                                                                                                                                                 | bytes sent from JavaScript as an `ArrayBuffer`; a byte result; a large byte value in each direction; a released id; an unknown id; a removed subscription                                                     | A non-plain value in a spec, an `ArrayBuffer` outside a request, bytes native code produces that cross other than as a file URI or a short base64 value, a size limit that refuses or cuts bytes, a crash on an unknown id, or an event after removal                                                                                                                                                                                     |
| FR5      | An interface check of each contract against the interface every earlier release carries; a check that every spec change states its added features or no behavior change; type checks of feature names; unit tests of each named feature with an older double; the current JavaScript on the oldest supported binary | a new method; a new prop; a new union value; a binary without a feature; a misspelt feature name; a canary build                                                                                              | A changed or removed shipped member, a new member without a named feature, a revision counter, a second feature list, a feature name that type-checks without being in the list, a spec change that states neither, JavaScript that uses a feature or value the binary does not report, or a crash on an older binary                                                                                                                     |
| FR6      | Gesture and transition runs on the Simulator, the emulator, and devices with a busy JavaScript thread; main-thread checker runs                                                                                                                                                                                     | a drag; a sheet; a navigation transition; a file read from the main thread                                                                                                                                    | A dropped frame while JavaScript is busy, JavaScript per frame, a view change off the main thread, or main-thread file or network work                                                                                                                                                                                                                                                                                                    |
| FR7      | The conformance suites on iOS, Android, and the JavaScript double; the frame recorder's behavior cases on the Simulator and unit tests of `recordFrames`                                                                                                                                                            | each contract; a binary with and without each feature; a push; a large title's collapse; a missing `testID`; a second recording; a step that never settles; a Release binary; VoiceOver on during a recording | An implementation that fails its suite, a double that passes a case the device fails, a native behavior change without cases, a sample at a resting position during an animation, a missing `testID` that slows the recorded frames, two recordings at once, a recording past 60 seconds, a recorder in a Release binary, a `recordFrames` that passes without recording, or a recording that changes an element's label, value, or order |
| FR8      | Check of each codegen spec against its engine-neutral description; source check of contract names and types; a host run of a manifest with an unknown requirement; builds of a generated app and of an app with its own projects with and without opt-in capabilities                                               | each contract; a manifest with a requirement the host does not know; a change to the linked capabilities                                                                                                      | A spec that differs from its description, a description without its owner, platforms, first version, stability, members, or named features, a binding-layer name in a contract or an app-facing type, a host that runs a manifest with an unknown requirement or refuses it without naming the version, or a change to the linked list that changes the JavaScript engine or how React Native's core is built                             |
| FR9      | Symbol and runtime checks of the built binaries; the compatibility apps of `spec:AST-112/FR2` on iOS and Android                                                                                                                                                                                                    | a binary with each listed library beside Astryx; an exception's self-check that fails                                                                                                                         | An unprefixed symbol, a swizzled or exchanged method, a replaced delegate or appearance proxy, a conflict with a listed library, or a failed self-check without the public fallback                                                                                                                                                                                                                                                       |
| FR10     | Builds of each host package on iOS and Android against its host interface; dependency check of host packages                                                                                                                                                                                                        | a host that matches its interface; a host that does not; a host package's dependency range                                                                                                                    | A mismatched host that builds, a package with native code that declares no role, or a host package that depends on a range instead of one exact version                                                                                                                                                                                                                                                                                   |

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
release: a host that runs other projects and an app that updates its
JavaScript apart from its binary both pair newer JavaScript with an older
binary. An interface that only grows, with each addition a named
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
    checks of FR5 and FR8.
- **OQ2 — Is a reached time bound a common reason?** (`human-api`) Options:
  - **A common `timeout` reason.** Every capability answers the same reason,
    and a caller handles it once.
  - **A reason per capability.** Each capability names its own, such as
    `scan-timeout`, and the common set stays as it is.
- **OQ3 — Does Android record frames for the behavior suite?** (`checkable`)
  Options: iOS only, as FR7 states, with `recordFrames` throwing
  `unsupported-step` on Android; or a frame-callback recorder on Android with
  the same samples.
