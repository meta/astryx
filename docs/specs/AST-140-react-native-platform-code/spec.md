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
reached from JavaScript, what a result looks like at the boundary, what values
cross it, how a native interface grows by named features, which thread each
kind of work runs on, which tests prove a contract on each platform, which
parts are engine-specific and which are engine-neutral, how engines bind native
code through its seam, and how Astryx's native code sits beside the native code
of other libraries in the same app.

A contributor who writes a native piece for any group of the platform
(`spec:AST-112/FR7`) follows these rules, and a reviewer checks a native change
against them. An app reaches the platform through its JavaScript API
(`spec:AST-112/FR5`).

While the package is on the canary channel (`spec:AST-112/FR14`), the rules
here are the platform's conventions for its native layer. The public promise
for these interfaces is set when the package leaves the canary channel
(`spec:AST-082/FR15`).

## Why this exists

`spec:AST-112` describes the React Native foundation in terms that hold for any
JavaScript engine React Native hosts. The platform's native code follows more
specific rules: the binding to React Native, the shape of every message across
it, threads, tests, and the native seam. Every platform group record follows
the same rules, so they live once, here.

## Related records

- Each native piece's methods, props, events, and reasons: its group record
  (below).
- The JavaScript API an app calls, its entries, and its capability shape:
  `spec:AST-112/FR5` and `spec:AST-112/FR7`.
- Which capabilities link by default and which an app opts in, and how
  linking relates to the app's build settings: `spec:AST-112/FR3`.
- Packages outside the core that carry native code, their roles, the host
  interface, and the version pin: `spec:AST-112/FR4`.

## Platform group records

Each group record specifies its own native pieces and follows this record for
the rules above. `spec:AST-112/FR3` says which pieces link in every app and
which an app opts in, and `spec:AST-112/FR7` lists the groups.

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

- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — One native module or native view per contract, registered through
  the binding layer.**
  - A contract is one native module (an API JavaScript calls) or one native
    view (a UI element JavaScript renders, with props down and events up). A
    contract has one name and one kind on both platforms.
  - The binding layer is React Native's New Architecture. Each native module
    is a TurboModule and each native view a Fabric component, declared in a
    typed codegen spec inside the platform layer, and the core and each
    opted-in capability register through autolinking (`spec:AST-112/FR3`).
    An app's native build finds the platform's native code and generates its
    interfaces through autolinking, so an app links Astryx with its generated
    or own projects as they are (`spec:AST-112/FR4`).
  - A contract's name is `Astryx` followed by a PascalCase noun, such as
    `AstryxHaptics` or `AstryxGlassView`. Each name is unique and distinct
    from the names React Native and the platform SDKs use.
  - A member that exists on one platform names that platform in its name or
    its tag.
  - The library layer and apps reach a contract through the platform's
    JavaScript API (`spec:AST-112/FR5`), whose types are plain JavaScript
    types and the platform's own API types (`spec:AST-112/FR7`).

- **FR2 — A missing native piece answers with a result.**
  - Every entry of the package imports cleanly, whether the binary links a
    piece or not: the platform looks a module up in a way that answers its
    absence.
  - A call on a module the binary does not carry resolves `not-linked` when
    the app did not opt its capability in, and `no-module` otherwise
    (`spec:AST-112/FR3`).
  - A view the binary does not carry reports itself unavailable through its
    `is<View>Available()` probe, and the library draws its fallback in its
    place.
  - A probe answers from data the binary reports once, at start: the
    capabilities it links and the named features it has (FR5).

