---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TabBar
platform_of: component:TabBar
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
    responsive,
    theming,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093]
---

# TabBar (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `TabBar` (`value`, `onChange`, `onReselect`, `label`, `children`, `moreValue`), `TabBarItem` (`value`, `label`, `icon`, `selectedIcon`, `badge`, `badgeLabel`, `aria-disabled`) and `TabBarMoreList` (`children`, `value`, `onChange`), without `panelId`. React Native adds `bottomAccessory`, `minimize` and `onLongPress` on `TabBar`, `render` on the router's tab navigator, the `BottomAccessory` component (`children`, `onClick`, `label`) and `useBottomAccessoryPlacement()`.                                                                                                                                                                                                                                                                                                               |
| Behavior                | `render` says who draws the bar's pixels: `system`, the tabs host presents the platform's tab bar; `drawn`, Astryx draws it in React; `auto` (the default), this component's default, which is `system` on iOS and `drawn` on Android unless the native theme's `render.default` (`spec:AST-112/FR21`) overrides every `auto`. A standalone TabBar is drawn. The drawn bar's glass or material look comes from the native theme's `material` member. A compact screen (`spec:AST-012` FR9) shows a bar; any other shows a sidebar or a rail. More than five tabs gets a More tab on iOS and is a development error on a compact Android screen. Every option means the same under both renderings: a plain colour is used as given, and a function of the theme resolves in the scope of the screen on top. |
| End-user impact         | A person gets each platform's own tab bar: Liquid Glass, minimize on scroll and the bottom accessory on iOS 26, a Material 3 navigation bar or rail on Android, badges read with their tab, and choosing the selected tab again returns its section to the top.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Builder impact          | Web code that drives a `TabBar` from app state ports with three exceptions: `panelId` is gone, `icon` and `selectedIcon` take an `Icon` element rather than any node, and a compact Android screen holds at most five tabs (FR6), where the web shows More. An app on the Astryx router declares tabs once and gets the platform's bar; an app on another router draws a standalone TabBar inside its own screens.                                                                                                                                                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. The drawn rendering has gap lines under FR8, FR9 and FR5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Review checks           | Reject a default rendering that the navigation library decides, a compact Android bar with more than five destinations that does not stop in development, a selected state or badge that a screen reader misses, a minimize that runs JavaScript per frame or runs while a screen reader is on, a public glass component, a web prop accepted and ignored, or a third-party native library the bar needs.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Governing rules         | `component:TabBar`; `spec:AST-012` FR9; `spec:AST-082` FR3–FR5, FR7, FR10, FR11, DEC-2; `spec:AST-085` FR1, FR2, FR5; `spec:AST-093` FR1–FR5; `spec:AST-112` FR2, FR10, FR19–FR21 (with its amendments to `spec:AST-082` FR10 and DEC-2); `spec:AST-125` FR1, FR5, FR7–FR13; `spec:AST-123` FR1, FR3, FR5, FR7, FR10; `spec:AST-127` FR4, FR9; DEC-1 to DEC-6 below.                                                                                                                                                                                                                                                                                                                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

TabBar on React Native is web's bar of an app's top-level sections, shown as
each platform's own tab bar, so the sections, their badges and their
selection work the way the rest of the phone works, while the API, the words
and the accessibility semantics follow the core `TabBar` contract. It also
holds the bottom accessory, the bar's own content above or beside it, which a
web page does not need.

In this record, "the core component" is `component:TabBar`: Lab's `TabBar`,
whose record covers `TabBar`, `TabBarItem` and `TabBarMoreList`.
`TabBarMoreList` is the core component's More list, not a component of its
own; this record treats it as part of TabBar.

## Why this exists

A phone app's tab bar is the platform's most visible chrome: on iOS 26 it
floats in Liquid Glass, minimizes as content scrolls and carries a bottom
accessory; on Android it is a Material 3 navigation bar that becomes a rail
on a wide window. An app otherwise adds a third-party tab navigator and its
native code to get it. The navigation hosts (`spec:AST-125`) hold the native
tab containers, and the library draws its own bar where the system's does not
fit, so TabBar gives both renderings behind web's API.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `value`; in the router's tab navigator the router owns it
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `TabBar`, `TabBarItem` and
  `TabBarMoreList`, standalone and in the router's tab navigator (FR1–FR4).
- Which rendering the tab bar uses by default on each platform, and how an
  app picks the other one (FR3, DEC-1).
- The tab layout by compact: a bar, a sidebar or a rail (FR5).
- How many destinations a bar holds on each platform, and the development
  error past Android's limit (FR6, DEC-3).
