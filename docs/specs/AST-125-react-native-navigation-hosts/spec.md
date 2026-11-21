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
search, and the person using it can get the platform's own navigation: the iOS
navigation bar with its large title, back swipes and Liquid Glass, the iOS tab
bar with its minimize and bottom accessory, and on Android a Material 3 app bar,
a navigation bar or rail, and predictive back. The developer writes this once,
in JavaScript, with the Astryx router (`@astryxdesign/react-native/navigation`). The navigation hosts are the native half of that router:
six native components that hold the stack and tab containers, and one
JavaScript protocol through which in-app UI reads and drives the router's
state.

This record details `spec:AST-112` for one group of the platform layer and
follows the shared platform rules of `spec:AST-140`. It uses the platform layer
and its capability loader (`spec:AST-112/FR1`, `spec:AST-112/FR2`),
registration and exposure (`spec:AST-140/FR1`), the missing-piece rule
(`spec:AST-140/FR2`), the result vocabulary (`spec:AST-140/FR3`), the
capability shape (`spec:AST-112/FR7`), additive evolution
(`spec:AST-140/FR5`), and threading (`spec:AST-140/FR6`). It applies
`spec:AST-112/DEC-9`: Astryx owns navigation, routing included.

## Why this exists

Astryx owns navigation (`spec:AST-112/DEC-9`). Per piece, the gap that makes
it build its own:

- **Stack host and screen.** Astryx's gesture and drag layer decides which of a
  stack's back swipe, a sheet over the stack and a scroll view inside it owns a
  touch, and the header, back gestures and transitions take Astryx's theme or
  give way to Astryx's own chrome. A stack container whose built-in UI and
  gestures the library cannot own allows neither.
- **Header slot.** No gap of its own: it exists because the stack screen does.
- **Search and large title.** One option set covers the system search field and
  a drawn search row, with one set of insets, and the large title collapses
  with the scroll view the library names.
- **Tabs host, tab screen and tab accessory.** The tab bar's minimize, the iOS
  26 bottom accessory, re-select through the stack's own guard, and a Material
  bar or rail follow Astryx's theme and insets and work with Astryx's stack
  host.
- **Android back.** Predictive back gives way to Astryx's back consumers
  (sheets, menus, search fields) and to the router's guard before the gesture
  starts.
- **Router protocol.** The app's own code (deep links, state restoration, and
  in-app UI such as a route list or a development inspector) reads the
  router's routes as one snapshot and opens paths through the app's own
  linking. Whether it belongs in this group is OQ2.

Astryx takes no third-party native navigation dependency, and Astryx components
work beside react-native-screens, react-native-gesture-handler or another
router in the same app (`spec:AST-140/FR9`).

## Who uses it

