---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-131
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

# React Native platform: Web (WebView and its modules) system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app shows web content inside a screen: a help page, a terms page, a sign-in
or payment page in place, an HTML document the app built, or a small web app
bundled with the app that works offline. The developer gets one web view that
is safe by default: links to other sites open in the system browser, the page
cannot reach the device's files or open pop-up windows, the page follows the
app's light or dark mode and text size, and the app and the page talk over one
message channel. The person sees the page as part of the screen, and a screen
reader reads the page's own content.

This record details the `web` capability of `spec:AST-112`: the platform layer
and its opt-in capabilities (`spec:AST-112/FR1`, `spec:AST-112/FR3`), the
result vocabulary (`spec:AST-112/FR6`), the capability shape
(`spec:AST-112/FR7`), additive evolution (`spec:AST-112/FR8`), and Astryx
Stage (`spec:AST-112/FR12`). It specifies the native web view
(`AstryxWebView`) and its feature report (`AstryxWebViewInfo`), which the
library's `WebView` and `WebContent` use. The capability's other modules are
listed in "Who uses it" with their scope questions.

## Why this exists

| Piece                                                                           | What the ecosystem already does well                                                                                                                                                                                                                                           | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxWebView`                                                                 | react-native-webview is mature and widely used. It covers iOS, Android, macOS, and Windows, has a large API (injected scripts, `onShouldStartLoadWithRequest`, `postMessage`/`onMessage`, cookies, file access, downloads, incognito mode), and handles most apps' needs well. | The gaps are specific. A bundled folder served from a private origin with no network, plus a byte route from the page to the app, instead of file access. Origin and path pinning that holds across redirects, decided natively from declared data, not by a JavaScript callback per navigation. Per-view session handles whose cookies never cross as props, and a page-storage-off mode. A message event whose sender origin comes from the engine. Results with closed reasons, never a throw. One dependency set (`spec:AST-112/FR2`). Theme colour scheme and text size wired by the library. Astryx Stage parity. |
| `AstryxWebViewInfo`                                                             | react-native-webview reports no per-binary feature list; an app reads the package version.                                                                                                                                                                                     | An app and the library ask the binary whether it keeps a guarantee (page storage off, a bundled origin, a frame-safe channel) before they rely on it, so a missing guarantee refuses loudly instead of loading a weaker page (DEC-5).                                                                                                                                                                                                                                                                                                                                                                                   |
| `AstryxAuthSession`                                                             | expo-web-browser opens the system's authentication session (ASWebAuthenticationSession, Custom Tabs) and expo-auth-session builds OAuth on it, PKCE and discovery included. Both are well maintained.                                                                          | The gap is narrow: results with closed reasons, no Expo runtime library (`spec:AST-112/FR11`), and a redirect URI per runtime. No Astryx component uses it (OQ4).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AstryxWebSessions`, `AstryxWebData`, `AstryxWebBundles`, `AstryxPageSnapshots` | react-native-webview shares or isolates cookies per app (`sharedCookiesEnabled`, `incognito`) and loads local files through file access. No common library draws an inert page snapshot.                                                                                       | They serve the web view's sessions, stores, bundled folders, and thumbnails. No Astryx component calls them; they are app API (OQ1, OQ2, OQ3, OQ5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Who uses it

