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
`spec:AST-112` defines. They are core modules (`spec:AST-112/FR1`: secure
storage, files, and client identity are generic capabilities of the core), so
every app links them. Every asynchronous call resolves the result vocabulary
of `spec:AST-112/FR6`, every module has the capability shape of
`spec:AST-112/FR7`, every interface evolves additively under
`spec:AST-112/FR8`, and Astryx Stage implements each module as the contract
developers build against (`spec:AST-112/FR12`).

## Why this exists

The React Native ecosystem covers each of these needs with a library that
ships its own native code. An app that adds one is no longer a
JavaScript-only app: it needs its own native build, and a Preview of it in the
Astryx app cannot run, because the host binary holds only the native code
Astryx ships. Astryx owns a module where that cost meets a real gap, and keeps
the module a thin, dependency-free wrapper with one result shape, one Preview
policy, and one Astryx Stage simulation (`spec:AST-112/FR2`,
`spec:AST-082/FR13`).

| Module                 | What the ecosystem does well                                                                                                                                                                                                                                                                   | The gap Astryx fills                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSecureStorage`  | `expo-secure-store` and `react-native-keychain` keep values in the Keychain and in Keystore-backed storage, with accessibility classes and biometric gating on both platforms; `react-native-keychain` also stores credential pairs per server.                                                | The capability is close to theirs, and their Android biometric gating goes further (OQ1). The gap is the native code they add, and a store that belongs to the calling runtime: a Preview project gets its own secrets and never reads the app's, decided natively (FR5). Secrets stay out of backups by default.                                                                                 |
| `AstryxClientIdentity` | Community TLS libraries pin server certificates, and some load a client certificate from a file that the app bundles, through their own HTTP client.                                                                                                                                           | A real capability gap. No widely used library creates a key in the Secure Enclave or StrongBox, builds its signing request, and presents the identity on React Native's own `fetch`, `XMLHttpRequest`, `Image` and WebSocket, under a host binding and a redirect rule. Android's system certificates (an administrator's or the person's) have no common wrapper either (FR8).                   |
| `AstryxFiles`          | `expo-file-system`, `react-native-fs` and `react-native-blob-util` read, write and download files across the app's folders, with progress and resumable downloads; `expo-sharing` and `react-native-share` share files. React Native's `Share` shares text and URLs with no extra native code. | Little capability gap, and less reach on purpose: a cache per runtime, downloads whose body never crosses into JavaScript and whose redirects drop credentials across origins, one save and one share call on both platforms, and a read of the app's own bundled files that a Preview project cannot point at the host app (FR9 to FR12). Sharing a URL on iOS needs no added native code (OQ2). |

## Who uses it

| Native piece           | Kind                                | Astryx components that use it                                                                                                                                                                                                                                                                                                                     | What a person sees                                                                                                                                       |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxSecureStorage`  | native module (Turbo Native Module) | No Astryx component. App API only (`./storage` entry): an app that signs in keeps its tokens here.                                                                                                                                                                                                                                                | The app opens signed in after a relaunch; Face ID or the passcode appears before a secret the app protects with it.                                      |
| `AstryxClientIdentity` | native module (Turbo Native Module) | No Astryx component. App API only (`./network` entry): an app that enrols a device certificate. The platform's networking presents a bound identity on the runtime's `fetch`, `XMLHttpRequest`, `Image`, WebSocket, and `AstryxFiles` downloads; the `web` capability presents it in web views through a core registration hook (`spec:AST-131`). | A work app reaches servers that require a device certificate with no certificate prompt; on Android, the system's certificate picker appears once (FR8). |
| `AstryxFiles`          | native module (Turbo Native Module) | No library component calls the module. The `pdf` capability writes its page pictures (`PdfView` thumbnails) into the runtime's cache, and the camera, photo, recorder and image markup modules return their files there. App API (`./storage` entry): `AstryxFiles` and `readBundledAsset`.                                                       | A downloaded document opens from the cache; Save opens the system's folder picker and Share opens the system's share sheet; backing out changes nothing. |

## Non-goals

- `AstryxStorage`, the runtime's string key-value store, and its project-data
  clear. `spec:AST-130` (FR14) owns them; this record names only the clearers
  these modules register with it.
- The cookie jar, domain information, redirect modes, and the request with no
  identity that `AstryxNetwork` carries. `spec:AST-130` owns them until OQ4 is
  answered.
