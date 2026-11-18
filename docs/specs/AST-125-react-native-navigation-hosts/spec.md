---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-125
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

# React Native platform: Navigation hosts system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer builds an app with screens that push and pop, tabs, headers, and
search, and the person using it gets the platform's own navigation: the iOS
navigation bar with its large title, back swipes and Liquid Glass, the iOS tab
bar with its minimize and bottom accessory, and on Android a Material 3 app bar,
a navigation bar or rail, and predictive back. The developer writes this once,
with the Astryx router (`@astryxdesign/react-native/navigation`), and never
touches native code. The navigation hosts are the native half of that router:
six native components that hold the stack and tab containers, and one
JavaScript protocol through which host-facing UI reads and drives the router's
state.

This record details `spec:AST-112` for one group of the platform layer. It
uses the platform layer and its capability loader (`spec:AST-112/FR1`,
`spec:AST-112/FR2`), the result vocabulary (`spec:AST-112/FR6`), the capability
shape (`spec:AST-112/FR7`), additive evolution (`spec:AST-112/FR8`), and Astryx
Stage as the contract developers build against (`spec:AST-112/FR12`). It
applies `spec:AST-112/DEC-9`: Astryx owns navigation, routing included.

## Why this exists

React Navigation and Expo Router, over react-native-screens, are mature: they
give React Native apps a typed router, deep links, native stack containers, and
system headers and tab bars. Astryx keeps their names and semantics where they
fit (the navigator and option names, `navigate`, `usePreventRemove`). It does
not build on them, for these reasons:

| Piece                        | What the ecosystem does well                                                                                | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack host and screen        | react-native-screens wraps UINavigationController and Android fragments, with headers, transitions and back | Its headers, back gestures and transitions are built-in UI that Astryx cannot theme or replace, and its gestures couple to the platform's. Astryx's gesture and drag layer must decide ownership between a stack's back swipe, a sheet over the stack and a scroll view inside it (`spec:AST-112/DEC-9`); sheets over stacks go through Astryx's own presentation host. |
| Header slot                  | react-native-screens hosts React subviews in the navigation bar                                             | No gap of its own: it exists because the stack screen exists, and it carries Astryx's measure and press rules into the bar.                                                                                                                                                                                                                                             |
| Search and large title       | react-native-screens maps search bar options onto UISearchController                                        | Astryx needs one search model across a UIKit-level field (iOS) and its own drawn field (Android, drawn chrome) with one set of options and insets, and a large title that collapses with Astryx's scroll target.                                                                                                                                                        |
| Tabs host, screen, accessory | react-native-screens and React Navigation's native bottom tabs wrap UITabBarController                      | The tab bar's minimize, the iOS 26 bottom accessory, re-select through the stack's own guard, and a Material bar or rail must follow Astryx's theme and insets and work with Astryx's stack host.                                                                                                                                                                       |
| Android back                 | react-native-screens supports predictive back on its stack                                                  | Predictive back must respect Astryx's back registry (sheets, menus and search fields that consume back) and the router's prevent-remove guard before the gesture starts.                                                                                                                                                                                                |
| Router protocol              | React Navigation exposes its state through its container and listeners                                      | Astryx Stage, the Astryx app's preview chrome, and a development inspector read one serialisable, revisioned snapshot and open paths through the app's own linking, the same in Stage and on devices (`spec:AST-112/FR12`).                                                                                                                                             |

One dependency set also matters: an app that navigates with the Astryx router
runs no third-party native navigation code, and the package's only peers
outside Astryx stay React and React Native (`spec:AST-112/FR2`).

## Who uses it

