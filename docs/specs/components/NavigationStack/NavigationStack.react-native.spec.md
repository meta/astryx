---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/NavigationStack
platform_of: component:NavigationStack
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    navigation,
    interaction,
    motion,
    scrolling,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# NavigationStack (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Web's `NavigationStack` (`root`, `path`, `onPathChange`, `renderScreen`, `getKey`, `isInteractivePopEnabled`, `label`), `NavigationScreen` (`title`, `backTitle`, `titleDisplayMode`, `endContent`, `children`) and `useNavigationStack()` (`push`, `pop`, `popToRoot`, `depth`), with one change: `push` takes `sourceRef`, a ref to the native view that pushed, where web's takes `source`. React Native adds `Screen` (`mode`, `isRefreshing`, `onRefresh`, `children`) and `useScreenScrollProps()`. A stack screen's options may be a function of `{route, navigation, theme}`. An app that navigates with another router keeps it, and Astryx's components work inside its screens. |
| Behavior                | The stack runs on the native stack host: `UINavigationController` on iOS, an AndroidX fragment back stack on Android. Pushes, pops, the back swipe and Android's predictive back are the system's; `path` stays the one source of truth, and a pop the system completes reaches the app as `onPathChange`. Each screen's content sits in a `Screen`, which applies the screen's insets, keeps focused fields above the keyboard and is the scroll target the large title collapses with.                                                                                                                                                                                                   |
| End-user impact         | A person gets the phone's own drill-down navigation: the system transitions, the back swipe and predictive back, a back control named by the screen it returns to, and VoiceOver and TalkBack focus that lands on the new screen's title and returns to the control that pushed it.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Builder impact          | Web code that drives a `NavigationStack` from app state ports unchanged, apart from `push`'s `source`, which is `sourceRef`, a ref object, on React Native. A screen that needs no scroller, or pull to refresh, puts a `Screen` as its `NavigationScreen`'s child; an app's own scroller becomes the screen's scroll target through `useScreenScrollProps()`.                                                                                                                                                                                                                                                                                                                             |
| Compatibility/readiness | Not released. Draft. Exported from the package's lab space under `./unstable/*` while web's NavigationStack is a Lab component, and from `@astryxdesign/react-native`'s `./navigation` entry after it leaves Lab (DEC-5). The web contract is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Review checks           | Reject a stack that keeps a route list of its own beside `path`, a native pop that does not reach `onPathChange`, a covered screen that loses its state or scroll position or takes touches or screen-reader focus, a back control whose name does not come from the screen below, a second frame inside a `Screen`, a web prop accepted and ignored, or a third-party native library the stack needs.                                                                                                                                                                                                                                                                                     |
| Governing rules         | `component:NavigationStack` (Lab's source and documentation stand in for it); `spec:AST-082` FR3–FR5, FR7, FR11; `spec:AST-093` FR1–FR5; `spec:AST-112` FR2, FR5; `spec:AST-017` FR27; `spec:AST-030` FR13; `spec:AST-125` FR1, FR3–FR5, FR10, FR11, FR13; `spec:AST-124` FR3, FR13; `spec:AST-129`; DEC-1 to DEC-6 below.                                                                                                                                                                                                                                                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

NavigationStack on React Native is web's drill-down navigator rendered by the
platform's own navigation container, so a push, a pop and a back gesture work
the way the rest of the phone works, while the API, the screens' words and the
accessibility semantics follow the core `NavigationStack` contract. It also
holds the screen container, `Screen`: the frame every screen's content sits in
on a phone, which a web page does not need.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `path`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `NavigationStack`, `NavigationScreen` and
  `useNavigationStack()` on the native stack host: pushes, pops, back
  controls, back gestures, covered screens and screen-reader focus (FR1–FR11).
- How `NavigationScreen`'s `title`, `backTitle`, `titleDisplayMode` and
  `endContent` reach the screen's header (FR6).
- `Screen` and `useScreenScrollProps()`: the screen's frame, its two modes,
  insets, keyboard avoidance, pull to refresh and the screen's scroll target
  (FR12–FR16).
- How NavigationStack relates to routers: Astryx's router, and another router
  an app uses instead (FR17); what it needs natively (FR18); and the shape of a
  stack screen's options (FR19).

**Does not own / non-goals**

- The meaning of `NavigationStack`'s props, its screens and its focus rules —
  owned by `component:NavigationStack`.
- Routing state, URLs and linking, route params, persistence and deep links —
  owned by the Astryx router (`spec:AST-125` FR1, FR2).
- The screen's header parts (title, subtitle, back, start and end content,
  search, title menu, bottom toolbar), the bar item model and how the header
  renders — owned by `component:react-native/TopNav`.