| Native piece       | Kind                                       | Astryx components that use it                                                                                                                                                                                                                      | What a person sees                                                                                 |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AstryxStackHost    | native component (Fabric Native Component) | The router's stack navigator (`createStack` in the `./navigation` entry), with `render: 'system'` or `'drawn'`; with `'drawn'`, `TopNav` draws inside its screens                                                                                  | Native push and pop transitions, the back swipe, Android predictive back                           |
| AstryxStackScreen  | native component (Fabric Native Component) | The router's stack navigator; `TopNav` (its `TopNav<Part>` parts declare the screen's stack options; component:react-native/TopNav) and `ScreenView`; `ScreenScroll` (the screen's scroll target); the header search row, drawn with `SearchField` | The navigation bar: titles, large title, back button, bar buttons and menus, toolbar, search field |
| AstryxHeaderSlot   | native component (Fabric Native Component) | The router's stack navigator, for a screen's `headerTitle`, `headerLeft` and `headerRight` given as React                                                                                                                                          | A custom title view or bar button in the system bar                                                |
| AstryxTabsHost     | native component (Fabric Native Component) | The router's tab navigator (`createTabs`) with `render: 'system'`                                                                                                                                                                                  | The system tab bar (iOS) or a Material navigation bar or rail (Android)                            |
| AstryxTabScreen    | native component (Fabric Native Component) | The router's tab navigator with `render: 'system'`                                                                                                                                                                                                 | Each tab's icon, label and badge, and the tab's content                                            |
| AstryxTabAccessory | native component (Fabric Native Component) | The router's tab navigator, for its bottom accessory (`BottomAccessory`, one component for both placements)                                                                                                                                        | A bar above the tab bar (a mini player), inline beside a minimized bar on iOS 26                   |
| AstryxRouter       | protocol (JavaScript)                      | The router provides it: `NavigationRoot` (its handle) and `createNavigationRef()` carry the four methods, and `useNavigationInspector` reads it; apps read it through `useRouterState`                                                             | A route list or an in-app address field that shows and opens the app's routes                      |

The drawn tab bar (`TabBar`) and the drawn modal route (`BottomSheet`) render
no navigation host.

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

- **FR1 — The router owns state and URLs; the hosts own the native containers.**
  - The router (`NavigationRoot`, `createStack`, `createTabs`) holds every
    route, its params, focus, linking and persistence. The native stack always
    ends up showing the router's active screens in the router's order, with a push or pop animation where
    one screen came or went, and a change that arrives during a transition
    shows once the transition ends.
  - The hosts own what the system draws and moves: the native stack and tab
    containers, transitions, back gestures, bars, large titles, search fields,
    bar items and menus, toolbars, tab bar minimize, the tab accessory,
    scroll-edge and bar behaviour, and the insets they report.
  - The header and tab bar components decide their own rendering in their own
    component records, through the components' rendering axis: the stack
    host's bar and the tabs host's tab bar are
    its `system` form, and a header or tab bar Astryx draws is `drawn`. The
    hosts host either: the stack host carries a screen with the system bar or
    with a header the component draws, and a drawn tab bar renders without the
    tabs host (FR12).
  - A native change reaches the router as an event, which the router applies as
    one action. Every event carries the router's `navigatorKey` and, where it
    concerns a route, its `routeKey`.
  - The router reaches the hosts through the package's internal host entry; an
    app imports the router, and the hosts stay internal behind it.
  - Astryx provides this router so that Astryx's screen header (`TopNav`), tab
    bar and sheets work with the native hosts and the gesture layer
    (`spec:AST-112/DEC-9`). An app may navigate with
    another router instead, such as Expo Router: Astryx components work inside
    that router's screens, and its navigation and chrome stay its own (DEC-6).
- **FR2 — The AstryxRouter protocol.** One view of a root's routes for the
  app's own callers: deep links, state restoration, and in-app UI that shows
  and opens routes.
  - The default root is the outermost root that mounted first and is still
    mounted. `getRouterState()` returns the default
    root's snapshot, or `undefined` while no root is mounted. `subscribeRouterState(listener)` calls the listener with
    each new snapshot, after each committed navigation change, and returns an unsubscribe
    function. `useRouterState()` is the hook form: inside a root, that root's;
    elsewhere, the default root's.
  - A snapshot holds `seq` (one more per published change of its
    root), `routes` (depth first: `key`, `name`, JSON-safe `params`, `path`,
    `presentation`, `focused`, `navigator`, `depth`, `parentKey`),
    `focusedKey`, `focusedPath`, `canGoBack` and `hasLinking`. It is
    immutable plain data.
  - `navigateToPath(pathOrURL)` opens a path or in-app URL through the root's
    linking and returns true when the app went somewhere. A URL for another
    app, one that matches nothing, and one that fails the config return false
    and stay inside the app. `canOpenPath(path)` answers whether a path turns
    into a route and back into the same path, without navigating.
  - The same four functions exist per root on the root's handle and on
    `createNavigationRef()`. In-app UI reads a root's routes by calling this
    protocol.
- **FR3 — The stack host.** A native stack container whose children are
  `AstryxStackScreen`s.
  - `canPop` (no active prevent-remove guard), `swipeEnabled` (`canPop` and the
    top screen's `gestureEnabled`), `backEnabled` (`canPop` and no JavaScript
    back consumer) and `popToRootEnabled` (no guard above the root) are
    published by the router and default to false, so a native pop waits for
    the router to allow it.
  - The back button and the VoiceOver escape show when the stack is deeper than
    one screen; they pop when `canPop` and otherwise emit `onBackPrevented`.
    The event's `source` is `button` (the back button), `escape` (the VoiceOver
    escape) or `reselect` (a tab re-select refused by `popToRootEnabled`,
    FR8).
  - `onWillShow` and `onDidShow` (`animated`) mark a transition's start and
    end. `onGestureCancel` reports a cancelled interactive pop. `onNativePop`
    reports, once per settled transition, every route the system removed (back
    button, its menu, a swipe, system back), and the router removes exactly
    those in one action.
  - A route the router removes stays mounted with `active: false` until the
    host emits `onScreenDismissed`, so the person sees its content for the
    whole pop animation.
  - `onPopStart` fires on the leaving top screen when the system starts a pop,
    before its transition begins, with `source`: `gesture` (the start of a
    back swipe or predictive back gesture), `key` (Android system back without
    a gesture, a hardware key, TalkBack, or the iOS VoiceOver escape) or
    `button` (the back button or its menu). Pop start groups backs by input
    kind, so the VoiceOver escape counts as `key`, a back without a gesture or
    a button; `onBackPrevented` keeps `escape` because it names the control the
    person used. A pop or `onGestureCancel` follows it. It fires for a back with
    one of these three sources; a pop the router asked for, a prevented back,
    and a tab re-select each have their own event. The router passes it to the leaving
    screen as a navigation event: a handler can start work as the pop begins,
    and the pop runs on at its own pace.
  - `colorScheme` (`unspecified | light | dark`) sets the container's interface
    style, which the system bars' material, buttons and search field follow;
    the router sends the theme's chrome appearance, and `unspecified` follows
    the system in the same frame.
  - Navigation options that derive from the theme (the chrome appearance, tint,
    bar and tab colours) resolve in the theme scope of the screen that uses
    them. A screen's own chrome appearance reaches the native bar through the
    stack screen's `appearance` (FR7).
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
  - A prevent-remove guard turns `canPop` off before any gesture, so every
    swipe the system starts is one the router accepts.
