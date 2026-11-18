---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-133
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
system_specs: [spec:AST-140]
---

# React Native platform: Storage, identity and files system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app built with `@astryxdesign/react-native` keeps secrets, proves who it
is to its own servers, and works with files through three native modules with
no view: a secure store for short secrets such as session tokens, TLS client
identities whose private keys stay in the device's secure hardware, and a
file cache with downloads, saving and sharing.
A developer calls one typed object per module and handles every failure as
data. A person stays signed in across launches, sees Face ID or the passcode
only where the app protects a secret with it, reaches a work server that asks
for a device certificate without a certificate prompt, and saves or shares a
file through the system's own sheets.

This record details these three modules of the platform layer that
`spec:AST-112` defines. They are part of the optional add-on package, not the
core package: no Astryx component uses them, so an app links them only when
it adds that package. Every asynchronous call resolves the
result vocabulary of `spec:AST-140/FR3`, every module has the capability shape
of `spec:AST-112/FR7`, and every interface evolves additively under
`spec:AST-140/FR5`.

## Why this exists

The React Native ecosystem covers each of these needs with a library that
ships its own native code. An app that adds one is no longer a
JavaScript-only app: it needs its own native build for that library. That is
why Astryx ships these modules although no Astryx component uses them, in the
optional add-on package rather than the core package. Each stays a thin
wrapper with one result shape and no third-party native dependency, and an
app that prefers an ecosystem library can still use it beside these modules
(FR17).

- `AstryxSecureStorage`: the ecosystem's secure stores match it in capability,
  and their Android biometric gating goes further (OQ1). Astryx keeps it so a
  JavaScript-only app can keep secrets, out of backups by default (FR3).
- `AstryxClientIdentity`: a real gap. No widely used library keeps the key in
  secure hardware and presents the identity on React Native's own requests
  under a host binding and a redirect rule (FR4 to FR6).
- `AstryxFiles`: little capability gap, and less reach on purpose: a cache,
  downloads that keep credentials to their origin, one save and one share
  call, and a confined read of bundled files (FR8 to FR11). React Native's
  `Share` already shares a URL on iOS with no added native code (OQ2).

## Who uses it

