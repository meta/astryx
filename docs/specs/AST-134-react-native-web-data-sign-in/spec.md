---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-134
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

# React Native platform: Web data, bundled web content and sign-in system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app keeps the web content it shows under its own control: an embedded page
signs in with cookies the app hands over, a sign-out leaves no web data
behind, a small web app bundled with the app opens offline and reads the app's
own data, a card shows a still picture of an HTML document, and a person signs
in to a web service in the system's own sign-in sheet. The developer calls one
typed object per job, from JavaScript only, and handles every outcome as data.
The person sees pages that keep nothing after sign-out, a bundled web app that
opens at once, thumbnails that never run the document's script, and the
system's sign-in sheet with its saved passwords and passkeys.

This record details five modules of the `web` capability of `spec:AST-112`:
`AstryxWebSessions`, `AstryxWebData`, `AstryxWebBundles`,
`AstryxPageSnapshots`, and `AstryxAuthSession`. They follow the opt-in rule
(`spec:AST-112/FR3`), the result vocabulary (`spec:AST-112/FR6`), the
capability shape (`spec:AST-112/FR7`), additive evolution
(`spec:AST-112/FR8`), and Astryx Stage (`spec:AST-112/FR12`). The web view
itself, its feature report, and the part of `AstryxWebSessions` the view
depends on are `spec:AST-131`; this record states the modules' own contracts
and stays consistent with `spec:AST-131/FR7` (bundled folders) and
`spec:AST-131/FR8` (sessions and page storage).

## Why this exists

An app could reach each piece through an open-source library instead. Every
such library ships native code, so a JavaScript-only app, or a project opened
in the Astryx app's Preview, cannot add it. The platform package already links
the system web engine for the web view (`spec:AST-131`), so these modules add
no new framework to an app that opts `web` in. Each piece adds:

- `AstryxAuthSession`: sign-in in the system's authentication browser with a
  redirect URI per runtime and a state bound natively (FR8, DEC-3, DEC-5).
- `AstryxWebSessions`: a store of one view's own, with cookies that never
  cross as props (FR4, `spec:AST-131/FR8`).
- `AstryxWebData`: one clear of the page store that keeps the app signed in,
  and a clear when the last view closes (FR5, DEC-1).
- `AstryxWebBundles`: a bundled web app from a private origin with no network,
  reading the app's data over a byte route (FR6, DEC-2).
- `AstryxPageSnapshots`: a picture of a document drawn inert (FR7, DEC-4). No
  Astryx component uses it, so its place in the package is a scope question
  (OQ2).

## Who uses it

| Native piece          | Kind                                | Astryx components that use it                                                                                                                                  | What a person sees                                                          |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `AstryxWebSessions`   | native module (Turbo Native Module) | `WebView` through its `session={{sessionId}}` prop: the native view resolves the handle (`spec:AST-131/FR8`); no component calls the module; app API (`./web`) | An embedded page that is already signed in and leaves nothing behind        |
| `AstryxWebData`       | native module (Turbo Native Module) | No Astryx component uses it; app API (`./web`)                                                                                                                 | Web pages that keep nothing after sign-out, while the app stays signed in   |
| `AstryxWebBundles`    | native module (Turbo Native Module) | No Astryx component uses it; app API (`./web`); a `NativeWebView` with a `{bundle}` source shows its folders (`spec:AST-131/FR7`)                              | A bundled web app that works offline and opens at once when warmed up       |
| `AstryxPageSnapshots` | native module (Turbo Native Module) | No Astryx component uses it; app API (`./web`)                                                                                                                 | A thumbnail of an HTML document or an SVG                                   |
| `AstryxAuthSession`   | native module (Turbo Native Module) | No Astryx component uses it; the library's `useAuthSession` hook reaches it; app API (`./web`)                                                                 | The system's sign-in sheet, with the browser's saved passwords and passkeys |

## Non-goals

- The web view (`AstryxWebView`, `NativeWebView`), its feature report
  (`AstryxWebViewInfo`), and how the view applies a session, a bundle, or the
  page store: `spec:AST-131`.
- An OAuth or OpenID Connect client: discovery, the token request, refresh,
  and token storage. The app makes the token request with `fetch` and keeps
  what it gets in secure storage (its own record).
- The runtime's network cookie jar and the cookie methods of `AstryxNetwork`
  (`spec:AST-130/OQ2`), and the files module's cache, where snapshots are
  written (its own record).
