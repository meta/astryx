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
or payment page in place, or an HTML document the app built. The developer gets one web view that
is safe by default: links to other sites open in the system browser, the page
cannot reach the device's files or open pop-up windows, the page follows the
app's light or dark mode and text size, and the app and the page talk over one
message channel. The person sees the page as part of the screen, and a screen
reader reads the page's own content.

This record details the `web` capability of `spec:AST-112`: the platform layer
and its opt-in capabilities (`spec:AST-112/FR1`, `spec:AST-112/FR3`), and
the capability shape (`spec:AST-112/FR7`). It follows the shared platform rules
of `spec:AST-140`: the result vocabulary (`spec:AST-140/FR3`) and additive
evolution (`spec:AST-140/FR5`). It specifies the native web view
(`AstryxWebView`), its device report (`AstryxWebViewInfo`), and the part of
the session registry (`AstryxWebSessions`) the view depends on, which the
library's `WebView` and `WebContent` use; the three are core, within the
opt-in `web` capability. Web data, bundled web content, web sign-in, and page snapshots are not part of
the `web` capability: no Astryx component uses them, so they are outside the
core package, and an app uses its host platform's implementation or an open-source library for them (`spec:AST-112/FR20`); "Who uses it" lists them.

## Why this exists

- `AstryxWebView`: an app cannot add these guarantees from outside an
  ecosystem web view component, so Astryx owns the view. A pin holds across
  redirects and is decided natively (FR5, DEC-1). A session's cookie values
  never appear in props (FR7, DEC-3). Pages can run with no storage (FR7). The
  message sender comes from the engine (FR8, DEC-2). Loads report closed
  reasons (FR12). The package keeps one dependency set (`spec:AST-112/FR2`).
  Astryx takes no third-party native dependency for the web view; an app may
  use react-native-webview beside these components without conflict
  (`spec:AST-140/FR9`).
- `AstryxWebViewInfo`: it answers what the device can keep (a frame-safe
  channel, separate page data), so a caller that needs a guarantee is refused
  loudly instead of getting a weaker page (DEC-4). OQ5 asks whether it folds
  into the platform info.
- `AstryxWebSessions`: it holds an embedded page's session natively, so
  `WebView` passes a handle instead of cookie values (FR7, DEC-3). OQ6 asks
  whether its create and remove calls belong in this record.
- Web data, bundled web content, web sign-in, and page snapshots: no Astryx
  component uses them, so they are outside the core package and the `web`
  capability, and an app uses its host platform's implementation or an open-source library for them (`spec:AST-112/FR20`).

## Who uses it