- **FR3 — Results come back as values: ok, a typed failure, or cancelled.**
  - Every asynchronous call in the platform resolves `AstryxResult<T, R>`:
    `{ok: true, …}` with its data, or `{ok: false, reason, message?}`. The
    test step `recordFrames` of `./testing` reports a failure by throwing
    (FR7).
  - `reason` comes from a closed set per capability plus the common reasons
    `no-module`, `not-linked`, `unsupported`, `cancelled`, and `error`.
    `no-module` means the platform's native side is absent; `not-linked`
    means the app did not opt the capability's native code in
    (`spec:AST-112/FR3`); `unsupported` means the binary predates the method,
    one of its options, or a value it was sent (FR5). A capability adds
    reasons of its own where it needs them, such as `unsupported-option` where
    a platform cannot honor an option.
  - `cancelled` means the person declined or dismissed something, or the
    caller went away. A caller treats it as a normal outcome and shows no
    error.
  - `message` is platform text for logs. It carries a description of the
    failure, free of URL queries, cookies, keys, and tokens.
  - At the binding, a native method takes one request object, followed by one
    `ArrayBuffer` argument when it receives bytes (FR4), and resolves one
    result object with `status` (`ok`, `cancelled`, or `error`), `reason`, and
    `message`. A domain outcome, such as "not found", is a field of an `ok`
    result. The platform maps that object onto `AstryxResult`. Every host of
    the contracts implements its methods in this shape (FR8), so the same
    JavaScript runs on each.
  - Native code reports every failure as a result object: a native exception,
    a failed system call, or a missing system service inside a method
    resolves `error` with a reason, and the platform turns any rejection or
    throw that reaches it into `error`.
  - A call resolves exactly once. When its caller goes away (an unmounted
    view, a hook's cancel), the call resolves `cancelled`, the native side
    stops that work, and the platform drops a late native reply.
  - A call that waits on the system has a time bound, and when the bound
    passes it resolves a failure whose reason says so (OQ2). A call that waits
    on the person, such as a picker or a sign-in sheet, resolves when the
    person finishes or dismisses it.

- **FR4 — Plain values cross the boundary.**
  - A request, a result, a prop, and an event carry the values codegen types:
    strings, numbers, booleans, arrays, and plain objects of those, with
    closed sets as string unions, and the `ArrayBuffer` argument below.
  - Bytes that JavaScript already holds cross to native as an `ArrayBuffer`,
    the method's own argument after its request object (FR3), such as bytes
    an app hands over for analysis.
  - Bytes that native code produces cross as a `file:` URI to a file in the
    core's cache, which stays there until the system reclaims the cache
    (`spec:AST-130/FR14`). A short, fixed-size value, such as a block of
    random bytes, crosses as a base64 string.
  - Bytes of any size cross in both directions: native code reads an
    `ArrayBuffer` in place and writes what it produces to the file.
  - A native object that outlives one call, such as a web session or a
    recorder, lives on the native side, and JavaScript names it with an
    opaque string id. The id is valid in the runtime that created it until it
    is released. A call with an unknown or released id resolves a failure.
  - An event carries one object. A subscription returns a function that
    removes it, and events stop after removal or when the view unmounts.

- **FR5 — Contracts grow by named features.**
  - Each contract starts from its baseline: its shape in the first release
    that carries it after the package leaves the canary channel, release
    candidates included (`spec:AST-112/DEC-14`). While the package is on the
    canary channel, each canary may reshape a contract (`spec:AST-112/FR14`).
  - Every behavior added after the baseline is a new optional method, a new
    optional prop, or a new value in a closed set, and it is a named feature,
    `<Contract>.<feature>`. Each contract's named features live in one list,
    the contract's own; the binary's report, the typed names below, and the
    documentation all come from it.
  - The binary reports the features it has through the platform info module
    (`spec:AST-130`), on both platforms with the same name, with
    `isSupported` false and a note on a platform that lacks one.
  - The package's public API reads the features a binary implements:
    `contractFeatures(contract)` answers the sorted list of the contract's
    named features that the binary implements, or `null` when the binary does
    not carry the contract. Feature names are of a generated, typed
    `ContractFeature` union, so type checking catches an unknown or misspelt
    feature. `contractFeatures` is the package-wide read; each capability's
    `supports(feature)` (`spec:AST-112/FR7`) is the per-capability check, and
    both read the same feature list.
  - JavaScript checks a feature through that read before it uses the
    behavior, and sends the values the binary reports. On a binary without
    the feature, JavaScript keeps the baseline behavior, draws its fallback,
    or answers `unsupported`, so an older binary always answers correctly or
    loudly. A binary that receives a value it does not know answers
    `unsupported` or `unsupported-option`.
  - Every change to a contract's spec states either the named features it
    adds or that it keeps behavior as it is.
  - A shipped method keeps its name, arguments, and result, and a shipped
    prop keeps its name, type, and meaning. Shipped members stay in the
    native interface.
  - A binary of any earlier release and the JavaScript of a later release
    work together: every behavior the JavaScript uses on that binary is
    either in the contract's baseline or a feature the binary reports. An app
    whose JavaScript updates apart from its native binary relies on that
    pairing (DEC-3).

  FR5 gap: modules report their growth as a behavior revision number
  (`getConstants().version`) rather than as named features, several
  contracts report revisions above 1, and some report different revisions on
  iOS and Android.

- **FR6 — UI work and motion run on the UI thread; long work runs in the
  background.**
  - Creating, changing, laying out, and removing a native view, and presenting
    or dismissing system UI, run on the platform's main thread on iOS and its
    UI thread on Android.
  - The library's motion runs on the UI thread: through the native driver of
    React Native's `Animated`, or inside a native host that drives the motion
    itself, such as a spring, a drag with snap points, or a navigation
    transition. Each transition and gesture runs frame by frame on the UI
    thread, so it keeps the display's rate while the JavaScript thread is
    busy.
  - Work that can take long, such as file, storage, and network work,
    decoding, rendering a page, and cryptography, runs on background threads.
    A method that runs on the main thread hands that work to them and returns
    promptly.
  - A synchronous method is a cheap read of data the binary already holds,
    such as a probe or a constant.
  - Results and events reach JavaScript on the JavaScript thread, through the
    binding.

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
    that prove it, in the same change. A new named feature adds cases for a
    binary with it and a binary without it.
  - A native claim meets the real-device bar of `spec:AST-112/FR15`.
  - The library's behavior suite checks what the screen shows at every frame
    of a gesture or a transition, through the frame recorder below. The
    recorder is a test tool in Debug builds on iOS (DEC-7, OQ3).
    - Tests reach the recorder through `./testing` (`recordFrames` and
      `isFrameRecorderAvailable`).
    - `recordFrames(ids, during, {settleMs?, timeoutMs?})` arms the recorder,
      awaits `during` (a pan, a snap, a push), records `settleMs` more
      (default 500 ms) for animations it started, and resolves the samples.
      `timeoutMs` (default 30 seconds) bounds `during`.
    - `recordFrames` is a test step and throws on failure (FR3). Where it
      cannot record (a binary without the recorder, a Release binary,
      Android, a recording already running, a native refusal), it throws an
      `unsupported-step` error, so the check fails as a runner gap. When the
      step under test outlives its bound, or the recording stops itself, it
      throws an error that names the step.
    - A sample has `t` (milliseconds since the recording started), `navBar`
      (the frontmost navigation bar's frame, or `null` when none shows), and
      `frames` (each requested `testID`'s frame, or `null` on a frame where
      that view is off screen). A frame is `{x, y, width, height}` in window
      points, where the screen shows it on that frame, so the system's own
      animations (a large title's collapse, a push) appear at each frame.
    - It records once per displayed frame, at the display's full rate, while
      it is armed, whichever `testID`s a test requests.
    - One recording runs at a time. A recording stops itself after 60
      seconds, so a test that forgets to stop ends its recording by itself.
    - The samples stay on the device, in memory, until the recording returns
      them.
    - It finds views by their `testID` (the accessibility identifier on iOS)
      and leaves what assistive technology reads as it is.
    - `isFrameRecorderAvailable()` answers synchronously whether this binary
      can record, and answers `false` where the recorder is absent.

- **FR8 — The contracts are engine-neutral; the binding is engine-specific.**
  - Engine-specific: the binding layer. That is the codegen specs, the
    registration through autolinking and React Native's code generation, the
    module lookup of FR2, the Fabric components, view managers, and Turbo
    Native Modules that forward to the native seam (FR11), and the binding's
    own delivery of calls, events, and threads (`spec:AST-112/FR22`).
  - Engine-neutral: each contract's name, kind, platforms, members, value
    types, results and reasons, and named features; the result vocabulary
    (FR3); the values that cross (FR4); the growth by named features (FR5);
    the threading outcomes (FR6); the conformance suites (FR7); and the native
    seam (FR11).
  - Each contract has a description in an engine-neutral form: its owner,
    platforms, first version, stability, members (with each platform-only
    member under its platform), and named features. Its codegen spec matches
    it, and a check confirms they agree. Another host of the contracts
    implements each contract from that description and runs the same suite.
  - Contract names, members, reasons, and app-facing types use platform and
    Astryx vocabulary.

- **FR9 — Astryx's native code sits beside the native code an app adds.**
  - The platform carries all the native code it needs (`spec:AST-112/FR2`),
    and an app adds react-native-gesture-handler, Reanimated,
    react-native-screens, react-native-safe-area-context, or another library
    with native code beside it without conflict.
  - Every class, type, C symbol, and category or extension method that
    Astryx's native code adds to the Objective-C runtime carries the `Astryx`
    prefix. Android code lives in the package's own namespace, and its
    resources carry an `astryx` prefix.
  - Astryx's native code works through objects it owns: its own views,
    controllers, delegates, and subclasses. The methods of system classes,
    React Native's classes, and other libraries' classes stay as they are, and
    the application's delegate, each window's root, other objects' delegates
    and data sources, and app-wide appearance proxies stay the app's.
  - An app-wide setting that a piece changes, such as the audio session's
    category, holds while that piece is active, and the piece's group record
    names it.
  - It observes system notifications and passes them on, and its gesture
    recognizers join each platform's arbitration (`spec:AST-112/FR18`) within
    Astryx's views.
  - Native code calls public platform API (`spec:AST-112/DEC-15`). Where a
    group record names an exception, the binary reports a self-check for it
    through the platform info module, and the piece takes its public path
    when the check fails.

- **FR11 — Native seam.** Astryx's native views and modules are exposed
  through a seam generated from the contracts; React Native's glue and other
  engines bind through it.
  - Each native view and module has one typed, engine-neutral interface, its
    native seam, so the same Swift, Objective-C, or Kotlin class is reachable
    from React Native's Fabric and Turbo Native Modules today, and another
    engine can bind the same members. A native class adopts its seam, and the
    seam carries its own typed values (DEC-8).
  - The seam is a published protocol for engine bindings: React Native's
    binding in the package and any other engine's binding call these exact
    members; apps use the JavaScript API (FR1).
  - An engine binding is compiled against the generated members and names, so
    a seam of a different shape breaks it. That is why this record fixes the
    seam's shape below, and why an equivalent interface cannot stand in for
    it.
  - The native seam is how an engine reaches a native view or module; the
    host seam is how a host shell forwards app lifecycle into the package
    (`spec:AST-112/FR4`).
  - The seam is generated from the same specs as the contracts (FR1), one per
    native view or module. A spec change regenerates the seam in the same
    change, and the package's check of generated files keeps it current.
  - A native view `<Name>` has two interfaces:
    - `<Name>Host`: one typed settable property per prop, in spec order; one
      method per command, with typed arguments; `eventSink`, the object the
      view sends its events to, which the engine sets before the first prop
      and which is weak on iOS; and `didUpdateProps`, called once after a
      batch of changed props so that props that go together apply once
      (optional on iOS, a no-op default on Android).
    - `<Name>Events`: one method per event, whose typed arguments are the
      payload's fields; an event without a payload has no arguments. The
      engine implements it.
  - A native module `<Name>` has `<Name>Module`: one typed method per spec
    method. An asynchronous method takes a typed resolve and a reject (a
    stable code and a message), and settles exactly once. A reject's code is
    one of the method's reasons (FR3), and the binding turns the reject into
    FR3's result object with that code as its reason, so JavaScript always
    receives a result value (DEC-2). An optional
    spec method is an optional member on iOS and, on Android, resolves `error`
    with reason `unsupported` by default. A module that emits events has `eventSink` and
    `<Name>ModuleEvents`. The constants method is `constants`.
  - The engine sets the props that changed, in spec order, and then calls
    `didUpdateProps`.
  - Spec types map onto the seam as the table below shows.

    | Spec type                 | iOS (Objective-C → Swift)                                            | Android (Kotlin)                                               |
    | ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
    | boolean                   | `BOOL` → `Bool`                                                      | `Boolean`                                                      |
    | `Int32`                   | `int32_t` → `Int32`                                                  | `Int`                                                          |
    | `Double`, `Float`, number | `double` → `Double`                                                  | `Double`                                                       |
    | string                    | `NSString` → `String`                                                | `String`                                                       |
    | color                     | `uint32` `0xRRGGBBAA`; optional as a `{present, rgba}` struct        | `Int` `0xRRGGBBAA`; optional as `Int?`                         |
    | string union              | `NS_ENUM` in spec order, with conversion to and from its wire string | `enum class` with its wire string                              |
    | object or named type      | immutable value class                                                | `data class`                                                   |
    | array                     | typed `NSArray`, scalars boxed                                       | `List<T>`                                                      |
    | untyped object            | `NSDictionary<NSString*, id>`                                        | `Map<String, Any?>`                                            |
    | `Promise<T>`              | `resolve(T)` and `reject(code, message)` blocks                      | a promise object with `resolve(T)` and `reject(code, message)` |
    | callback                  | block                                                                | function type                                                  |

  - On a view, an optional scalar, enum, or array without a default reads as
    React Native's code generation reads it (false, 0, the first case, empty),
    so it always has a value; an optional string, color, record, or untyped
    value is nullable. In a module's records every optional field is nullable
    (absent). Each member documents its spec default, and the engine applies
    it, so a host always receives a value.
  - A generated record carries the fields its spec declares, and each spec
    declares every field its native implementation sends.
  - Generated types carry a `Seam` infix (`<Name>Seam<Type>`), so they stay
    distinct from an engine's own generated names in the same compilation
    unit. A member whose name the adopting platform class already has
    (`UIView` and `NSObject` members; Android `View` accessors such as
    `enabled`, `layoutDirection`, `text`, `id`, and `tag`), or that is a C,
    C++, or Objective-C word, is `<name>Prop` on both platforms; such a
    record field is `<name>Field`.
  - On iOS the seam is Objective-C protocols in plain Objective-C public
    headers, so Objective-C++ and Swift classes both adopt them in their own
    language. Inline C entry points per prop and command
    (`<Name>HostSet<Prop>(host, value)`, `<Name>Host<Command>(host, …)`) let a
    C caller reach a host directly.
  - On Android the seam is public Kotlin interfaces in one package, as on iOS,
    where the seam headers are public headers; an engine outside the platform
    module binds them. A class adopts its seam directly or through a host
    object it owns.
  - A class adopts its seam and keeps its behavior. For React Native, the
    Fabric component or view manager compares old and new props, writes the
    changed ones through the host, calls `didUpdateProps`, and sets
    `eventSink` to a forwarder to React Native's event emitter; a module's
    work lives in an object that adopts `<Name>Module`, and the Turbo Native
    Module forwards to it. Another engine binds the same members directly.

  FR11 gap: the seam carries colors as RGBA values. A color that follows the
  appearance by itself (`PlatformColor` and `DynamicColorIOS` on iOS, resource
  colors on Android) reaches a class through React Native's platform-color
  setters, beside the seam's color property (OQ4).

  FR11 gap: some native implementations send fields their spec does not
  declare, and those fields reach JavaScript outside the seam.

### Platform support

- Supported feature/engine floor: the floor of `spec:AST-112`: iOS at React
  Native's own minimum and Android API level 24, on React Native's New
  Architecture.
- Unsupported behavior: a piece a binary lacks answers `not-linked`,
  `no-module`, or `unsupported` (FR2, FR3, FR5); a view a binary lacks reports
  itself unavailable and the library draws its fallback.
- Browser evidence: native claims are proven on the Simulator, the emulator,
  and devices (`spec:AST-112/FR15`).

## Current-state impact

- `spec:AST-112` keeps the engine-neutral foundation and points to this record
  for the result vocabulary, the growth of native interfaces by named
  features, the registration of the core and each capability, how native
  modules and views reach JavaScript, the native-layer conformance tests, and
  the split between engine-specific and engine-neutral code.
- Every platform group record listed above follows this record and adds its
  own pieces.
- The package's contributor documentation for native code states these rules.

## Verification

| Contract | Verification                                                                                                                                                                                                                                                                                                                             | Representative states                                                                                                                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Spec rules check over every codegen spec; package-boundary check of the public types; a Debug and a Release iOS build's module tables                                                                                                                                                                                                    | a module; a view; a platform-only member; a name React Native uses; a Release binary                                                                                                                                                                       | A name without the prefix, one name of two kinds, an unmarked platform-only member, an app-facing type that carries a handle or a binding-layer type, a build that needs a manual native edit to link the platform, or a frame recorder in a Release binary                                                                                                                                                                                                                                                                                                    |
| FR2      | Unit tests through `./testing` doubles of an absent module; an app that does not opt a capability in                                                                                                                                                                                                                                     | every entry imported with no native side; an opted-out capability; a missing view                                                                                                                                                                          | An import that throws, a call that answers a reason other than `not-linked` or `no-module`, or a missing view that mounts                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR3      | Unit tests of every asynchronous call through `./testing` doubles; native tests that throw inside a method                                                                                                                                                                                                                               | absent, older, and current module; a missing option; a native throw; a cancel; an unmount that resolves `cancelled`; a time bound                                                                                                                          | A call rejects, resolves twice, answers a reason outside its set, a native throw crosses the binding, or a `message` carries a query, cookie, key, or token                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR4      | Spec rules check of value types; conformance cases of bytes, ids, and subscriptions                                                                                                                                                                                                                                                      | bytes sent from JavaScript as an `ArrayBuffer`; a byte result; a large byte value in each direction; a released id; an unknown id; a removed subscription                                                                                                  | A non-plain value in a spec, an `ArrayBuffer` anywhere but a method's own argument after its request object, bytes native code produces that cross other than as a file URI or a short base64 value, bytes refused or cut by size, a crash on an unknown id, or an event after removal                                                                                                                                                                                                                                                                         |
| FR5      | An interface check of each contract against the interface every earlier release carries; a check that every spec change states its added features or kept behavior; type checks of feature names; unit tests of `contractFeatures` and of each named feature with an older double; the current JavaScript on the oldest supported binary | a new method; a new prop; a new union value; a binary without a feature; a binary without the contract; a misspelt feature name; a canary build                                                                                                            | A changed or removed shipped member, a new member without a named feature, a second feature list, a feature name that type-checks without being in the list, a `contractFeatures` that is unsorted or not `null` for a missing contract, a spec change that states neither, JavaScript that uses a feature or value the binary does not report, or a crash on an older binary                                                                                                                                                                                  |
| FR6      | Gesture and transition runs on the Simulator, the emulator, and devices with a busy JavaScript thread; main-thread checker runs                                                                                                                                                                                                          | a drag; a sheet; a navigation transition; a file read from the main thread                                                                                                                                                                                 | A dropped frame while JavaScript is busy, JavaScript per frame, a view change off the main thread, or main-thread file or network work                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR7      | The conformance suites on iOS, Android, and the JavaScript double; the frame recorder's behavior cases on the Simulator and unit tests of `recordFrames`                                                                                                                                                                                 | each contract; a binary with and without each feature; a push; a large title's collapse; an off-screen `testID`; a second recording; a step that never settles; a Release binary; VoiceOver on during a recording                                          | An implementation that fails its suite, a double that passes a case the device fails, a native behavior change without cases, a sample at a resting position during an animation, an off-screen `testID` that slows the recorded frames, two recordings at once, a recording past 60 seconds, a recorder in a Release binary, a `recordFrames` that passes without recording, or a recording that changes an element's label, value, or order                                                                                                                  |
| FR8      | Check of each codegen spec against its engine-neutral description; source check of contract names and types                                                                                                                                                                                                                              | each contract                                                                                                                                                                                                                                              | A spec that differs from its description, a description without its owner, platforms, first version, stability, members, or named features, or a binding-layer name in a contract or an app-facing type                                                                                                                                                                                                                                                                                                                                                        |
| FR9      | Symbol and runtime checks of the built binaries; the compatibility apps of `spec:AST-112/FR2` on iOS and Android                                                                                                                                                                                                                         | a binary with each listed library beside Astryx; an exception's self-check that fails                                                                                                                                                                      | An unprefixed symbol, a swizzled or exchanged method, a replaced delegate or appearance proxy, a conflict with a listed library, or a failed self-check without the public path                                                                                                                                                                                                                                                                                                                                                                                |
| FR11     | The package's check of generated files; native builds on iOS and Android of every class against its seam; source check of each binding; unit tests of the generated type mapping; conformance suites run through the seam                                                                                                                | each native view and module; a spec change; a prop batch; an event with and without a payload; an optional value without a default; a member whose name a platform class already has; a C caller on iOS; a seam reject; a record with every declared field | A stale seam, a class that does not adopt its seam, a binding that reaches a class other than through its seam, an engine type, value box, or name lookup across it, a prop set out of spec order or unchanged, a missing `didUpdateProps` call, an event without its typed arguments, an optional view scalar that reads null, a generated name without the `Seam` infix, a colliding member name without `Prop` or `Field`, a seam reject that reaches JavaScript as a rejection, a record field its spec does not declare, or a behavior change on adoption |

## Decision log

### DEC-1 — Platform code has its own record

**Reference:** `spec:AST-140/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The foundation record describes what an app gets in terms that hold for any
JavaScript engine React Native hosts. The rules for the native code itself
follow the binding and apply to every platform group, so one record owns them
and every group record follows it.

### DEC-2 — Results are values at the binding too

**Reference:** `spec:AST-140/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A native method resolves one result object and never throws or rejects across
the binding, because a rejection's reason is untyped and a missed one is lost.
A failure keeps its typed reason from the native side to the caller, and a
caller handles every outcome with a type-checked branch.

### DEC-3 — Contracts grow by named features

**Reference:** `spec:AST-140/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

An app whose JavaScript updates apart from its native binary pairs newer
JavaScript with an older binary. A shipped
member keeps its shape, because an older binary in the field is not upgraded
with its JavaScript. Each addition is a named feature the binary reports, so
JavaScript asks for the behavior it is about to use and every pairing works or
answers loudly (`spec:AST-112/DEC-14`).

### DEC-4 — Motion runs on the UI thread

**Reference:** `spec:AST-140/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

The JavaScript thread is busiest when an app renders. Running motion on the UI
thread keeps gestures and transitions at the display's rate.

### DEC-5 — Conventions while on the canary channel

**Reference:** `spec:AST-140/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Apps reach the platform through its JavaScript API, so while the package is on
the canary channel its native interfaces serve the package itself, and these
rules are the platform's conventions. The promise to apps and other hosts
about those interfaces is set when the package leaves the canary channel.

### DEC-6 — Astryx's native code works through its own prefixed objects

**Reference:** `spec:AST-140/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An app adds other native libraries beside Astryx, and they share one process,
one Objective-C runtime, and one set of app-wide objects. Astryx's native code
therefore swizzles or replaces no method of a class it does not own and takes
no app-wide singleton, because either changes every other library's behavior
and breaks when another library does the same. Prefixed names and objects of
Astryx's own keep each library's behavior its own.

### DEC-7 — The frame recorder is a Debug test tool

**Reference:** `spec:AST-140/DEC-7`
**Decider:** imdreamrunner, 2026-11-17

Checks that hold at every frame need per-frame positions. The recorder lives in
Debug builds only, because every shipped app would otherwise carry a per-frame
reader of its view tree. Tests reach it through `./testing`, and a test that
cannot record fails, so every frame check that passes has recorded frames
behind it.

### DEC-8 — Engines bind through the published seam

**Reference:** `spec:AST-140/DEC-8`
**Decider:** imdreamrunner, 2026-11-18

Engines bind Astryx's native views and modules through the published seam,
not through internal class names or selectors. A native view or module is
written once and reached by more than one engine, and a binding by class name
or selector ties a class's internals to one engine and breaks when the class
changes. The seam's typed, generated members let each engine bind the same
class, so the class keeps one implementation across engines.

## Open questions

- **OQ1 — Does the package publish each contract's engine-neutral
  description?** (`human-api`) Options:
  - **Published.** The descriptions ship in the package as data, so another
    host reads the contracts it implements; their format then becomes part of
    the package's surface.
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
- **OQ4 — How does the native seam carry a color that follows the
  appearance?** (`human-api`) Options:
  - **A color handle.** The seam's color value becomes a handle that carries a
    platform or dynamic color, and the React Native binding sets colors
    through the seam too.
  - **Resolved values.** The seam keeps RGBA values, and an engine that sends
    dynamic colors resolves them before it sets the prop.