| Native piece           | Kind                                | Astryx components that use it                                                                                                                                                                                                                                                                                     | What a person sees                                                                                                                                       |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSecureStorage`  | native module (Turbo Native Module) | No Astryx component. App API only, from the add-on package: an app that signs in keeps its tokens here.                                                                                                                                                                                                           | The app opens signed in after a relaunch; Face ID or the passcode appears before a secret the app protects with it.                                      |
| `AstryxClientIdentity` | native module (Turbo Native Module) | No Astryx component. App API only, from the add-on package: an app that enrols a device certificate. The platform's networking presents a bound identity on the app's `fetch`, `XMLHttpRequest`, `Image`, WebSocket, and `AstryxFiles` downloads; the `web` capability presents it in web views (`spec:AST-131`). | A work app reaches servers that require a device certificate with no certificate prompt; on Android, the system's certificate picker appears once.       |
| `AstryxFiles`          | native module (Turbo Native Module) | No library component calls the module. The core package owns the cache it reads: `CameraView` returns captured photos there, and the add-on's `PdfView` page pictures, photo export, recorder and image markup write there too (FR8). App API, from the add-on package: `AstryxFiles` and `readBundledAsset`.     | A downloaded document opens from the cache; Save opens the system's folder picker and Share opens the system's share sheet; backing out changes nothing. |

## Non-goals

- Astryx Stage and the Astryx app's Preview are specified in `spec:AST-139`;
  they conform to this record's contracts.
- `AstryxStorage`, the string key-value store. `spec:AST-130` (FR14) owns it.
- The cookie jar, domain information, redirect modes, and the request with no
  identity that `AstryxNetwork` carries. `spec:AST-130` owns them until OQ4 is
  answered.
- How a web view presents a client identity. The `web` capability's records
  own it (`spec:AST-131`).
- General file system access: the app's documents folder, arbitrary paths,
  directory trees, and file watching. Data that must last belongs in
  `AstryxStorage` (OQ3).
- The system's file and photo pickers. `AstryxFilePicker` owns them
  (`spec:AST-130/FR13`).
- Sign-in flows, certificate authorities, and enrolment protocols. The app
  talks to its own authority; this record owns only the key, the signing
  request, the stored chain, and where the identity is presented.
- Each component's or capability's use of these modules beyond what "Who uses
  it" names; the owner's own record owns it.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The group is three native modules of the optional add-on
  package.** They are part of the optional add-on package, not the core
  package. An app that does not add the package links none of their native
  code. The package exports `AstryxSecureStorage`, `AstryxClientIdentity`,
  `AstryxFiles` and `readBundledAsset`. Each module is read with
  `TurboModuleRegistry.get`, only by its own wrapper (`spec:AST-140/FR2`), and
  its wrapper answers `no-module` where the module is absent.

  | Contract               | Kind                                | Methods                                                                                                                                                               | Platforms    |
  | ---------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxSecureStorage`  | native module (Turbo Native Module) | `getConstants` (`isUserPresenceAvailable`, `accessibleClasses`, `biometry`), `getItem`, `setItem`, `removeItem`, `getAllKeys`, `clear`                                | iOS, Android |
  | `AstryxClientIdentity` | native module (Turbo Native Module) | `getConstants` (`isSimulator`), `createKey`, `createCsr`, `sign`, `storeCertificate`, `getInfo`, `list`, `bindToHosts`, `remove`, `adoptSystemIdentity` (Android)     | iOS, Android |
  | `AstryxFiles`          | native module (Turbo Native Module) | `getConstants`, `write`, `read`, `remove`, `list`, `trim`, `clear`, `download`, `cancelDownload`, `onDownloadProgress` (event), `saveAs`, `share`, `readBundledAsset` | iOS, Android |

- **FR2 — Every call is a result; constants are synchronous.**
  - Every asynchronous call resolves `AstryxResult` and never rejects
    (`spec:AST-140/FR3`), `readBundledAsset` included. Each module adds only
    these reasons to the common ones:

    | Module                 | Module reasons                                                                                                                                                                                              |
    | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `AstryxSecureStorage`  | `invalid-key`, `invalid-value`, `invalid-json`, `locked`, `unavailable`, `auth-failed`, `unsupported-option`; `cancelled` when the person dismisses Face ID, Touch ID or the passcode                       |
    | `AstryxClientIdentity` | `invalid-label`, `exists`, `no-secure-hardware`, `no-key`, `invalid-subject`, `invalid-certificate`, `key-mismatch`, `invalid-host`, `no-activity`, `no-system-identities`, `unavailable`; `cancelled`      |
    | `AstryxFiles`          | `invalid-name`, `invalid-data`, `invalid-url`, `invalid-uri`, `invalid-option`, `missing-file`, `no-space`, `no-window`, `busy`, `http`, `redirect`, `timeout`, `network`, `io`, `unavailable`; `cancelled` |

  - Synchronous members (`isAvailable()`, `supports(feature)`,
    `AstryxSecureStorage.capabilities()`, `AstryxClientIdentity.isSimulator()`)
    read the module's constants once and never throw. They answer `false` or
    `null` where the module or the constant is absent.
  - A domain outcome is data on an `ok` result, never a failure: a missing key
    reads `{ok: true, value: null}`, a missing identity `{ok: true, info:
null}`, and a missing cache file `{ok: true, data: null, uri: null}`.
    Removing something that is not there answers `ok`.
  - A behaviour that the binary lacks answers `unsupported`
    (`spec:AST-112/FR7`, `spec:AST-140/FR5`); a module reason names a limit of the platform or
    the device.
  - `message` never carries a stored value, a key's name, a token, a
    certificate, or a URL's query (`spec:AST-140/FR3`).