| Native piece          | Kind                                       | Astryx components that use it                                                                                                                             | What a person sees                                                                                      |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AstryxWebView`       | native component (Fabric Native Component) | `WebView`; `WebContent` (through `WebView`); apps through the `./web` entry's `NativeWebView`                                                             | A web page or an HTML document inside the screen, in the app's colour scheme and text size              |
| `AstryxWebViewInfo`   | native module (Turbo Native Module)        | `WebView` and `WebContent` (through `NativeWebView`'s checks before a load); the `useWebViewSupports` hook and the capability status of `useCapabilities` | Nothing directly; a page that needs a guarantee the device lacks does not load, and the screen says why |
| `AstryxWebSessions`   | native module (Turbo Native Module)        | `WebView` uses it through its session handle (`session={{sessionId}}`, FR7): the native view resolves the handle; core, within the `web` capability       | A signed-in embedded page                                                                               |
| `AstryxWebData`       | native module (Turbo Native Module)        | No Astryx component uses it; outside the core package and the `web` capability (`spec:AST-112/FR20`)                                                      | Web pages that keep nothing after sign-out                                                              |
| `AstryxWebBundles`    | native module (Turbo Native Module)        | No Astryx component uses it; outside the core package and the `web` capability (`spec:AST-112/FR20`)                                                      | A bundled web app that works offline                                                                    |
| `AstryxAuthSession`   | native module (Turbo Native Module)        | No Astryx component uses it; outside the core package and the `web` capability (`spec:AST-112/FR20`)                                                      | The system's sign-in sheet                                                                              |
| `AstryxPageSnapshots` | native module (Turbo Native Module)        | No Astryx component uses it; outside the core package and the `web` capability (`spec:AST-112/FR20`)                                                      | A thumbnail of an HTML document                                                                         |

Note: `AstryxWebSessions` (core) holds an embedded page's cookies, store, and
pin natively under an opaque handle that the view's `sessionId` prop names
(FR7). The other four rows name native pieces that Astryx does not ship as
part of this capability; an app that needs them uses its host platform's
implementation or an open-source library (`spec:AST-112/FR20`).

## Non-goals

- The contract of the library's `WebView` and `WebContent` components: their
  props, layout, loading and failure states, and fallback content. Each
  component's own record and `spec:AST-082/FR3` own it.
- Web data, bundled web content, web sign-in, and page snapshots
  (`AstryxWebData`, `AstryxWebBundles`, `AstryxAuthSession`,
  `AstryxPageSnapshots`): outside the core package and the `web` capability,
  because no Astryx component uses them (`spec:AST-112/FR20`).
- `AstryxWebSessions` beyond the handle the view depends on (FR7; OQ6).
- Astryx Stage (`spec:AST-139`) and Preview in the Astryx app (`spec:AST-141`) are separate products; they conform to this record's contracts.
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

- **FR1 — `web` is an opt-in capability.** The web view, its device report,
  and the session registry belong to the `web` capability, which an app opts
  in (`spec:AST-112/FR3`). An app that does not opt it in links no web engine.
  The `./web` entry exports `NativeWebView`, `isNativeWebViewAvailable()`,
  `AstryxWebViewInfo`, and `AstryxWebSessions`. The library reaches the
  capability only through `AstryxPlatform.capability('web')`
  (`spec:AST-112/FR2`).
- **FR2 — `NativeWebView` is the platform's web view.** Its props:
  - `source`, one of `{uri}` (an http or https page) or `{html, baseUrl?,
grantsOrigin?}` (an HTML string).
  - Navigation: `allowedOrigins`, `externalNavigation`, `allowedExternalSchemes`
    (FR5); sessions: `session` (FR7).
  - Appearance and layout: `colorScheme`, `textScale`, `isScrollEnabled`,
    `layerTypeAndroid` (`software` by default, or `hardware` for WebGL and
    hardware video), `applicationNameForUserAgent`, and `userAgent` (FR9).
  - `preventsCapture` and `linkMenu` with `onLinkMenuAction` (FR11);
    `reloadsOnContentProcessEnd` (FR10).
  - Events, each with one object argument: `onLoadStart({url})`,
    `onLoad({url, title})`, `onProgress({progress})` (0 to 1),
    `onError(failure)`, `onContentHeight({height})`, `onMessage(event)`,
    `onOpenExternal({url})`, `onNavigationBlocked({url, reason})`, and
    `onContentProcessEnded(event)`.
  - `ref`, a handle with `postMessage(data)` and `reload()`; `fallback`, drawn
    where the view is absent (FR15); `style` and `testID`.
  - Without `allowedOrigins`, the view's own origin is the first page's
    origin alone (FR5).
- **FR3 — The native contract.**

  | Contract        | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                        | Commands                | Events                                                                                                                                                                                               | Platforms    |
  | --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
  | `AstryxWebView` | native component (Fabric Native Component) | `html`, `baseUrl`, `url`, `grantsOrigin`, `allowedOrigins`, `externalNavigation`, `allowedExternalSchemes`, `noExternalSchemes`, `pinnedOrigin`, `pinnedPathPrefix`, `sessionId`, `ephemeral`, `allowsPageStorage`, `colorScheme`, `textScale`, `scrollEnabled`, `layerTypeAndroid`, `applicationNameForUserAgent`, `userAgent`, `preventsCapture`, `linkMenu`, `reloadsOnContentProcessEnd` | `postMessage`, `reload` | `onWebLoadStart`, `onWebLoad`, `onWebError`, `onWebProgress`, `onWebContentHeight`, `onWebMessage`, `onWebOpenExternal`, `onWebNavigationBlocked`, `onWebLinkMenuAction`, `onWebContentProcessEnded` | iOS, Android |

  | Contract            | Kind                                | Methods                                                                                | Platforms    |
  | ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
  | `AstryxWebViewInfo` | native module (Turbo Native Module) | `getConstants()`: the device constants `channelIsolation` and `pageProfile` (FR7, FR8) | iOS, Android |
  - `noExternalSchemes` is the host's form of an empty
    `allowedExternalSchemes` (FR5).
  - Each contract's baseline is its first release's shape
    (`spec:AST-140/FR5`). The web view's named features (FR13) are listed with
    every other contract's by the platform info module (`spec:AST-130`);
    `AstryxWebViewInfo`
    carries no feature list and no revision number.

- **FR4 — Safe defaults.** A page in the view cannot read local files or
  content URIs, cannot open a second window, cannot ask for the device's
  location, and cannot load http content into an https page. Before the
  page's own script runs, every frame that runs script, the main frame and
  iframes alike, loses WebRTC (`RTCPeerConnection`, `navigator.mediaDevices`),
  DNS prefetching, and the `preconnect` relation on links; a same-origin
  frame the page creates is covered when the page reaches it. The view's only
  other script in a page is its own page script, which
  carries the message channel (FR8), the colour scheme and text scale (FR9),
  and the content height. No prop lets a caller add a script.

  FR4 gap: without the opt-in of FR18, a `preconnect` link that the HTML
  parser inserts, or one in a frame that runs no script, can still open a
  connection, and a new blank frame can reach WebRTC before the protection
  covers it.

- **FR5 — Navigation follows declared policy, decided natively.**
  - The view shows the first page, and any top-level page on that page's
    origin or on an origin listed in `allowedOrigins`. The first page's origin
    is the origin of the source the caller passed (`url`, or `baseUrl` with
    `grantsOrigin`), whatever the first load's redirects reach. An HTML string
    without `grantsOrigin` has an opaque origin, which no web origin matches,
    so only `allowedOrigins` keep a navigation in the view. The policy covers
    top-level navigation only; images, scripts, and frames load as the
    page's own rules allow.
  - A top-level navigation to any other origin that a person causes (tapping
    a link, sending a form, a `target=_blank` link, `window.open`) follows
    `externalNavigation`: `allow` (the default) opens it in the system browser
    and sends `onOpenExternal`; `report` opens nothing and sends
    `onNavigationBlocked` with `external` or `newWindow`; `block` opens
    nothing and sends nothing.
  - A top-level navigation that no person caused (a server redirect, a
    script, a meta refresh) stays in the view whatever its origin, and sends
    no event; only a pin limits it. A page reached that way does not change
    the view's own origin: a person's link or form there to an origin that is
    neither the first page's nor allowed follows `externalNavigation`, and
    on a device with channel isolation the message channel does not accept
    that page's messages (FR8).
  - A non-web scheme opens outside the view only when it is in
    `allowedExternalSchemes` (default `mailto`, `tel`, `sms`; an empty list
    allows none). Any other scheme is cancelled and reported as
    `onNavigationBlocked` with reason `scheme`.
  - A pin (`session.pin`: `origin`, and `pathPrefix` matched by whole path
    segments, `/` when absent) limits every top-level navigation to that
    origin and path, and a redirect counts as a navigation. The view stops a
    navigation outside the pin and reports it with reason `pin`.
  - No navigation waits on JavaScript: the view decides from these props, and
    the events reach JavaScript after the decision.
- **FR6 — An HTML string has an opaque origin unless granted one.** With
  `{html}` the page has an opaque origin: no site's cookies or storage, and
  relative links do not resolve. With `grantsOrigin: true` and an http or
  https `baseUrl`, the page takes that origin. `html` wins over `url` when both
  are set.
- **FR7 — Sessions and page storage.**
  - `session` is `{sessionId}` (a handle `AstryxWebSessions.create` answered)
    or options: `isEphemeral`, `pin` (FR5), and `allowsPageStorage`. A handle
    wins over the options. An empty or unknown handle loads nothing and
    reports `invalid-config`.
  - The part of `AstryxWebSessions` the view depends on: a handle works only
    in the runtime that created it, and the session's cookies, ephemeral
    store, page-storage setting, and pin apply to the view without their
    values appearing in its props. A view that loaded with a session keeps
    it after `AstryxWebSessions.remove`.
  - `isEphemeral` gives the view a private store that leaves no data behind:
    its cookies, storage, and HTTP cache are gone when the view goes, and the
    page has no Cache API or service workers. The view reads the option once,
    when it first renders.
  - `allowsPageStorage: false` gives the page no `localStorage`,
    `sessionStorage`, IndexedDB, Cache API, or service workers, and its loads
    do not use cached responses; what a load caches is gone when the view
    goes. A change reloads the page.
  - Pages in views without an ephemeral store share the runtime's page data.
    Where the device can keep it apart from the app's network cookies (the
    `pageProfile` constant), it is kept apart. Where it cannot, those pages
    run with no page storage. The `web` capability has no call that clears
    the shared page data; an app that needs one uses its host platform's
    implementation (`spec:AST-112/FR20`).
- **FR8 — One message channel.**
  - The page sends with `window.astryx.postMessage(string)`. On a device with
    channel isolation, the view accepts a message only from the main frame,
    and only when that frame is on the first page's origin (FR5) or an allowed
    origin, and sends `onMessage({data, origin, isMainFrame})`. `origin` and
    `isMainFrame` come from the engine, never from the page's data.
  - The app sends with `ref.postMessage(data)` (the `postMessage` command). The
    page receives it through `window.astryx.addListener` and as a `message`
    event on `window` (`event.data`, a string).
  - Where the device's web engine cannot tell frames apart, the binary reports
    `channelIsolation` false and the sender as `origin: "null"`,
    `isMainFrame: false`. An app that must know the sender ignores those
    messages.
- **FR9 — The page follows the app's appearance.**
  - `colorScheme` (`light`, `dark`, or `system`) sets what the page reads from
    `prefers-color-scheme`, and the engine does not darken the page by
    itself. Without the prop, `NativeWebView` takes the platform appearance's
    scheme, else `system`.
  - `textScale` scales the page's text. Without the prop, it is the system's
    font scale, so the page's text follows the person's text size.
  - `onContentHeight` reports the document's height in dp whenever it changes,
    so a caller lays the page out at its height with `isScrollEnabled: false`
    inside an outer scroll view.
  - `applicationNameForUserAgent` is appended to the user agent, and
    `userAgent` replaces it (and wins over the appended name). A value with
    anything other than printable ASCII is not applied: the default user agent
    stays, and `onError` reports `invalid-config`.
- **FR10 — A content process end is reported, and the app picks the
  recovery.** When the page's content process ends, the view sends
  `onContentProcessEnded({reason, willReload, url})` with `reason`
  `terminated`, `crashed`, `killed-for-memory`, or `unknown`. `onError` does
  not fire for it, because the page loaded. With `reloadsOnContentProcessEnd`
  true (the default) the view reloads the page on its own. With false, the
  view shows nothing until the app calls `ref.reload()` or mounts it again, so
  the screen can show its own message. The app keeps running in every case.
  Android reports a content process end from Android 8.0; before it, the
  binary reports `contentProcessEnd` as not supported, and a content process
  end can end the app.
- **FR11 — Capture prevention and the link menu.**
  - `preventsCapture` keeps screenshots, screen recordings, and the app
    switcher's image of the window out while the view is on screen, however
    many views ask for it. iOS has no view-level equivalent: it ignores the
    prop, shows the page, and reports the feature as not supported, so capture
    prevention there is best effort. A caller that requires it checks
    `supports('preventsCapture')` first.
  - `linkMenu` describes the menu a long press on a link shows: actions
    (`id`, `title`, an optional icon, `destructive`) with declarative matchers
    (`schemes`, `hosts` with `*.<domain>` patterns that never match a public
    suffix, and whole-segment `pathPrefix`), and a title of the link or none.
    A menu appears only for http, https, `mailto`, `tel`, and `sms` links; a
    matcher can exclude links but cannot add a scheme. When a person picks an
    action, the view sends `onLinkMenuAction({id, href})` and does not follow
    the link. The menu never loads or shows a preview of the target. When no
    action matches, the long press shows no menu. The page controls `href`,
    so the app validates it before acting on it.
- **FR12 — Loads report results in a closed set.** `onError` receives
  `{ok: false, reason, message, url}` with `reason` from `offline`, `timeout`,
  `ssl`, `invalid-url`, `invalid-config`, `unsupported`, `no-native-view`, and
  `error`; a reason the JavaScript does not know reads `error`
  (`spec:AST-140/FR3`). `message` never carries a URL's query or a cookie. The
  JavaScript checks the session and the source first. When it knows the view
  cannot honour them, it does not render the host view and reports the reason
  through `onError` one time for that page.
- **FR13 — The web view's behaviour beyond the baseline is named features.**
  `AstryxWebView`'s baseline is loading a page or an HTML string, the safe
  defaults (FR4), navigation to the page's own and allowed origins, the
  colour scheme, text scale, and content height (FR9), the message channel
  without sender fields, and the load events (FR12). Every other behaviour is
  a named contract feature, `AstryxWebView.<feature>`: `session`,
  `userAgent`, `externalNavigation`, `sessionHandle`,
  `externalSchemes`, `grantsOrigin`, `channelIsolation`, `preventsCapture`,
  `pageStorage`, `pageProfile`, `linkMenu`, `messageOrigin`, and
  `contentProcessEnd` (`spec:AST-140/FR5`).
  - The binary of each platform reports every feature by the same name, with
    `isSupported` false and a note on a platform that lacks it
    (`spec:AST-140/FR5`): `preventsCapture` on iOS; `linkMenu` on Android.
  - `AstryxWebViewInfo.supports(feature)` answers true when the binary reports
    the feature as supported and, for `channelIsolation` and `pageProfile`, the device's
    constant is not false; `contentProcessEnd` also needs Android 8.0 or
    later (FR10). `isAvailable()` answers whether the module is
    linked. Without it (not opted in, Jest, the web), nothing is claimed.
  - The library's `useWebViewSupports(feature)` answers the same, and false
    without a web view.
- **FR14 — The caller supplies the appearance.** `NativeWebView` has no
  theme of its own. Its caller passes the colour scheme and text scale to use
  (the library passes its theme's), and the view applies a new value to the
  loaded page. The view's events are the same one-object shapes the library
  hands to its own callers.
- **FR15 — Fallbacks when `web` is not linked or the view is absent.**
  - Not opted in: the capability's module still loads; `isNativeWebViewAvailable()`
    and `AstryxWebViewInfo.isAvailable()` answer false, and module calls
    resolve `not-linked` (`spec:AST-112/FR3`, `spec:AST-140/FR2`). A missing view of an opted-in
    capability reports `no-native-view`.
  - `NativeWebView` where the view is absent renders `fallback` (nothing by
    default) and reports `onError` with `no-native-view` once.
  - Where there is no web view (not opted in, Jest, the web, or the platform
    switched off through the capabilities provider), the library's components
    draw their own fallback; their records own its content. The handle's
    `postMessage` does nothing there.
- **FR16 — Accessibility.** The engine exposes the page's own structure
  (headings, links, form fields, text) to VoiceOver and TalkBack, and the
  platform neither adds to it nor hides it. The view has no accessible name of
  its own: the caller names the region on a containing view (the library's
  components require a label). The page's text follows the system text size
  through `textScale` (FR9). The link menu is the system's context menu.
- **FR17 — Contract baseline.** Each contract's baseline is its first
  release's shape (`spec:AST-140/FR5`). JavaScript checks a named feature
  (FR13) before it uses the behaviour; without it, JavaScript keeps the
  baseline behaviour or answers `unsupported`, never a silent weaker path
  (DEC-4).
- **FR18 — Native code uses public platform API only.** The web view and its
  core modules (`AstryxWebViewInfo`, `AstryxWebSessions`) use only public
  platform API (`spec:AST-112/FR4`). One exception exists, and it is off by
  default: an app may opt in through its configuration
  (`web.privateHardening`) to private `WKPreferences` setters and WebKit
  feature flags that turn peer connections, media devices, DNS prefetching,
  and link preconnect off in every frame on iOS. WebKit has no public setting
  for them, and they cover frames that the page-level protection of FR4
  cannot reach. The view checks that the running WebKit answers to each
  setting before it uses it, and the app that opts in takes the review risk
  of private API. Without the opt-in, FR4's protection is the same on both
  platforms.

### Platform support

| Contract            | iOS                                                                                                                                    | Android                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxWebView`     | WebKit (`WKWebView`). Every named feature except `preventsCapture`, which iOS ignores because it has no view-level capture protection. | Android System WebView (`android.webkit.WebView`) with AndroidX WebKit. Every named feature except `linkMenu`, which Android ignores. A content process end is reported on Android 8.0 and later. |
| `AstryxWebViewInfo` | `channelIsolation` is true; `pageProfile` is true on iOS 17 and later.                                                                 | Both constants follow the installed WebView: `channelIsolation` needs its frame-aware message support, `pageProfile` its support for separate profiles.                                           |

- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only), with the
  system web engine the device carries.
- Unsupported behavior: a feature the binary lacks answers false from
  `supports(feature)`, and a load that needs it refuses with `unsupported`
  (FR12, FR13); a view the binary lacks reports itself unavailable and the
  library draws its fallback (FR15).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Relies on `spec:AST-112` FR1 (amended): the `web` capability holds the web
  view, its device report, and the session registry.
- Relies on `spec:AST-112` FR20 (amended): native capabilities no Astryx
  component uses are outside the core package, and an app uses its host
  platform's implementation or an open-source library for them; web data,
  bundled web content, web sign-in, and page snapshots are such
  capabilities.
- Relies on `spec:AST-112` FR7 (amended): each group of the platform has its
  own record, and this is the web group's.
- Relies on `spec:AST-112` FR3 (amended): the `web` capability is a device
  feature an app opts in; Astryx's components link by default.
- Relies on `spec:AST-112` FR4 (amended): native code uses public platform
  API only, and a record names any exception (FR18).
- Relies on `spec:AST-140` FR5: each contract's baseline is its first
  release's shape, later behaviour is a named feature the platform info
  module lists, and a contract has no revision number (FR3, FR13, FR17).
- `spec:AST-093/FR5` (every native component is tested and validated the same
  way) applies to `WebView` and `WebContent` unchanged.