| Native piece          | Kind                                       | Astryx components that use it                                                                                                                             | What a person sees                                                                                      |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AstryxWebView`       | native component (Fabric Native Component) | `WebView`; `WebContent` (through `WebView`); apps through the `./web` entry's `NativeWebView`                                                             | A web page or an HTML document inside the screen, in the app's colour scheme and text size              |
| `AstryxWebViewInfo`   | native module (Turbo Native Module)        | `WebView` and `WebContent` (through `NativeWebView`'s checks before a load); the `useWebViewSupports` hook and the capability status of `useCapabilities` | Nothing directly; a page that needs a guarantee the device lacks does not load, and the screen says why |
| `AstryxWebSessions`   | native module (Turbo Native Module)        | No Astryx component; app API only (`./web`). `WebView`'s `session={{sessionId}}` carries a handle the app created                                         | A signed-in embedded page                                                                               |
| `AstryxWebData`       | native module (Turbo Native Module)        | No Astryx component; app API only (`./web`)                                                                                                               | Web pages that keep nothing after sign-out                                                              |
| `AstryxWebBundles`    | native module (Turbo Native Module)        | No Astryx component; app API only (`./web`, a `NativeWebView` with a `{bundle}` source)                                                                   | A bundled web app that works offline and opens at once when warmed up                                   |
| `AstryxAuthSession`   | native module (Turbo Native Module)        | No Astryx component; app API through the library's `useAuthSession` hook and `./web`                                                                      | The system's sign-in sheet                                                                              |
| `AstryxPageSnapshots` | native module (Turbo Native Module)        | No Astryx component; app API only (`./web`)                                                                                                               | A thumbnail of an HTML document                                                                         |

Notes on the app-only modules (their contracts are outside this record):

- `AstryxWebSessions` holds an embedded page's cookies, store, and pin natively
  under an opaque handle that the view's `sessionId` prop names (FR8).
- `AstryxWebData` clears the runtime's shared web store and sets when it clears
  itself.
- `AstryxWebBundles` registers bundled folders, answers the page's byte route,
  and keeps a pool of warm pages; the view side is FR7.
- `AstryxAuthSession` runs web sign-in in the system's authentication session.
- `AstryxPageSnapshots` draws an HTML document inert in an offscreen web view
  and writes a PNG to the app's file cache.

## Non-goals

- The contract of the library's `WebView` and `WebContent` components beyond
  how they use the platform (FR15, FR16). Each component's own record and
  `spec:AST-082/FR3` own it.
- The full contracts of `AstryxWebSessions`, `AstryxWebData`,
  `AstryxWebBundles`, `AstryxAuthSession`, and `AstryxPageSnapshots`
  (OQ1 to OQ5).
- The Astryx app's preview host and the policies it applies to a previewed
  project's web views (its link gate, its client identity).
- Browser features the view does not offer: downloads, file upload pickers,
  geolocation, WebRTC, pop-up windows, and pull-to-refresh.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — `web` is an opt-in capability.** The web view and its modules belong
  to the `web` capability, which an app opts in (`spec:AST-112/FR3`): opting in
  links WebKit on iOS, and the AndroidX Browser library and the sign-in
  redirect activity on Android. The `./web` entry exports `NativeWebView`,
  `isNativeWebViewAvailable()`, `AstryxWebViewInfo`, and the app-only modules.
  The library reaches the capability only through
  `AstryxPlatform.capability('web')` (`spec:AST-112/FR2`).
- **FR2 — `NativeWebView` is the platform's web view.** Its props:
  - `source`, one of `{uri}` (an http or https page), `{html, baseUrl?,
grantsOrigin?}` (an HTML string), or `{bundle: {name, path?}}` (a bundled
    folder, FR7).
  - Navigation: `allowedOrigins`, `externalNavigation`, `allowedExternalSchemes`
    (FR5); sessions: `session` (FR8).
  - Appearance and layout: `colorScheme`, `textScale`, `isScrollEnabled`,
    `layerTypeAndroid` (`software` by default, or `hardware` for WebGL and
    hardware video), `applicationNameForUserAgent`, and `userAgent` (FR10).
  - `preventsCapture` and `linkMenu` with `onLinkMenuAction` (FR12); `warm`
    (FR7); `reloadsOnContentProcessEnd` (FR11).
  - Events, each with one object argument: `onLoadStart({url})`,
    `onLoad({url, title})`, `onProgress({progress})` (0 to 1),
    `onError(failure)`, `onContentHeight({height})`, `onMessage(event)`,
    `onOpenExternal({url})`, `onNavigationBlocked({url, reason})`, and
    `onContentProcessEnded(event)`.
  - `ref`, a handle with `postMessage(data)` and `reload()`; `fallback`, drawn
    where the view is absent (FR16); `style` and `testID`.
  - With no allowed origins, every link a person follows to another origin
    opens outside the view.
- **FR3 — The native contract.**

  | Contract        | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                                              | Commands                | Events                                                                                                                                                                                               | Platforms    |
  | --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxWebView` | native component (Fabric Native Component) | `html`, `baseUrl`, `url`, `grantsOrigin`, `bundleName`, `bundlePath`, `warm`, `allowedOrigins`, `externalNavigation`, `allowedExternalSchemes`, `noExternalSchemes`, `pinnedOrigin`, `pinnedPathPrefix`, `sessionId`, `sessionCookies`, `ephemeral`, `allowsPageStorage`, `colorScheme`, `textScale`, `scrollEnabled`, `layerTypeAndroid`, `applicationNameForUserAgent`, `userAgent`, `preventsCapture`, `linkMenu`, `reloadsOnContentProcessEnd` | `postMessage`, `reload` | `onWebLoadStart`, `onWebLoad`, `onWebError`, `onWebProgress`, `onWebContentHeight`, `onWebMessage`, `onWebOpenExternal`, `onWebNavigationBlocked`, `onWebLinkMenuAction`, `onWebContentProcessEnded` | iOS, Android |

  | Contract            | Kind                                | Methods                                                                                       | Platforms    |
  | ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxWebViewInfo` | native module (Turbo Native Module) | `getConstants()` (`version`, and the device's `channelIsolation` and `pageProfile` constants) | iOS, Android |
  - The JavaScript maps its props onto the host's flat props and leaves absent
    keys absent. An empty `allowedExternalSchemes` crosses as
    `noExternalSchemes`, because codegen cannot tell an empty array from an
    absent one.

- **FR4 — Safe defaults.** The view has no file or content access, opens no
  pop-up window, offers no geolocation, and blocks mixed content. A script at
  document start in every frame removes WebRTC (`RTCPeerConnection` and
  `navigator.mediaDevices`), turns DNS prefetching off, and removes
  `<link rel=preconnect>`; on iOS the system's own switches for these are off
  as well. The view injects no script besides this one and the message
  channel's (FR9). There is no prop that injects JavaScript.
- **FR5 — Navigation follows declared policy, decided natively.**
  - The first load and every main-frame navigation to the page's own origin
    or to an origin in `allowedOrigins` stay in the view. Subresources and
    frames follow the page's own rules.
  - Any other main-frame navigation a person starts (a link, a form,
    `target=_blank`, `window.open`) follows `externalNavigation`: `allow` (the
    default) opens it in the system browser and sends `onOpenExternal`;
    `report` opens nothing and sends `onNavigationBlocked` with `external` or
    `newWindow`; `block` opens nothing and sends nothing.
  - A non-web scheme opens outside the view only when it is in
    `allowedExternalSchemes` (default `mailto`, `tel`, `sms`; an empty list
    allows none). Any other scheme is cancelled and reported as
    `onNavigationBlocked` with reason `scheme`.
  - A pin (`session.pin`: `origin` and an optional `pathPrefix` of whole path
    segments, default `/`) keeps every main-frame navigation, redirects
    included, under that origin and path. Any other is cancelled and reported
    with reason `pin`.
  - The native view decides each navigation on the UI thread from these props.
    No navigation waits on JavaScript; the events reach JavaScript after the
    decision.
- **FR6 — An HTML string has an opaque origin unless granted one.** With
  `{html}` the page has an opaque origin: no site's cookies or storage, and
  relative links do not resolve. With `grantsOrigin: true` and an http or
  https `baseUrl`, the page takes that origin. `html` wins over `url` when both
  are set.
- **FR7 — Bundled folders load from a private origin with no network.**
  - `{bundle: {name, path?}}` loads a folder the app's runtime registered with
    `AstryxWebBundles` under `name` (a DNS label). The page is `path` (default
    `/index.html`) under the bundle's origin: `astryx-bundle://<name>/` on iOS,
    an https origin on a host that never resolves on Android.
  - Every file the page names loads from the folder. Nothing reaches a network,
    and the view's store keeps nothing: no cookies, credentials, or client
    identity. Requests under `/_app/` go to the app over `AstryxWebBundles`'
    byte route.
  - The bundle's origin is the view's only origin: `html`, `url`, `baseUrl`,
    `grantsOrigin`, `ephemeral`, and `allowedOrigins` do not apply. A bundle
    source with `session.pin` or session cookies, a name that is not a DNS
    label, or a path with `..`, `.`, a hidden, or an empty segment loads
    nothing and reports `invalid-config`.
  - A bundle page needs a message channel that tells frames apart (FR9). Where
    the device's channel cannot, nothing loads and `onError` reports
    `unsupported`.
  - Warm-up: with `warm`, a bundle view adopts a loaded page from
    `AstryxWebBundles`' warm pool for its bundle and path on mount. It sends
    `onLoad` at once and then the messages the page sent while it waited, in
    order. A page is adopted by one view and never reused. With no page ready,
    or with a custom user agent, page storage off, or session cookies, the view
    loads its own page with no error.