- Tabs, the tab bar and its accessory, and presented sheets and modal routes —
  owned by `spec:AST-125` FR8, FR9 and `spec:AST-128`.
- The native stack host, its props and events — owned by `spec:AST-125`.
- Which of a control's drag, a scroll view and the back swipe takes a touch —
  owned by `spec:AST-124` FR3.
- The safe area, the inset hooks and the keyboard dock — owned by
  `spec:AST-129`.

## Public concepts

| Concept       | Closed values or states                                                                     | Meaning                                                                                                   | Availability by variant/orientation/state | Default  | Owner                                    | Stability    | Invalid-value behavior                                    |
| ------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | ---------------------------------------- | ------------ | --------------------------------------------------------- |
| path          | the entries pushed on the root                                                              | the one source of truth for the screens shown, bottom first                                               | always                                    | none     | `component:NavigationStack`              | experimental | none                                                      |
| pop source    | back control; back menu; swipe; predictive back; system back; screen-reader escape; program | where a pop came from; every source ends in one `onPathChange` call                                       | below the root                            | none     | `component:react-native/NavigationStack` | experimental | none                                                      |
| title display | `large`; `inline`                                                                           | `NavigationScreen`'s `titleDisplayMode`: a large title that collapses into the bar, or the bar title only | always                                    | `inline` | `component:NavigationStack`              | experimental | none                                                      |
| screen mode   | `scroll`; `fill`                                                                            | `Screen`'s `mode`: the screen's content scrolls in one scroll target, or fills the frame with no scroller | always                                    | `scroll` | `component:react-native/NavigationStack` | experimental | an unknown value is a type error                          |
| refresh       | idle; refreshing                                                                            | `Screen`'s `isRefreshing` and `onRefresh`: pull to refresh on the screen's scroll target                  | `mode="scroll"` only                      | idle     | `component:react-native/NavigationStack` | experimental | in `fill` mode, a development warning that names the prop |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                                                         | Draft review state |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | The React Native `NavigationStack`, `NavigationScreen` and `useNavigationStack()` MUST take web's props with web's names, types, defaults and meaning, with one exception: `push` takes `sourceRef`, a ref object (a `RefObject` of the native `View` that pushed), in place of web's `source`, because React Native has no DOM `Element` and every ref-valued input ends in `Ref` (`spec:AST-116` DEC-1; DEC-6). The stack offers only props it fully honors (`spec:AST-082` FR3); web base props follow `spec:AST-082` FR7. The three exports, `Screen` and `useScreenScrollProps()` are exported as FR20 states (DEC-5).                                                                                                                                                                                                                            | `spec:AST-082` FR3, FR5, FR7; FR20; DEC-1, DEC-5, DEC-6                                                       | settled            |
| FR2  | The stack MUST render in the platform's own navigation container: `UINavigationController` on iOS, an AndroidX fragment back stack on Android. An app uses the container through `NavigationStack`. `path` is the stack's one route list: after any change, the native stack shows the root screen and one screen per `path` entry, in `path`'s order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-125` FR1, FR3; `spec:AST-093` FR2; DEC-1                                                            | settled            |
| FR3  | A change of `path` that adds one entry at the end MUST push its screen with the platform's push transition; one that removes the last entry pops it with the pop transition; one that removes several pops straight to the new top in one transition. Any other change shows the new stack, animating where one screen came or went. A change that arrives during a transition shows once that transition ends.                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:NavigationStack` (`path`); `spec:AST-125` FR1                                                      | verify             |
| FR4  | A pop the system starts (the header's back control or its menu of earlier screens, a back swipe, predictive back, Android system back, the VoiceOver escape, TalkBack's back) MUST call `onPathChange` once, when the pop settles, with `path` shortened by exactly the screens the system removed. A cancelled back swipe or predictive back calls nothing. The stack keeps showing the system's result until the app renders the shortened `path`.                                                                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-125` FR3 (`onNativePop`, `onGestureCancel`)                                                         | verify             |
| FR5  | A screen that leaves MUST stay mounted, showing its content, until its pop transition ends (`spec:AST-125` FR3). A covered screen MUST keep its React state and its scroll position, take no touches, and be hidden from VoiceOver and TalkBack, as web's covered screens are inert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:NavigationStack`; `spec:AST-125` FR3                                                               | verify             |
| FR6  | `NavigationScreen`'s props MUST reach the screen's header, which renders them as the header component decides: `title` is the screen's title while it is on top; `backTitle` (else `title`) is the title and accessible name of the back control on the screen pushed after it; `titleDisplayMode="large"` asks for a large title above the content that collapses into the bar as the screen's scroll target scrolls, and `inline` for the bar title only; `endContent` is the content at the bar's end, in reading direction. The root screen has no back control.                                                                                                                                                                                                                                                                                   | `component:NavigationStack` (`NavigationScreen`); `spec:AST-125` FR5                                          | verify             |
| FR7  | The header's back control MUST pop the top screen through the stack, with one `onPathChange` (FR4), and its accessible name is FR6's. Where the header offers a menu of earlier screens, choosing one pops straight to that screen in one transition and one `onPathChange`. How the back control and its menu look is the header component's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:NavigationStack`; FR4                                                                              | verify             |
| FR8  | While `isInteractivePopEnabled` is true, the iOS back swipe MUST pop: the system's edge swipe, and a sideways drag from anywhere in the content (the system's content swipe on iOS 26 and later; the host's full-width swipe below). A control that owns a horizontal drag keeps it, and a horizontal scroller at its leading edge hands the drag to the back swipe (`spec:AST-124` FR3). With `false`, no back swipe starts; the back control and the VoiceOver escape still pop.                                                                                                                                                                                                                                                                                                                                                                     | `component:NavigationStack` (`isInteractivePopEnabled`); `spec:AST-125` FR4; `spec:AST-124` FR3               | verify             |
| FR9  | On Android, back MUST be the system's: system back, the back key and TalkBack's back pop the top screen, and the predictive back gesture previews the screen below while the finger moves and pops on release or springs back, as the system decides. On Android, back starts from the system's back gesture, the back key or TalkBack, and a sideways drag in the content stays with the content. With `isInteractivePopEnabled={false}`, system back still pops, with the pop transition and no predictive preview. A sheet, a menu or a focused search field that is open above the stack takes back before the stack does.                                                                                                                                                                                                                         | `spec:AST-125` FR4; Android back navigation guidance; OQ1                                                     | human decision     |
| FR10 | `useNavigationStack()` MUST work from inside any screen of the stack: `push` adds an entry and calls `onPathChange`; `pop` removes the top entry and does nothing at the root; `popToRoot` empties `path`; `depth` is the number of entries. Each runs the same transition as the matching `path` change (FR3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:NavigationStack` (`useNavigationStack`)                                                            | settled            |
| FR11 | Transitions MUST be the platform's own. On iOS a push slides the new screen in from the trailing edge over the covered one, which moves a shorter distance under a dimming, and a released back swipe finishes or springs back by the system's distance and velocity rules. On Android a push and a pop use the Material shared-axis transition. Transitions and back gestures run on the UI thread with no JavaScript per frame.                                                                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-082` FR11; `spec:AST-093` FR2, FR3 (iOS); Material 3 motion guidance (Android); `spec:AST-125` FR11 | verify             |
| FR12 | Every screen's content MUST sit in exactly one `Screen`. A `NavigationScreen` whose child is a `Screen` uses that `Screen` as its frame; a `NavigationScreen` with any other children puts them in a `Screen` with `mode="scroll"`. A `Screen` inside a `Screen`'s content renders its children only and warns once in development, so the screen keeps one frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DEC-2                                                                                                         | verify             |
| FR13 | `Screen` with `mode="scroll"` (the default) MUST be the screen's one vertical scroll target: the large title collapses with it (FR6), its content scrolls under the bar and stops above the bottom of the safe area, and a sticky header in it sticks below the bar. With `mode="fill"`, the frame has no scroller and its content fills the space between the bar and the bottom of the safe area.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-125` FR5 (`scrollViewNativeID`), FR10                                                               | verify             |
| FR14 | A component or an app's own scroller MUST become the screen's scroll target in place of `Screen`'s own when it spreads the props `useScreenScrollProps()` returns (a component that takes a `scrollProps` prop passes them through it); its `Screen` then uses `mode="fill"`. A screen has one scroll target; a second one that spreads the props warns once in development.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DEC-2                                                                                                         | verify             |
| FR15 | `Screen` MUST apply the screen's insets from its first frame (`spec:AST-125` FR10; `spec:AST-129`), so no edge is padded twice and no content sits under the bar, the home indicator or a display cutout. It MUST keep a focused text field above the keyboard: in `scroll` mode by scrolling the field into view, in `fill` mode by ending its content above the keyboard. Content in a keyboard dock rides on the keyboard (`spec:AST-129`).                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-125` FR10; `spec:AST-129`                                                                           | verify             |
| FR16 | `onRefresh` MUST add the platform's pull to refresh to a `scroll` mode screen's scroll target: the system refresh control on iOS and the Material swipe-refresh indicator on Android. `isRefreshing` shows the indicator; the screen calls `onRefresh` when the person pulls past the system's threshold. A screen has one refresh home: a scroll target that brings its own refresh (a `List` with its own scroller) takes precedence and is the screen's refresh.                                                                                                                                                                                                                                                                                                                                                                                    | DEC-2                                                                                                         | verify             |
| FR17 | NavigationStack MUST be the stack of Astryx's router, which supports Astryx's header, tab bar and sheets: a stack the router declares behaves as this record states. An app MAY navigate with another router, such as Expo Router, instead. Astryx's components, `Screen` included, MUST then work inside that router's screens, and that router's navigation (its stack, transitions, back handling and header) is not covered by Astryx. There `Screen` takes its insets from the safe area (`spec:AST-129`) and adds no bar of its own.                                                                                                                                                                                                                                                                                                             | DEC-3                                                                                                         | settled            |
| FR18 | NavigationStack and `Screen` MUST need no third-party native library: their native pieces are Astryx's own (FR2; `spec:AST-112` FR2). An app MAY link react-native-screens, react-native-gesture-handler, Reanimated and react-native-safe-area-context beside them. With any of them linked, the stack's pushes, pops, back gestures and insets MUST behave as this record states, and those libraries' own views MUST keep their behaviour inside a `Screen`.                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-112` FR2; DEC-3                                                                                     | verify             |
| FR19 | In the Astryx router, a stack screen's `options` MAY be a function `({route, navigation, theme}) => options`, called in the screen's scope. `route` is the screen's route: its name, its key and its params. `navigation` is the stack's handle, the same `push`, `pop`, `popToRoot` and `depth` that `useNavigationStack()` returns (FR10). `theme` is the theme in the screen's scope. The options this function returns are app API: the four `NavigationScreen` values an app writes per screen (`title`, `backTitle`, `titleDisplayMode`, `endContent`; FR6). The header's own options live in `component:react-native/TopNav`; its flat options record is the wire format between composed TopNav parts and the native host, not app API. An option set is a function, so extending one is a call: `(args) => ({...base(args), title: 'Edit'})`. | FR6, FR10, FR17; DEC-4                                                                                        | verify             |
| FR20 | The React Native `NavigationStack`, with `Screen`, `useScreenScrollProps()` and the stack navigator, MUST start in the package's lab folder, `packages/react-native/lab/`, exported only under `./unstable/*` (`spec:AST-112` FR5), and MUST move to `./navigation` when web's `NavigationStack` leaves Lab (DEC-5). It follows web's Lab-to-Core lifecycle (`spec:AST-017` FR27, as Family and system relationships amends it). A pull request that changes the lab folder runs CI as any mixed pull request does (`spec:AST-030` FR13).                                                                                                                                                                                                                                                                                                              | `spec:AST-112` FR5; `spec:AST-017` FR27; `spec:AST-030` FR13; DEC-5                                           | settled            |

### Allowed variation

- **AV1 — The platform's navigation.** Transition curves and timing, the
  dimming and the predictive back preview are the platform's own and may change
  with each OS release.
- **AV2 — When the new screen takes touches.** The system transition decides
  when an incoming screen takes touches; a push that waits for the system
  transition before its screen is interactive is not a regression.

### Representative states

| State                                   | Required invariant                                                               | Allowed variation         |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| root only                               | no back control; the root screen in a `Screen`                                   | none                      |
| one pushed screen                       | back control named by the root's `backTitle` or `title`                          | the header's rendering    |
| pop to the root from three deep         | one transition; one `onPathChange([])`                                           | the platform's transition |
| back swipe cancelled                    | no `onPathChange`; the top screen stays                                          | none                      |
| back menu choice two screens down       | one `onPathChange` with both screens removed                                     | the system menu's look    |
| `isInteractivePopEnabled={false}`       | no back swipe on iOS; back control and VoiceOver escape pop                      | none                      |
| large title, scrolled                   | the title collapses into the bar with the scroll target                          | the header's rendering    |
| `mode="fill"` with a focused text field | the field's content ends above the keyboard                                      | none                      |
| Reduce Motion                           | button and program pushes and pops cross-fade; the back swipe follows the finger | none                      |

### Transformation and precedence order

- **ORD1 — Back.** An open sheet, menu or focused search field above the stack
  takes back first; then the stack pops its top screen; at the root, back
  leaves the stack to the app or the system.
- **ORD2 — Scroll target.** A component's own scroller that spreads
  `useScreenScrollProps()` (FR14), then `Screen`'s own scroller in `scroll`
  mode; `fill` mode has none.

### Performance and resources

- **PR1 — No JavaScript per frame.** Transitions, back gestures and the large
  title's collapse run on the UI thread; JavaScript hears a transition's start
  and end, a settled pop, and inset changes only (`spec:AST-125` FR11).
- **PR2 — Covered screens stay mounted and idle.** A covered screen keeps its
  tree and does no work of its own while covered; the stack adds no timer or
  listener per screen.

## Accessibility contract

- **AR1 — Push moves focus to the new title.** After a push, VoiceOver and
  TalkBack focus MUST land on the new screen's title and read it, unless focus
  is already inside that screen, as core moves focus on a push. The screen's
  title is its accessibility title: VoiceOver announces the screen change, and
  on Android the screen's pane title is its `title`, so TalkBack announces it.
- **AR2 — Pop returns focus.** After a pop, VoiceOver and TalkBack focus MUST
  return to the control that pushed the screen: the view `push`'s `sourceRef` points to when given,
  otherwise the element that had screen-reader focus when the push started.
- **AR3 — Back is named by its destination.** The back control's accessible
  name is the screen below's `backTitle`, else its `title`, else core's "Back"
  message, whether or not the control shows its title. The VoiceOver escape
  gesture and TalkBack's back pop under the same rules as the back control
  (FR8, FR9).
- **AR4 — Titles are headings and scale.** The bar title and the large title
  are headings to VoiceOver and TalkBack, and scale with Dynamic Type and
  Android's font scale (`spec:AST-125` FR13).
- **AR5 — Reduce Motion.** With iOS Reduce Motion, a push or pop that the back
  button, the back menu or the program starts cross-fades instead of sliding,
  as core's screens cross-fade; a back swipe still follows the finger. With
  Android's animations removed, transitions are instant.
- **AR6 — Covered screens are not read.** Covered screens are hidden from
  VoiceOver and TalkBack (FR5); `label` names the stack as a group, read when
  focus enters it.

## Design relationships

| Anatomy or state  | Design requirement                                  | Representation authority   | Hierarchy role | Component contract |
| ----------------- | --------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Transitions       | the platform's push, pop and predictive back motion | prescribed by the platform | supporting     | FR3, FR11, AR5     |
| Refresh indicator | the system refresh control; Material swipe-refresh  | prescribed by the platform | supporting     | FR16               |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): `UINavigationController` with its
interactive pop on iOS; an AndroidX fragment back stack with predictive back on
Android; `UIRefreshControl` and Material's swipe-refresh indicator. Guideline
pages: Accessibility (VoiceOver, Reduce Motion, Dynamic Type) and Motion in the
Apple Human Interface Guidelines (`spec:AST-093` FR3); on Android, Predictive
back and Motion (transitions) in Material 3, this record's own basis. The bar's representation is the header
component's.