- **FR3 — `AstryxSecureStorage` keeps short secrets.**
  - `get(key, {prompt?})`, `set(key, value, options?)`, `remove(key)`,
    `keys({prefix?})` and `clear({prefix?})` make the store; `getJSON` and
    `setJSON` parse and serialize (`invalid-json`). Keys and values are
    strings; an empty key answers `invalid-key`.
  - `set` replaces a value in place: a failed write keeps the old secret.
  - `accessible` says when a secret can be read: `afterFirstUnlock` (default:
    after the first unlock since the device started, so background work can
    read it) or `whenUnlocked` (only while the device is unlocked). A read
    that the lock state refuses answers `locked`. A value the device does not
    accept answers `unsupported-option`, never a silent default.
  - `thisDeviceOnly` (default `true`) keeps the secret on this device: never
    in a backup and never in a synced keychain. Android secrets are always
    device-bound and never backed up.
  - `capabilities()` answers the device's facts synchronously:
    `isUserPresenceAvailable`, `accessibleClasses` (the `accessible` values the
    device accepts) and `biometry` (`faceID`, `touchID`, `opticID`, `none`, or
    `null` where the platform does not say).
  - `requireUserPresence: true` (feature `user-presence`) protects the secret
    with Face ID, Touch ID or the device passcode: every read asks the person
    first, showing the read's `prompt`. Such a secret is device-only. A read
    the person fails answers `auth-failed`; a read they dismiss answers
    `cancelled`. On a binary without the feature the option answers
    `unsupported`; with `isUserPresenceAvailable` false (no passcode set) it
    answers `unsupported-option`. Neither stores anything.
  - The store is for secrets, not data: the package sets no size limit, and
    each platform's secure store limits what one item holds.

- **FR4 — `AstryxClientIdentity` makes and keeps TLS client identities.**
  - `createKey(label, {allowSoftware?})` creates a P-256 key in the device's
    secure hardware (iOS: the Secure Enclave; Android: StrongBox where the
    device has it, else the trusted execution environment) and answers the
    public key as a base64 DER SubjectPublicKeyInfo and `isHardwareBacked`. A
    label is 1 to 64 of `A–Z a–z 0–9 . _ -`; a label in use answers `exists`.
  - With no secure hardware the call answers `no-secure-hardware`, unless
    `allowSoftware` is true; then the key is a software key and
    `isHardwareBacked` is false.
  - `createCsr(label, subject, {altNames?})` answers an RFC 2986 certificate
    signing request in PEM, signed with ECDSA and SHA-256 by the label's
    key. Subject fields are `CN`, `O`, `OU`, `C`, `L`, `ST`, `serialNumber`,
    `UID`, `DC`, `emailAddress` or a dotted OID, in order; alternative names
    are `email`, `dns`, `uri`, `ip` or `upn`.
  - `sign(label, data, {input?})` signs base64 bytes: their SHA-256
    (`message`, the default) or a 32-byte digest the caller computed
    (`digest`). It answers a base64 DER ECDSA signature.
  - `storeCertificate(label, certificates)` keeps a PEM chain, leaf first. A
    leaf whose public key is not the label's answers `key-mismatch`.
  - `getInfo(label)` and `list()` answer each identity's label, whether it has
    a certificate, `isHardwareBacked`, the leaf's subject, its validity
    (`null` where the platform cannot read it), its SHA-256 fingerprint, and
    its bound hosts. `remove(label)` deletes the key, the chain and the
    binding.
  - The private key never leaves the secure hardware or the store, and never
    reaches JavaScript.
  - `isSimulator()` answers `true` on the iOS Simulator and an Android
    emulator, `false` on a device, from the binary's constants; `createKey`'s
    result carries the same fact. A caller decides a simulator-only path on
    it, never on a `no-secure-hardware` failure, which a device can answer
    too.