- **FR5 — The stack screen carries each screen's chrome.** These are native
  props. The stack options, which a screen declares through the `TopNav` parts
  (component:react-native/TopNav), map onto them; their API lives in their own records. Where a
  concept is the same, a prop keeps
  the name and meaning react-native-screens and React Navigation give it:
  compatibility with the ecosystem's option vocabulary is a goal, so an app
  that moves from those libraries reads the same words. Booleans are positive.
  - Header: `title`, `headerShown`, `headerTransparent`, `headerShadowVisible`,
    `headerLargeTitleEnabled`, `headerLargeTitleInRow` (the large title stays
    in the bar row and does not collapse), `headerSubtitle`,
    `headerLargeSubtitle`, `headerTitleStyle`, `headerLargeTitleStyle` (both
    follow Dynamic Type), `headerTintColor`, and `headerStyle` (a solid bar
    colour; on Android also the colour and bottom line the bar takes when
    content scrolls under it).
  - Back: `headerBackVisible`, `headerBackTitle` (an empty string shows the
    chevron alone), `hasHeaderBackTitle` (whether `headerBackTitle` was given:
    no title means the system's own back title, which differs from an empty
    one), `headerBackButtonDisplayMode`, `headerBackButtonMenuEnabled`.
  - Items: `headerLeftItems`, `headerRightItems` and `toolbarItems` are lists
    of plain data, leading to trailing, each with a stable `id`. An item is a
    button, a menu, a spacer, a flexible spacer or a status text; its icon is a
    system symbol, an Astryx glyph with its vector drawing, or an image URI; it
    can carry a badge, a selected, disabled, hidden or prominent state, a
    shared background, and an accessibility label and hint. Item menus and the
    title menu (`headerTitleMenu`) use the system menu's JSON spec. The
    `onBarItemPress` and `onMenuSelect` events report which item or menu row
    the person chose.
  - Header slots: an `AstryxHeaderSlot` child (`slot`: `title`, `left` or
    `right`) holds React content that the system bar places, sized by that
    content. Layout measurement and touches inside it use the slot's place in
    the bar. Children that are not slots form the screen's content.
  - Toolbar and tabs: `toolbarShown`, `toolbarHidesOnScroll`, and
    `hidesTabBarWhenPushed` (read when the screen is pushed: the tab bar leaves
    with the push and returns with the pop).
  - Transition and system: `animation`, `animationTypeForReplace`,
    `backPreview`, `statusBarStyle`, `statusBarHidden`, `statusBarAnimation`,
    `autoHideHomeIndicator`.
  - Scroll: `scrollViewNativeID` names the scroll view the bar follows (without
    it, the first vertical scroll view). The large title collapses with that
    scroll view, and `scrollEdgeEffects` (top and bottom: automatic, soft,
    hard, hidden) apply to it on iOS 26.
  - Vertical bars (iOS 27.1): `verticalBarBehavior`, `verticalBarCompression`,
    and each item's `axis` and `visibilityPriority` pass the system's own
    options through. A vertical bar shows the items that have an icon, and
    header slots stay in the horizontal bar.