Theme values read (`spec:AST-093` FR4): the native theme's appearance (light
or dark) and `color.backgroundBody` behind each screen. The bar's colours and
type are the header component's.

### Native pieces

| Native piece             | Record             | What this record uses it for                                                      |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `AstryxStackHost`        | `spec:AST-125` FR3 | the stack: pushes, pops, back controls, back gestures, predictive back (FR2–FR11) |
| `AstryxStackScreen`      | `spec:AST-125` FR5 | each screen: its title, the header's values and the scroll target (FR6, FR13)     |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3 | which of a control's drag and the back swipe takes a touch (FR8)                  |
| `AstryxSafeAreaProvider` | `spec:AST-129`     | the insets `Screen` applies (FR15)                                                |
| `AstryxKeyboardDock`     | `spec:AST-129`     | keeping focused fields and docked content above the keyboard (FR15)               |

## Family and system relationships

- `component:NavigationStack` owns the props, the screens, `useNavigationStack`
  and the focus rules; this record states how React Native renders them, and
  adds `Screen`. Until the core component has its own record, Lab's public
  source and documentation stand in as that contract.
- `spec:AST-125` owns the stack host and its native props and events; this
  record is one of the host's callers through the library's internal host
  entry.
- `spec:AST-124` FR3 owns drag ownership against the back swipe; FR13 owns its
  Reduce Motion and right-to-left rules, so the back direction is the trailing
  one in right-to-left.