- **FR5 — An identity is presented only to hosts it is bound to.**
  - `bindToHosts(label, hosts)` sets where the identity is presented; an empty
    list presents it nowhere. Binding is the app's opt-in: an identity with no
    hosts is never presented.
  - Hosts are exact host names: lower case `a–z 0–9 . -`, with a dot in the
    name or `localhost`. A pattern such as `*.example.com` answers
    `invalid-host`.
  - The call checks, in order, the label (`invalid-label`), that the label has
    a key or a system certificate (`no-key`), and every host
    (`invalid-host`). It changes nothing when a check fails.

- **FR6 — Presentation follows the app's own requests and the redirect rule.**
  - When a server asks for a client certificate, the app's requests to a bound
    host present the identity: `fetch`, `XMLHttpRequest`, React Native's
    `Image`, WebSocket connections, and `AstryxFiles.download` with
    `credentials: 'include'` (FR9).
  - An identity is presented only to the host and port of the request the
    app's code made, never to a host a redirect leads to. A redirected hop
    runs with no identity, and the server's chain is still checked as before.

- **FR7 — On Android, an app can use a system certificate (feature
  `system-identity`).**
  - `adoptSystemIdentity(label, hosts, {alias?})` adopts a certificate from
    Android's system store (one an administrator or the person installed)
    under `label`, bound to exact `hosts`. The system's picker and consent
    dialog name the hosts; an `alias` the app adopted before and that is
    still granted skips the picker.
  - It answers the alias in use and the leaf's subject, `cancelled` when the
    person dismisses the picker or no certificate is installed, `exists` when
    a key identity has the label, and `no-activity` with no screen to show the
    picker on. The adopted certificate is bound and presented as FR5 and FR6
    say, and `getInfo` marks it as a system certificate.
  - Android binaries list the feature, so `supports('system-identity')`
    answers true there. iOS gives apps no system certificate store:
    `supports('system-identity')` answers false, and the call answers
    `no-system-identities`.

- **FR8 — `AstryxFiles` keeps files in the app's cache.**
  - `write(name, data, {encoding?})` writes a file and answers its `file://`
    URL and size; `read(name, {encoding?})` and `remove(name)` complete it.
    Encodings are `utf8` (default) and `base64`. A name is one path component
    that does not start with a dot; anything else answers `invalid-name`.
  - The cache is one folder in the app's caches folder, and the core package
    owns it: core pieces such as `CameraView` write their files there and
    return `file://` URIs into it, and the add-on's modules (`PdfView` page
    pictures, photo export, the recorder, image markup) write there too.
    `AstryxFiles` reads, lists, trims, and shares that same folder. The system
    may delete cached files when space runs low; data that must last belongs
    in `AstryxStorage`.
  - `list({prefix?})` answers the folder's `file://` URL, its entries (name,
    URL, size, and last use), most recently used first, and the total bytes.
    A write, a read, and a download each count as use.
  - `trim({maxBytes?, maxAgeMs?})` removes the least recently used files until
    the total is at most `maxBytes`, and files unused for longer than
    `maxAgeMs`; `clear({prefix?})` removes the matching files. Both answer the
    count and bytes removed and the bytes left. The budget is the app's: the
    package sets none.