## Verification

| Contract | Verification                                                                                                                                              | Representative states                                                                                                                                                                                                                                                     | Mutation or failure expectation                                                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Built app with the core only compared with one that opts `web` in; unit tests of the loader; the `./web` export list                                      | `web` opted out; opted in                                                                                                                                                                                                                                                 | An opted-out app links WebKit, `./web` exports a module outside the core package, or the library imports the capability outside its loader                                                                                                           |
| FR2      | Unit tests of `NativeWebView` through the `./testing` doubles                                                                                             | each source kind; each event; the `ref` handle                                                                                                                                                                                                                            | An event arrives with more than one argument, or a prop does not reach the host                                                                                                                                                                      |
| FR3      | The platform's spec rules check of the codegen specs                                                                                                      | the view's props, commands, and events; the module's constants                                                                                                                                                                                                            | A listed member is missing, a shipped member changes, or a contract carries a revision number or a feature list of its own                                                                                                                           |
| FR4      | Simulator and emulator checks with a hostile page; tests that keep the page protection equal on every platform; the same checks with FR18's opt-in on iOS | a page that opens WebRTC, a pop-up, a file URL, mixed content, a preconnect link, inside a scripted iframe; a parser-inserted preconnect link and a new blank frame (the named gap)                                                                                       | Any of them succeeds in a frame that runs script, or the named gap is not closed on iOS with the opt-in                                                                                                                                              |
| FR5      | Simulator and emulator scripts                                                                                                                            | an allowed origin; another origin under `allow`, `report`, `block`; a blocked scheme; a pin with a redirect out; a script navigation and a server redirect to another origin; a first load that redirects; a person's form on a page a redirect reached on another origin | A navigation outside policy stays in the view, opens without its event, or sends the wrong reason; a navigation no person caused leaves the view or sends an event; or the first page's origin follows its redirects; or that form stays in the view |
| FR6      | Simulator and emulator checks                                                                                                                             | `html` with and without `grantsOrigin`                                                                                                                                                                                                                                    | An ungranted page reads the base origin's cookies or storage                                                                                                                                                                                         |
| FR7      | Unit tests of the session refusals; Simulator and emulator checks of page data                                                                            | a handle; an empty handle; a handle from another runtime; an ephemeral view; page storage off; a device without separate page data                                                                                                                                        | A cookie value appears in props, an empty or foreign handle loads the page, an ephemeral view leaves data behind, or a page-storage-off page keeps storage                                                                                           |
| FR8      | Unit tests through the doubles; Simulator and emulator scripts                                                                                            | both directions; a message from an iframe; a device without channel isolation; a page a redirect reached on another origin                                                                                                                                                | An iframe's message is delivered as the main frame's, an origin comes from the page's data, or a message from a page outside the first page's and allowed origins is delivered                                                                       |
| FR9      | Simulator and emulator renders                                                                                                                            | light, dark, and system schemes; no `textScale` at the largest system text size; text scale 2; auto height; a custom user agent                                                                                                                                           | The page ignores the scheme or text scale, unscaled text without the prop, a stale height, or a non-ASCII user agent applied                                                                                                                         |
| FR10     | Device-level termination checks on the Simulator and emulator                                                                                             | reload on; reload off then `reload()`; Android 7.x                                                                                                                                                                                                                        | The app ends, the event reaches `onError`, or a view with reload off reloads by itself, or Android 7.x reports `contentProcessEnd` as supported                                                                                                      |
| FR11     | Emulator check of capture; unit tests of the link-menu matchers shared by every platform; Simulator long press                                            | a protected view; matchers with schemes, hosts, `*.` over a public suffix, prefixes                                                                                                                                                                                       | A screenshot captures a protected view on Android, a `javascript:` link gets a menu, or a menu loads a preview                                                                                                                                       |
| FR12     | Unit tests through the doubles in their absent, older, and current shapes                                                                                 | each reason; an unknown native reason; a refusal                                                                                                                                                                                                                          | A call throws, a reason falls outside the set, or a refusal crosses to the host                                                                                                                                                                      |
| FR13     | Unit tests of `supports` through `./testing` doubles of binaries with and without each feature, per platform and device constant                          | each feature on iOS and Android; no module                                                                                                                                                                                                                                | A feature answers true when the binary reports it as not supported, a feature a platform lacks is reported supported there or missing from the report, or a device constant is ignored                                                               |
| FR14     | Platform tests through the `./testing` doubles                                                                                                            | a colour scheme or text scale change on a loaded page                                                                                                                                                                                                                     | The new value does not reach the page, or an event's shape differs from the library's                                                                                                                                                                |
| FR15     | Platform tests with the module absent, not linked, and switched off                                                                                       | a `NativeWebView` with and without `fallback`; a module call                                                                                                                                                                                                              | `fallback` is not drawn, `no-native-view` is reported more than once, or a call rejects                                                                                                                                                              |
| FR16     | VoiceOver and TalkBack checks on the Simulator, emulator, and device; text-size checks                                                                    | a page with headings, links, and a form; the largest text size                                                                                                                                                                                                            | The page's content is not read, the platform hides part of it, or the text does not scale                                                                                                                                                            |
| FR17     | Unit tests through `./testing` doubles of a binary without a named feature                                                                                | each named feature absent                                                                                                                                                                                                                                                 | The JavaScript uses a feature the binary does not list, or falls back silently instead of keeping the baseline behaviour or answering `unsupported`                                                                                                  |
| FR18     | Source check of the native code's symbols on both platforms; Simulator check with the opt-in on and off                                                   | the default app; an app that opts in to `web.privateHardening`                                                                                                                                                                                                            | A private symbol is used without the opt-in, or on Android at all                                                                                                                                                                                    |

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
command. On a device with channel isolation, the view accepts only the main
frame of the first page's or an allowed origin, and reports the sender's
origin from the engine, so a frame cannot forge it.