- How a web view presents a client identity, and the Preview host's policies
  for a project's web views. The `web` capability's records own them
  (`spec:AST-131`).
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

- **FR1 — The group is three core native modules.** Every app links them
  (`spec:AST-112/FR1`). Each module is read with `TurboModuleRegistry.get`,
  only by its own wrapper (`spec:AST-112/FR8`), and its wrapper answers
  `no-module` where the module is absent. `./storage` exports
  `AstryxSecureStorage`, `AstryxFiles` and `readBundledAsset`; `./network`
  exports `AstryxClientIdentity` (`spec:AST-112/FR5`).

  | Contract               | Kind                                | Methods                                                                                                                                                                           | Platforms    |
  | ---------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxSecureStorage`  | native module (Turbo Native Module) | `getConstants` (`version`, `isUserPresenceAvailable`, `accessibleClasses`, `biometry`), `getItem`, `setItem`, `removeItem`, `getAllKeys`, `clear`                                 | iOS, Android |
  | `AstryxClientIdentity` | native module (Turbo Native Module) | `getConstants` (`version`, `isSimulator`), `createKey`, `createCsr`, `sign`, `storeCertificate`, `getInfo`, `list`, `bindToHosts`, `remove`, `useSystemIdentity` (Android)        | iOS, Android |
  | `AstryxFiles`          | native module (Turbo Native Module) | `getConstants` (`version`), `write`, `read`, `remove`, `list`, `trim`, `clear`, `download`, `cancelDownload`, `onDownloadProgress` (event), `saveAs`, `share`, `readBundledAsset` | iOS, Android |

- **FR2 — Every call is a result; constants are synchronous.**
  - Every asynchronous call resolves `AstryxResult` and never rejects
    (`spec:AST-112/FR6`), `readBundledAsset` included. Each module adds only
    these reasons to the common ones:

    | Module                 | Module reasons                                                                                                                                                                                               |
    | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `AstryxSecureStorage`  | `invalid-key`, `invalid-value`, `invalid-json`, `locked`, `unavailable`, `auth-failed`, `unsupported-option`, `no-namespace`; `cancelled` when the person dismisses Face ID, Touch ID or the passcode        |
    | `AstryxClientIdentity` | `invalid-label`, `exists`, `no-secure-hardware`, `no-key`, `invalid-subject`, `invalid-certificate`, `key-mismatch`, `invalid-host`, `not-presentable`, `no-activity`, `no-system-identities`; `cancelled`   |
    | `AstryxFiles`          | `invalid-name`, `invalid-data`, `invalid-url`, `invalid-uri`, `invalid-option`, `missing-file`, `no-space`, `no-window`, `busy`, `http`, `redirect`, `timeout`, `network`, `io`, `no-namespace`; `cancelled` |

  - Synchronous members (`isAvailable()`, `version()`, `supports(feature)`,
    `AstryxSecureStorage.capabilities()`, `AstryxClientIdentity.isSimulator()`,
    `AstryxClientIdentity.hasSystemIdentities()`) read the module's constants
    once and never throw. They answer `false` or `null` where the module or the
    constant is absent.
  - A domain outcome is data on an `ok` result, never a failure: a missing key
    reads `{ok: true, value: null}`, a missing identity `{ok: true, info:
null}`, and a missing cache file `{ok: true, data: null, uri: null}`.
    Removing something that is not there answers `ok`.
  - `message` never carries a stored value, a key's name, a token, a
    certificate, or a URL's query (`spec:AST-112/FR6`).
  - Every call works in the calling runtime's namespace, decided natively from
    the runtime and never by JavaScript: `app` for the app's own runtime, and a
    namespace of its own for each Preview project, as `AstryxStorage` does
    (`spec:AST-130/FR14`). A runtime with no namespace answers `no-namespace`.

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
    `cancelled`. Without the feature, or with `isUserPresenceAvailable` false
    (no passcode set), the option answers `unsupported-option` and stores
    nothing.
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
  - `createCsr(label, {subject, altNames?})` answers an RFC 2986 certificate
    signing request in PEM, signed with ECDSA and SHA-256 by the label's
    key. Subject fields are `CN`, `O`, `OU`, `C`, `L`, `ST`, `serialNumber`, `UID`, `DC`,
    `emailAddress` or a dotted OID, in order; alternative names are `email`,
    `dns`, `uri`, `ip` or `upn`.
  - `sign(label, data, {input?})` signs base64 bytes: their SHA-256
    (`message`, the default) or a 32-byte digest the caller computed
    (`digest`). It answers a base64 DER ECDSA signature.
  - `storeCertificate(label, certificates)` keeps a PEM chain, leaf first. A
    leaf whose public key is not the label's answers `key-mismatch`.
  - `getInfo(label)` and `list()` answer each identity's label, whether it has
    a certificate, `isHardwareBacked`, the leaf's subject, its validity
    (`null` where the platform cannot read it), its SHA-256 fingerprint, and
    its bound hosts; `list()` also names the calling runtime's namespace.
    `remove(label)` deletes the key, the chain and the binding.
  - The private key never leaves the secure hardware or the store, and never
    reaches JavaScript.
  - `isSimulator()` answers `true` on the iOS Simulator and an Android
    emulator, `false` on a device, from the binary's constants; `createKey`'s
    result carries the same fact. A caller decides a simulator-only path on
    it, never on a `no-secure-hardware` failure, which a device can answer
    too.

- **FR5 — Each runtime has its own secrets and identities.**
  - A Preview project's runtime sees, uses, and deletes only its own secrets
    and identities, never the app's or another project's.
  - In a Preview project's runtime, the Astryx app asks the person before
    `createKey` and `bindToHosts`; a refusal answers `not-allowed`.
  - The secure store and the identity store each register a clearer with the
    core, so `AstryxStorage.clearProjectData` removes a project's secrets and
    identities with the rest of its data (`spec:AST-130/FR14`).

- **FR6 — An identity is presented only to hosts it is bound to.**
  - `bindToHosts(label, hosts)` sets where the identity is presented; an empty
    list presents it nowhere. Host names are lower case `a–z 0–9 . -`, with a
    dot in the name or `localhost`.
  - The app's own runtime binds exact host names only; `*.example.com`
    answers `invalid-host` there. A Preview project's runtime may also bind
    `*.` patterns under a registrable domain, never at or above a public
    suffix by the public suffix list (`*.co.uk` and `*` answer
    `invalid-host`).
  - The app's own runtime presents identities only when the app declares it
    in its configuration (default: off), which the configuration plugin writes
    (`spec:AST-112/FR4`); without it, `bindToHosts` answers `not-presentable`.
    JavaScript and Preview projects cannot change the declaration.

- **FR7 — Presentation follows the runtime's own requests and the redirect
  rule.**
  - When a server asks for a client certificate, the calling runtime's
    requests to a bound host present its identity: `fetch`,
    `XMLHttpRequest`, React Native's `Image`, WebSocket connections, and
    `AstryxFiles.download`. Another runtime's requests never present it.
  - An identity is presented only to the host and port of the request the
    app's code made, never to a host a redirect leads to. A redirected hop
    runs with no identity and the server's chain is still checked as before.
  - `credentials` on a download governs cookies only; a bound identity is
    presented to the original host in either mode.

- **FR8 — On Android, an app can use a system certificate (feature
  `system-identity`).**
  - `useSystemIdentity(label, {hosts, alias?})` adopts a certificate from
    Android's system store (one an administrator or the person installed)
    under `label`, bound to exact `hosts`. The system's picker and consent
    dialog name the hosts; an `alias` this runtime adopted before and that is
    still granted skips the picker.
  - It answers the alias in use and the leaf's subject, `cancelled` when the
    person dismisses the picker or no certificate is installed, `exists` when
    a key identity has the label, and `no-activity` with no screen to show the
    picker on. The adopted certificate is bound and presented as FR6 and FR7
    say, and `getInfo` marks it as a system certificate.
  - iOS gives apps no system certificate store: `hasSystemIdentities()` and
    `supports('systemIdentity')` answer false, and the call answers
    `no-system-identities`.

- **FR9 — `AstryxFiles` keeps files in the runtime's cache.**
  - `write(name, data, {encoding?})` writes a file and answers its `file://`
    URL and size; `read(name, {encoding?})` and `remove(name)` complete it.
    Encodings are `utf8` (default) and `base64`. A name is one path component
    that does not start with a dot; anything else answers `invalid-name`.
  - Each runtime's cache is its own folder in the app's caches folder. The
    system may delete cached files when space runs low; data that must last
    belongs in `AstryxStorage`.
  - `list({prefix?})` answers the folder's `file://` URL, its entries (name,
    URL, size, and last use), most recently used first, and the total bytes.
    A write, a read, and a download each count as use.
  - `trim({maxBytes?, maxAgeMs?})` removes the least recently used files until
    the total is at most `maxBytes`, and files unused for longer than
    `maxAgeMs`; `clear({prefix?})` removes the matching files. Both answer the
    count and bytes removed and the bytes left. The budget is the app's: the
    package sets none.