- **FR9 — `AstryxFiles.download` fetches a URL into the cache natively.**
  - `download(url, options?)` streams the response body to a cache file; the
    body never crosses into JavaScript. It answers the file's URL, name, size,
    media type, and HTTP status. The default name is a hash of the URL plus
    the URL path's extension. A partial body never replaces a file of the
    same name.
  - The URL is `https:`, or `http:` where the app's transport security allows
    it; anything else answers `invalid-url`. A status outside 2xx answers
    `http` with the status.
  - `redirect` is `follow` (default), `same-origin`, or `error`. A followed
    cross-origin hop drops `Authorization`, `Proxy-Authorization`, an explicit
    `Cookie`, and every header outside the CORS-safelisted set; a hop from
    `https:` to `http:` is refused in every mode; at most 20 hops. A refused
    hop answers `redirect`.
  - `credentials` has `fetch`'s meaning: `omit` (default) sends no cookie,
    stores none, and presents no client identity; `include` sends the app's
    cookies, applied again on every hop, and presents a bound identity to the
    original host (FR6).
  - `timeoutMs` (default 60,000) ends a download that receives no byte for
    that long with `timeout`. `signal` cancels it: the call answers
    `cancelled`. `onProgress` receives the bytes written and the expected
    total (`-1` when the server does not say), at most about ten times a
    second and once at the end.

- **FR10 — `AstryxFiles` saves and shares through the system.**
  - `saveAs(uri, {name?, mimeType?, rootTag?})` lets the person choose where a
    copy goes and answers the copy's URI: on iOS the document picker in export
    mode, on Android the Storage Access Framework's create-document picker.
  - `share(uri, {name?, mimeType?, rootTag?})` opens the system's share sheet
    with the file and answers `isCompleted`: `true` when the platform saw an
    activity complete (iOS), `null` when it cannot say (Android reports only
    that the sheet opened). A "Shared" confirmation follows
    `isCompleted === true`, never `ok` alone.
  - The source is a `file://` URL in the app's cache or files folder, or on
    Android a `content://` URI; any other source answers `invalid-uri`. A
    missing source answers `missing-file`; a second sheet while one is open
    answers `busy`; no window to present on answers `no-window`; the person
    backing out answers `cancelled`.
  - Both present over the calling surface when `rootTag` names it
    (`spec:AST-112/FR7`), else over the top-most one.

- **FR11 — `readBundledAsset` reads a file the app ships.**
  - `readBundledAsset(asset, {encoding?})` takes a `require()`d asset or the
    URI `Image.resolveAssetSource` gives, reads it natively with no size
    limit, and answers its data and size.
  - It reads only the app package's own assets and the running bundle's own
    folder. A read is judged on the resolved path, after every symbolic link:
    a path outside those folders, a `..` component, or a hidden file or folder
    answers `invalid-uri`.
  - FR11 gap: `readBundledAsset` rejects with an error instead of resolving a
    result.

- **FR12 — Threads and lifecycle (`spec:AST-140/FR6`).**
  - Constants are read on the JavaScript thread once per module, at the first
    call that needs them.
  - Keychain and Keystore work, key generation, signing, file reads and
    writes, and downloads run off the JavaScript thread and off the main
    thread. The Face ID, passcode, certificate picker, save, and share sheets
    present on the main thread.
  - A download's progress events reach JavaScript on the JavaScript thread. A
    reload of the JavaScript runtime cancels its downloads, and each call
    answers `cancelled`.
  - A module torn down during a reload answers `unavailable` until the
    runtime is back.

- **FR13 — Security and privacy.**
  - Secrets, private keys, certificates, and file contents never reach logs,
    result messages, or crash reports.
  - Secrets stay out of backups and synced keychains unless the app sets
    `thisDeviceOnly: false` on iOS (FR3).
  - A private key is created in, and used by, the secure hardware or the
    store; JavaScript holds public keys, requests, signatures, and
    certificates only (FR4).
  - An identity is presented only to a bound host, never across a redirect
    (FR5, FR6). A download drops credentials across origins and never
    downgrades to `http:` (FR9).
  - A bundled-file read never leaves the app's own assets (FR11).

- **FR14 — Accessibility.**
  - Every sheet these modules show is the system's own: Face ID and the
    passcode, the certificate picker, the document picker, and the share
    sheet. VoiceOver and TalkBack read them as the system does, and the
    `prompt` of a protected read is the line the system speaks.
  - `cancelled` is not an error: a caller that receives it shows no error
    (`spec:AST-140/FR3`).
  - These modules expose nothing to VoiceOver or TalkBack themselves; they have
    no view.