- `spec:AST-094`'s touch release rules for popping a NavigationStack govern the
  web. On React Native the system's back gesture decides when a pop commits.
- `spec:AST-129` owns the safe area, the inset hooks and the keyboard dock.
- `spec:AST-017` FR27 keeps the React Native `NavigationStack`, with `Screen`,
  `useScreenScrollProps()`, and the stack navigator, in the lab folder of
  `@astryxdesign/react-native` instead of the Lab package until web's
  `NavigationStack` leaves Lab (FR20, DEC-5).
- `component:react-native/TopNav` owns the header
  and its parts; `NavigationScreen` maps its four bar props onto that header
  (FR6). App code declares a screen's header by composing TopNav parts, or by returning FR19's options, which are app API. The header record's flat options record is the wire format between composed TopNav parts and the native host, not app API.

## Verification map

| Contract       | Verification                                                                                                          | Representative states                                                                                                                                | Mutation or failure expectation                                                                                                                     | Audit section                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| FR1            | Type tests of the three exports against web's types; a contract drift test                                            | each prop; `push` with and without `sourceRef`, and with a `sourceRef` whose view unmounted before the pop; each export's entry under `./unstable/*` | a missing web prop, a different default, or an accepted and ignored prop fails                                                                      | `audit:react-native/NavigationStack/api`     |
| FR2, FR3       | Unit tests through the package's testing doubles (`spec:AST-112` FR15); Simulator and emulator checks                 | push one; pop one; pop three; replace the top; a change during a transition                                                                          | a host stack that differs from `path`, or a pop of several in more than one transition, fails                                                       | `audit:react-native/NavigationStack/stack`   |
| FR4            | Simulator and emulator checks of each pop source                                                                      | back control; back menu; swipe; cancelled swipe; predictive back; system back; escape                                                                | a pop with no `onPathChange`, two calls, or a call after a cancel fails                                                                             | `audit:react-native/NavigationStack/stack`   |
| FR5            | Unit tests; screen-reader checks on the Simulator and the emulator                                                    | a covered screen with scrolled content and typed state                                                                                               | lost state or scroll, or a covered screen reached by touch or a screen reader, fails                                                                | `audit:react-native/NavigationStack/stack`   |
| FR6, FR7       | Simulator and emulator captures in light and dark and at the largest text size                                        | inline; large and scrolled; `backTitle` set and unset; narrow bar; `endContent`                                                                      | a back control named by the wrong screen, or a large title that does not collapse, fails                                                            | `audit:react-native/NavigationStack/bar`     |
| FR8, FR9       | Simulator and emulator gesture checks                                                                                 | edge swipe; content swipe; a slider at the edge; a carousel at its leading edge; `false`                                                             | a swipe that takes an owned drag, a swipe with `false`, or an Android content swipe that pops fails                                                 | `audit:react-native/NavigationStack/back`    |
| FR10           | Unit tests of the hook from a pushed screen                                                                           | push; pop at the root; pop to root; depth                                                                                                            | a pop at the root that changes `path`, or a wrong depth, fails                                                                                      | `audit:react-native/NavigationStack/api`     |
| FR11, AR5, PR1 | Frame captures on the Simulator and the emulator, with and without Reduce Motion and removed animations               | push; pop; back swipe; predictive back; a large title collapsing as the screen scrolls                                                               | a slide under Reduce Motion for a button pop, or JavaScript work per frame during a transition, a back gesture or the large title's collapse, fails | `audit:react-native/NavigationStack/motion`  |
| FR12–FR14      | Unit tests of the frame rule and the scroll target                                                                    | default children; a `Screen` child; a nested `Screen`; a `List` with `scrollProps`                                                                   | two frames, two scroll targets, or a large title that ignores the list fails                                                                        | `audit:react-native/NavigationStack/screen`  |
| FR15           | First-frame captures of a pushed screen; keyboard checks on the Simulator and the emulator                            | portrait; landscape with a cutout; focused field in each mode                                                                                        | an edge padded twice, content under the bar, or a field under the keyboard fails                                                                    | `audit:react-native/NavigationStack/screen`  |
| FR16           | Simulator and emulator checks of pull to refresh                                                                      | pull; `isRefreshing`; `fill` mode; a `List` with its own refresh                                                                                     | two refresh controls, or none in `scroll` mode with `onRefresh`, fails                                                                              | `audit:react-native/NavigationStack/screen`  |
| FR17           | An app on another router (Expo Router) with Astryx components in its screens; Simulator and emulator checks           | a list, a sheet and a `Screen` inside the other router's screens                                                                                     | a component that fails or pads twice inside another router's screen fails                                                                           | `audit:react-native/NavigationStack/routers` |
| FR18           | A dependency check of the package; a build with each listed library linked, checked on the Simulator and the emulator | push; pop; back swipe; a gesture-handler pan inside a `Screen`; insets beside the safe-area library's                                                | a third-party native dependency, a build or class conflict, a back swipe that takes the pan's touch, or insets that disagree fails                  | `audit:react-native/NavigationStack/routers` |
| FR19           | Unit tests of the option function                                                                                     | `options` as a function of `route` on a router stack screen; `navigation.push` from an option; an option set extended by a call                      | an option that does not reach the screen, or an extended set that drops the base's options fails                                                    | `audit:react-native/NavigationStack/options` |
| FR20           | An export check of the four names; the CI lane of a pull request that changes only the lab folder                     | each of the four names; a pull request that changes only `packages/react-native/lab/`; web's `NavigationStack` leaving Lab                           | a name in a stable entry or outside `./unstable/*` while web's `NavigationStack` is in Lab, or a lab change on the Lab-only lane, fails             | `audit:react-native/NavigationStack/api`     |
| ORD1, FR9      | Simulator and emulator checks of back with a presentation open above the stack                                        | an open sheet; an open menu; a focused search field; none open; the root                                                                             | back that pops the stack while a sheet, menu or focused search field is open, or that does nothing at the root instead of leaving the stack, fails  | `audit:react-native/NavigationStack/back`    |
| PR2            | Unit tests through the testing doubles counting timers, listeners and renders per covered screen                      | three covered screens; a push and a pop over them                                                                                                    | a timer or listener per screen, or a covered screen that renders on its own while covered, fails                                                    | `audit:react-native/NavigationStack/stack`   |
| AR1–AR4, AR6   | VoiceOver and TalkBack checks on the Simulator, the emulator and devices                                              | push; pop; push from a row; back menu; largest text size                                                                                             | focus that does not reach the new title, or does not return to the pushing control, fails                                                           | `audit:react-native/NavigationStack/a11y`    |