- The Astryx app's Preview host policies: the consent sheet a project's
  sign-in shows, which project origins it trusts, and which modules it offers
  a project. This record names only the reasons those policies answer.
- Browser features of the sign-in sheet: autofill, passkeys, and saved
  passwords are the system browser's.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — Five modules of the opt-in `web` capability.** The modules belong to
  the `web` capability, which an app opts in (`spec:AST-112/FR3`). The `./web`
  entry exports their objects, and the library reaches them only through
  `AstryxPlatform.capability('web')` (`spec:AST-112/FR2`). Each module is read
  with `TurboModuleRegistry.get`, only by its own wrapper
  (`spec:AST-112/FR8`).

  | Contract              | Kind                                | Methods                                                                                        | Platforms    |
  | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxWebSessions`   | native module (Turbo Native Module) | `create`, `remove`                                                                             | iOS, Android |
  | `AstryxWebData`       | native module (Turbo Native Module) | `clear`, `setPolicy`                                                                           | iOS, Android |
  | `AstryxWebBundles`    | native module (Turbo Native Module) | `register`, `remove`, `respond`, `write`, `end`, `prewarm`, `releaseWarm`, `onRequest` (event) | iOS, Android |
  | `AstryxPageSnapshots` | native module (Turbo Native Module) | `getConstants` (`isSupported`), `capture`, `cancel`                                            | iOS, Android |
  | `AstryxAuthSession`   | native module (Turbo Native Module) | `isSupported`, `start`, `cancel`, `getRedirectUri`, `createPkce`                               | iOS, Android |
  - Every method takes one request object and resolves one result object
    with `status`, `reason`, and `message` (`spec:AST-112/FR8`), `cancel`
    included.
  - `prewarm` and `releaseWarm` exist on iOS only (FR13).

- **FR2 — The JavaScript objects.** Each object has `isAvailable()`, and
  `AstryxWebData`, `AstryxWebBundles`, and
  `AstryxAuthSession`, which have named features (FR13), have
  `supports(feature)` (`spec:AST-112/FR7`). Their calls resolve
  `AstryxResult` (`spec:AST-112/FR6`):
  - `AstryxWebSessions`: `create({cookies?, isEphemeral?, allowsPageStorage?,
pin?})` answers `{sessionId}`; `remove(sessionId)`.
  - `AstryxWebData`: `clear()` answers `{isHttpCacheCleared,
isImageCacheCleared}`; `setPolicy({clearsWhenLastViewCloses})`.
  - `AstryxWebBundles`: `register({name, folder: {resource}})` answers
    `{origin, isReplaced}`; `remove(name)`; `subscribe(listener)` delivers each
    byte-route request and returns its unsubscribe function;
    `respond(response)`, `write({requestId, base64})`, and `end({requestId})`
    answer a request; `prewarm({name, path?, count?})` returns a function that
    releases the pool.
  - `AstryxPageSnapshots`: `capture({html}, {width, height, timeoutMs?,
background?, maxPixels?, signal?})` answers `{file, name, width, height,
isBlank}`.
  - `AstryxAuthSession`: `signIn(request)` answers `{url}`; `cancel()`
    answers `ok` whether or not a sign-in was open;
    `getRedirectUri({callbackScheme?, path?})` answers `{uri}`; `createPkce()`
    answers `{pkce: {verifier, challenge, method, state}}`.
  - The library's `useAuthSession()` hook returns `isAvailable` and the same
    methods with stable identities, and fills the calling surface's root tag
    into a request that has none, so the sheet presents over that surface
    (`spec:AST-112/FR7`).

- **FR3 — Every module works in the calling runtime's namespace.** The
  namespace is decided natively, never by JavaScript: `app` for the app's own
  runtime, and one of its own for each Preview project. Sessions, bundles and
  their byte-route requests, the page store and its policy, snapshot files,
  and redirect URIs belong to the runtime that made them. A project never
  reaches the app's or another project's. `register` and `capture` answer
  `not-allowed` in a project, and a project's `prewarm` keeps nothing.

- **FR4 — `AstryxWebSessions` holds an embedded page's session natively.**
  - `create` takes `cookies` (`{name, value, domain, path?}`), `isEphemeral`
    (default true), `allowsPageStorage` (default true), and `pin` (`{origin,
pathPrefix?}`). It keeps the session in memory under a random, opaque
    `sessionId` from the system's secure generator, and answers that id.
  - Each cookie is a plain name and value for exactly `domain`, the page's
    https host. The view sets it HttpOnly and Secure, with no expiry, before
    the first request (`spec:AST-131/FR8`). Cookies need `isEphemeral`.
  - `pin.origin` is an https origin; `pin.pathPrefix` (default `/`) matches by
    whole path segments. The view limits every top-level navigation to the
    pin, redirects included (`spec:AST-131/FR5`).
  - `allowsPageStorage: false` gives the page no web storage
    (`spec:AST-131/FR8`).
  - A cookie that is not a plain name and value, cookies without
    `isEphemeral`, or a pin that is not an https origin answers
    `invalid-config`.
  - Cookie values never appear in props, logs, development tools, or a
    result. A session lives until `remove` or the end of the process; it is
    never written to disk.
  - `remove` answers `ok` whether or not the session existed. A view that
    loaded with the session keeps its store until the view goes; a view that
    mounts later with that id loads nothing and reports `invalid-config`.

- **FR5 — `AstryxWebData` owns the runtime's page store and how long it
  lives.**
  - The page store is what the runtime's views without an ephemeral store
    keep: cookies, Local Storage, IndexedDB, the Cache API, service worker
    registrations, and the HTTP cache. In the app's runtime it is apart from
    the runtime's network cookie jar, which `fetch` uses, where the device can
    keep them apart (`spec:AST-131/FR8`, the `pageProfile` constant).
  - `clear()` empties the page store at once. Live views keep running over the
    emptied store, and ephemeral views are not touched. It never clears the
    network cookie jar, so the app stays signed in to its own services. Where
    the device cannot keep the stores apart, pages run with no page storage
    and the clear spares the shared store's cookies.
  - With `AstryxWebData.networkCaches` (FR13), the app runtime's `clear()`
    also empties the HTTP cache that `fetch`, `XMLHttpRequest`, and image
    downloads share, and the image caches. It runs off the main thread,
    bounded at 5 seconds. `isHttpCacheCleared` and `isImageCacheCleared` say
    whether each cache holds nothing afterwards; `false` means a step failed
    or ran past the bound, and `null` means this clear does not cover them (a
    Preview project's runtime, or a binary without the feature).
  - `setPolicy({clearsWhenLastViewCloses: true})` clears the page store as
    `clear()` does when the runtime's last view without an ephemeral store
    closes. When the process ends with such a view open, the clear runs at
    the next start, before any page shows. The setting lasts for the process,
    and turning it off forgets a pending clear.
  - A Preview project's page store is the project's own, and its `fetch`
    shares it.

- **FR6 — `AstryxWebBundles` serves bundled folders and answers their byte
  route.**
  - `register` resolves a folder of the app's binary once (iOS a folder in the
    app bundle, Android a folder under the app's assets) under `name`, a DNS
    label: lower-case letters, digits, and hyphens, 1 to 63 characters, no
    hyphen at either end. It answers the bundle's origin
    (`spec:AST-131/FR7`) and `isReplaced`. Registering a name again replaces
    the folder for views mounted afterwards; live views keep theirs. `remove`
    answers `ok` whether or not the bundle existed.
  - A page's `GET` under `/_app/` is the byte route. The module refuses a path
    with a `..`, `.`, hidden, or empty segment before the app sees it, and
    delivers the rest as a request: `requestId` (random, one answer each),
    `name`, the percent-decoded `path`, the raw `query`, and one byte range
    (`hasRange`, `rangeStart`, `rangeEnd`, `-1` for the end).
  - The app answers with `respond({requestId, status?, contentType, body,
contentRange?, errorCode?})`. `body` is one of `{text}` (UTF-8),
    `{base64}`, `{file}` (a file in the runtime's file cache, streamed from
    disk with the request's range cut natively), or `{isStream: true}`
    followed by `write` chunks and `end`. A stream buffers at most one chunk.
    The platform sets no size limit on a body.
  - Every answer carries `X-Content-Type-Options: nosniff` and
    `Cache-Control: no-store`; `errorCode` is served as `X-Astryx-Error` on
    an error status. A request with no answer after 30 seconds is served
    `504`. A request whose page went away is dropped, and an answer to it, a
    second answer, or an unknown id answers `no-request`.
  - With `AstryxWebBundles.warmPages` (FR13), `prewarm` keeps `count` loaded
    pages of a registered bundle (a whole number, at least one; default one)
    at `path` (default `/index.html`) for a view with `warm` to adopt
    (`spec:AST-131/FR7`). The pages wait out of sight, hidden from
    accessibility, with a bundle view's hardening and a store that keeps
    nothing. The pool warms a new page after each adoption, drops every page
    on a memory warning or when the app goes to the background, and warms
    again when it returns. The platform sets no limit on `count`. A bad name,
    path, or count, an unregistered bundle, a Preview project's call, or a
    binary without the feature keeps nothing, and each view then loads its
    own page.
  - A runtime's bundles, pools, and open requests go when the runtime goes.

- **FR7 — `AstryxPageSnapshots` draws an HTML document inert.**
  - `capture` draws `{html}` in an offscreen web view at `width` by `height`
    CSS pixels and answers a PNG: `file` (a `file://` URI in the runtime's
    file cache), `name` (its cache name, the same for the same inputs),
    `width` and `height` in pixels, and `isBlank` (every pixel is the
    background). The picture is taken when the load finishes or at
    `timeoutMs` (default 2000), whichever comes first, as the page stands.
    When the engine does not draw the picture within a further `timeoutMs`
    (a hung renderer), `capture` answers `timeout`.
    `background` (default `#ffffff`) is the canvas under the page.
    `maxPixels` (default the layout size times the screen's scale) is the
    picture's longest side.
  - The contract is fixed natively, and no option loosens it: script off; the
    document served once from a private origin with a content security
    policy that admits only inline styles and `data:` images; every other
    request refused; only the first main-frame load (a refresh, a link, or a
    frame is cancelled); a store that keeps nothing; no cookies, user agent,
    base URL, bridge, or client identity; every authentication challenge
    cancelled. An SVG is drawn by placing it in a page as a `data:` image.
  - Jobs run one at a time, in order. Aborting `signal` stops a queued or
    running job with `cancelled` and leaves no file; a clear of the file
    cache during the job also answers `cancelled`.
  - `isAvailable()` is the binary's word that this device keeps the contract
    (Android needs WebView profiles and request interception). Where it is
    false, `capture` answers `unavailable`. There is no weaker fallback.

- **FR8 — `AstryxAuthSession` runs web sign-in in the system's
  authentication browser.**
  - `signIn` opens `url` in the system's authentication session and resolves
    `{url}`, the callback with its query, when the flow reaches
    `<callbackScheme>://…`. Closing the sheet answers `cancelled`. `url` is
    https, or http to a loopback host only (`invalid-url`). `callbackScheme`
    defaults to the app's first configured callback scheme.
  - Request options: `callback` (`{host?, path?}`, the callback the session
    waits for); `stateParameter` (default `state`); `stateless` (wait for a
    callback without a state; needs a named `callback`); `prefersEphemeral`
    (a private session that shares no cookies with the person's browser;
    default false in the app's runtime and true in a Preview project's);
    `presenter` (FR13); `followUp` (FR13); `rootTag`.
  - One sign-in is open at a time across the app (`busy`). The app's runtime
    pre-empts a project's open sign-in, which settles `cancelled`. `cancel()`
    closes the open sign-in.
  - `getRedirectUri` answers the calling runtime's own redirect URI,
    `<scheme>://oauth/<namespace>[/<path>]`. `createPkce` answers a 43
    character verifier, its S256 challenge, `method: 'S256'`, and a 22
    character state, all from the system's secure generator.
  - Routing: the platform wraps the sign-in URL's state with a nonce of its
    own and checks it on the callback, which then carries the caller's value
    again. A callback with another state, host, or path is dropped and never
    handed over; the callback reaches only the runtime that started the
    sign-in.
  - In a Preview project, the sign-in URL carries a state of at least 16
    characters (`missing-state`), and its `redirect_uri` names the project's
    own namespace (`wrong-project`, or `redirect-not-owned` on one of the
    app's schemes). A project callback that names no namespace fails
    `redirect-not-owned`, unless the app lists that callback host for
    projects in its native configuration.
  - On iOS the session is `ASWebAuthenticationSession`. On Android it is the
    browser's Auth Tab where the browser has one, else a Custom Tab, and the
    redirect activity that the `web` capability's host declarations
    (`spec:AST-112/FR4`) add for the app's callback schemes receives the
    callback.

- **FR9 — Security and privacy.**
  - Cookie values, callback URLs, codes, states, and verifiers never appear
    in props, logs, traces, or a result `message` (`spec:AST-112/FR6`).
  - Every identifier a module makes (session ids, request ids, nonces,
    verifiers, states) comes from the system's secure generator.
  - A bundled page reaches no network and has no file access; a snapshot runs
    no script and loads nothing but its own images; neither reaches the app's
    client identity.
  - Sign-in never runs in an embedded web view (DEC-5).
  - The package declares no permission (`spec:AST-112/FR3`); the `web`
    capability's host declarations (`spec:AST-112/FR4`) carry the callback
    schemes and the redirect activity.

- **FR10 — Results never throw, and reasons are a closed set.** Every call
  resolves `AstryxResult` and never rejects; a reason the JavaScript does not
  know reads `error` (`spec:AST-112/FR6`). Each module adds these reasons to
  the common ones:

  | Contract              | Reasons                                                                                                                                                                               |
  | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `AstryxWebSessions`   | `invalid-config`                                                                                                                                                                      |
  | `AstryxWebData`       | `unavailable` (no web engine on this device, or the module went with a reload)                                                                                                        |
  | `AstryxWebBundles`    | `invalid-config` (a name, path, body, or status the platform cannot serve), `not-found` (no such folder or cache file), `no-request`                                                  |
  | `AstryxPageSnapshots` | `timeout`, `unsupported-content` (the engine refused the document, or its content process ended), `unavailable`, `invalid-option` (a size, time, colour, or pixel count out of range) |
  | `AstryxAuthSession`   | `no-window`, `busy`, `invalid-url`, `scheme-not-registered`, `no-browser`, `missing-state`, `wrong-project`, `state-mismatch`, `origin-not-trusted`, `redirect-not-owned`             |
  - `not-allowed` is a call only the app's runtime may make (FR3).
    `cancelled` is a sign-in the person closed or a project sign-in whose
    consent the person declined (`spec:AST-112/FR6`). `origin-not-trusted` is
    a project origin the Astryx app does not admit (Non-goals).

- **FR11 — Threads and lifecycle.** No call blocks the UI thread. Snapshot
  and cache work runs off the main thread. The web engine's own calls run on
  the main thread, and the byte route answers on the engine's request thread
  without blocking the page's main thread. A runtime's reload ends its
  bundles, pools, open requests, and open sign-in; sessions stay until
  `remove` or the end of the process (OQ4).

- **FR12 — Fallbacks.** Where the app did not opt `web` in, every object's
  `isAvailable()` answers false and its calls resolve `not-linked`. Where the
  module is absent (Jest, the web, an older binary), calls resolve
  `no-module`. Where the platform is switched off through the capabilities
  provider, `useAuthSession()` answers `isAvailable: false` and its calls
  resolve `no-module` (`spec:AST-131/FR16`). `subscribe` on a binary without
  `AstryxWebBundles` delivers nothing.

- **FR13 — Every contract is at revision 1; later behaviour is a named
  feature.**
  - Every contract in the group is at revision 1 on iOS and Android and
    carries no revision counter (`spec:AST-112/FR8`). A
    behaviour beyond revision 1 is a named feature, `<Contract>.<feature>`,
    that the binary lists in `AstryxPlatformInfo`'s `contractFeatures`
    constant, and JavaScript checks it with `hasContractFeature` before use
    (`spec:AST-130/FR18`).
  - The group's named features:
    - `AstryxWebData.networkCaches` (FR5): iOS, Android.
    - `AstryxWebBundles.warmPages` (FR6): iOS; listed exactly where
      `AstryxWebView.warmBundle` is (`spec:AST-131/FR14`).
    - `AstryxAuthSession.safariView`: iOS. `presenter: 'safariView'` shows the
      page in `SFSafariViewController`, which can present the device's
      certificates. Its callback arrives as a URL the app is opened with, on a
      scheme the app declares, and the native shell hands it to the module.
      `stateless` then accepts only a callback that the Safari view opened.
    - `AstryxAuthSession.followUp`: iOS, Android. `followUp: {url, callback:
{host}}` declares one stateless step after the sign-in, under an https
      origin and path prefix, on a callback host the app lists for stateless
      callbacks. One consent covers both steps where the Astryx app asks for
      consent.
    - `AstryxAuthSession.ephemeral`: iOS always; Android where the browser has
      an Auth Tab. It says `prefersEphemeral` is honoured (OQ3).
  - Without a feature, JavaScript keeps the revision-1 behaviour or answers
    `unsupported`, never a silently weaker path: `presenter: 'safariView'` or
    `followUp` answers `unsupported`; `prewarm` keeps nothing; `clear()`
    answers `null` for both cache keys.
  - Astryx Stage pairs with the package through the library's Stage version
    floor: the package names the oldest Astryx Stage that implements its
    contract set, and an older Astryx Stage refuses the project with the gaps
    listed.

- **FR14 — Native code uses public API only.** The modules use only the
  public API of WebKit, AuthenticationServices, SafariServices, the Android
  SDK, AndroidX WebKit, AndroidX Browser, and React Native. The group needs
  no exception.
  - FR14 gap: on Android the network-cache clear reaches React Native's
    networking client through a field React Native does not publish.

- **FR15 — Astryx Stage implements each module.**
  - `AstryxWebSessions`, `AstryxWebData`, and `AstryxWebBundles` behave as on a
    device wherever Astryx Stage shows a web view (macOS,
    `spec:AST-131` Platform support): the same sessions, page store, policy,
    bundled folders, and byte route.
  - `AstryxAuthSession`: the sign-in opens in the desktop's browser. A flow
    whose `redirect_uri` uses the callback scheme comes back through a
    loopback redirect on `127.0.0.1` that accepts one request with the right
    path and state. On macOS a custom-scheme callback comes back through the
    system's sign-in sheet. On Linux it comes back only while a sign-in with a
    state is open, and only on a scheme the app declares. A headless run opens
    nothing, and a script step supplies the callback. The same routing checks
    as a device apply (FR8).
  - FR15 gap: Astryx Stage has no `AstryxPageSnapshots`; `isAvailable()`
    answers false there.
  - FR15 gap: Astryx Stage keeps no warm pages and does not list
    `AstryxWebBundles.warmPages`.
  - FR15 gap: on Linux and Windows Astryx Stage shows no web view
    (`spec:AST-131` Platform support). There `AstryxWebData` answers
    `unavailable`, as on a device with no web engine, and sessions and
    bundles register but no view shows them.
  - FR15 gap: on Windows a sign-in whose callback is a custom scheme does not
    come back; only a loopback redirect does, and the person ends any other
    sign-in with Cancel.

- **FR16 — Accessibility.** The sign-in sheet is the system's, read by
  VoiceOver and TalkBack and sized by the system text size. Warm pages are
  hidden from accessibility until a view adopts one. A snapshot is an image:
  the caller gives it an accessible label where it shows it.

### Platform support

| Contract              | iOS                                                                                                      | Android                                                                                                           | Astryx Stage                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AstryxWebSessions`   | Sessions in memory only; an ephemeral store is discarded with its view                                   | Sessions in memory only; an ephemeral store is deleted with its view, with no Cache API or service workers        | As on a device, where Stage shows a web view                                                                                  |
| `AstryxWebData`       | A page store apart from the network cookie jar on iOS 17 and later; before 17, pages run with no storage | A page store apart from the network cookie jar where the WebView has multiple profiles; otherwise no page storage | As on a device: clears the page store; the policy counts its views                                                            |
| `AstryxWebBundles`    | `astryx-bundle://<name>/` origin with no network; warm pages                                             | An https origin on a reserved `.invalid` host that no DNS lookup answers, with no network; no warm pages          | Bundled folders and byte route as on a device, where Stage shows a web view; no warm pages                                    |
| `AstryxPageSnapshots` | The inert contract on every supported version                                                            | The inert contract where the WebView has multiple profiles and request interception; elsewhere `unavailable`      | Absent (FR15)                                                                                                                 |
| `AstryxAuthSession`   | The system's web authentication sheet; the in-app Safari view with `safariView`; ephemeral when asked    | The browser's Auth Tab where it has one, else a Custom Tab; ephemeral only in an Auth Tab                         | Sign-in in the desktop browser; callbacks through a loopback redirect, the macOS sign-in sheet, or a declared scheme on Linux |

- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only), with the
  system web engine and browser the device carries.
- Unsupported behavior: a feature the binary lacks is absent from
  `contractFeatures`, and a call that needs it answers `unsupported` (FR13); a
  device that cannot keep a module's guarantee answers `unavailable`
  (FR5, FR7).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- `spec:AST-112/FR1` names the `web` capability as the web view and the
  sign-in session, and lists web data, bundled web folders, and page
  snapshots among the package's app-level modules. This record places those
  modules in `web`: it amends FR1's `web` entry to the web view, its sessions
  and page store, bundled web content, page snapshots, and the sign-in
  session.
- Otherwise none beyond `spec:AST-112`. This record details its FR3 (the
  `web` capability stays opt-in), FR6 (the modules' closed reasons), FR7
  (their probes and features), FR8 (the group's revision-1 baseline), and
  FR12 (the modules in Astryx Stage).
- It states the full contract of `AstryxWebSessions`, `AstryxWebData`,
  `AstryxWebBundles`, `AstryxPageSnapshots`, and `AstryxAuthSession`, which
  `spec:AST-131` places in the `web` capability and leaves to this record. It
  changes none of `spec:AST-131`'s requirements.

## Verification

| Contract | Verification                                                                                                    | Representative states                                                                                                                                                      | Mutation or failure expectation                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| FR1      | The platform's spec rules check; the contracts list against the codegen specs; built app without and with `web` | each module; `web` opted out and in                                                                                                                                        | A module is missing, read with `getEnforcing` or outside its wrapper, or linked without the opt-in                       |
| FR2      | Unit tests of each object and of `useAuthSession` through the `./testing` doubles                               | each method; a hook re-render; a request without `rootTag`                                                                                                                 | A call rejects, a callback identity changes on re-render, or the root tag is not filled in                               |
| FR3      | Simulator and emulator checks with the app's runtime and two Preview projects                                   | a session, a page store, and a redirect URI in each runtime; a bundle, a snapshot, and a warm pool in the app's runtime; `register`, `capture`, and `prewarm` in a project | One runtime reaches another's, a project's `register` or `capture` succeeds, or a project's `prewarm` keeps a page       |
| FR4      | Unit tests of the refusals; Simulator and emulator checks of a session in a view                                | cookies with and without `isEphemeral`; a bad cookie; an http pin; `remove` then a new mount                                                                               | A cookie value appears in props or logs, a refused session gets an id, or a removed id loads a page                      |
| FR5      | Simulator and emulator checks of the store, the network jar, and the caches; a process end with a view open     | `clear()` with a signed-in `fetch`; the policy on and off; a device without separate page profiles                                                                         | The network jar loses a cookie, a page keeps storage after a clear, or the start clear does not run                      |
| FR6      | Unit tests of the name and path rules; Simulator, emulator, and Astryx Stage scripts of the byte route          | each body kind; a ranged `file`; a stream; no answer for 30 seconds; a second answer; `prewarm` and an adoption                                                            | A refused path reaches the app, a header is missing, a late request is not `504`, or a second answer is accepted         |
| FR7      | Simulator and emulator checks with hostile documents; unit tests of the option rules                            | a script, a remote image, a refresh, a frame, a storage write; a cancel; a file-cache clear mid-job                                                                        | Any script runs, any request leaves the device, a cancelled job leaves a file, or the same inputs give two names         |
| FR8      | Simulator, emulator, and device sign-ins against a test provider; unit tests of the routing checks              | success; close; a wrong state; a project with another namespace; two sign-ins at once; a loopback http URL                                                                 | A callback with the wrong state is handed over, a project receives another runtime's callback, or a second sign-in opens |
| FR9      | Log and trace capture during the FR4 to FR8 checks; source check of the generators                              | a sign-in, a session, a byte-route request                                                                                                                                 | A cookie value, callback URL, code, or verifier appears in a log, trace, or message                                      |
| FR10     | Unit tests through the doubles in their absent, older, and current shapes                                       | each reason; an unknown native reason                                                                                                                                      | A call throws, or a reason falls outside the set                                                                         |
| FR11     | Main-thread hang checks during snapshots, clears, and byte-route answers; reload checks                         | a long snapshot queue; a reload with an open request and an open sign-in                                                                                                   | The UI thread stalls, or a request or sign-in outlives its runtime                                                       |
| FR12     | Platform tests with the module absent, not linked, and switched off                                             | each object; `useAuthSession`; `subscribe`                                                                                                                                 | A call rejects, `isAvailable()` answers true, or the wrong common reason is returned                                     |
| FR13     | Unit tests of `hasContractFeature` per platform; Stage version floor check                                      | each feature present and absent; an older Astryx Stage                                                                                                                     | A call uses a feature the binary does not list, or an older Astryx Stage runs the project                                |
| FR14     | Source check of the native code's symbols on both platforms                                                     | the default app with `web` opted in                                                                                                                                        | A symbol outside the named public frameworks is used                                                                     |
| FR15     | Astryx Stage contract suites, headless and in a window                                                          | a session view, a clear, a byte-route page, a scripted sign-in callback, a loopback sign-in                                                                                | Astryx Stage behaves differently from a device without a gap line                                                        |
| FR16     | VoiceOver and TalkBack checks of the sign-in sheet; accessibility tree check with a warm pool                   | an open sign-in; a pool of two warm pages                                                                                                                                  | A warm page appears in the accessibility tree, or the sheet is not read                                                  |

## Decision log

### DEC-1 — Web pages keep their data apart from the app's network session

**Reference:** `spec:AST-134/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The runtime's page store is apart from its network cookie jar, and clearing
web data never clears the jar. A sign-out of the embedded pages leaves the
app's own `fetch` session signed in; a page that needs one of the app's
cookies gets it through an ephemeral session.

Rejected: clearing the platform's default web store whole, because it signs
the app's network session out.

### DEC-2 — A bundled page reads the app's data over a byte route the app answers

**Reference:** `spec:AST-134/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The page asks for `/_app/…` on its own private origin, and the app answers in
JavaScript with text, bytes, a cached file, or a stream. The page needs no
network and no file access (`spec:AST-131/DEC-4`).

Rejected: a local HTTP server on a loopback port, because any local process
can reach it.

### DEC-3 — Sign-in callbacks are bound to their runtime and state natively

**Reference:** `spec:AST-134/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

The platform wraps the state with its own nonce, checks the callback's state,
host, and path, and hands the callback only to the runtime that started the
sign-in. A Preview project's redirect URI names its own namespace.

Rejected: handing every callback on the scheme to JavaScript, because another
runtime or app could then inject one.

### DEC-4 — The snapshot contract has no option that loosens it

**Reference:** `spec:AST-134/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

Script, network, store, and identity are fixed off in native code. The caller
chooses only the size, the time, the background, and the picture's size.

Rejected: a snapshot of a live `NativeWebView`, because the document's script
would run with network access.

### DEC-5 — Sign-in runs in the system's authentication browser

**Reference:** `spec:AST-134/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Web sign-in uses the system's authentication session, which keeps the
person's credentials out of the app and offers the browser's saved passwords
and passkeys.

Rejected: sign-in in an embedded web view, because the app could read what
the person types and identity providers refuse embedded views.

## Open questions

- **OQ1 — Is web sign-in (`AstryxAuthSession`) an opt-in capability of its
  own?** (`human-api`) It needs no embedded web view, and no Astryx component
  uses it. Options: keep it in `web` with the `useAuthSession` hook; or make
  sign-in its own opt-in, so an app that signs in links no web view and an app
  with a web view links no redirect activity. `spec:AST-112/OQ8` and
  `spec:AST-131/OQ3` ask the same
  question from the web view's side.
- **OQ2 — Does `AstryxPageSnapshots` stay in the platform package?**
  (`human-design`) No Astryx component uses it. Options: keep it in `web`; make
  it its own opt-in; or leave thumbnails to the app.
- **OQ3 — Does `prefersEphemeral` refuse where it is not honoured?**
  (`human-api`) Options: keep it a preference that `AstryxAuthSession.ephemeral`
  reports; or answer `unsupported-option` when a caller sets it true on a
  device without the feature.
- **OQ4 — Does a web session end when its runtime reloads?** (`human-design`)
  Options: keep sessions until `remove` or the end of the process; or end a
  runtime's sessions with the runtime, as its bundles and pools end.
- **OQ5 — Does the network-cache clear belong to `AstryxWebData`?**
  (`human-design`) Options: keep it in `clear()` behind
  `AstryxWebData.networkCaches`; or move it to the network module with the
  cookie methods `spec:AST-130/OQ2` places.