- **FR10 — `AstryxFiles.download` fetches a URL into the cache natively.**
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
  - `credentials` is `omit` (default: no cookie sent or stored) or `include`
    (the runtime's cookie jar, applied again on every hop).
  - `timeoutMs` (default 60,000) ends a download that receives no byte for
    that long with `timeout`. `signal` cancels it: the call answers
    `cancelled`. `onProgress` receives the bytes written and the expected
    total (`-1` when the server does not say), at most about ten times a
    second and once at the end.

- **FR11 — `AstryxFiles` saves and shares through the system.**
  - `saveAs(uri, {name?, mimeType?, rootTag?})` lets the person choose where a
    copy goes and answers the copy's URI: on iOS the document picker in export
    mode, on Android the Storage Access Framework's create-document picker.
  - `share(uri, {name?, mimeType?, rootTag?})` opens the system's share sheet
    with the file and answers `isCompleted`: `true` when the platform saw an
    activity complete (iOS), `null` when it cannot say (Android reports only
    that the sheet opened). A "Shared" confirmation follows `isCompleted ===
true`, never `ok` alone.
  - The source is a `file://` URL in the app's cache or files folder, or on
    Android a `content://` URI. A missing source answers `missing-file`; a
    second sheet while one is open answers `busy`; no window to present on
    answers `no-window`; the person backing out answers `cancelled`.
  - Both present over the calling surface when `rootTag` names it
    (`spec:AST-112/FR7`), else over the top-most one.
  - A Preview project's runtime may save or share only files in its own cache;
    any other source answers `not-allowed`.

- **FR12 — `readBundledAsset` reads a file the running bundle ships.**
  - `readBundledAsset(asset, {encoding?})` takes a `require()`d asset or the
    URI `Image.resolveAssetSource` gives, reads it natively with no size
    limit, and answers its data and size.
  - The app's runtime reads only its own package's assets and the running
    bundle's own folder. A Preview project's runtime reads only files it may
    read: its own bundle's assets and its own cache, never the host app's.
    Any other path answers `not-allowed`.
  - A read is judged on the resolved path, after every symbolic link: a `..`
    component or a hidden file or folder answers `not-allowed`.
  - FR12 gap: `readBundledAsset` rejects with an error instead of resolving a
    result.

- **FR13 — Threads and lifecycle.**
  - Constants are read on the JavaScript thread once per module, at the first
    call that needs them.
  - Keychain and Keystore work, key generation, signing, file reads and
    writes, and downloads run off the JavaScript thread and off the main
    thread. The Face ID, passcode, certificate picker, save, and share sheets
    present on the main thread.
  - A download's progress events reach JavaScript on the JavaScript thread. A
    download outlives no runtime: a reload cancels it, and its call answers
    `cancelled`.
  - A module torn down during a reload answers `unavailable` until its runtime
    is back.

- **FR14 — Security and privacy.**
  - Secrets, private keys, certificates, and file contents never reach logs,
    result messages, or crash reports.
  - Secrets stay out of backups and synced keychains unless the app sets
    `thisDeviceOnly: false` on iOS (FR3).
  - A private key is created in, and used by, the secure hardware or the
    store; JavaScript holds public keys, requests, signatures, and
    certificates only (FR4).
  - An identity is presented only to a bound host of the calling runtime,
    never across a redirect (FR6, FR7). A download drops credentials across
    origins and never downgrades to `http:` (FR10).
  - A Preview project cannot reach the app's secrets, identities, cache, or
    bundled files (FR5, FR11, FR12).

- **FR15 — Accessibility.**
  - Every sheet these modules show is the system's own: Face ID and the
    passcode, the certificate picker, the document picker, and the share
    sheet. VoiceOver and TalkBack read them as the system does, and the
    `prompt` of a protected read is the line the system speaks.
  - `cancelled` is not an error: a caller that receives it shows no error
    (`spec:AST-112/FR6`).
  - These modules expose nothing to VoiceOver or TalkBack themselves; they have
    no view.

- **FR16 — Every contract is at revision 1; later behaviour is a named
  feature.**
  - Every contract in the group reports revision 1 on iOS and Android. A
    behaviour added after revision 1 is a named feature,
    `<Contract>.<feature>`, that the binary lists in `AstryxPlatformInfo`'s
    `contractFeatures` constant (`spec:AST-130/FR18`). JavaScript checks it
    with `hasContractFeature` before it uses the behaviour.
  - The group's named features are `AstryxSecureStorage.user-presence` (FR3)
    and `AstryxClientIdentity.system-identity` (FR8).
    `AstryxClientIdentity.supports('systemIdentity')` reads the second.
  - Without a feature, JavaScript keeps the revision-1 behaviour or answers
    `unsupported-option` or `no-system-identities`, never a silently weaker
    path, and a missing feature is reported once with a development warning.
  - Astryx Stage pairs with the package through the library's Stage version
    floor: the package names the oldest Astryx Stage that implements its
    contract set, and an older Astryx Stage refuses the project with the gaps
    listed.

- **FR17 — Astryx Stage simulates each module.**
  - `AstryxSecureStorage`: one file per namespace in Astryx Stage's data
    folder, readable only by the person who runs it. It is not encrypted and
    has no lock state, so `locked` never happens. Under an iOS look a
    protected read draws a confirmation with the `prompt`; under an Android
    look `user-presence` is absent. The command that starts Astryx Stage can
    hand a secret to the launched project through its standard input, never
    through the environment.
  - `AstryxClientIdentity`: identities per namespace in its data folder, with
    software keys (`isHardwareBacked: false`, never `no-secure-hardware`, and
    `isSimulator()` false); signing requests, signatures, chains, the host
    rules of FR6, and presentation on the runtime's requests and downloads
    under the redirect rule of FR7. `system-identity` is absent.
  - `AstryxFiles`: a cache per namespace in its data folder, downloads through
    its own HTTP client under the rules of FR10, the system's save panel and a
    share sheet look-alike, and `readBundledAsset` confined to the project's
    own asset folders and cache.
  - FR17 gap: Astryx Stage reports a download's progress only once, at the
    end, and presents a bound identity on a download only with `credentials:
'include'`.

- **FR18 — Public platform API only.**
  - The native code of every module in the group uses public platform API
    only: the Security and LocalAuthentication frameworks, UIKit's document
    picker and activity sheet, and `URLSession` on iOS; the Android Keystore,
    `KeyChain`, the Storage Access Framework, `FileProvider`, and React
    Native's public HTTP client factory on Android. The group needs no
    exception.

### Platform support

| Contract               | iOS                                                                                                                                   | Android                                                                                                                                           | Astryx Stage                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `AstryxSecureStorage`  | Keychain generic-password items, one service per namespace; accessibility classes; a user-presence access control for `user-presence` | AES-256-GCM values under an Android Keystore key, in the app's no-backup folder; `whenUnlocked` through an unlocked-device key (API 28 and later) | One file per namespace (FR17)                                 |
| `AstryxClientIdentity` | Secure Enclave keys; React Native's request handler and `URLSession` challenges for presentation                                      | StrongBox or TEE Keystore keys; a client key manager on React Native's HTTP client; `KeyChain` for `system-identity`                              | Software keys; its own HTTP client presents them (FR17)       |
| `AstryxFiles`          | The caches folder; `URLSession` downloads; `UIDocumentPickerViewController` in export mode; `UIActivityViewController`                | The cache folder; React Native's HTTP client for downloads; the create-document picker; the share chooser through the package's `FileProvider`    | Its data folder; its own HTTP client; the system's save panel |

- FR17 gap: Astryx Stage reports no `contractFeatures` list.
- Supported feature/engine floor: the platform floor of `spec:AST-112`
  (iOS at React Native's minimum, Android API level 24, the New Architecture
  only). Below Android API level 28, `accessibleClasses` omits
  `whenUnlocked`, and the option answers `unsupported-option`. A device
  without StrongBox uses its TEE; a device without either answers
  `no-secure-hardware`. Certificate validity reads `null` where iOS cannot
  read it.
- Unsupported behavior: an absent module answers `no-module` and its
  synchronous members answer their empty values (FR2); a missing named feature
  answers `unsupported-option` or `no-system-identities` (FR16).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`); secure hardware,
  Face ID, and StrongBox need a real device.

## Current-state impact

- This record details `spec:AST-112`: its FR1 (secure storage, files, and
  client identity in the core), FR5 (the `./storage` and `./network` entries),
  FR6 and FR7 for each module's results and probes, FR8 for the revision-1
  baseline and named features, and FR12 for Astryx Stage's simulation.
- It relies on `spec:AST-130`: FR14 for the runtime namespace and the
  project-data clear, FR18 for `contractFeatures` and `hasContractFeature`.
- It changes no other record. The split between core and opt-in capabilities
  does not change for this group: every module in it is core (OQ5).

## Verification

| Contract | Verification                                                                                                    | Representative states                                                                                                      | Mutation or failure expectation                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The platform's spec rules check; the contracts list                                                             | each module's spec; the Android-only method                                                                                | A module read with `getEnforcing`, read outside its wrapper, or missing from the contracts list                             |
| FR2      | Unit tests through the `./testing` doubles in absent, older and current shapes                                  | each synchronous member; each call; a native throw; a missing key, identity and file; a runtime with no namespace          | A synchronous member throws, a call rejects, a missing item reads as a failure, or a message carries a value                |
| FR3      | Unit tests; Simulator and emulator runs; device runs with Face ID and the passcode; Astryx Stage storage suites | each `accessible`; a locked device; `thisDeviceOnly`; a protected read passed, failed and dismissed; no passcode set       | A failed write loses the old secret, an unknown option falls back silently, or a protected read returns without asking      |
| FR4      | Unit tests; Simulator and emulator runs; device runs on secure hardware; Astryx Stage identity suites           | a hardware key; `allowSoftware`; a request with every field type; a digest signature; a mismatched chain; the Simulator    | A key leaves the hardware, a request does not verify, a mismatched chain is stored, or `isSimulator()` is true on a device  |
| FR5      | Unit tests; Simulator and emulator runs with two Preview projects and the app                                   | a project reading the app's secret; consent refused; a project cleared                                                     | One namespace reads another's secrets or identities, or a cleared project leaves either behind                              |
| FR6      | Unit tests of the host rules                                                                                    | exact names; `*.` under a registrable domain; `*.co.uk`; the app runtime with and without the declaration                  | A wildcard binds in the app runtime or at a public suffix, or the app runtime presents without the declaration              |
| FR7      | Simulator and emulator runs against a server that asks for a client certificate; Astryx Stage network suites    | each request kind; a redirect to another host; another runtime's request                                                   | An identity is presented after a redirect, to an unbound host, or on another runtime's request                              |
| FR8      | Emulator runs with an installed system certificate                                                              | first use with the picker; a granted alias; dismissed; no certificate; iOS                                                 | The picker shows for a granted alias, a dismissal reads as an error, or iOS answers anything but `no-system-identities`     |
| FR9      | Unit tests through the `./testing` doubles; Simulator and emulator runs; Astryx Stage files suites              | write and read in each encoding; a nested or hidden name; list order; trim by size and by age; clear by prefix             | A nested name writes, the list order ignores use, or a trim removes a recently used file first                              |
| FR10     | Unit tests; Simulator and emulator runs against a test server; Astryx Stage files suites                        | a 2xx and a 404; redirects in each mode; a cross-origin hop with headers; `https:` to `http:`; a stall; a cancel; progress | A header crosses origins, a downgrade is followed, a partial body replaces a file, or progress floods the JavaScript thread |
| FR11     | Simulator and emulator runs; Astryx Stage files suites                                                          | save; share; cancel; a missing source; a second sheet; a Preview project's source outside its cache                        | A cancel reads as an error, Android reports a completion, or a project shares a host file                                   |
| FR12     | Unit tests; Simulator and emulator release builds; Astryx Stage bundled-asset suites                            | an image asset; a text asset; a `..` path; a symbolic link out; a Preview project naming a host file                       | A read leaves the bundle's roots, follows a link out, or a project reads the host app's files                               |
| FR13     | Thread checks during a large download and a key generation; reload tests                                        | a 100 MB download while scrolling; a reload during a download                                                              | Work blocks the JavaScript or main thread, or a download survives its runtime                                               |
| FR14     | Log and crash-report review of each module's failure paths; a backup and restore of a device                    | each failure with a secret, key and token present; restore on another device                                               | A secret or token appears in a log or message, or a device-only secret is restored on another device                        |
| FR15     | VoiceOver and TalkBack runs over each system sheet                                                              | a protected read; the certificate picker; save; share                                                                      | A sheet is not reachable, or the `prompt` is not read                                                                       |
| FR16     | The platform's spec rules check; unit tests with a binary that lacks each feature                               | each named feature present and absent; an older Astryx Stage                                                               | A behaviour runs without its feature, a missing feature answers anything but its named reason, or no warning                |
| FR17     | Astryx Stage contract suites against the Simulator and emulator results                                         | each module's suite                                                                                                        | An Astryx Stage answer differs from iOS and Android and its documentation does not name it                                  |
| FR18     | Review of each native change for private API; a symbol check of a core-only build                               | a core-only iOS and Android build                                                                                          | A private API call in the group's native code                                                                               |

## Decision log

### DEC-1 — Secrets, identities and cache files belong to the calling runtime

**Reference:** `spec:AST-133/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The Astryx app runs other people's projects in the same process as its own
code, so a store keyed only by the app would hand a project the app's tokens
and certificates. Each module derives the namespace from the runtime
natively, as `AstryxStorage` does, and registers a clearer so a removed
project leaves nothing behind.

Rejected: a namespace argument from JavaScript, because a project could name
the app's.

### DEC-2 — Identity keys live in secure hardware and are presented by the runtime's own clients

**Reference:** `spec:AST-133/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A device certificate is worth having only when its key cannot be copied off
the device, so the key is created in the Secure Enclave, StrongBox, or the TEE
and JavaScript gets the public key, the request, and signatures. Apps already
use `fetch`, `Image`, and WebSocket, so the platform presents the identity
there instead of offering a separate client.

Rejected: a client certificate file that the app bundles or downloads,
because its private key leaves the hardware.

### DEC-3 — An identity is never presented across a redirect

**Reference:** `spec:AST-133/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

An app may open a URL it did not choose, such as a link in content. If a
redirect could carry the identity to a bound host, that URL could make an
authenticated request as the device. The identity goes only to the host the
app's code asked for.

### DEC-4 — The files module is a cache, not a file system

**Reference:** `spec:AST-133/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

What the library and its capabilities need is a place for downloads,
pictures, and recordings that the system may reclaim, plus the system's save
and share sheets. A cache per runtime keeps a Preview project inside its own
folder; lasting data goes to `AstryxStorage`. OQ3 keeps the wider reach
open.

## Open questions

- **OQ1 — Does Android implement user presence for secure storage?**
  (`human-design`) Android can protect a Keystore key with the person's
  biometric or device credential and ask through the system's biometric
  prompt, as `expo-secure-store` and `react-native-keychain` do. Options:
  implement `AstryxSecureStorage.user-presence` on Android with the same
  reasons as iOS; or keep it iOS-only, with Android answering
  `unsupported-option`.
- **OQ2 — Does `share` stay in `AstryxFiles`?** (`human-design`) React
  Native's `Share` shares a file URL on iOS with no added native code, but on
  Android it shares only text. Options: keep `share` in the module on both
  platforms (one call, one result, `isCompleted` on iOS); or use React
  Native's `Share` on iOS and keep native code only for Android.
- **OQ3 — Does `AstryxFiles` offer a lasting files folder?** (`human-design`)
  The cache can be reclaimed, and `AstryxStorage` holds strings. Options: keep
  the cache only; or add a per-runtime files folder that the system does not
  reclaim, with the same name rules and Preview confinement.
- **OQ4 — Does this group take the cookie jar, domain information and the
  request with no identity from `AstryxNetwork`?** (`human-design`)
  `spec:AST-130` (OQ2) asks whether they leave the system modules. Their rules
  (per-runtime jars, values that stay native, requests that present nothing)
  match this group's. Options: a module of their own in this record, with
  `AstryxNetwork` keeping only the path state; or they stay in
  `AstryxNetwork` under `spec:AST-130`.
- **OQ5 — Does client identity stay in the core?** (`human-design`) No Astryx
  component calls `AstryxClientIdentity`, and only apps that talk to servers
  requiring device certificates use it. Options: keep it in the core, so the
  runtime's requests present identities in every app and in Preview; or make
  it an opt-in capability whose presentation hooks register with the core.