- **FR8 — Sessions and page storage.**
  - `session` is `{sessionId}` (a handle `AstryxWebSessions.create` answered)
    or options: `isEphemeral`, `pin` (FR5), `allowsPageStorage`, and
    `cookies`. A handle wins over the options. The view resolves the handle
    natively, so the session's cookies never cross as props. An empty or
    unknown handle loads nothing and reports `invalid-config`.
  - `cookies` are set in the view's store before the page loads, each
    HttpOnly, Secure, a session cookie, and host-only for the page's https
    host. They require `isEphemeral`; new code passes a handle instead.
  - `isEphemeral` gives the view a store of its own that keeps nothing:
    iOS's non-persistent data store; on Android a throwaway profile whose
    cookies, storage, and HTTP cache go when the view goes, with no Cache API
    or service workers. It is fixed at the first render.
  - `allowsPageStorage: false` gives the page no `localStorage`,
    `sessionStorage`, IndexedDB, Cache API, or service workers, and its loads
    do not read the HTTP cache; what a load writes to the HTTP cache goes when
    the view goes. A change reloads the page.
  - Views without an ephemeral store share the runtime's page store, which is
    apart from the runtime's network cookie jar where the device can keep them
    apart (the `pageProfile` constant: Android WebView with multiple profiles,
    iOS 17 and later). Where it cannot, those views run with no page storage,
    and clearing the page store never clears the app's network cookies.