- **FR6 — The stack screen hosts header search as a system field or a drawn
  row.** The
  native prop `headerSearchBarOptions` (placement, placeholder,
  capitalization, hiding on scroll, dimming, controlled `text` with
  `textRevision`, the Cancel title, autofocus, scopes) configures the system
  search field on iOS, which reports through `onSearchChange`,
  `onSearchFocus`, `onSearchBlur`, `onSearchCancel`, `onSearchButtonPress` and
  `onScopeChange`. Where the `TopNav` component draws its own search row
  instead (how header search renders, Android included, is that component's
  decision), three members of the screen support it: `searchActive` hides the bar while the row is edited, `searchRowInset`
  adds the row's height to the screen's top safe area, and `onBarEdge` reports
  the bar's bottom edge to a native-driver binding.
- **FR7 — A stack screen may take its own appearance.** The native prop
  `appearance` (`unspecified`, `light` or `dark`; `unspecified` follows the
  host) sets one screen's chrome to light or dark whatever the app's mode.
  - While the screen is on top, its mode applies to the navigation bar, the
    status bar glyphs (and the Android navigation bar glyphs), the background
    behind the screen, the surfaces the screen presents natively on iOS
    (through the presentation host's `appearance`, `spec:AST-128/FR9`), and the tab bar of
    the tabs that hold the stack.
  - The change happens within the frames of the push or pop transition. During
    an interactive back the top screen's mode stays until the back completes;
    a cancelled back changes nothing.
  - The router exposes this as a per-screen option and draws the screen's own
    content in the same mode; that option's API lives in the router's records.
  - The chrome behaviour is the named feature `AstryxStackScreen.appearance`
    (FR14). On a binary without it, the chrome follows the host's
    `colorScheme`, and the router warns once.
- **FR8 — The tabs host.** A native tab container whose children are
  `AstryxTabScreen`s and at most one `AstryxTabAccessory`.
  - `selectedRouteKey` names the selected tab. The host selects it only when
    the value changes, so a tap the router is still answering stands.
    A new `selectionNonce` makes the host apply `selectedRouteKey` again.
  - `onTabSelect` reports a tap on a tab, with `reselected` true when the tab
    was already selected. A tab with `tabBarSelectionEnabled: false` stays
    unselected when tapped, and the tap still arrives as `onTabSelect`.
    `onTabLongPress` reports a long press.
  - Re-select is native: unless the tab's `tabBarRepeatedPressBehavior` is
    `none`, a tab with a deeper stack pops it to its root when that stack's
    `popToRootEnabled` allows (reported by the stack host as `onNativePop`),
    else the stack host emits `onBackPrevented` with `source: 'reselect'`; a
    tab at its root scrolls its scroll view to the top. Under the system tab
    bar the host performs this pop.
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
    stack; a stack arriving in the selected tab keeps it on screen.
  - FR8 gap: on iOS 26, a tab whose content container changes after the tab bar
    is installed has no accessibility identifier from `tabBarButtonTestID`.
- **FR9 — The tab accessory.** The accessory's content sits above the tab bar.
  - On iOS 26 it is the system's bottom accessory, which moves beside the bar
    when the bar minimizes. Below iOS 26 and on Android it is a docked view
    above the bar, and the tabs' safe area includes its height.
  - The contract has one placement vocabulary: `expanded` (above the bar) and
    `inline` (beside a minimized bar). `onTabAccessoryPlacementChange` reports
    the placement once at the first layout and again on each change; Android
    and iOS below 26 report `expanded` only.
  - `isChromeHidden` removes the system's own background and press highlight
    around the content on iOS 26; the content view stays mounted and keeps its
    touches.
- **FR10 — The hosts report insets to JavaScript.**
  - A screen's content runs edge to edge by default. Each stack screen, and
    each tab screen without a stack, reports `onScreenInsetsChange {routeKey,
width, height, insets, topBarBottom, verticalBarEdge}`: its size, the room
    the system bars take on each edge, the navigation bar's bottom edge in
    window coordinates, and the edge where the system places a vertical bar
    (`none`, `leading`, `trailing`).
  - A pushed screen's first frame is laid out at its real size and insets; the
    event may reach JavaScript one frame after the layout uses the numbers.
  - `safeAreaEdges` pads non-scrolling content natively and the reported insets
    on those edges are 0, so each edge is padded once.
  - The router exposes them as `useScreenInsets()`, `useContentWidth()` and
    `useVerticalBarEdge()`. Every value comes from the system's own
    measurement of the screen.
- **FR11 — Threading and motion.** Under `spec:AST-140/FR6`: transitions, back gestures, large-title
  collapse, scroll-edge effects, tab bar minimize and the accessory's placement
  run on the UI thread under the system, with no JavaScript per frame.
  JavaScript hears an event at a transition's start, a settled pop, a press, or
  an inset change. `onBarEdge` is delivered per frame only to an Animated
  native-driver binding, so the drawn search row follows the bar with no
  JavaScript per frame.
- **FR12 — A missing host fails loudly.**
  - The navigation hosts are part of the library's default native set
    (`spec:AST-112/FR3`).
  - The router checks that the hosts are present before it renders through
    them (`spec:AST-140/FR2`). When they are absent (an app that opted out of the default set, or a
    binary without them), a navigator whose rendering resolves to `system` fails at its first
    render with an error that names the missing capability.
  - Drawn tabs render without a host. The stack needs its host for transitions
    with either `render` value (OQ1).
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
    focus to the incoming screen as the platform does.
- **FR14 — Named features.**
  - The group's native contracts grow by named features under
    `spec:AST-140/FR5`, and JavaScript checks a named feature before use. The
    group's named features are
    `AstryxStackHost.pop-start` (`onPopStart`, FR3) and
    `AstryxStackScreen.appearance` (the screen's chrome, FR7); any further
    stack screen behaviour beyond the baseline is a named feature of
    `AstryxStackScreen`. On a binary without `pop-start`, a `popStart` listener
    hears no native pop and the router warns once, in development and in
    release builds.
- **FR15 — Public platform API, with two named exceptions.** The hosts follow
  `spec:AST-140/FR9` and use the public API of UIKit, the Android SDK, AndroidX
  and Material Components. The group's exceptions are on Android, each with a
  public-API fallback:
  - Predictive back in a nested stack forwards the gesture's progress to the
    stack's own FragmentManager through AndroidX Fragment's package-private
    back members, because React Native's always-enabled back callback otherwise
    comes first after the app returns from the background. When the members
    are missing from the resolved AndroidX version, back pops with the screen
    transition and no scrub, and the cause is logged once.
  - The medium app bar's large title scales into the toolbar through Material
    AppBarLayout's package-private offset callback, because React Native's
    scroll views do not drive nested scrolling. When the member is missing, the
    bar still moves with the content and the title does not scale.

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

| Contract           | iOS                                                                                                                                                                                                                                                        | Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AstryxStackHost    | UINavigationController; the edge swipe, the iOS 26 content pop, a full-width swipe below iOS 26                                                                                                                                                            | An AndroidX FragmentManager back stack; predictive back with Material's shared-axis transition or the shrink preview                                                                                                                                                                                                                                                                                                                                                                                          |
| AstryxStackScreen  | A view controller with its navigation item: bar button items, UIMenu, title menu (iOS 16+), subtitles (iOS 26), toolbar, UISearchController, scroll edge effects (iOS 26), vertical bars (iOS 27.1); ignores `backPreview` and the scrolled header colours | A fragment with a Material 3 top app bar (small, in-row, or medium collapsing); bar items, menus, header slots. No bottom toolbar (`toolbarItems`, `toolbarShown` and `toolbarHidesOnScroll` are no-ops); no native search field (`headerSearchBarOptions` is a no-op; the `TopNav` component decides how header search renders). Other no-ops: back title and its menu, `headerLargeSubtitle`, scroll-edge effects, `fullScreenGestureEnabled`, `statusBarAnimation`, `autoHideHomeIndicator`, vertical bars |
| AstryxHeaderSlot   | The navigation item's title view and custom bar button views                                                                                                                                                                                               | Views placed in the Material app bar's start, title and end areas                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AstryxTabsHost     | UITabBarController; UITab and UISearchTab (iOS 18+), the iPad sidebar (iOS 18+), minimize (iOS 26); ignores `tabBarBackgroundColor` and `tabBarActiveIndicatorColor`                                                                                       | Material 3 NavigationBarView below 600dp, NavigationRailView at 600dp and above; a More list beyond five destinations on the bar (seven on the rail). No-ops: `tabBarRole: 'search'`, `tabBarMinimizeBehavior: 'automatic'` (never)                                                                                                                                                                                                                                                                           |
| AstryxTabScreen    | A UITab or a UITabBarItem with badge colours                                                                                                                                                                                                               | A Material destination with a BadgeDrawable                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AstryxTabAccessory | UITabAccessory (iOS 26); a docked view below iOS 26                                                                                                                                                                                                        | A docked view above the bar; placement is always `expanded`; `isChromeHidden` is a no-op                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AstryxRouter       | JavaScript                                                                                                                                                                                                                                                 | JavaScript                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

- Supported feature/engine floor: `spec:AST-112`'s floor (iOS at React
  Native's minimum, Android API level 24, the New Architecture only). Features
  with a newer OS floor degrade as listed above and in FR5 to FR9: the title
  menu needs iOS 16, tabs and the sidebar iOS 18, Liquid Glass, minimize,
  subtitles and the bottom accessory iOS 26, vertical bars iOS 27.1.
- Unsupported behavior: a prop a platform does not honor is a documented no-op
  listed in this table; a missing host fails loudly (FR12); a missing named
  feature keeps the baseline behaviour with one warning (FR14).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator and devices (`spec:AST-112/FR15`).

## Current-state impact

- Relies on `spec:AST-112` FR3 (amended): the library's own native pieces,
  the navigation hosts included, link by default.
- Relies on `spec:AST-140/FR5`: native contracts grow by named features.
- Relies on `spec:AST-128` FR9: the presentation host's `appearance` styles
  the surfaces a screen presents natively (FR7 here).
- Relies on `spec:AST-140/FR9` and `spec:AST-140/DEC-9`: native code uses
  public platform API only, and a record names its exceptions (FR15 here).
- Details `spec:AST-112/FR5` (the
  `./navigation` entry holds the router), `spec:AST-112/FR7` (FR12 here) and
  `spec:AST-112/DEC-9`, and applies `spec:AST-140/FR2`, `spec:AST-140/FR3`
  (FR12 here) and `spec:AST-140/FR6` (FR11 here).

## Verification

| Contract | Verification                                                                                                                                                                                             | Representative states                                                                                  | Mutation or failure expectation                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| FR1      | Router unit tests over the `./testing` host doubles; Simulator and emulator push, pop, replace and reset                                                                                                 | a push during a transition; a reset; a native pop of two routes                                        | The host keeps a route the router removed, or a native pop reaches the router as more than one action            |
| FR2      | Unit tests of the snapshot and each declared consumer's reads                                                                                                                                            | no root; nested roots; a URL the config fails on; an unchanged commit                                  | A snapshot leaks a store object, publishes without a commit, or a failed URL goes to the system                  |
| FR3      | Simulator and emulator checks of each event                                                                                                                                                              | depth 1 and 2; `canPop` false; a cancelled swipe; a back button pop; a router pop                      | The back button shows at depth 1, a pop happens while `canPop` is false, or `onPopStart` fires for a router pop  |
| FR4      | Simulator swipe checks (edge, content, full width) and emulator predictive back checks; unit tests of the gating                                                                                         | a guarded screen; a horizontal scroller; three-button navigation; TalkBack back                        | A swipe starts on a guarded screen, or system back pops while a sheet consumes back                              |
| FR5      | Simulator and emulator captures per option                                                                                                                                                               | each bar item kind; menus; header slots; large title collapse; scroll edge effects                     | An option changes nothing where this record says it is honored, or a header slot's press region is not the bar's |
| FR6      | Unit tests of the option mapping; Simulator checks of the system field; emulator checks of the drawn row                                                                                                 | each placement; scopes; controlled text; Android                                                       | The two renderings disagree on an option's meaning, or the drawn row's motion runs JavaScript per frame          |
| FR7      | Unit tests of the scoped options; Simulator and emulator frame captures of push, pop and a cancelled back                                                                                                | a dark screen over a light stack; a screen under a nested theme; a tab bar under it; a presented sheet | The chrome changes outside the transition, or a cancelled back changes it                                        |
| FR8      | Simulator and emulator selection and re-select checks                                                                                                                                                    | a refused tab; re-select with a guard; six tabs on Android; a lazy stack tab                           | The router pops on a system re-select, a refused tab is selected, or a selected tab goes blank                   |
| FR9      | Simulator checks of placement events; emulator docked accessory                                                                                                                                          | iOS 26 minimize; below iOS 26; `isChromeHidden`                                                        | No placement event at first layout, or hiding the chrome remounts the content                                    |
| FR10     | Unit tests of the inset hooks; Simulator and emulator first-frame captures                                                                                                                               | a push's first frame; `safeAreaEdges`; a vertical bar pose                                             | A pushed screen's first frame is laid out at a wrong size, or an edge is padded twice                            |
| FR11     | UI-thread frame checks during transitions, swipes, large-title collapse and the drawn search row                                                                                                         | a push; an interactive back; a scroll under a large title                                              | Any JavaScript work per frame during these motions                                                               |
| FR12     | Unit tests through the `./testing` doubles with the hosts absent; a built app with the default capability set                                                                                            | hosts absent; drawn tabs                                                                               | A blank screen, a silent fallback, or an error that does not name the capability                                 |
| FR13     | VoiceOver and TalkBack checks on the Simulator, the emulator and a device; largest Dynamic Type captures                                                                                                 | the escape gesture; a tab long press; a badge; Reduce Motion                                           | The escape pops while `canPop` is false, or a badge is not read                                                  |
| FR14     | The platform's spec rules check; unit tests of the feature checks with older and current binary shapes                                                                                                   | a binary without `AstryxStackHost.pop-start` or `AstryxStackScreen.appearance`                         | A named feature used without the check, or one the record does not list                                          |
| FR15     | Source check of the native code for non-public members; unit tests that the two Android bridges' members exist in the resolved AndroidX and Material versions; emulator checks with each bridge disabled | a resolved AndroidX or Material version without the member                                             | A non-public member outside the two named exceptions, or a missing member that crashes instead of falling back   |

## Decision log

### DEC-1 — The router owns the routes; the hosts own the containers and report

**Reference:** `spec:AST-125/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

The router is the one source of truth for routes, focus and URLs, so linking,
persistence and the inspector read one state. The hosts apply the
router's list, own everything the system moves, and report each native change
as one event the router applies as one action, so the one list stays exact through gestures
and transitions.

### DEC-2 — Back is gated before a gesture starts

**Reference:** `spec:AST-125/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The router publishes `canPop`, `swipeEnabled`, `backEnabled` and
`popToRootEnabled` ahead of time, all false by default, so every swipe or predictive back the system starts is
one the router accepts, and the gesture
stays on the UI thread with no round trip mid-gesture.

### DEC-3 — Removed routes stay mounted until the host dismisses them

**Reference:** `spec:AST-125/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A route the router removes keeps its content drawn with `active: false` until
`onScreenDismissed`, and a native pop reaches the router once, after the
transition settles. The person sees the screen's content for the whole pop, and
the router hears each pop once it has finished.

### DEC-4 — Tab re-select and per-screen appearance are native

**Reference:** `spec:AST-125/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A system tab re-select pops the tab's stack through the stack host's own guard,
and a screen's appearance changes the chrome inside the system's transition
frames. Both follow the system's timing exactly, which JavaScript cannot match.

### DEC-5 — Pop start is a notification

**Reference:** `spec:AST-125/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

`popStart` lets a leaving screen start work as a native pop begins without
holding back. Holding back is `usePreventRemove`'s job, and on Android it turns
off the predictive back scrub.

### DEC-6 — Astryx's router serves Astryx's chrome; an app may use another router

**Reference:** `spec:AST-125/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

Astryx's header, tab bar and sheets need a router that drives the native hosts
and the gesture layer, so Astryx provides one. An app that navigates with
another router keeps it: Astryx components render inside its screens, and its
navigation and chrome stay that router's, so an app adopts the components and
keeps its navigation.

## Open questions

- **OQ1 — Does the stack draw its own transitions when its host is absent?**
  (`human-design`) Options: fail loudly and name the capability (FR12); or a
  JavaScript stack with drawn transitions, at the cost of a second gesture and
  transition path to keep in step with the native one.
- **OQ2 — Does the AstryxRouter protocol stay in this group?**
  (`human-design`) The router provides it; its readers are apps' in-app UI
  and the inspector. Options: keep it here beside the hosts it describes; or move it to the
  router's own record.
- **OQ3 — Does the Android stack screen host a bottom toolbar?**
  (`human-design`) On Android, `toolbarItems`, `toolbarShown` and
  `toolbarHidesOnScroll` are no-ops. Options: map them onto a Material bottom
  app bar; or document the toolbar options as iOS-only.