- **FR15 — Every contract is at revision 1; later behaviour is a named
  feature.**
  - Every contract in the group is at revision 1 on iOS and Android, and none
    carries a revision counter (`spec:AST-140/FR5`). A behaviour added after
    revision 1 is a named feature, `<Contract>.<feature>`, that the binary
    lists in `AstryxPlatformInfo`'s `contractFeatures` constant
    (`spec:AST-130/FR18`). JavaScript checks it with `hasContractFeature`
    before it uses the behaviour.
  - The group's named features are `AstryxSecureStorage.user-presence` (FR3)
    and `AstryxClientIdentity.system-identity` (FR7). Each module's
    `supports(feature)` takes the feature's own name (`'user-presence'`,
    `'system-identity'`) and reads it (`spec:AST-112/FR7`).
  - Without a feature, JavaScript keeps the revision-1 behaviour or answers
    `unsupported`, never a silently weaker path (FR2), and a missing feature
    is reported once with a development warning.

- **FR16 — Public platform API only.**
  - The native code of every module in the group uses public platform API
    only, and public React Native API where it joins React Native's
    networking. The group needs no exception.

- **FR17 — No third-party native dependency, and room for one beside it.**
  - The modules take no third-party native dependency
    (`spec:AST-112/FR2`, `spec:AST-140/FR9`).
  - An app may use an ecosystem library for the same need beside these
    modules, such as `expo-secure-store`, `react-native-keychain`,
    `expo-file-system` or `react-native-fs`, without conflict. The modules
    keep their items, keys, folders, and file-sharing authority under names
    of their own, never read or change another library's, and leave the
    networking client's other settings as they are.

### Platform support

| Contract               | iOS                                                                                                                    | Android                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSecureStorage`  | Keychain generic-password items under the module's own service; accessibility classes; a user-presence access control  | AES-256-GCM values under an Android Keystore key, in the app's no-backup folder; `whenUnlocked` through an unlocked-device key (API 28 and later) |
| `AstryxClientIdentity` | Secure Enclave keys; React Native's request handler and `URLSession` challenges for presentation                       | StrongBox or TEE Keystore keys; a client key manager on React Native's HTTP client; `KeyChain` for `system-identity`                              |
| `AstryxFiles`          | The caches folder; `URLSession` downloads; `UIDocumentPickerViewController` in export mode; `UIActivityViewController` | The cache folder; React Native's HTTP client for downloads; the create-document picker; the share chooser through the module's own `FileProvider` |

- Packaging: all three modules are part of the optional add-on package, not
  the core package (FR1); the cache location `AstryxFiles` works in belongs to
  the core package (FR8).
- Supported feature/engine floor: the platform floor of `spec:AST-112`
  (iOS at React Native's minimum, Android API level 24, the New Architecture
  only). Below Android API level 28, `accessibleClasses` omits
  `whenUnlocked`, and the option answers `unsupported-option`. A device
  without StrongBox uses its TEE; a device without either answers
  `no-secure-hardware`. Certificate validity reads `null` where iOS cannot
  read it.
- Unsupported behavior: an absent module answers `no-module` and its
  synchronous members answer their empty values (FR2); a missing named feature
  answers `unsupported` (FR15); iOS answers `no-system-identities` (FR7).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`); secure hardware, Face ID, and
  StrongBox need a real device.

## Current-state impact

- This record details `spec:AST-112` (FR2, no third-party native dependency;
  FR7, the capability shape) and `spec:AST-140` (FR2 and FR3, results; FR5,
  the revision-1 baseline and named features; FR6, threads; FR7, conformance
  suites; FR9, coexistence) for these three modules.
- It relies on `spec:AST-130/FR18` for `contractFeatures` and
  `hasContractFeature`.