- Re-select, badges, minimize on scroll and the bar's look on each platform
  (FR7, FR9, FR10, FR12).
- `BottomAccessory` and its two placements (FR11, DEC-2).

**Does not own / non-goals**

- The meaning of the tabs' props, the More tab and its list, and the disabled
  tab rules — owned by `component:TabBar` and `spec:AST-085`.
- The native tab containers and their native props and events — owned by
  `spec:AST-125`.
- How the header renders — owned by the React Native header record.
- The paint of glass and material surfaces — owned by `spec:AST-123`; icon
  resolution — owned by `spec:AST-127`.

## Public concepts

| Concept             | Closed values or states               | Meaning                                                                                                                                                     | Availability by variant/orientation/state                                      | Default                                                                                       | Owner                           | Stability    | Invalid-value behavior                                              |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------- | ------------ | ------------------------------------------------------------------- |
| `render`            | `auto`; `system`; `drawn`             | who draws the bar's pixels: the tabs host presents the platform's tab bar (`system`); Astryx draws it in React (`drawn`); this component's default (`auto`) | the router's tab navigator; a standalone TabBar is drawn and takes no `render` | `auto`: `system` on iOS, `drawn` on Android, unless the theme's `render.default` overrides it | `component:react-native/TabBar` | experimental | an unknown value is a type error                                    |
| layout              | bar; sidebar; rail                    | where the destinations sit: along the bottom, or along the leading edge of a screen that is not compact                                                     | always; chosen by compact (`spec:AST-012` FR9)                                 | bar on a compact screen                                                                       | `component:react-native/TabBar` | experimental | none                                                                |
| More tab            | shown; hidden                         | the fifth slot that holds every tab past the fourth                                                                                                         | iOS and iPadOS on a compact screen, past five tabs                             | hidden                                                                                        | `component:TabBar`              | experimental | none                                                                |
| `minimize`          | `never`; `onScrollDown`; `onScrollUp` | whether the bar gets smaller, or leaves, as the selected section's content scrolls                                                                          | always; never while a screen reader is on                                      | `never`                                                                                       | `component:react-native/TabBar` | experimental | an unknown value is a type error                                    |
| accessory placement | `expanded`; `inline`                  | the bottom accessory above the bar, or beside a minimized bar                                                                                               | `inline` on iOS only                                                           | `expanded`                                                                                    | `component:react-native/TabBar` | experimental | none                                                                |
| destination count   | one to five; more                     | how many tabs the bar holds                                                                                                                                 | always                                                                         | none                                                                                          | `component:react-native/TabBar` | experimental | more than five on a compact Android screen: development error (FR6) |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                                  | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------ |
| FR1  | The React Native `TabBar`, `TabBarItem` and `TabBarMoreList` MUST take web's props with web's names, types, defaults and meaning, with two exceptions. `panelId` is not offered, because React Native has no element ids to wire as `aria-controls`; FR7 gives re-select its scroll target instead. `icon` and `selectedIcon` take an `Icon` element, so the system rendering can read the icon's name (FR3). TabBar MUST NOT offer a prop it does not fully honor; web base props follow `spec:AST-082` FR7.                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-082` FR3, FR5, FR7; `spec:AST-112` FR10; DEC-5                               | settled            |
| FR2  | React Native adds, each for a platform reason: `bottomAccessory` on `TabBar`, a `BottomAccessory` the bar carries (FR11), because iOS 26's tab bar has an accessory and a web page does not; `minimize` (FR10), because phone tab bars get smaller or leave as content scrolls; and `onLongPress(value)`, called when a tab is held, because the platforms' tab bars report a long press (a menu of the section's recent places). The router's tab navigator takes `render` (FR3). An unset addition changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-125` FR8, FR9; `spec:AST-082` FR5                                            | settled            |
| FR3  | In the Astryx router's tab navigator, the navigator's `render` prop MUST say who draws the tab bar's pixels: with `'system'` the tabs host presents the platform's tab bar (`UITabBarController` on iOS and iPadOS, Material's `NavigationBarView` on Android); with `'drawn'` Astryx draws the bar in React (a bar on the chrome glass on iOS, a Material 3 navigation bar on Android); `'auto'`, the default, is this component's default, `system` on iOS and iPadOS and `drawn` on Android, unless the native theme's `render.default` overrides every `auto` (`spec:AST-112/FR21`, the member it adds to `spec:AST-082` FR10). `render` never chooses glass or material: the drawn bar's look is FR12's. TabBar decides this default; the navigation library and the header record do not.                                                                                                                                                          | `spec:AST-125` FR1, FR8; `spec:AST-093` FR2, FR3; `spec:AST-112/FR21`; DEC-1           | settled            |
| FR4  | A standalone TabBar, outside the router's tab navigator, MUST render the drawn bar on both platforms and takes no `render` prop, because the system tab bar owns its tabs' content views and a standalone TabBar leaves its sections to the app, as on the web. It is the bar an app draws on another router, such as Expo Router, inside that router's screens, or with no router.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-125` FR1, DEC-6; DEC-1                                                       | settled            |
| FR5  | Compact, as `spec:AST-012` FR9 defines it (a viewport width below the effective `md` point, 768 by default, or a height below 500, in points or dp), MUST choose the layout; platform size classes do not. On a compact screen the destinations sit in a bar along the bottom. On any other screen they sit along the leading edge: under the system rendering, the library asks the tabs host for the iPadOS sidebar that the tab bar adapts to (iPadOS 18 and later, as `tabBarControllerMode` allows) or Android's Material navigation rail; under the drawn rendering, a rail the library draws. A change while the app runs (a rotation, a resized window, a fold) switches the layout without remounting any tab's content or changing the selection.                                                                                                                                                                                              | `spec:AST-012` FR9; `spec:AST-082` FR11; `spec:AST-093` FR3; `spec:AST-125` FR8; DEC-4 | verify             |
| FR6  | Past five tabs on a compact screen on iOS and iPadOS, the bar MUST show four tabs and More, as the core component's FR1–FR4 state: the system rendering uses `UITabBarController`'s More list, and the drawn rendering shows `TabBarMoreList`, which the router's tab navigator renders for the app. On a compact Android screen, more than five destinations MUST stop a development build with an error that names the count and fixes that work on a phone: keep five destinations in the bar and reach the rest from a screen, a navigation drawer or a menu in the top app bar. On any other Android screen, the rail holds up to seven destinations under either rendering; more than seven is the same error.                                                                                                                                                                                                                                     | `component:TabBar` FR1–FR4; Material 3 navigation bar guidance; DEC-3; OQ1             | verify             |
| FR7  | Choosing the selected tab again MUST call `onReselect` with its value, never `onChange`. In the router's tab navigator, unless the tab's `tabBarRepeatedPressBehavior` is `none`, a tab whose stack is deeper than its root pops to the root through the stack's own guard, and a tab at its root scrolls its screen's scroll target to the top; under the system rendering the tabs host does both, and a guarded stack reports a refused re-select. A standalone TabBar calls `onReselect` only, and the app returns its section to the top.                                                                                                                                                                                                                                                                                                                                                                                                           | `component:TabBar` FR3; `spec:AST-125` FR3, FR8, DEC-4                                 | verify             |
| FR8  | The router's tab options MUST behave as the option table below states, and every option MUST mean the same under both renderings: where both honor an option, they draw the same value for it. An option a rendering does not honor warns once in development and changes nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-125` FR5, FR8; `spec:AST-112` FR10; DEC-6                                    | verify             |
| FR9  | A badge MUST show as the core component gives it: a number as a count in the locale's digits, a short string as written, and nothing for an empty string. It appears, changes and disappears without animating. Under the system rendering it is `UITabBarItem`'s badge on iOS and Material's badge on Android; the drawn rendering draws the same at the icon's top-trailing corner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:TabBar` (`badge`); `spec:AST-125` FR8                                       | verify             |
| FR10 | `minimize` (and the router's `tabBarMinimizeBehavior`) MUST follow the selected tab's screen scroll target. On iOS 26 and later the system rendering uses the system's minimize; below iOS 26 the bar never minimizes. The drawn rendering on iOS shrinks the bar to the selected tab, whose press expands it again, and moves the bottom accessory inline. On Android the bar slides away as content scrolls down and returns as it scrolls up, as Material's hide-on-scroll does; `automatic` is `never` there. The bar never minimizes while VoiceOver or TalkBack is on, so every tab stays reachable.                                                                                                                                                                                                                                                                                                                                               | `spec:AST-125` FR8, FR11; `spec:AST-093` FR2                                           | verify             |
| FR11 | `BottomAccessory` MUST be one component with two placements, `expanded` (above the bar) and `inline` (beside a minimized bar); `useBottomAccessoryPlacement()` returns the current one, so content lays itself out for each. On iOS 26 and later under the system rendering it is the system's bottom accessory; under the drawn rendering on iOS it is a capsule above the bar that moves beside the minimized bar. Below iOS 26 and on Android it docks above the bar and is always `expanded`. With `onClick`, a press outside the accessory's own controls calls it, and `label` names it; `onClick` without `label` warns once in development. The accessory's height is part of every tab screen's bottom inset.                                                                                                                                                                                                                                   | `spec:AST-125` FR9, FR10; DEC-2                                                        | verify             |
| FR12 | The bar's look MUST come from the theme and the tab options, never from a glass or material prop on TabBar. Under `render` `system` the system draws it: Liquid Glass on iOS 26 and later, Material 3 on Android. Under `render` `drawn`, the native theme's `material` member decides the look: on iOS chrome glass, painted as `spec:AST-123` FR7 chooses, which is the opaque paint under Reduce Transparency, Increase Contrast or a theme whose `material` is `opaque`; on Android the theme's surface, not a simulated glass. Where an app needs more, the tab options `tabBarStyle` and `tabBarBackground` (FR8) set it. The bar's glass views stay internal: TabBar exports no glass or material component.                                                                                                                                                                                                                                      | `spec:AST-123` FR1, FR7, DEC-2, DEC-6; `spec:AST-082` FR10, DEC-2                      | verify             |
| FR13 | Under a finger, the drawn rendering on iOS MUST behave as the core component's bar does on touch: the lens lifts as a finger lands, follows a drag across the tabs and settles on the tab where the finger lifts, which it chooses. The drawn rendering on Android behaves as Material's navigation bar: a tap chooses a tab, and its active indicator moves to it. The system rendering is the system's own. A disabled tab follows the core component's FR5 and FR6 and `spec:AST-085` FR2 under every rendering.                                                                                                                                                                                                                                                                                                                                                                                                                                      | `component:TabBar`; `spec:AST-085` FR2; `spec:AST-093` FR2, FR3                        | verify             |
| FR14 | In the router's tab navigator, the room the bar and the bottom accessory take MUST reach each tab screen's bottom inset (`useScreenInsets()`), the screens of a stack inside the tab included, so content scrolls under the bar and stops above it; a hidden bar takes no room. A standalone TabBar sits at its parent's bottom edge, above the bottom safe area.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-125` FR10; `spec:AST-129`                                                    | verify             |
| FR15 | TabBar and BottomAccessory MUST need no third-party native library: their native pieces are Astryx's own. An app may link other navigation and gesture libraries beside them; the bar behaves as this record states with them linked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-112` FR2, FR20; `spec:AST-140` FR9                                           | verify             |
| FR16 | Under the system rendering with the navigation hosts absent, the tab navigator MUST fail at its first render with an error that names the missing capability, never a blank screen. The drawn rendering needs no host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-125` FR12                                                                    | settled            |
| FR17 | A colour-bearing tab option (`tabBarActiveTintColor`, `tabBarInactiveTintColor`, and the colours inside `tabBarStyle`, `tabBarItemStyle`, `tabBarLabelStyle` and `tabBarBackground`) is theme-derived only when the app gives it as a function of the theme; the bar MUST then resolve it in the scope of the screen on top of the selected tab, so a screen with its own light or dark appearance gets the bar in that mode under either rendering. A plain colour value is the app's: both renderings MUST use it as given, even when it equals a theme default, and never re-ink it for the screen's mode. A theme-derived option set, the library's own included, is a function of the theme: an app extends one by calling it inside its own function and adding to the result, never by spreading a resolved object. No option object carries a hidden mark of where it came from, and the bar never infers provenance by comparing colour values. | `spec:AST-125` FR7; `spec:AST-082` FR10; DEC-6                                         | verify             |

### Router tab options

| Option                                                                                            | System, iOS and iPadOS                                                                  | System, Android                               | Drawn                                                                 |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `title`, `tabBarLabel`                                                                            | the tab's label                                                                         | the destination's label                       | the tab's label                                                       |
| `tabBarIcon`                                                                                      | a system symbol, an Astryx glyph or an image (`spec:AST-127` FR4)                       | an Astryx glyph or an image                   | the icon as `spec:AST-127` FR4 resolves it                            |
| `tabBarBadge`                                                                                     | `UITabBarItem`'s badge                                                                  | Material's badge                              | the drawn badge (FR9)                                                 |
| `tabBarAccessibilityLabel`, `tabBarButtonTestID`                                                  | honored                                                                                 | honored                                       | honored                                                               |
| `tabBarActiveTintColor`, `tabBarInactiveTintColor` (FR17)                                         | honored                                                                                 | honored                                       | honored                                                               |
| `tabBarStyle`, `tabBarItemStyle`, `tabBarLabelStyle`, `tabBarBackground`                          | honored where the system bar has the property                                           | honored where Material's bar has the property | honored                                                               |
| `tabBarRole: 'search'`                                                                            | the system's search tab (iOS 18 and later; floating apart on iOS 26); a plain tab below | a plain tab                                   | a search tab apart at the trailing end on iOS; a plain tab on Android |
| `tabBarMinimizeBehavior`                                                                          | the system's minimize (iOS 26 and later)                                                | hide on scroll; `automatic` is `never`        | FR10                                                                  |
| `tabBarControllerMode`                                                                            | the iPadOS sidebar (iPadOS 18 and later)                                                | the rail when not compact (FR5)               | the drawn rail when not compact (FR5)                                 |
| `bottomAccessory`                                                                                 | the system's accessory, `expanded` and `inline` (iOS 26); docked and `expanded` below   | docked, `expanded`                            | `expanded` and `inline` on iOS; `expanded` on Android                 |
| `tabBarHidden`, `tabBarSelectionEnabled`, `tabBarRepeatedPressBehavior`, `lazy`, `popToTopOnBlur` | honored                                                                                 | honored                                       | honored                                                               |
| a stack screen's `hidesTabBarWhenPushed`                                                          | the bar leaves with the push and returns with the pop                                   | the same                                      | the same                                                              |

- FR8 gap: the drawn rendering ignores `tabBarStyle`, `tabBarItemStyle`,
  `tabBarLabelStyle` and `tabBarBackground`, with a development warning; it
  takes the theme only.
- FR8 gap: the drawn rendering ignores `tabBarRole: 'search'` and
  `tabBarControllerMode`, with a development warning.
- FR8 gap: the drawn rendering ignores a stack screen's
  `hidesTabBarWhenPushed`, with a development warning; the bar stays while
  the screen is pushed.
- FR8 gap: the drawn rendering draws a neutral glyph for an icon that resolves
  only to an image or a platform symbol.
- FR5 gap: the drawn rendering draws a bottom bar at every width; it has no
  rail.
- FR9 gap: the drawn rendering draws a badge that is not a number as a dot,
  read with its words.

### Allowed variation

- **AV1 — The platform's bar.** Under the system rendering, the bar's glass,
  its minimize and accessory motion, the More list and the sidebar are the
  system's own and may change with each OS release.
- **AV2 — Android's hide on scroll.** The distance and timing of the bar's
  slide are Material's.

### Representative states

| State                                 | Required invariant                                                        | Allowed variation      |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| router tabs, iOS, `render` `auto`     | the system tab bar, unless the theme's `render.default` is `drawn`        | the system's glass     |
| router tabs, Android, `render` `auto` | the drawn Material 3 bar, unless the theme's `render.default` is `system` | none                   |
| standalone TabBar                     | drawn on both platforms                                                   | none                   |
| six tabs, iPhone                      | four tabs and More                                                        | the system's More list |
| six tabs, compact Android screen      | a development build stops with FR6's error                                | none                   |
| not compact                           | a sidebar (iPadOS system) or a rail                                       | the system's sidebar   |
| a rotation that ends compact          | the layout changes; tab content and selection stay                        | none                   |
| re-select on a pushed screen          | the stack pops to its root; `onReselect` is called                        | none                   |
| minimized with an accessory, iOS 26   | the accessory is `inline` beside the bar                                  | the system's motion    |
| VoiceOver or TalkBack on              | the bar never minimizes                                                   | none                   |
| Reduce Transparency, drawn on iOS     | the opaque paint with an outline                                          | none                   |

### Transformation and precedence order

- **ORD1 — Rendering.** A standalone TabBar is drawn (FR4). In the router's
  tab navigator: an explicit `render` of `system` or `drawn`; then, for
  `auto`, the native theme's `render.default`; then this component's default,
  `system` on iOS and iPadOS and `drawn` on Android (FR3).
- **ORD2 — Layout.** Compact chooses bar or leading edge (FR5); then
  the destination count applies the More tab or FR6's error for that layout.
- **ORD3 — Paint.** `spec:AST-123` FR7's order: accessibility settings, then
  the theme's `material`, then glass where it can paint.
- **ORD4 — Theme-derived options.** A plain colour is the app's and applies
  as given under both renderings; a function of the theme resolves in the
  scope of the screen on top of the selected tab (FR17).

### Performance and resources

- **PR1 — No JavaScript per frame.** The lens, minimize, the accessory's
  placement change and Android's hide on scroll run on the UI thread;
  JavaScript hears a selection, a re-select, a long press and a placement
  change only (`spec:AST-125` FR11).
- **PR2 — Only visited tabs render.** In the router's tab navigator a tab's
  screen renders when it is first visited, unless its `lazy` option is false;
  a visited tab keeps its tree and does no work of its own while unselected.

## Accessibility contract

- **AR1 — A tab list of tabs.** The bar is a tab list named by `label`, else
  core's "Tabs" message. Each tab has the tab role, its label as its name, and
  its selected state; a disabled tab keeps its focus stop and reads as
  disabled (`spec:AST-085` FR1, FR5). The system rendering keeps the
  platform's own VoiceOver and TalkBack behaviour for these.
- **AR2 — Badges are read with their tab.** A tab with a badge reads its label
  and then `badgeLabel`, else the badge, through core's
  `@astryx.tabBar.badgedItem` message, as one name; below iOS 26 the system
  rendering reads the badge as the tab's value. A badge change is read when
  focus next reaches the tab and is not announced while focus is elsewhere, as
  the platforms' tab bars do.
- **AR3 — Text size.** On iOS and iPadOS, under both renderings, tab labels and
  glyphs keep the bar's size at every Dynamic Type size, and a long press on a
  tab shows the Large Content Viewer with its glyph and label
  (`spec:AST-127` FR9). On Android, labels follow the font scale, as
  Material's bar does.
- **AR4 — Reduce Motion.** With iOS Reduce Motion, the lens, minimize and the
  accessory's placement change swap without moving, and a bar that leaves
  fades. With Android's animations removed, they are instant.
- **AR5 — No gesture-only actions.** A tab's long press (`onLongPress`) is also
  a VoiceOver custom action and a TalkBack long-click action.
- **AR6 — Keyboard.** With a hardware keyboard, the drawn rendering moves
  between tabs with the arrow keys and skips a disabled tab, as the core
  component's FR6 states; the system rendering uses the platform's keyboard
  navigation.
- **AR7 — The More list and the accessory are named.** `TabBarMoreList` is
  named by core's `@astryx.tabBar.more` message; a pressable
  `BottomAccessory` is a button named by `label`, and its own controls stay
  separate elements.

## Design relationships

| Anatomy or state   | Design requirement                                       | Representation authority   | Hierarchy role | Component contract |
| ------------------ | -------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| System tab bar     | `UITabBarController`; Material's navigation bar and rail | prescribed by the platform | primary        | FR3, FR5           |
| Drawn bar, iOS     | the core component's bar on the chrome glass             | prescribed (UIKit)         | primary        | FR4, FR12, FR13    |
| Drawn bar, Android | Material 3 navigation bar                                | prescribed (Material 3)    | primary        | FR4, FR12, FR13    |
| Bottom accessory   | iOS 26's tab bar accessory                               | prescribed by the platform | supporting     | FR11               |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): `UITabBarController` with `UITab`,
`UISearchTab`, the sidebar and the bottom accessory on iOS and iPadOS;
Material's `NavigationBarView` and `NavigationRailView` with badges on
Android. Guideline pages: Tab bars, Sidebars, Materials (Liquid Glass) and
Accessibility (VoiceOver, Large Content Viewer, Reduce Motion, Reduce
Transparency) in the Apple Human Interface Guidelines; Navigation bar,
Navigation rail and Badges in Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the accent colour for the selected
tab, the text colours for unselected tabs and labels, the error colour for
badges, the surface and border colours for the opaque paint and Android's
bar, the native theme's `material` intent (`spec:AST-082` FR10), and the
theme's motion.

### Native pieces

| Native piece                                             | Record                       | What this record uses it for                                                                        |
| -------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `AstryxTabsHost`                                         | `spec:AST-125` FR8           | the system rendering: selection, re-select, minimize, the sidebar and the rail (FR3, FR5–FR7, FR10) |
| `AstryxTabScreen`                                        | `spec:AST-125` FR8           | each tab's label, icon, badge and role under the system rendering (FR8, FR9)                        |
| `AstryxTabAccessory`                                     | `spec:AST-125` FR9           | the bottom accessory under the system rendering (FR11)                                              |
| `AstryxStackScreen`                                      | `spec:AST-125` FR5           | `hidesTabBarWhenPushed` on a stack inside a tab (FR8)                                               |
| `AstryxGlassView`, `AstryxGlassContainerView`            | `spec:AST-123` FR3, FR5, FR7 | the drawn bar's and the accessory's chrome glass on iOS (FR12)                                      |
| `AstryxSymbolView`, `AstryxVectorView`, `AstryxIconView` | `spec:AST-127` FR4, FR9      | tab icons and the Large Content Viewer glyph (FR8, AR3)                                             |

## Family and system relationships

- `component:TabBar` owns the props, the More tab and its list, the badge
  words and the disabled tab rules; this record states only what React
  Native adds or does differently.
- `spec:AST-125` owns the tabs host, the tab screen and the tab accessory,
  and their native props and events. Its Platform support lists a More list
  past five destinations on Android's bar; FR6 stops a development build
  before a compact Android bar reaches it. Its Platform support places
  Android's rail at 600 dp; TabBar asks the host for the bar or the rail by
  compact (FR5).
- `spec:AST-123` owns the glass and opaque paints; `spec:AST-127` owns icon
  resolution and the Large Content Viewer glyph; `spec:AST-129` owns the safe
  area.
- `component:react-native/NavigationStack` owns the stack inside a tab and its
  scroll target, which re-select (FR7) and minimize (FR10) follow.
- The React Native header record decides the header's rendering; this record
  decides only the tab bar's.

## Verification map

| Contract           | Verification                                                                                                            | Representative states                                                                                                                                            | Mutation or failure expectation                                                                                                                                                             | Audit section                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1, FR2           | Type tests of the exports against web's types; a contract drift test                                                    | each prop; `panelId` absent; each addition unset                                                                                                                 | a missing web prop, a different default, or an accepted and ignored prop fails                                                                                                              | `audit:react-native/TabBar/api`       |
| FR3, FR4           | Unit tests of the rendering choice through the package's testing doubles; Simulator and emulator captures               | router tabs on iOS and Android with `render` `auto`, `system` and `drawn`; `auto` under each theme `render.default`; standalone                                  | a default other than system on iOS and drawn on Android, a theme default that `auto` ignores, an explicit `render` that the theme overrides, or a system bar for a standalone TabBar, fails | `audit:react-native/TabBar/rendering` |
| FR5                | Simulator and emulator captures at compact and regular widths; a rotation and a resized window                          | iPhone; iPad; a phone; a tablet just below and above 768 dp; a phone in landscape below 500 high; a fold                                                         | a bottom bar on a screen that is not compact, a layout chosen by a platform size class, or remounted tab content or a lost selection after a change, fails                                  | `audit:react-native/TabBar/layout`    |
| FR6, OQ1           | Unit tests of the destination check; Simulator and emulator captures                                                    | five and six tabs on iPhone; six on a compact Android screen; seven and eight on a rail                                                                          | no More tab on iPhone, or six destinations on a compact Android screen without the error, fails                                                                                             | `audit:react-native/TabBar/limits`    |
| FR7                | Simulator and emulator re-select checks                                                                                 | a pushed stack; a stack at its root; a guarded stack; `tabBarRepeatedPressBehavior: 'none'`                                                                      | `onChange` on a re-select, a pop through a guard, or no scroll to the top at the root fails                                                                                                 | `audit:react-native/TabBar/reselect`  |
| FR8                | Unit tests of the option mapping; Simulator and emulator captures per option                                            | each row of the option table under each rendering                                                                                                                | an option that changes nothing where the table says it is honored, or no warning where it is not, fails                                                                                     | `audit:react-native/TabBar/options`   |
| FR9, AR2           | Unit tests of badge formatting; VoiceOver and TalkBack checks                                                           | a count; a large count in another locale's digits; `"!"`; empty; a badge change                                                                                  | an animated badge, a lost word badge, or a badge not read with its tab fails                                                                                                                | `audit:react-native/TabBar/badges`    |
| FR10, PR1          | Frame captures on the Simulator and the emulator with scrolling content; screen-reader checks                           | each `minimize` value; iOS 26 and an earlier iOS; Android; VoiceOver on                                                                                          | JavaScript work per frame, a minimize while a screen reader is on, or a minimize below iOS 26 fails                                                                                         | `audit:react-native/TabBar/minimize`  |
| FR11               | Simulator and emulator captures; unit tests of the placement hook                                                       | expanded; inline; below iOS 26; Android; `onClick` without `label`                                                                                               | an `inline` placement on Android, a placement the hook misreports, or content under the accessory fails                                                                                     | `audit:react-native/TabBar/accessory` |
| FR12, AR4          | Simulator captures with Reduce Transparency, Increase Contrast and a theme with `material: 'opaque'`; emulator captures | the drawn bar on iOS 26 under each theme `material`; on Android; `tabBarBackground` set; Reduce Motion                                                           | glass under either setting, a simulated glass on Android, or a public glass export fails                                                                                                    | `audit:react-native/TabBar/look`      |
| FR13, AR6          | Simulator and emulator touch checks; hardware keyboard checks                                                           | a drag across the tabs; a tap; a disabled tab; arrow keys                                                                                                        | a lift that chooses a disabled tab, or focus landing on it from the arrow keys, fails                                                                                                       | `audit:react-native/TabBar/touch`     |
| FR14               | First-frame captures of each tab's screen and of a pushed screen inside a tab                                           | bar shown; bar hidden; with an accessory                                                                                                                         | content under the bar, or room kept for a hidden bar, fails                                                                                                                                 | `audit:react-native/TabBar/insets`    |
| FR17               | Unit tests of option resolution through the testing doubles; Simulator and emulator captures                            | a function of the theme; the library's option set extended by a call; a plain colour equal to a theme default; a dark screen in a light app under each rendering | a function resolved in the outer mode, a plain value re-inked under either rendering, or provenance read from a mark or a colour comparison, fails                                          | `audit:react-native/TabBar/options`   |
| FR15, FR16         | A dependency check of the package; a build with common navigation libraries linked; unit tests with hosts absent        | hosts absent with system and drawn rendering; other libraries linked                                                                                             | a third-party native dependency, a blank screen, or an error that does not name the capability fails                                                                                        | `audit:react-native/TabBar/platform`  |
| AR1, AR3, AR5, AR7 | VoiceOver and TalkBack checks on the Simulator, the emulator and devices; the largest text sizes                        | a selected tab; a disabled tab; a long press; the More list; the accessory                                                                                       | a tab without its role or selected state, a scaled iOS label without the Large Content Viewer, or a gesture-only action fails                                                               | `audit:react-native/TabBar/a11y`      |

## Decision log

### DEC-1 — The tab bar defaults to the system bar on iOS and the drawn bar on Android

**Reference:** `component:react-native/TabBar/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

On iOS the system tab bar brings Liquid Glass, minimize, the bottom accessory,
the search tab and the iPadOS sidebar, which a drawn bar can only follow. On
Android the drawn Material 3 bar takes the theme and Astryx's look where the
system bar does not. The choice is TabBar's, so the navigation library stays
neutral of it. The navigator's `render` says who draws the pixels: `system`
(the tabs host presents the platform's bar), `drawn` (Astryx draws it in
React) or `auto`, this component's default, which the native theme's
`render.default` overrides for every `auto`. The drawn bar's glass or
material look comes from the native theme's `material` member. A standalone
TabBar is drawn, because the system bar owns its tabs' content.

### DEC-2 — The bottom accessory belongs to TabBar, with two placements

**Reference:** `component:react-native/TabBar/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The accessory lives with the bar it rides on. `BottomAccessory` is the one
component for both placements, `expanded` and `inline`, and its content reads
the placement to lay itself out. The accessory is not a separate docked bar
component, because its placement follows the bar's minimize, and a separate
component would drift from the bar.

### DEC-3 — More than five destinations on a compact Android screen is a development error

**Reference:** `component:react-native/TabBar/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Material's navigation bar holds three to five destinations and has no More
tab. A sixth destination on a compact Android screen, such as a phone, stops a
development build with an error that names fixes that work on a phone: keep five in the bar, and reach
the rest from a screen, a navigation drawer or a menu in the top app bar.

### DEC-4 — Compact chooses the tab layout

**Reference:** `component:react-native/TabBar/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A compact screen, as `spec:AST-012` FR9 defines it, shows a bottom bar; any
other screen shows the destinations along the leading edge, as an iPadOS
sidebar or a Material rail. One compact definition serves every platform, so
the bar and Astryx's other adaptive presentations change together. The app
declares the tabs once, and a window that changes size while the app runs
keeps its sections and selection.

### DEC-5 — React Native keeps web's TabBar API

**Reference:** `component:react-native/TabBar/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

An Astryx developer drives a tab bar the same way on the web and on a phone:
the app owns `value`, and tabs are `TabBarItem`s. React Native drops only
`panelId`, which has no meaning without element ids, and adds only what a
phone tab bar has and a web page does not.

### DEC-6 — Theme-derived tab options resolve in the screen's scope

**Reference:** `component:react-native/TabBar/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An option the app derives from the theme says so by being a function of the
theme, and the bar evaluates it in the scope of the screen on top, so a dark
screen in a light app gets a dark bar. A plain value is always the app's, and
both renderings use it as given. An option set derived from the theme is a
function too, so an app extends it with a call.

The bar never treats a plain value as theme-derived because it equals a
theme default, so an app's own colour is never swapped and an app's own
theme-derived colour never stays in the outer mode. Option objects carry no
hidden mark of where they came from, because a spread copies or drops a mark
without a trace.

## Open questions

- **OQ1 — What does a release build do with more than five destinations on an
  Android phone?** (`human-api`) Options: show the first five and log the
  error once; or fall back to the tabs host's More list so every destination
  stays reachable.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