| Native piece       | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                   | What a person sees                                                                                 |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AstryxStackHost    | native component (Fabric Native Component) | The router's stack navigator (`createStack` in the `./navigation` entry), in both system and drawn chrome; the drawn chrome draws `Header` (`Header.ForNavigation`) inside its screens                                                                                          | Native push and pop transitions, the back swipe, Android predictive back                           |
| AstryxStackScreen  | native component (Fabric Native Component) | The router's stack navigator; `ScreenView` and `StackHeader` (they set a screen's options); `ScreenScroll` (the screen's scroll target); the header search row, drawn with `SearchField`                                                                                        | The navigation bar: titles, large title, back button, bar buttons and menus, toolbar, search field |
| AstryxHeaderSlot   | native component (Fabric Native Component) | The router's stack navigator, for a screen's `headerTitle`, `headerLeft` and `headerRight` given as React                                                                                                                                                                       | A custom title view or bar button in the system bar                                                |
| AstryxTabsHost     | native component (Fabric Native Component) | The router's tab navigator (`createTabs`) with system chrome                                                                                                                                                                                                                    | The system tab bar (iOS) or a Material navigation bar or rail (Android)                            |
| AstryxTabScreen    | native component (Fabric Native Component) | The router's tab navigator with system chrome                                                                                                                                                                                                                                   | Each tab's icon, label and badge, and the tab's content                                            |
| AstryxTabAccessory | native component (Fabric Native Component) | The router's tab navigator, for its `bottomAccessory` option                                                                                                                                                                                                                    | A bar above the tab bar (a mini player), inline beside a minimized bar on iOS 26                   |
| AstryxRouter       | protocol (JavaScript)                      | The router provides it: `NavigationRoot` (its handle) and `createNavigationRef()` carry the four methods, and `useNavigationInspector` reads it. No other Astryx component reads it; apps (`useRouterState`), Astryx Stage's address bar and the Astryx app's preview chrome do | An address bar or route list that shows and opens the app's routes                                 |

The drawn tab bar (`TabBar.ForNavigation`) and the drawn modal route
(`BottomSheet`) render no navigation host.

## Non-goals

- Routing semantics: the state tree, actions, `navigate` rules, linking
  configuration and persistence format belong to the router's own records; this
  record names only what the hosts and the protocol expose.
- Presentation of sheets and modals: the platform's presentation host owns
  native sheets; a stack's modal routes reach it, not the stack host.
- Safe-area measurement outside navigation: the core's safe-area provider owns
  window insets; the hosts report screen insets only.
- How an app chooses system or drawn chrome (OQ1).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The router owns state and URLs; the hosts own the native containers.**
  - The router (`NavigationRoot`, `createStack`, `createTabs`) holds every
    route, its params, focus, linking and persistence. The hosts hold no route
    list of their own: after each mount the stack host diffs its active screens
    against the native stack and applies the difference (push, pop to a prefix,
    or one replacement), and while a transition runs it waits, then diffs again.
  - The hosts own what the system draws and moves: the native stack and tab
    containers, transitions, back gestures, bars, large titles, search fields,
    bar items and menus, toolbars, tab bar minimize, the tab accessory,
    scroll-edge and bar behaviour, and the insets they report.
  - A native change reaches the router as an event, which the router applies as
    one action. Every event carries the router's `navigatorKey` and, where it
    concerns a route, its `routeKey`.
  - The hosts are reached only by the router (and an optional router adapter,
    `spec:AST-112/FR2`) through the package's internal host entry; an app
    imports the router, never a host.
- **FR2 — The AstryxRouter protocol.** One serialisable, revisioned view of a
  root's routes for host-facing UI.
  - `getRouterState()` returns the host root's snapshot, or `undefined` when no
    root is mounted. `subscribeRouterState(listener)` calls the listener with
    each new snapshot, published on commits only, and returns an unsubscribe
    function. `useRouterState()` is the hook form: inside a root, that root's;
    outside, the host root's.
  - A snapshot holds `revision`, `seq` (one more per published change of its
    root), `routes` (depth first: `key`, `name`, JSON-safe `params`, `path`,
    `presentation`, `focused`, `navigator`, `depth`, `parentKey`),
    `focusedKey`, `focusedPath`, `canGoBack` and `hasLinking`. It is
    immutable, and no store, tree or navigation object leaks through it.
  - `navigateToPath(pathOrURL)` opens a path or in-app URL through the root's
    linking and returns true only when the app went somewhere. A URL that is not
    in-app, matches nothing, or fails the config returns false and is never
    handed to the system. `canOpenPath(path)` answers whether a path parses and
    prints back to the same path; it never dispatches.
  - The same four functions exist per root on the root's handle and on
    `createNavigationRef()`. Astryx Stage and the Astryx app's preview chrome
    read the host root through a global bridge that the host installs; an app's
    mount never installs it.
  - A change to the snapshot's shape or meaning, or to the bridge's members,
    changes `revision` (`RouterStateRevision`).
- **FR3 — The stack host.** A native stack container whose children are
  `AstryxStackScreen`s.
  - `canPop` (no active prevent-remove guard), `swipeEnabled` (`canPop` and the
    top screen's `gestureEnabled`), `backEnabled` (`canPop` and no JavaScript
    back consumer) and `popToRootEnabled` (no guard above the root) are
    published by the router and default to false, so nothing pops natively until
    the router allows it.
  - The back button and the VoiceOver escape show when the stack is deeper than
    one screen; they pop when `canPop` and otherwise emit `onBackPrevented`
    with `source: 'button' | 'escape'`. A stack's root never shows a back
    button.
  - `onWillShow` and `onDidShow` (`animated`) mark a transition's start and
    end. `onGestureCancel` reports a cancelled interactive pop. `onNativePop`
    reports, once per settled transition, every route the system removed (back
    button, its menu, a swipe, system back), and the router removes exactly
    those in one action.
  - A route the router removes stays mounted with `active: false` until the
    host emits `onScreenDismissed`, so its content stays drawn while the
    system animates the pop.
  - `onPopStart` fires on the leaving top screen when the system starts a pop,
    before its transition begins, with `source`: `gesture` (the start of a
    back swipe or predictive back gesture), `key` (Android system back without
    a gesture, a hardware key, TalkBack, or the iOS VoiceOver escape) or
    `button` (the back button or its menu). A pop or `onGestureCancel` follows
    it. It never fires for a pop the router asked for, a prevented back, or a
    tab re-select. The router delivers it as the leaving screen's `popStart`
    event with `data: {source, routeKey}`; a handler starts work as the pop
    begins, and the pop is not held for it.
  - `colorScheme` (`unspecified | light | dark`) sets the container's interface
    style, which the system bars' material, buttons and search field follow;
    the router sends the theme's chrome appearance, and `unspecified` follows
    the system in the same frame.
  - `estimatedWidth` and `estimatedHeight` size a new screen's first layout
    until its container reports the real size.
- **FR4 — Back gestures belong to the stack host and are gated before they
  start.**
  - iOS: the edge swipe, and on iOS 26 the system's content swipe, under the
    top screen's `gestureEnabled`. Below iOS 26, `fullScreenGestureEnabled`
    adds a full-width swipe that vertical scroll views wait for; horizontal
    gestures inside the screen go through the core gesture owner's back-swipe
    gate.
  - Android: system back, the predictive back gesture (it scrubs the
    transition; `backPreview: 'shrink'` shrinks the leaving screen over the one
    below) and TalkBack's back pop only while `backEnabled`, the depth and the
    top screen allow; otherwise React Native's back handling runs, where sheets,
    menus, search fields and the router consume it.
  - A prevent-remove guard turns `canPop` off before any gesture, so the
    system never starts a swipe the router would refuse.
- **FR5 — The stack screen carries each screen's chrome.** Its props have the
  meaning of the router's stack option of the same name; booleans are
  positive.
  - Header: `title`, `headerShown`, `headerTransparent`, `headerShadowVisible`,
    `headerLargeTitleEnabled`, `headerLargeTitleInRow` (the large title in the
    bar row, never collapsing), `headerSubtitle`, `headerLargeSubtitle`,
    `headerTitleStyle`, `headerLargeTitleStyle` (scaled with Dynamic Type),
    `headerTintColor`, `headerStyle` (an opaque bar colour; on Android also the
    colour and hairline once content scrolls under it).
  - Back: `headerBackVisible`, `headerBackTitle` (`''` is the chevron only),
    `headerBackButtonDisplayMode`, `headerBackButtonMenuEnabled`.
  - Items: `headerLeftItems`, `headerRightItems` and `toolbarItems` are data in
    visual order with a stable `id` (`kind`: button, menu, spacer, flexible
    spacer, status; icon as a system symbol, an Astryx glyph with its vector
    drawing, or an image URI; badge, selected, disabled, hidden, prominent,
    shared background, accessibility label and hint). A menu or the title menu
    (`headerTitleMenu`) is the system menu's spec as JSON. `onBarItemPress
{routeKey, id}` and `onMenuSelect {routeKey, barItemId, menuItemId}` report
    presses.
  - Header slots: a screen's React `headerTitle`, `headerLeft` or `headerRight`
    is an `AstryxHeaderSlot` child (`slot: title | left | right`) that the bar
    hosts at its content's own size; `measure` and press regions inside it are
    the bar's. Every other child is the screen's content.
  - Toolbar and tabs: `toolbarShown`, `toolbarHidesOnScroll`,
    `hidesTabBarWhenPushed` (read at the push; the tab bar slides away with it).
  - Transition and system: `animation`, `animationTypeForReplace`,
    `backPreview`, `statusBarStyle`, `statusBarHidden`, `statusBarAnimation`,
    `autoHideHomeIndicator`.
  - Scroll: `scrollViewNativeID` names the screen's scroll target (else the
    first vertical scroll view); the large title collapses with it, and
    `scrollEdgeEffects` (top and bottom: automatic, soft, hard, hidden) apply
    to it on iOS 26.
  - Vertical bars (iOS 27.1): `verticalBarBehavior`, `verticalBarCompression`,
    and each item's `axis` and `visibilityPriority` mirror the system's
    options; a title-only item or a header slot never joins a vertical bar.
- **FR6 — Header search has one option set and two renderings.**
  `headerSearchBarOptions` (placement, placeholder, capitalization, hide on
  scroll, dimming, controlled `text` with `textRevision`, Cancel's title,
  autofocus, scopes) drives the system search field on iOS under system chrome,
  with `onSearchChange`, `onSearchFocus`, `onSearchBlur`, `onSearchCancel`,
  `onSearchButtonPress` and `onScopeChange`. Elsewhere (Android, drawn chrome)
  the router draws the library's `SearchField` in a row under the bar: the
  screen's `searchActive` hides the bar while it is edited, `searchRowInset`
  adds the row to the screen's top safe area, and `onBarEdge {routeKey,
barBottom}` reports the bar's live bottom edge on the native driver.
- **FR7 — A stack screen may take its own appearance.** The stack option
  `appearance: 'light' | 'dark'` gives one screen its own light or dark
  whatever the app's mode; unset, the screen follows the app.
  - The router draws the screen's content, header slots and the modal routes it
    presents in that mode, and reads the theme-derived options the screen
    inherits (tint, title colours, page fill, Android bar colours, status bar)
    again in it. Options the screen sets itself win as given.
  - The screen's native prop `appearance` (`unspecified | light | dark`) puts
    its chrome in that mode while it is the top screen: the navigation bar, the
    status bar glyphs (and Android's navigation bar glyphs), the background
    behind it, surfaces it presents natively, and the tab bar of the tabs it
    sits in (no tabs host prop). The chrome changes inside the push and pop
    transitions' own frames; an interactive back keeps the top screen's mode
    until it commits, and a cancelled one changes nothing.
- **FR8 — The tabs host.** A native tab container whose children are
  `AstryxTabScreen`s and at most one `AstryxTabAccessory`.
  - `selectedRouteKey` applies when it changes, never on an unrelated update;
    `selectionNonce` re-asserts it when the router did not follow a native
    selection.
  - `onTabSelect {routeKey, reselected}` reports a native selection. A tab with
    `tabBarSelectionEnabled: false` is never selected natively, but its tap is
    reported. `onTabLongPress {routeKey}` reports a long press.
  - Re-select is native: unless the tab's `tabBarRepeatedPressBehavior` is
    `none`, a tab with a deeper stack pops it to its root when that stack's
    `popToRootEnabled` allows (reported by the stack host as `onNativePop`),
    else the stack host emits `onBackPrevented` with `source: 'reselect'`; a
    tab at its root scrolls its scroll target to the top. The router never pops
    for a system tab bar.
  - `tabBarMinimizeBehavior` (automatic, never, on scroll down, on scroll up;
    from the selected tab's scroll target), `tabBarControllerMode` (automatic,
    tab bar, sidebar), `tabBarHidden`, `tabBarActiveTintColor`,
    `tabBarInactiveTintColor`, `tabBarBackgroundColor`,
    `tabBarActiveIndicatorColor`, `colorScheme` (as FR3).
  - A tab screen carries `title`, `tabBarLabel`, `tabBarIcon` (system symbol,
    Astryx glyph with its vector drawing, or image URI), `tabBarBadge` with
    `tabBarBadgeColor` and `tabBarBadgeTextColor`, `tabBarAccessibilityLabel`,
    `tabBarButtonTestID`, `tabBarRole` (`search`), `verticalBarBehavior` and
    `scrollViewNativeID`. A tab whose only child is a stack host uses that
    stack's container as the tab itself, so the back swipe pops only that
    stack; a stack arriving in the selected tab never replaces or blanks it.
  - FR8 gap: on iOS 26, a tab whose content container changes after the tab bar
    is installed has no accessibility identifier from `tabBarButtonTestID`.
- **FR9 — The tab accessory.** The accessory's content sits above the tab bar.
  On iOS 26 it is the system's bottom accessory, inline beside the bar when the
  bar minimizes; below iOS 26 and on Android it is docked above the bar and the
  tabs' safe area includes it. `onTabAccessoryPlacementChange {placement:
'expanded' | 'inline'}` fires once at first layout and on each change.
  `isChromeHidden` hides the system's own platter and press effect on iOS 26
  while the same content view stays mounted and touchable.
- **FR10 — The hosts report insets to JavaScript.**
  - A screen's content runs edge to edge by default. Each stack screen, and
    each tab screen without a stack, reports `onScreenInsetsChange {routeKey,
width, height, insets, topBarBottom, verticalBarEdge}`: its size, the room
    the system bars take on each edge, the navigation bar's bottom edge in
    window coordinates, and the edge where the system places a vertical bar
    (`none`, `leading`, `trailing`).
  - The same numbers are the screen's layout state, written synchronously at
    every native layout, so a pushed screen's first frame is laid out at its
    real size; the event may trail that state by one frame.
  - `safeAreaEdges` pads non-scrolling content natively and the reported insets
    on those edges are 0, so nothing pads twice.
  - The router exposes them as `useScreenInsets()`, `useContentWidth()` and
    `useVerticalBarEdge()`. The hosts report what the system measured; they
    never derive a bar from orientation, size class or device.
- **FR11 — Threading and motion.** Transitions, back gestures, large-title
  collapse, scroll-edge effects, tab bar minimize and the accessory's placement
  run on the UI thread under the system, with no JavaScript per frame.
  JavaScript hears an event at a transition's start, a settled pop, a press, or
  an inset change. `onBarEdge` is delivered per frame only to an Animated
  native-driver binding, so the drawn search row follows the bar with no
  JavaScript per frame.
- **FR12 — Navigation links by default; a missing host fails loudly.**
  - The `navigation` capability is the native half of Astryx's own navigators,
    so an app links it by default. A minimal opt-out may exist.
  - The router probes the hosts before it renders through them. When they are
    absent (an opted-out build, or a binary without them), a navigator with
    system chrome fails at its first render with an error that names the
    missing capability; inside a preview project it shows an in-place message,
    announced as an alert, and a development error. It never renders a blank
    screen.
  - Drawn tabs render without a host. The stack needs its host for transitions
    in both chrome modes (OQ2).
- **FR13 — Accessibility.**
  - The system bars, back buttons, tab items and menus keep the platform's own
    VoiceOver and TalkBack behaviour, including UIKit's Large Content Viewer
    for bar and tab items. Bar items take their `accessibilityLabel` and
    `accessibilityHint`; a badge is read with its item (below iOS 26 as the
    item's accessibility value), and tab badges are read with the destination.
  - The VoiceOver escape and TalkBack's back pop the stack under the same
    gating as the back button (FR3, FR4).
  - A tab's long press is also a VoiceOver custom action and a TalkBack
    long-click action.
  - Titles and large titles scale with Dynamic Type and Android font scale.
    The drawn search row's motion follows Reduce Motion (it swaps instead of
    moving).
  - After a push or pop, the system container moves VoiceOver and TalkBack
    focus to the incoming screen as the platform does; the hosts add no focus
    rule of their own.
- **FR14 — Contract baseline and Astryx Stage.**
  - Every contract in the group is at revision 1. A behaviour added after
    revision 1 is a named feature, `<Contract>.<feature>`, that the binary
    lists and the JavaScript checks with `hasContractFeature` before it uses it.
    Without it the JavaScript keeps the revision-1 behaviour or answers
    `unsupported`, and warns once in development and in release builds; it
    never takes a silent weaker path.
  - The group's named feature is `AstryxStackHost.pop-start` (`onPopStart`,
    FR3). On a binary without it, a `popStart` listener hears no native pop and
    the router warns once.
  - Astryx Stage implements every contract in the group on its iOS and Android
    profiles and reads the router through FR2's bridge. Compatibility goes
    through the library's Stage version floor: the package names the oldest
    Stage that implements its contract set, and an older Stage refuses the
    project with the gaps listed.

### Native contract

| Contract           | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Commands | Events                                                                                                                                                                             | Platforms    |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AstryxStackHost    | native component (Fabric Native Component) | `backEnabled`, `canPop`, `colorScheme`, `estimatedHeight`, `estimatedWidth`, `navigatorKey`, `popToRootEnabled`, `swipeEnabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | none     | `onBackPrevented`, `onDidShow`, `onGestureCancel`, `onNativePop`, `onPopStart`, `onScreenDismissed`, `onWillShow`                                                                  | iOS, Android |
| AstryxStackScreen  | native component (Fabric Native Component) | `active`, `animation`, `animationTypeForReplace`, `appearance`, `autoHideHomeIndicator`, `backPreview`, `estimatedHeight`, `estimatedWidth`, `fullScreenGestureEnabled`, `gestureEnabled`, `hasHeaderBackTitle`, `headerBackButtonDisplayMode`, `headerBackButtonMenuEnabled`, `headerBackTitle`, `headerBackVisible`, `headerLargeSubtitle`, `headerLargeTitleEnabled`, `headerLargeTitleInRow`, `headerLargeTitleStyle`, `headerLeftItems`, `headerRightItems`, `headerSearchBarOptions`, `headerShadowVisible`, `headerShown`, `headerStyle`, `headerSubtitle`, `headerTintColor`, `headerTitleMenu`, `headerTitleStyle`, `headerTransparent`, `hidesTabBarWhenPushed`, `routeKey`, `safeAreaEdges`, `scrollEdgeEffects`, `scrollViewNativeID`, `searchActive`, `searchRowInset`, `statusBarAnimation`, `statusBarHidden`, `statusBarStyle`, `title`, `toolbarHidesOnScroll`, `toolbarItems`, `toolbarShown`, `verticalBarBehavior`, `verticalBarCompression` | none     | `onBarEdge`, `onBarItemPress`, `onMenuSelect`, `onScopeChange`, `onScreenInsetsChange`, `onSearchBlur`, `onSearchButtonPress`, `onSearchCancel`, `onSearchChange`, `onSearchFocus` | iOS, Android |
| AstryxHeaderSlot   | native component (Fabric Native Component) | `slot`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | none     | none                                                                                                                                                                               | iOS, Android |
| AstryxTabsHost     | native component (Fabric Native Component) | `colorScheme`, `navigatorKey`, `selectedRouteKey`, `selectionNonce`, `tabBarActiveIndicatorColor`, `tabBarActiveTintColor`, `tabBarBackgroundColor`, `tabBarControllerMode`, `tabBarHidden`, `tabBarInactiveTintColor`, `tabBarMinimizeBehavior`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none     | `onTabLongPress`, `onTabSelect`                                                                                                                                                    | iOS, Android |
| AstryxTabScreen    | native component (Fabric Native Component) | `routeKey`, `scrollViewNativeID`, `tabBarAccessibilityLabel`, `tabBarBadge`, `tabBarBadgeColor`, `tabBarBadgeTextColor`, `tabBarButtonTestID`, `tabBarIcon`, `tabBarLabel`, `tabBarRepeatedPressBehavior`, `tabBarRole`, `tabBarSelectionEnabled`, `title`, `verticalBarBehavior`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none     | `onScreenInsetsChange`                                                                                                                                                             | iOS, Android |
| AstryxTabAccessory | native component (Fabric Native Component) | `isChromeHidden`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none     | `onTabAccessoryPlacementChange`                                                                                                                                                    | iOS, Android |

| Contract     | Kind                  | Methods                                                                   | Platforms    |
| ------------ | --------------------- | ------------------------------------------------------------------------- | ------------ |
| AstryxRouter | protocol (JavaScript) | `canOpenPath`, `getRouterState`, `navigateToPath`, `subscribeRouterState` | iOS, Android |

### Platform support

| Contract           | iOS                                                                                                                                                                                                                                                        | Android                                                                                                                                                                                                                                                                                                                 | Astryx Stage                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| AstryxStackHost    | UINavigationController, a child of the nearest view controller; interactive pop recognizers, the iOS 26 content pop, a full-width swipe below iOS 26                                                                                                       | An AndroidX FragmentManager back stack in a headless host fragment; predictive back through the back dispatcher with Material's shared-axis transition or the shrink preview                                                                                                                                            | Both profiles                                       |
| AstryxStackScreen  | A view controller with its navigation item: bar button items, UIMenu, title menu (iOS 16+), subtitles (iOS 26), toolbar, UISearchController, scroll edge effects (iOS 26), vertical bars (iOS 27.1); ignores `backPreview` and the scrolled header colours | A fragment with a Material 3 top app bar (small, in-row, or medium collapsing); bar items, menus, header slots. No-ops: back title and its menu, `headerLargeSubtitle`, toolbar, scroll-edge effects, `fullScreenGestureEnabled`, `statusBarAnimation`, `autoHideHomeIndicator`, vertical bars; search is the drawn row | Both profiles                                       |
| AstryxHeaderSlot   | The navigation item's title view and custom bar button views                                                                                                                                                                                               | Views placed in the Material app bar's start, title and end areas                                                                                                                                                                                                                                                       | Both profiles                                       |
| AstryxTabsHost     | UITabBarController; UITab and UISearchTab (iOS 18+), the iPad sidebar (iOS 18+), minimize (iOS 26); ignores `tabBarBackgroundColor` and `tabBarActiveIndicatorColor`                                                                                       | Material 3 NavigationBarView below 600dp, NavigationRailView at 600dp and above; a More list beyond five destinations on the bar (seven on the rail). No-ops: `tabBarRole: 'search'`, `tabBarMinimizeBehavior: 'automatic'` (never)                                                                                     | Both profiles                                       |
| AstryxTabScreen    | A UITab or a UITabBarItem with badge colours                                                                                                                                                                                                               | A Material destination with a BadgeDrawable                                                                                                                                                                                                                                                                             | Both profiles                                       |
| AstryxTabAccessory | UITabAccessory (iOS 26); a docked view below iOS 26                                                                                                                                                                                                        | A docked view above the bar; placement is always `expanded`; `isChromeHidden` is a no-op                                                                                                                                                                                                                                | Both profiles                                       |
| AstryxRouter       | JavaScript                                                                                                                                                                                                                                                 | JavaScript                                                                                                                                                                                                                                                                                                              | Read through the host bridge by Stage's address bar |

- Supported feature/engine floor: `spec:AST-112`'s floor (iOS at React
  Native's minimum, Android API level 24, the New Architecture only). Features
  with a newer OS floor degrade as listed above and in FR5 to FR9: the title
  menu needs iOS 16, tabs and the sidebar iOS 18, Liquid Glass, minimize,
  subtitles and the bottom accessory iOS 26, vertical bars iOS 27.1.
- Unsupported behavior: a prop a platform does not honor is a documented no-op
  listed in this table; a missing host fails loudly (FR12); a missing named
  feature keeps the revision-1 behaviour with one warning (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- `spec:AST-112/FR1` and `spec:AST-112/FR3` list `navigation` as an opt-in
  capability. This record changes that: the navigation hosts link by default as
  the native half of Astryx's own navigators (FR12), and only a minimal opt-out
  remains.
- `spec:AST-112/FR8`'s per-spec version history becomes the revision-1
  baseline with named features (FR14) for this group's contracts.
- Otherwise this record details `spec:AST-112/FR2` (router and hosts),
  `spec:AST-112/FR5` (the `./navigation` entry holds the router),
  `spec:AST-112/FR6` and `spec:AST-112/FR7` (FR12 here), `spec:AST-112/FR12`
  (FR14 here), and `spec:AST-112/DEC-9`.

## Verification

| Contract | Verification                                                                                                                  | Representative states                                                              | Mutation or failure expectation                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FR1      | Router unit tests over the `./testing` host doubles; Simulator and emulator push, pop, replace and reset                      | a push during a transition; a reset; a native pop of two routes                    | The host keeps a route the router removed, or a native pop reaches the router as more than one action            |
| FR2      | Unit tests of the snapshot, its shape fingerprint, and each declared consumer's reads; Astryx Stage address-bar suite         | no root; nested roots; a URL the config fails on; an unchanged commit              | A snapshot leaks a store object, publishes without a commit, or a failed URL goes to the system                  |
| FR3      | Astryx Stage contract suites on both profiles; Simulator and emulator checks of each event                                    | depth 1 and 2; `canPop` false; a cancelled swipe; a back button pop; a router pop  | The back button shows at depth 1, a pop happens while `canPop` is false, or `onPopStart` fires for a router pop  |
| FR4      | Simulator swipe checks (edge, content, full width) and emulator predictive back checks; unit tests of the gating              | a guarded screen; a horizontal scroller; three-button navigation; TalkBack back    | A swipe starts on a guarded screen, or system back pops while a sheet consumes back                              |
| FR5      | Astryx Stage suites per option on both profiles; Simulator and emulator captures                                              | each bar item kind; menus; header slots; large title collapse; scroll edge effects | An option changes nothing where this record says it is honored, or a header slot's press region is not the bar's |
| FR6      | Unit tests of the option mapping; Simulator checks of the system field; Stage checks of the drawn row                         | each placement; scopes; controlled text; Android                                   | The two renderings disagree on an option's meaning, or the drawn row's motion runs JavaScript per frame          |
| FR7      | Unit tests of the scoped options; Simulator and emulator frame captures of push, pop and a cancelled back                     | a dark screen over a light stack; a tab bar under it; a presented sheet            | The chrome changes outside the transition, or a cancelled back changes it                                        |
| FR8      | Astryx Stage tabs suites on both profiles; Simulator and emulator selection and re-select checks                              | a refused tab; re-select with a guard; six tabs on Android; a lazy stack tab       | The router pops on a system re-select, a refused tab is selected, or a selected tab goes blank                   |
| FR9      | Stage and Simulator checks of placement events; emulator docked accessory                                                     | iOS 26 minimize; below iOS 26; `isChromeHidden`                                    | No placement event at first layout, or hiding the chrome remounts the content                                    |
| FR10     | Unit tests of the inset hooks; Simulator and emulator first-frame captures                                                    | a push's first frame; `safeAreaEdges`; a vertical bar pose                         | A pushed screen's first frame is laid out at a wrong size, or an edge is padded twice                            |
| FR11     | UI-thread frame checks during transitions, swipes, large-title collapse and the drawn search row                              | a push; an interactive back; a scroll under a large title                          | Any JavaScript work per frame during these motions                                                               |
| FR12     | Unit tests through the `./testing` doubles with the hosts absent; a built app with the default capability set                 | hosts absent; a preview project; drawn tabs                                        | A blank screen, a silent fallback, or an error that does not name the capability                                 |
| FR13     | VoiceOver and TalkBack checks on the Simulator, the emulator and a device; largest Dynamic Type captures                      | the escape gesture; a tab long press; a badge; Reduce Motion                       | The escape pops while `canPop` is false, or a badge is not read                                                  |
| FR14     | The platform's spec rules check; unit tests of `hasContractFeature` with older and current binary shapes; Stage floor refusal | a binary without `AstryxStackHost.pop-start`; a Stage below the floor              | A contract above revision 1, a feature used without the check, or an older Stage that runs the project           |

## Decision log

### DEC-1 — The router owns the routes; the hosts own the containers and report

**Reference:** `spec:AST-125/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The router is the one source of truth for routes, focus and URLs, so linking,
persistence, the inspector and Astryx Stage read one state. The hosts apply the
router's list, own everything the system moves, and report each native change
as one event the router applies as one action.

Rejected: hosts that keep their own route list, because two lists drift during
gestures and transitions.

### DEC-2 — Back is gated before a gesture starts

**Reference:** `spec:AST-125/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The router publishes `canPop`, `swipeEnabled`, `backEnabled` and
`popToRootEnabled` ahead of time, all false by default, so the system never
starts a swipe or predictive back that the router would refuse, and the gesture
stays on the UI thread.

Rejected: cancelling a started gesture from JavaScript, because it needs a
round trip mid-gesture.

### DEC-3 — Removed routes stay mounted until the host dismisses them

**Reference:** `spec:AST-125/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A route the router removes keeps its content drawn with `active: false` until
`onScreenDismissed`, and a native pop reaches the router once, after the
transition settles. The person never sees a blank screen sliding away, and the
router never sees a half-finished pop.

### DEC-4 — Tab re-select and per-screen appearance are native

**Reference:** `spec:AST-125/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A system tab re-select pops the tab's stack through the stack host's own guard,
and a screen's appearance changes the chrome inside the system's transition
frames. Both follow the system's timing exactly, which JavaScript cannot match.

### DEC-5 — Pop start is a notification, not a hold

**Reference:** `spec:AST-125/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

`popStart` lets a leaving screen start work as a native pop begins without
holding back. Holding back is `usePreventRemove`'s job, and on Android it turns
off the predictive back scrub.

## Open questions

- **OQ1 — How does an app choose system or drawn navigation chrome?**
  (`human-api`) The hosts serve both; the choice's API shape (per navigator, per
  theme, or one axis across components) is not settled.
- **OQ2 — Does the stack draw its own transitions when its host is absent?**
  (`human-design`) Options: fail loudly and name the capability (FR12); or a
  JavaScript stack with drawn transitions, at the cost of a second gesture and
  transition path to keep in step with the native one.
- **OQ3 — Does the AstryxRouter protocol stay in this group?**
  (`human-design`) The router provides it, and no other Astryx component
  reads it; its readers are apps' host-facing UI, the inspector, Astryx Stage
  and the Astryx app's preview chrome. Options: keep it here beside the hosts it describes; or move it to the
  router's own record.