- It places secure storage, client identity, and files in the optional
  add-on package, not the core package. `spec:AST-112/FR1` and FR5, which
  list them in the core and its `./storage` and `./network` entries, change
  to match.

## Verification

| Contract | Verification                                                                                                                         | Representative states                                                                                                      | Mutation or failure expectation                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The platform's spec rules check; the contracts list                                                                                  | each module's spec; the Android-only method                                                                                | A module read with `getEnforcing`, read outside its wrapper, or missing from the contracts list                             |
| FR2      | Each module's conformance suite (`spec:AST-140/FR7`); unit tests through the `./testing` doubles in absent, older and current shapes | each synchronous member; each call; a native throw; a missing key, identity and file                                       | A synchronous member throws, a call rejects, a missing item reads as a failure, or a message carries a value                |
| FR3      | Unit tests; Simulator and emulator runs; device runs with Face ID and the passcode                                                   | each `accessible`; a locked device; `thisDeviceOnly`; a protected read passed, failed and dismissed; no passcode set       | A failed write loses the old secret, an unknown option falls back silently, or a protected read returns without asking      |
| FR4      | Unit tests; Simulator and emulator runs; device runs on secure hardware                                                              | a hardware key; `allowSoftware`; a request with every field type; a digest signature; a mismatched chain; the Simulator    | A key leaves the hardware, a request does not verify, a mismatched chain is stored, or `isSimulator()` is true on a device  |
| FR5      | Unit tests of the host rules and the check order                                                                                     | exact names; `*.example.com`; an unknown label; a label with no key                                                        | A pattern binds, a failed check changes the binding, or an unbound identity is presented                                    |
| FR6      | Simulator and emulator runs against a server that asks for a client certificate                                                      | each request kind; a download with each `credentials` mode; a redirect to another host                                     | An identity is presented after a redirect, to an unbound host, or on a download with `credentials: 'omit'`                  |
| FR7      | Emulator runs with an installed system certificate                                                                                   | first use with the picker; a granted alias; dismissed; no certificate; iOS                                                 | The picker shows for a granted alias, a dismissal reads as an error, or iOS answers anything but `no-system-identities`     |
| FR8      | Unit tests through the `./testing` doubles; Simulator and emulator runs                                                              | write and read in each encoding; a nested or hidden name; list order; trim by size and by age; clear by prefix             | A nested name writes, the list order ignores use, or a trim removes a recently used file first                              |
| FR9      | Unit tests; Simulator and emulator runs against a test server                                                                        | a 2xx and a 404; redirects in each mode; a cross-origin hop with headers; `https:` to `http:`; a stall; a cancel; progress | A header crosses origins, a downgrade is followed, a partial body replaces a file, or progress floods the JavaScript thread |
| FR10     | Simulator and emulator runs                                                                                                          | save; share; cancel; a missing source; a second sheet; a source outside the app's folders                                  | A cancel reads as an error, Android reports a completion, or a source outside the app's folders is shared                   |
| FR11     | Unit tests; Simulator and emulator release builds                                                                                    | an image asset; a text asset; a `..` path; a symbolic link out; a path outside the bundle                                  | A read leaves the app's assets or follows a link out                                                                        |
| FR12     | Thread checks during a large download and a key generation; reload tests                                                             | a 100 MB download while scrolling; a reload during a download                                                              | Work blocks the JavaScript or main thread, or a download survives a reload                                                  |
| FR13     | Log and crash-report review of each module's failure paths; a backup and restore of a device                                         | each failure with a secret, key and token present; restore on another device                                               | A secret or token appears in a log or message, or a device-only secret is restored on another device                        |
| FR14     | VoiceOver and TalkBack runs over each system sheet                                                                                   | a protected read; the certificate picker; save; share                                                                      | A sheet is not reachable, or the `prompt` is not read                                                                       |
| FR15     | The platform's spec rules check; unit tests with a binary that lacks each feature                                                    | each named feature present and absent                                                                                      | A behaviour runs without its feature, a missing feature answers anything but `unsupported`, or no warning                   |
| FR16     | Review of each native change for private API; a symbol check of an add-on build                                                      | an add-on iOS and Android build                                                                                            | A private API call in the group's native code                                                                               |
| FR17     | A sample app that also uses an ecosystem secure store and file library; a dependency check of the package                            | both libraries writing, reading and clearing their own items and files                                                     | A third-party native dependency in the package, or one library reads, changes or removes the other's items or files         |