Rejected: an injected-script prop, because any script then runs with the
page's full rights and the channel's rules no longer hold.

### DEC-3 — Sessions cross as native handles

**Reference:** `spec:AST-131/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

An embedded page's cookies, store, and pin are created natively once and
named by an opaque handle that the view's props carry. Cookie values never
appear in props, development tools, or logs.

### DEC-4 — A guarantee the binary cannot keep refuses the load

**Reference:** `spec:AST-131/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

When a caller asks for a privacy or isolation guarantee (page storage off, a
frame-safe channel) and the binary or device cannot keep it,
nothing loads and `onError` reports `unsupported`. A caller checks
`supports(feature)` first and picks its own path.

Rejected: loading the page without the guarantee, because the person would see
a working page that leaks what the app meant to keep.

## Open questions

- **OQ1 — Does `WebView` create and remove its session handle itself?**
  (`human-api`) Options: the caller creates the handle with
  `AstryxWebSessions` and passes `session={{sessionId}}`; or `WebView` takes
  the session's options and manages the handle for the caller.
- **OQ2 — Do `WebView` and `WebContent` expose `preventsCapture`,
  `linkMenu`, and `allowedExternalSchemes`, which only `NativeWebView` takes?**
  (`human-api`)
- **OQ3 — Does Android build the link menu, or does it stay an iOS-only
  feature?** (`human-design`)
- **OQ4 — Does the page's `prefers-reduced-motion` follow the system's Reduce
  Motion setting on both engines?** (`checkable`)
- **OQ5 — Do the device constants of `AstryxWebViewInfo` move into the
  platform info?** (`human-api`) The named features already live in the
  platform info's list (FR3, FR17). Options: keep `AstryxWebViewInfo` for
  `channelIsolation` and `pageProfile`; or report both through the platform
  info and remove the module.
- **OQ6 — Do `AstryxWebSessions`' create and remove calls belong in this
  record?** (`human-api`) FR7 holds the handle part the view depends on.
  Options: specify the module's calls here beside the view; or keep this
  record to the handle and give the calls a record of their own.