## Decision log

### DEC-1 — React Native keeps web's NavigationStack API and renders it with the platform's stack

**Reference:** `component:react-native/NavigationStack/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

An Astryx developer drives drill-down navigation the same way on the web and on
a phone: the app owns `path`, and screens are `NavigationScreen`s. The stack
renders on the platform's own navigation container, so transitions, back
controls, back gestures and predictive back are the system's, and every pop
the system completes comes back to the app as `onPathChange`.

### DEC-2 — The screen container belongs to the stack on React Native

**Reference:** `component:react-native/NavigationStack/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

On a phone each screen needs one frame that applies the screen's insets, keeps
fields above the keyboard, hosts pull to refresh and names the one scroll
target the bar follows. `Screen` is that frame, and every `NavigationScreen`
has one.

### DEC-3 — Astryx has its own router, and an app may use another

**Reference:** `component:react-native/NavigationStack/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Astryx's router supports Astryx's header, tab bar and sheets, so an app that
uses it gets them from one declaration per screen. An app that already
navigates with another router, such as Expo Router, keeps it: Astryx's
components work inside its screens, and its navigation stays that router's.
NavigationStack needs no third-party native library, and the common native
navigation and gesture libraries can sit beside it.

### DEC-4 — A screen's options are a function of the screen's scope

**Reference:** `component:react-native/NavigationStack/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