## Decision log

### DEC-1 — Identity keys live in secure hardware and are presented by the app's own clients

**Reference:** `spec:AST-133/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A device certificate is worth having only when its key cannot be copied off
the device, so the key is created in the Secure Enclave, StrongBox, or the TEE
and JavaScript gets the public key, the request, and signatures. Apps already
use `fetch`, `Image`, and WebSocket, so the platform presents the identity
there instead of offering a separate client.

Rejected: a client certificate file that the app bundles or downloads,
because its private key leaves the hardware.

### DEC-2 — An identity is never presented across a redirect

**Reference:** `spec:AST-133/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

An app may open a URL it did not choose, such as a link in content. If a
redirect could carry the identity to a bound host, that URL could make an
authenticated request as the device. The identity goes only to the host the
app's code asked for.

### DEC-3 — The files module is a cache, not a file system

**Reference:** `spec:AST-133/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

What the library and its capabilities need is a place for downloads,
pictures, and recordings that the system may reclaim, plus the system's save
and share sheets. Lasting data goes to `AstryxStorage`. OQ3 keeps the wider
reach open.

### DEC-4 — The package owns its native code and stays neutral

**Reference:** `spec:AST-133/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

The modules carry their own native code and take no third-party native
dependency, so an app stays JavaScript-only. They keep to names of their own,
so an app can still choose an ecosystem library for the same need beside
them.

Rejected: wrapping an ecosystem library's native code, because every app
would carry it and an app's own copy could conflict with it.

### DEC-5 — The core package owns the cache; the files API is an add-on

**Reference:** `spec:AST-133/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Core pieces such as `CameraView` hand back files, so the core package owns the
cache location and returns URIs into it. The API that lists, reads, writes,
removes, and shares those files serves apps, not components, so it stays in
the optional add-on, and the add-on's modules write into the same cache.

## Open questions

- **OQ1 — Does Android implement user presence for secure storage?**
  (`human-design`) Android can protect a Keystore key with the person's
  biometric or device credential and ask through the system's biometric
  prompt, as `expo-secure-store` and `react-native-keychain` do. Options:
  implement `AstryxSecureStorage.user-presence` on Android with the same
  reasons as iOS; or keep it iOS-only, with Android binaries not listing the
  feature.
- **OQ2 — Does `share` stay in `AstryxFiles`?** (`human-design`) React
  Native's `Share` shares a file URL on iOS with no added native code, but on
  Android it shares only text. Options: keep `share` in the module on both
  platforms (one call, one result, `isCompleted` on iOS); or use React
  Native's `Share` on iOS and keep native code only for Android.
- **OQ3 — Does `AstryxFiles` offer a lasting files folder?** (`human-design`)
  The cache can be reclaimed, and `AstryxStorage` holds strings. Options: keep
  the cache only; or add a files folder that the system does not reclaim,
  with the same name rules.
- **OQ4 — Does this group take the cookie jar, domain information and the
  request with no identity from `AstryxNetwork`?** (`human-design`)
  `spec:AST-130` (OQ2) asks whether they leave the system modules. Their rules
  (values that stay native, requests that present nothing) match this
  group's. Options: a module of their own in this record, with
  `AstryxNetwork` keeping only the path state; or they stay in
  `AstryxNetwork` under `spec:AST-130`.