- **FR9 — One message channel.**
  - The page sends with `window.astryx.postMessage(string)`. The view accepts a
    message only from the main frame of the page's own origin or an allowed
    origin, and sends `onMessage({data, origin, isMainFrame})`. `origin` and
    `isMainFrame` come from the engine, never from the page's data.
  - The app sends with `ref.postMessage(data)` (the `postMessage` command). The
    page receives it through `window.astryx.addListener` and as a `message`
    event on `window` (`event.data`, a string).
  - Where the device's channel cannot tell frames apart (an Android WebView
    without document-start scripts and a message listener), the binary reports
    `channelIsolation` false and the sender as `origin: "null"`,
    `isMainFrame: false`. A strict app drops those messages.
- **FR10 — The page follows the app's appearance.**
  - `colorScheme` (`light`, `dark`, or `system`) sets the page's
    `prefers-color-scheme`: on iOS through the view's interface style, on
    Android through the CSS `color-scheme` the page script sets, with
    algorithmic darkening off. `NativeWebView` takes the platform appearance's
    scheme when the prop is absent, else `system`.
  - `textScale` (React Native's font scale; default 1) scales the page's text:
    `-webkit-text-size-adjust` on iOS, `textZoom` on Android.
  - `onContentHeight` reports the document's height in dp whenever it changes,
    so a caller lays the page out at its height with `isScrollEnabled: false`
    inside an outer scroll view.
  - `applicationNameForUserAgent` is appended to the user agent, and
    `userAgent` replaces it (and wins). Each takes printable ASCII only;
    otherwise the view keeps the default and reports `invalid-config`.
- **FR11 — A content process end is reported, and the app picks the
  recovery.** When the page's content process ends, the view sends
  `onContentProcessEnded({reason, willReload, url})` with `reason`
  `terminated`, `crashed`, `killed-for-memory`, or `unknown`. It is not a load
  failure and never reaches `onError`. With `reloadsOnContentProcessEnd` true
  (the default) the view loads the page again by itself; on Android it loads it
  in a fresh engine view. With false, the view stays empty until
  `ref.reload()` or a remount, so the screen shows its own card. A content
  process end never ends the app.
- **FR12 — Capture prevention and the link menu.**
  - `preventsCapture` keeps screenshots, screen recordings, and the recents
    image out while the view is in a window (Android's `FLAG_SECURE`, counted
    across views). iOS has no view-level equivalent: it ignores the prop and
    does not report the feature.
  - `linkMenu` describes the menu a long press on a link shows: actions
    (`id`, `title`, an optional icon, `destructive`) with declarative matchers
    (`schemes`, `hosts` with `*.<domain>` patterns that never match a public
    suffix, and whole-segment `pathPrefix`), and a title of the link or none.
    Only http, https, `mailto`, `tel`, and `sms` links get a menu; a matcher
    narrows, never widens. Choosing an action sends
    `onLinkMenuAction({id, href})`, and the view opens nothing. No link preview
    is shown or loaded. A link no action fits gets no menu. `href` comes from
    the page and is untrusted input.
- **FR13 — Loads report results in a closed set.** `onError` receives
  `{ok: false, reason, message, url}` with `reason` from `offline`, `timeout`,
  `ssl`, `invalid-url`, `invalid-config`, `unsupported`, `no-native-view`, and
  `error`; a reason the JavaScript does not know reads `error`
  (`spec:AST-112/FR6`). `message` never carries a URL's query or a cookie. The
  JavaScript refuses a session or source it knows the view cannot honour before
  anything crosses: it renders no host view and reports the reason once per
  refusal and page.
- **FR14 — The binary reports what it honours.**
  `AstryxWebViewInfo.isAvailable()`, `version()`, and `supports(feature)`
  answer for this binary (`spec:AST-112/FR7`). The features are `session`,
  `userAgent`, `hardening`, `externalNavigation`, `sessionHandle`,
  `externalSchemes`, `grantsOrigin`, `channelIsolation`, `preventsCapture`,
  `pageStorage`, `bundledOrigin`, `pageProfile`, `linkMenu`, `messageOrigin`,
  `warmBundle`, and `contentProcessEnd`.
  - A feature one platform implements answers false on the other:
    `preventsCapture` on Android only; `linkMenu` and `warmBundle` on iOS only.
  - `channelIsolation` and `pageProfile` also follow the device's constants
    (FR8, FR9).
  - Without the module (not opted in, Jest, the web), nothing is claimed. The
    library's `useWebViewSupports(feature)` answers the same, and false without
    a web view.
- **FR15 — The library's components wire the theme.** `WebView` renders
  `NativeWebView` with the theme's mode as `colorScheme` and the theme's text
  scale as `textScale`, and hands every event through unchanged, with stable
  handlers so a parent's new callbacks never re-render the native view. It
  passes the session, user agent, navigation, layer type, and content-process
  props it receives. `WebContent` builds on `WebView`: `height: 'auto'` grows
  to the page's height inside the screen's scroll view, `fill` takes the
  parent's space and scrolls, a spinner shows until the first load ends, and a
  failure line with Try again shows when the page does not load.
- **FR16 — Fallbacks when `web` is not linked or the view is absent.**
  - Not opted in: the capability's module still loads; `isNativeWebViewAvailable()`
    and `AstryxWebViewInfo.isAvailable()` answer false, and module calls
    resolve `not-linked` (`spec:AST-112/FR3`). A missing view of an opted-in
    capability reports `no-native-view`.
  - `NativeWebView` where the view is absent renders `fallback` (nothing by
    default) and reports `onError` with `no-native-view` once.
  - `WebView` and `WebContent` where there is no web view (not opted in, Jest,
    the web, or the platform switched off through the capabilities provider)
    render their fallback: the page's text for `html`, or an "Open in browser"
    button for `url` that opens the address through the app's link handling.
    The region keeps its label. `postMessage` does nothing.
  - `useAuthSession()` answers `isAvailable: false`, and its calls resolve
    `no-module`.
- **FR17 — Accessibility.** `WebView` and `WebContent` take a required
  `label`, the region's accessible name. Inside the region, VoiceOver and
  TalkBack read the page's own content through the engine's accessibility
  tree, and the platform adds nothing to it. The page's text follows the
  system text size through `textScale` (FR10). `WebContent`'s loading and
  failure states use the library's `Spinner`, `Text`, and `Button`, so they are
  announced as those are. The link menu is the system's context menu. The
  fallback's text and button are ordinary library content.
- **FR18 — Contract baseline.** Every contract in the group is at revision 1.
  A behaviour added after revision 1 is a named feature
  (`AstryxWebView.<feature>`) that the binary lists and the JavaScript checks
  with `hasContractFeature` before it uses it. Without the feature the
  JavaScript keeps the revision-1 behaviour or answers `unsupported`, never a
  silent weaker path (DEC-5). Compatibility with Astryx Stage goes through the
  library's Stage version floor: the package names the oldest Stage that
  implements its contract set, and an older Stage refuses the project with the
  gaps listed.

### Platform support

| Contract            | iOS                                                                                                                                                                                                                                                              | Android                                                                                                                                                                                                                                                                                                             | Astryx Stage                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxWebView`     | `WKWebView` (WebKit): `WKURLSchemeHandler` for bundled folders, `WKWebsiteDataStore` (non-persistent, or by identifier on iOS 17 and later) for stores, `WKUIDelegate` context menus for the link menu, a warm pool for bundle pages. `preventsCapture` ignored. | `android.webkit.WebView` with AndroidX WebKit: document-start scripts and a web message listener for the channel, profiles for stores, request interception for bundled folders, `FLAG_SECURE` for capture, `onRenderProcessGone` for a content process end (Android 8.0 and later). `linkMenu` and `warm` ignored. | On macOS, the system's `WKWebView`, with the device's navigation, session, page-storage, bundle, message, and content-process behaviour. `preventsCapture` ignored, as on iOS. |
| `AstryxWebViewInfo` | Reports `version` and the device constants; `channelIsolation` always true                                                                                                                                                                                       | Reports `version` and the device constants; `channelIsolation` false on a WebView without document-start scripts and a message listener; `pageProfile` false without multiple profiles                                                                                                                              | Reports what its web view implements                                                                                                                                           |

- FR18 gap: Astryx Stage renders `AstryxWebView` only on macOS; on Linux and
  Windows the view reports absent, and `WebView` and `WebContent` draw their
  fallback.
- FR18 gap: Astryx Stage keeps no warm pages: a `warm` bundle view loads its
  own page, and Stage does not report `warmBundle`.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only), with the
  system web engine the device carries.
- Unsupported behavior: a feature the binary lacks answers false from
  `supports(feature)`, and a load that needs it refuses with `unsupported`
  (FR13, FR14); a view the binary lacks reports itself unavailable and the
  library draws its fallback (FR16).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- None beyond `spec:AST-112`. This record details its FR3 (the `web`
  capability stays opt-in), FR6 (the web view's closed load reasons), FR7 (the
  web view's probes and features), FR8 (the group's revision-1 baseline), and
  FR12 (the web view in Astryx Stage).
- `spec:AST-093/FR5` (every native component is tested and validated the same
  way) applies to `WebView` and `WebContent` unchanged.

## Verification

| Contract | Verification                                                                                                          | Representative states                                                                                                             | Mutation or failure expectation                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Built app with the core only compared with one that opts `web` in; unit tests of the loader                           | `web` opted out; opted in                                                                                                         | An opted-out app links WebKit or the redirect activity, or the library imports the capability outside its loader                           |
| FR2      | Unit tests of `NativeWebView` through the `./testing` doubles                                                         | each source kind; each event; the `ref` handle                                                                                    | An event arrives with more than one argument, or a prop does not reach the host                                                            |
| FR3      | The platform's spec rules check; `contracts.json` against the codegen specs                                           | the view's props, commands, and events; the module's constants                                                                    | A listed member is missing, or a shipped member changes                                                                                    |
| FR4      | Simulator and emulator checks with a hostile page; tests that keep the document-start scripts equal on every platform | a page that opens WebRTC, a pop-up, a file URL, mixed content, a preconnect link, inside an iframe                                | Any of them succeeds                                                                                                                       |
| FR5      | Simulator, emulator, and Astryx Stage scripts                                                                         | an allowed origin; another origin under `allow`, `report`, `block`; a blocked scheme; a pin with a redirect out                   | A navigation outside policy stays in the view, opens without its event, or sends the wrong reason                                          |
| FR6      | Simulator and emulator checks                                                                                         | `html` with and without `grantsOrigin`                                                                                            | An ungranted page reads the base origin's cookies or storage                                                                               |
| FR7      | Unit tests of the refusals; Simulator, emulator, and Astryx Stage scripts of a bundled folder                         | a valid bundle; a bad name or path; a bundle with a pin; a device without channel isolation; `warm` with and without a ready page | A bundle page reaches a network, loads with a refused config, or a warm view loads twice or loses an early message                         |
| FR8      | Unit tests of the session refusals; Simulator and emulator checks of stores                                           | a handle; an empty handle; an ephemeral view; page storage off; a device without separate page profiles                           | A cookie crosses as a prop, an empty handle loads the page, an ephemeral view leaves data behind, or a page-storage-off page keeps storage |
| FR9      | Unit tests through the doubles; Simulator, emulator, and Astryx Stage scripts                                         | both directions; a message from an iframe; a device without channel isolation                                                     | An iframe's message is delivered as the main frame's, or an origin comes from the page's data                                              |
| FR10     | Simulator, emulator, and Astryx Stage renders                                                                         | light, dark, and system schemes; text scale 1 and 2; auto height; a custom user agent                                             | The page ignores the scheme or text scale, the height is stale, or a non-ASCII user agent is applied                                       |
| FR11     | Device-level termination checks on the Simulator and emulator; Astryx Stage scripted process end                      | reload on; reload off then `reload()`                                                                                             | The app ends, the event reaches `onError`, or a view with reload off reloads by itself                                                     |
| FR12     | Emulator check of capture; unit tests of the link-menu matchers shared by every platform; Simulator long press        | a protected view; matchers with schemes, hosts, `*.` over a public suffix, prefixes                                               | A screenshot captures a protected view on Android, a `javascript:` link gets a menu, or a menu loads a preview                             |
| FR13     | Unit tests through the doubles in their absent, older, and current shapes                                             | each reason; an unknown native reason; a refusal                                                                                  | A call throws, a reason falls outside the set, or a refusal crosses to the host                                                            |
| FR14     | Unit tests of `supports` per platform and device constant                                                             | each feature on iOS and Android; no module                                                                                        | A one-platform feature answers true on the other platform, or a device constant is ignored                                                 |
| FR15     | Library tests of `WebView` and `WebContent`                                                                           | a theme change; a parent re-render; auto and fill heights; a failed load                                                          | The native view re-renders on a parent's new callback, or the scheme does not follow the theme                                             |
| FR16     | Library and platform tests with the module absent, not linked, and switched off                                       | `html` and `url` sources without a web view                                                                                       | A fallback is missing, `no-native-view` is reported more than once, or a call rejects                                                      |
| FR17     | VoiceOver and TalkBack checks on the Simulator, emulator, and device; text-size checks                                | a page with headings and links; the largest text size                                                                             | The region has no name, the page's content is not read, or the text does not scale                                                         |
| FR18     | Contract baseline check; Astryx Stage contract suites; Stage version floor check                                      | a binary without a named feature; an older Stage                                                                                  | The JavaScript uses a feature the binary does not list, or an older Stage runs the project                                                 |

## Decision log

### DEC-1 — Navigation policy is declared data the native view enforces

**Reference:** `spec:AST-131/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Allowed origins, the pin, external navigation, and external schemes are props,
and the native view decides each navigation on the UI thread. A pin holds
across redirects, and no navigation waits on JavaScript or races a load.

Rejected: a JavaScript callback per navigation, because it blocks the UI thread
or lets the load run ahead of the answer.

### DEC-2 — One message channel; the sender comes from the engine

**Reference:** `spec:AST-131/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The page and the app talk only through `window.astryx` and the `postMessage`
command. The view accepts only the main frame of the page's own or an allowed
origin, and reports the sender's origin from the engine, so a frame cannot
forge it.

Rejected: an injected-script prop, because any script then runs with the
page's full rights and the channel's rules no longer hold.

### DEC-3 — Sessions cross as native handles

**Reference:** `spec:AST-131/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

An embedded page's cookies, store, and pin are created natively once and
named by an opaque handle that the view's props carry. Cookie values never
appear in props, development tools, or logs.

### DEC-4 — Bundled web content loads from a private origin

**Reference:** `spec:AST-131/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A bundled folder loads from an origin of its own, with no network and a store
that keeps nothing; the page reads the app's data over a byte route the app
answers. The view keeps file access off on every path.

Rejected: loading bundled files through file URLs, because the page would then
need file access.

### DEC-5 — A guarantee the binary cannot keep refuses the load

**Reference:** `spec:AST-131/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

When a caller asks for a privacy or isolation guarantee (page storage off, a
bundled origin, a frame-safe channel) and the binary or device cannot keep it,
nothing loads and `onError` reports `unsupported`. A caller checks
`supports(feature)` first and picks its own path.

Rejected: loading the page without the guarantee, because the person would see
a working page that leaks what the app meant to keep.

## Open questions

- **OQ1 — Does `AstryxWebSessions` stay in the `web` capability's public
  scope when no Astryx component calls it?** (`human-api`) Options: keep it
  public as the handle source for `WebView`'s `session`; or give `WebView` a
  session option that creates and removes the handle itself.
- **OQ2 — Does `AstryxWebData` stay in this group's scope?** (`human-api`)
  Options: keep it in `web` as app API; or move it to the core's storage and
  sign-out surface.
- **OQ3 — Does `AstryxWebBundles` stay in this group's scope, and do
  `WebView` and `WebContent` take a bundle source?** (`human-api`) Options:
  app API through `NativeWebView` only; or a `bundle` prop on the library's
  components.
- **OQ4 — Does `AstryxAuthSession` stay in the `web` capability when no
  Astryx component uses it?** (`human-api`) Options: keep it beside the web
  view with the `useAuthSession` hook; or make sign-in a capability of its
  own.
- **OQ5 — Does `AstryxPageSnapshots` stay in this group's scope?**
  (`human-api`) Options: keep it as app API in `web`; or remove it from the
  public surface.
- **OQ6 — Do `WebView` and `WebContent` expose `preventsCapture`,
  `linkMenu`, and `allowedExternalSchemes`, which only `NativeWebView` takes?**
  (`human-api`)
- **OQ7 — Does Android build the link menu and warm pages, or do they stay
  iOS-only features?** (`human-design`)
- **OQ8 — Does the page's `prefers-reduced-motion` follow the system's Reduce
  Motion setting on both engines?** (`checkable`)