Options that read the route, the navigation and the theme of the screen they
configure stay correct per route and per screen. Because an option set is a
function, an app extends one by calling it.

### DEC-5 — The React Native NavigationStack follows web's Lab lifecycle

**Reference:** `component:react-native/NavigationStack/DEC-5`
**Decider:** cixzhang, 2026-11-18 13:06 PT

Web's `NavigationStack` is a Lab component, and this record is its React Native
form, so the React Native stack follows the same lifecycle: it starts in the
package's lab space under `./unstable/*` (FR20) and moves to the
`./navigation` entry of `@astryxdesign/react-native` when web's `NavigationStack`
leaves Lab. `Screen` and
`useScreenScrollProps()` move with it, since every stack screen sits in a
`Screen`.

### DEC-6 — A ref-valued input ends in `Ref`

**Reference:** `component:react-native/NavigationStack/DEC-6`
**Decider:** cixzhang, 2026-11-18 13:28–13:35 PT

`push`'s source is a ref object to the native view that pushed, as every
`…Ref` input in the system is a ref (`spec:AST-116` DEC-1). A caller passes the
ref it already holds, such as a row's ref, and the stack reads the view when the
pop returns focus.

## Open questions

- **OQ1 — What does `isInteractivePopEnabled={false}` do on Android?**
  (`human-api`) Options: system back still pops, without the predictive preview
  (FR9 as written); or system back is refused while it is false, as a guard.
- **OQ2 — Does the system's own focus move meet AR1 and AR2?** (`checkable`)
  `spec:AST-125` FR13 leaves focus after a push or pop to the system container.
  Where the system does not land on the new title, or does not return focus to
  the pushing control, the stack moves focus itself when the transition ends.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
