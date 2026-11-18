---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TopNav
platform_of: component:TopNav
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
    scrolling,
    motion,
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
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# TopNav (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports TopNav as `Header`, the screen header (DEC-1). It keeps TopNav's `heading`, `startContent` (alias `children`) and `endContent` with web's meaning, and adds the `back`, `search` and `toolbar` slots, `render` (`auto`, `system` or `drawn`: who draws the pixels) `surface` (the drawn header's glass, material or solid) and `onHeightChange` (its height, outside the router). Composed parts fill the slots: `HeaderTitle`, `HeaderLargeTitle`, `HeaderBack`, `HeaderSearch`, and the bar items `BarButton`, `BarMenu`, `BarSpacer` and `BarStatus`. The parts are how an app authors a header; they register through context into the screen's header record, the wire format both renderings read (DEC-2). |
| Behavior                | The header of a stack screen in Astryx's router: the title, a large title that collapses into the bar as the screen scrolls, the back control and its menu, bar buttons and menus, a title menu, header search and a bottom toolbar. With `render="auto"` (the default) iOS shows the system navigation bar and Android shows the header Astryx draws, unless the theme's `render.default` overrides it; an app picks either rendering per navigator or per screen (DEC-3). On Android, header search is the drawn search row (DEC-4).                                                                                                                                                                                                |
| End-user impact         | A person gets the platform's own header: on iOS the navigation bar with its large title, back swipe, back menu and search field; on Android a Material 3 top app bar layout with system back. Titles are headings that scale with the text size, and the back control is named by the screen it returns to.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Builder impact          | An app declares its header once per screen with the parts, inside its own wrapper components if it likes. The same code renders on both platforms, in both renderings. A setting derived from the theme is a function of the theme, so a screen in another light or dark mode gets it in its own mode; a plain value is used as given in both renderings. An app that uses another router keeps Astryx's components inside its screens, but not this header.                                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps in the drawn rendering are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Review checks           | Reject a header default chosen by the navigation library rather than this component, glass or material carried by `render`, a `surface` that changes the system bar, a part that stops working inside a wrapper component, the wire record offered as app API, a part that renders in the screen's content, a theme-derived colour decided by comparing values or by a hidden mark on an options object, a plain value the drawn header re-inks, a large title or search row that moves with JavaScript per frame, a back control named by anything but FR10's rule, a style setting the drawn header drops without a development warning, or a third-party native dependency.                                                        |
| Governing rules         | `component:TopNav` FR1–FR3 and ORD1; `component:react-native/NavigationStack` FR6, FR7 and FR17; `spec:AST-125` FR1, FR3, FR5, FR6, FR7, FR10, FR11 and FR13; `spec:AST-127` FR4, FR7 and FR9; `spec:AST-123` FR1, FR3, FR5, FR7 and FR8; `spec:AST-082` FR11; `spec:AST-093` FR2–FR4; DEC-1–DEC-6 below.                                                                                                                                                                                                                                                                                                                                                                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

On a phone, the bar at the top belongs to each screen of a stack: it names the
screen, leads back to the screen below, and holds the screen's actions and its
search. TopNav on React Native is that bar. It keeps TopNav's slot vocabulary,
so a builder who knows the web header knows where a title and actions go, and
it renders with the platform's own navigation bar or with a header Astryx
draws, so it looks and moves like the platform around it. This record states
only what React Native adds to `component:TopNav` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: `HeaderSearch` is controlled through
  `value` and `onChange`, or a starter through `onPress`; nothing else holds
  state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The system rendering honours every option this record lists for it. The drawn
rendering has these gaps; each warns once in development when a screen asks
for it, and the drawn header shows its theme's look in its place.

- FR11 gap: under the drawn rendering, a custom view in `heading`,
  `startContent` or `endContent` (a screen's view `headerTitle`, `headerLeft`
  or `headerRight`) is not drawn.
- FR11 gap: under the drawn rendering, a bar item with an image icon and no
  glyph draws its label instead of the image.
- FR12 gap: under the drawn rendering, a submenu inside a title menu or a bar
  menu is drawn as a titled section of the same menu, not as a submenu.
- FR13 gap: under the drawn rendering, `HeaderLargeTitle`'s `subtitle`
  (`headerLargeSubtitle`) is not drawn.
- FR10 gap: under the drawn rendering, the back control is always the chevron
  alone, named by the screen below's title: `HeaderBack`'s `title`, the
  `default` and `generic` display modes, and its menu of earlier screens are
  not drawn.
- FR14 gap: under the drawn rendering, no toolbar is drawn (`toolbar`,
  `toolbarShown`, `toolbarHidesOnScroll`), a `BarStatus` item leaves its place
  empty, and `hidesTabBarWhenPushed` keeps the tab bar.
- FR15 gap: under the drawn rendering, `scrollEdgeEffects` is ignored; the
  drawn header's own scroll edge applies.
- FR16 gap: under the drawn rendering, an app's own `headerTitleStyle`,
  `headerLargeTitleStyle`, `headerStyle` (its scrolled colours included) and
  `headerTransparent` are ignored; the theme's values apply.
- FR6 gap: under the drawn rendering, `backPreview` is ignored on Android; the
  pop keeps the shared-axis transition.

## Ownership boundary

**Owns**

- The React Native public name `Header`, its slots and its parts (FR1, FR2).
- How the parts register and the header record they write (FR3).
- The header's default rendering on each platform and the per-screen choice
  (FR4), and what each rendering draws (FR5, FR6, the option table).
- The large title, its collapse on scroll, header search, the back control's
  look and name, bar items, the title menu and the toolbar (FR7–FR14).
- The header's look: glass, material, scroll edge and colours (FR15, FR16).
- A header placed outside the router and the height it reports (FR20).

**Does not own / non-goals**

- The meaning of `heading`, `startContent`, `endContent` and the `children`
  alias — owned by `component:TopNav`.
- Pushes, pops, back gestures, transitions, focus after a push or pop, and the
  screen's scroll target — owned by `component:react-native/NavigationStack`.
- The native stack, its bars and the native props the header record maps onto —
  owned by `spec:AST-125`.
- Icon resolution and drawn glyphs — owned by `spec:AST-127`; glass and
  material views and paint selection — owned by `spec:AST-123`.
- The bottom tab bar and its accessory — the tab bar component's.
- Navigation and chrome of another router, such as Expo Router (FR17).
- Web's AppShell render modes (`default`, `mobile-bar`, `drawer`) and the
  drawer: a stack screen's header has none of them.
- Astryx Stage (`spec:AST-139`) and Preview in the Astryx app (`spec:AST-141`)
  are separate products; they conform to this record and never define it.

## Public concepts

| Concept       | Closed values or states                                          | Meaning                                                                                                                                                                                                                         | Availability by variant/orientation/state               | Default                                     | Owner                           | Stability    | Invalid-value behavior                            |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- | ------------------------------- | ------------ | ------------------------------------------------- |
| rendering     | `auto`; `system`; `drawn`                                        | who draws the header's pixels: `system`, the stack host presents the platform's bar; `drawn`, Astryx draws it in React over the stack screen; `auto`, this component's default unless the theme's `render.default` overrides it | per navigator and per screen (`render`)                 | `auto`: `system` on iOS, `drawn` on Android | `component:react-native/TopNav` | experimental | an unknown value is a type error                  |
| surface       | glass; material; solid                                           | `surface`: what the drawn header's bar and item groups sit on                                                                                                                                                                   | `drawn` only; the system bar's look is the system's     | chrome glass                                | `spec:AST-123` FR1, FR7         | experimental | ignored under `system`                            |
| title display | inline (`HeaderTitle`); large (`HeaderLargeTitle`); large in row | a bar title, a large title above the content that collapses into the bar, or a large title that stays in the bar row                                                                                                            | always                                                  | inline                                      | `component:react-native/TopNav` | experimental | none                                              |
| search place  | under the title (`search`); in the bar (`endContent`)            | where `HeaderSearch` rests                                                                                                                                                                                                      | always                                                  | none                                        | `component:react-native/TopNav` | experimental | a second `HeaderSearch` warns once in development |
| back display  | `default`; `generic`; `minimal`                                  | `HeaderBack`'s `displayMode`: the back title, a generic "Back", or the chevron alone                                                                                                                                            | below the stack's root                                  | `default`                                   | `component:react-native/TopNav` | experimental | an unknown value is a type error                  |
| collapse      | resting; collapsing; collapsed                                   | how far the large title and the search row have travelled with the screen's scroll target                                                                                                                                       | with a large title or a search row that hides on scroll | resting                                     | `component:react-native/TopNav` | experimental | none                                              |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                                           | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| FR1  | `Header` MUST take TopNav's `heading`, `startContent` and `endContent` with web's names and meaning, and `children` as start content when `startContent` is absent (`component:TopNav` FR2, ORD1). `heading` holds the title part; `startContent` holds items after the back control, in reading direction; `endContent` holds items at the bar's end. TopNav's `centerContent`, `label`, `top-nav` target and render modes are not offered: a phone bar centres or starts its title as the platform does, and has no navigation landmark or drawer. Web base props follow `spec:AST-082` FR7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `component:TopNav` FR1–FR3, ORD1; `spec:AST-082` FR3, FR7; DEC-1                | verify             |
| FR2  | React Native MUST export the component as `Header`, with these composed parts: `HeaderTitle` (`title`, `subtitle`, a title menu), `HeaderLargeTitle` (`title`, `subtitle`, `isInRow`, a title menu), `HeaderBack` (`title`, `displayMode`, `hasMenu`), `HeaderSearch`, and the bar items `BarButton`, `BarMenu`, `BarSpacer` and `BarStatus`. Its added slots are `back` (a `HeaderBack`), `search` (a `HeaderSearch` under the title) and `toolbar` (bar items in the bottom toolbar).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-1, DEC-2                                                                    | verify             |
| FR3  | `Header` MUST render nothing in the screen's content. The parts are the authoring model: each part registers through context with the stack screen it renders in, so it works inside an app's wrapper components, conditionals and fragments, and its values apply while it is rendered and go when it unmounts. What the parts register becomes the screen's header record: plain, serialisable data that both renderings read and the stack screen carries (`spec:AST-125` FR5). The record is wire format, not app API; its keys keep the names React Navigation and react-native-screens give them so the native props stay familiar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DEC-2; `spec:AST-125` FR5                                                       | verify             |
| FR4  | `render` MUST be the header's one setting for who draws its pixels, with the values `auto` (the default), `system` and `drawn`. Under `system`, the stack host presents the platform's bar; under `drawn`, Astryx draws the header in React. `auto` is this component's default, `system` on iOS and `drawn` on Android, unless the theme's `render.default` overrides every `auto`. The default is this component's: it holds over any library-wide default for drawn chrome, and the navigation library sets none of its own. A navigator's `render` sets the rendering for its screens; a screen's `Header` `render` sets it for that screen alone. Both renderings take the same parts and settings, and every setting means the same in both. Glass and material are `surface`, never a value of `render` (FR15).                                                                                                                                                                                                                                                                                                     | DEC-3                                                                           | settled            |
| FR5  | Under `system`, the header MUST be the platform's own bar on the stack screen (`spec:AST-125` FR5): `UINavigationBar` on iOS, a Material 3 top app bar on Android. The header record maps onto the screen's native props; a custom view in `heading`, `startContent` or `endContent` is placed by the system bar as a header slot, sized by its content, with its touches and layout in the bar's coordinates. What Android's bar does not have (a back title and its menu, a large subtitle, a toolbar, scroll-edge effects) is not drawn there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-125` FR1, FR5; `spec:AST-093` FR2                                     | verify             |
| FR6  | Under `drawn`, Astryx MUST draw the header over the stack screen with its own parts, and the screen's native bar is hidden. On iOS the drawn header follows the system bar's layout: a centred title, leading and trailing item groups on the theme's surface, and the large title under the bar. On Android it follows the Material 3 top app bar: a start-aligned title, the back arrow first, actions at the end, and a large title in Material's medium collapsing bar. Transitions and back stay the stack host's (`spec:AST-125` FR3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | DEC-3; `spec:AST-093` FR2, FR3                                                  | verify             |
| FR7  | `HeaderLargeTitle` MUST show a large title above the content that collapses into the bar's title as the screen's scroll target scrolls (`component:react-native/NavigationStack` FR13, FR14), and returns when it scrolls back to the top. With `isInRow`, the large title stays in the bar row and does not collapse. `HeaderTitle` shows the bar title only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-125` FR5; `component:react-native/NavigationStack` FR6                | verify             |
| FR8  | The collapse MUST follow the scroll target's offset on the UI thread, with no JavaScript per frame, in both renderings (`spec:AST-125` FR11). Under `drawn`, a part that has risen away takes no touches and leaves the accessibility tree; the bar's title fades in as the large title leaves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-125` FR11; `spec:AST-082` FR11                                        | verify             |
| FR9  | `HeaderSearch` in `search` MUST rest under the title; in `endContent` it rests in the bar. It is a field (`value`, `onChange`, `onSubmit`, `onFocus`, `onBlur`, `onCancel`, `cancelLabel`, `autoCapitalize`, `hasAutoFocus`) or a starter (`onPress`). With `hidesWhenScrolling`, the row rises with the large title and collapses into the bar's search control; without it, the row stays below the bar. With `obscuresBackground`, the content dims while the field is edited and empty, and a tap on the dim ends the search. Ending a search (Cancel, the dim, the escape gesture) calls `onChange('')`, then `onCancel`. Under `system` on iOS it is the system search field with its scopes (`scopes`, `selectedScope`, `onScopeChange`); under `drawn`, and on Android in both renderings, it is the drawn search row (`spec:AST-125` FR6). While the field has focus, back ends the search before it pops the screen.                                                                                                                                                                                             | DEC-4; `spec:AST-125` FR6; `component:react-native/NavigationStack` ORD1        | verify             |
| FR10 | The back control MUST show on every screen below the stack's root. `HeaderBack` sets the current screen's back control: `title` (else the screen below's `backTitle` or title), `displayMode`, and `hasMenu`, the menu of earlier screens (default true where the platform has one). Its accessible name is the screen below's title rule (`component:react-native/NavigationStack` AR3), whatever it shows. Pressing it, or choosing a screen from its menu, pops through the stack (`component:react-native/NavigationStack` FR7). On Android the back control is the arrow alone, with no menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:react-native/NavigationStack` FR6, FR7, AR3; `spec:AST-125` FR3, FR5 | verify             |
| FR11 | `startContent`, `endContent` and `toolbar` MUST lay out their bar items leading to trailing in reading direction, so start and end mirror in right-to-left. An item keeps its badge, selected, disabled, hidden and prominent states, its menu (with checkable groups and a menu title), and its accessibility label. An icon resolves through `Icon` (`spec:AST-127` FR4): under `system` on iOS a system symbol where the name has one; otherwise the Astryx glyph, drawn natively (`spec:AST-127` FR7); a symbol-only icon draws the matching glyph where one exists. Any other element in `heading`, `startContent` or `endContent` is a custom view the bar places as it is.                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-125` FR5; `spec:AST-127` FR4, FR7                                     | verify             |
| FR12 | A title part with menu items MUST make its title open that menu, with checkable groups, the menu's title line and submenus, in web's `DropdownMenu` vocabulary. The title's accessible name says it opens a menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-125` FR5                                                              | verify             |
| FR13 | A title part's `subtitle` MUST show a line under the title: in the bar under `HeaderTitle`, and under the large title under `HeaderLargeTitle`. Under `system` on iOS, a subtitle needs iOS 26 and is not shown below it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-125` FR5                                                              | verify             |
| FR14 | `toolbar` MUST show its items in the screen's bottom toolbar on iOS: `BarButton`, `BarMenu`, `BarSpacer` (fixed or flexible) and `BarStatus` (static text with an optional subtitle). The toolbar's shown and hide-on-scroll settings and the screen's hide-the-tab-bar setting apply (wire keys `toolbarShown`, `toolbarHidesOnScroll`, `hidesTabBarWhenPushed`). Android has no stack toolbar; the slot is not drawn there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `spec:AST-125` FR5                                                              | verify             |
| FR15 | Glass and material MUST be a look, never a component an app renders (`spec:AST-123` FR1). `surface` sets it, with the theme's `material`, and applies only to the drawn header: its bar and item groups sit on chrome glass by default (`spec:AST-123` FR3, FR5, FR7), and on a solid surface under Reduce Transparency or Increase Contrast. Under `system`, `surface` changes nothing: the platform's bar draws its own material, and on iOS 26 `scrollEdgeEffects` sets its scroll edge. The drawn header draws the platform's scroll edge effect under itself where the system has one (`spec:AST-123` FR8), else a page-colour band that fades in as content passes under it.                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-123` FR1, FR3, FR5, FR7, FR8; `spec:AST-082` FR10                     | verify             |
| FR16 | Both renderings MUST honour the header's style settings, set on a screen's `Header` or as a navigator's default for its screens: the tint, the divider at the bar's bottom edge, the title and large-title faces, the bar's colours (with Android's colours once scrolled) and a transparent bar (wire keys `headerTintColor`, `headerShadowVisible`, `headerTitleStyle`, `headerLargeTitleStyle`, `headerStyle`, `headerTransparent`). A setting derived from the theme is a function of the theme, resolved in the scope that uses it, so a screen with its own light or dark appearance gets it in that mode (`spec:AST-125` FR7). A plain value is the app's: both renderings use it as given, even when it equals a theme default, and never re-ink it. Nothing marks an option object as theme-derived: a set of navigator defaults is a function of the theme, and an app extends one by calling it inside its own function, not by spreading its result. Which settings came from the theme is never decided by comparing values. Without a setting, each rendering takes the theme's value in the screen's scope. | `spec:AST-125` FR5, FR7; `spec:AST-093` FR4                                     | verify             |
| FR17 | `Header` MUST be the header of Astryx's router: its stack screens, and `NavigationScreen`'s `title`, `backTitle`, `titleDisplayMode` and `endContent`, which map onto `HeaderTitle` or `HeaderLargeTitle`, the back control's title on the next screen, and `endContent` (`component:react-native/NavigationStack` FR6). An app that navigates with another router, such as Expo Router, keeps that router's header: Astryx's components work inside its screens, and that router's chrome is not covered by this record. A `Header` the app places in such a screen draws as FR20 states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-5; `spec:AST-125` FR1, DEC-6                                                | settled            |
| FR18 | The header MUST need no third-party native library: its native pieces are Astryx's own. An app MAY link react-native-screens, react-native-gesture-handler, Reanimated and react-native-safe-area-context beside it, and the header behaves as this record states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-5; `spec:AST-112` FR2                                                       | verify             |
| FR19 | The header's height MUST reach the screen's insets from its first frame, so `Screen` and `useScreenInsets()` clear it once: the system bar through the host's insets (`spec:AST-125` FR10), the drawn header through the height it reports, a search row included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-125` FR10; `component:react-native/NavigationStack` FR15              | verify             |
| FR20 | A `Header` rendered outside a stack screen of Astryx's router (in a sheet, in a plain view, or in another router's screen) MUST draw the drawn header in place, whatever its `render`, since no stack host presents a bar there. It lies over the top of its parent, and calls `onHeightChange` with its resting height from its parent's top, the safe area and any search row included, at its first layout and whenever that height changes. The screen's content pads itself by that height: the header adds no inset of its own there, and `useScreenInsets()` does not include it. Its large title and search row collapse with the scroll source the app names, else the nearest one Astryx's scroll components provide.                                                                                                                                                                                                                                                                                                                                                                                            | DEC-6; `spec:AST-125` FR1                                                       | verify             |

### Option support by rendering

What each rendering does with each part and setting, with its key in the header
record. "Gap" names a
line under Current-state impact.

| Wire key (part or setting)                                                      | `system`, iOS        | `system`, Android          | `drawn`                        |
| ------------------------------------------------------------------------------- | -------------------- | -------------------------- | ------------------------------ |
| `title`, `headerShown`, `headerLargeTitleEnabled` (title parts)                 | yes                  | yes                        | yes                            |
| `headerSubtitle` (`HeaderTitle` `subtitle`)                                     | iOS 26               | yes                        | yes                            |
| `headerLargeSubtitle` (`HeaderLargeTitle` `subtitle`)                           | iOS 26               | not on Android             | FR13 gap                       |
| `headerTitleMenu` (title menu)                                                  | yes                  | yes                        | yes; submenus FR12 gap         |
| `headerLeftItems`, `headerRightItems` (bar items)                               | yes                  | yes                        | yes; image-only icons FR11 gap |
| view `headerTitle`, `headerLeft`, `headerRight` (custom views)                  | yes                  | yes                        | FR11 gap                       |
| `headerSearchBarOptions` (`HeaderSearch`)                                       | system field, scopes | drawn row                  | drawn row, no scopes           |
| `headerBackVisible`                                                             | yes                  | yes                        | yes                            |
| `headerBackTitle`, `headerBackButtonDisplayMode`, `headerBackButtonMenuEnabled` | yes                  | not on Android             | `minimal` only; FR10 gap       |
| `headerTintColor`, `headerShadowVisible`                                        | yes                  | yes                        | yes                            |
| `headerTitleStyle`, `headerLargeTitleStyle`, `headerStyle`, `headerTransparent` | yes                  | yes, with scrolled colours | FR16 gap                       |
| `toolbarItems`, `toolbarShown`, `toolbarHidesOnScroll`, `BarStatus`             | yes                  | not on Android             | FR14 gap                       |
| `hidesTabBarWhenPushed`                                                         | yes                  | yes                        | FR14 gap                       |
| `scrollEdgeEffects`                                                             | iOS 26               | not on Android             | FR15 gap                       |
| `backPreview`                                                                   | not on iOS           | yes                        | FR6 gap                        |

### Allowed variation

- **AV1 — The system's bar.** Under `system`, the bar's glass, item grouping,
  title truncation, search field, menus and their motion are the system's own
  and may change with each OS release.
- **AV2 — Platform layout.** The drawn header's sizes, title alignment and
  collapse distances follow each platform's guidance and may differ between iOS
  and Android.

### Representative states

| State                                    | Required invariant                                                                   | Allowed variation           |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| root screen, large title, at rest        | large title under the bar; no back control                                           | the platform's sizes        |
| large title, scrolled                    | the title has collapsed into the bar; the large row takes no touches                 | the system's motion         |
| pushed screen, `HeaderBack` unset        | back control named by the screen below's `backTitle` or title                        | how much of the title shows |
| search under the title, scrolled         | with `hidesWhenScrolling`, collapsed into the bar's control; else below it           | the system's motion         |
| search field focused, back pressed       | the search ends; the screen stays                                                    | none                        |
| custom view in `endContent`              | placed in the bar under `system`; FR11 gap under `drawn`                             | its own size                |
| `render="drawn"` on an iOS screen        | the drawn header; the same parts                                                     | the drawn header's look     |
| Reduce Transparency or Increase Contrast | no glass; solid surfaces                                                             | none                        |
| `Header` in a sheet, outside the router  | the drawn header; `onHeightChange` reports its height; the content pads itself by it | the drawn header's look     |
| largest text size                        | titles scale; the bar title keeps one line and truncates                             | the large title's cap       |

### Transformation and precedence order

- **ORD1 — Header values.** A value a rendered part registers, then the same
  value from `NavigationScreen`'s props, then a navigator's default for its
  screens, then the theme's value in the screen's scope.
- **ORD2 — Rendering.** The screen's `render`, then the navigator's `render`;
  `auto` then resolves to the theme's `render.default`, else this component's
  default: `system` on iOS, `drawn` on Android (FR4).
- **ORD3 — Start content.** `startContent`, then `children` (`component:TopNav`
  ORD1).
- **ORD4 — Surface (drawn only).** Reduce Transparency or Increase Contrast
  (solid), then `surface`, then the theme's `material` (`spec:AST-123` FR7).

### Performance and resources

- **PR1 — No JavaScript per frame.** The large title's collapse, the search
  row's motion and the scroll edge run on the UI thread (`spec:AST-125` FR11).
- **PR2 — The record changes only on change.** A part writes the screen's
  header record only when a value changes; an unchanged render writes nothing
  and renders no screen.

## Accessibility contract

- **AR1 — Titles are headings and name the screen.** The bar title and the
  large title are headings to VoiceOver and TalkBack. The title is the screen's
  accessibility title: VoiceOver announces it on a screen change, and on
  Android it is the screen's pane title. After a push, screen-reader focus
  lands on it (`component:react-native/NavigationStack` AR1).
- **AR2 — Back is named by its destination.** The back control's accessible
  name follows `component:react-native/NavigationStack` AR3, whatever it shows;
  its menu's rows are named by their screens' titles.
- **AR3 — Text size.** Titles, the subtitle and the search field scale with
  Dynamic Type and Android's font scale. The bar keeps its height and its
  title truncates; the large title grows up to the platform's cap. On iOS, bar
  items show the Large Content Viewer at accessibility sizes, with the drawn
  glyph as its image (`spec:AST-127` FR9).
- **AR4 — Reduced motion.** With Reduce Motion, the drawn header's large title
  and search row swap at the halfway point of the scroll instead of moving; the
  system bar follows the system's setting.
- **AR5 — Items keep their names and states.** Bar items, menus and the title
  menu keep their labels, roles, badges and selected and disabled states in
  both renderings (`spec:AST-125` FR13). Parts that have risen away are hidden
  from screen readers (FR8).
- **AR6 — Contrast settings.** Under Reduce Transparency or Increase Contrast,
  every item keeps a solid, visible background (FR15).

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority   | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Bar title        | the screen's name at the bar's centre or start            | prescribed by the platform | prominent      | FR1, FR6, FR7      |
| Large title      | the screen's name above the content, collapsing on scroll | prescribed by the platform | prominent      | FR7, FR8           |
| Back control     | a chevron or arrow, with the platform's title rules       | prescribed by the platform | supporting     | FR10               |
| Bar items        | start and end item groups                                 | prescribed by the platform | supporting     | FR11               |
| Search           | a search field under the title or in the bar              | prescribed by the platform | supporting     | FR9                |
| Surface          | glass, material or solid, with a scroll edge              | theme intent               | supporting     | FR15, FR16         |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): `UINavigationBar` with
`UISearchController` and `UIMenu` on iOS; the Material 3 top app bar on
Android. Guideline pages: Navigation bars, Search fields, Toolbars, Materials
and Accessibility (Dynamic Type, Reduce Motion, Reduce Transparency) in the
Apple Human Interface Guidelines; Top app bar and Search in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the native theme's appearance and
`material` intent (`spec:AST-082` FR10), the tint, the title and large-title
faces, the page colour and surface colour at rest and once scrolled, the
border colour for the divider, and the Dynamic Type scale.

### Native pieces

| Native piece                                  | Record                  | What this record uses it for                                                                                            |
| --------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AstryxStackScreen`                           | `spec:AST-125` FR5      | the system bar's title, items, menus, back, toolbar and styles; the scroll target the bar follows (FR5, FR7, FR10–FR16) |
| `AstryxStackScreen` search                    | `spec:AST-125` FR6      | the system search field on iOS, and the bar edge and inset the drawn search row uses (FR9)                              |
| `AstryxHeaderSlot`                            | `spec:AST-125` FR5      | custom views placed by the system bar (FR5, FR11)                                                                       |
| `AstryxStackHost`                             | `spec:AST-125` FR3      | the back control and its menu, popping through the stack (FR10)                                                         |
| Screen insets                                 | `spec:AST-125` FR10     | the header's height in the screen's insets from its first frame (FR19)                                                  |
| `Icon` resolution                             | `spec:AST-127` FR4      | a system symbol or an Astryx glyph for each bar item (FR11)                                                             |
| `NativeVectorView`                            | `spec:AST-127` FR7, FR9 | drawn glyphs in bar items, and their Large Content Viewer image (FR11, AR3)                                             |
| `AstryxGlassView`, `AstryxGlassContainerView` | `spec:AST-123` FR3, FR5 | the drawn header's glass item groups (FR15)                                                                             |
| `AstryxScrollEdgeView`                        | `spec:AST-123` FR8      | the system scroll edge effect under the drawn header (FR15)                                                             |

## Family and system relationships

- `component:TopNav` owns the slot names and meanings this record keeps; this
  record states how React Native renders them as a screen header.
- `component:react-native/NavigationStack` owns the stack, back, transitions,
  focus and the screen's scroll target; its `NavigationScreen` props map onto
  this header (FR17).
- `spec:AST-125` owns the native stack, its bars, the header slot and the
  native props; it leaves the header's rendering to this record.
- `spec:AST-127` owns icons and glyph drawing; `spec:AST-123` owns glass,
  material and the scroll edge view.
- The tab bar component owns the bottom tab bar, which a screen's
  `hidesTabBarWhenPushed` hides (FR14).

## Verification map

| Contract              | Verification                                                                                                                                                                                                                                                               | Representative states                                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                                                                        | Audit section                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| FR1, FR2              | Type tests of `Header` and its parts against TopNav's slot types; a contract drift test                                                                                                                                                                                    | each slot; `children` with and without `startContent`                                                                                                                                                            | a renamed slot, a dropped `children` alias, or an accepted and ignored prop fails                                                                                                                                                                      | `audit:react-native/TopNav/api`     |
| FR3, ORD1             | Unit tests of part registration and the header record through the package's testing doubles (`spec:AST-112` FR15)                                                                                                                                                          | a part in an app's wrapper component; a conditional part; a part that unmounts; a part and `NavigationScreen` props on one value                                                                                 | content rendered by `Header`, a part that fails inside a wrapper, a value kept after its part unmounts, or precedence other than ORD1 fails                                                                                                            | `audit:react-native/TopNav/options` |
| FR4, ORD2             | Unit tests of the rendering choice on each platform                                                                                                                                                                                                                        | no `render`; `auto` with and without a theme default; a navigator `render`; a screen `render`                                                                                                                    | `auto` resolving to anything but the theme's default, else `system` on iOS and `drawn` on Android, or a screen choice that leaks to another screen, fails                                                                                              | `audit:react-native/TopNav/render`  |
| FR5, FR6              | Simulator and emulator captures in both renderings, light and dark                                                                                                                                                                                                         | each part; a custom view; Android's bar                                                                                                                                                                          | a part drawn in the content, or an Android bar that draws an option it does not have, fails                                                                                                                                                            | `audit:react-native/TopNav/render`  |
| FR7, FR8, PR1, AR4    | UI-thread frame checks while scrolling, with and without Reduce Motion                                                                                                                                                                                                     | large title; `isInRow`; a search row hiding on scroll                                                                                                                                                            | JavaScript work per frame, a large title that does not collapse or return, or motion under Reduce Motion fails                                                                                                                                         | `audit:react-native/TopNav/motion`  |
| FR9                   | Simulator and emulator checks of search                                                                                                                                                                                                                                    | field; starter; `obscuresBackground`; scopes; back while focused; Android in both renderings                                                                                                                     | a Material search bar on Android, a search that ends without `onChange('')`, or back that pops while focused fails                                                                                                                                     | `audit:react-native/TopNav/search`  |
| FR10, AR2             | VoiceOver and TalkBack checks of the back control and its menu                                                                                                                                                                                                             | each display mode; `title` set and unset; the menu; Android                                                                                                                                                      | a back control named by anything but AR2's rule, or a menu choice that pops in more than one step, fails                                                                                                                                               | `audit:react-native/TopNav/back`    |
| FR11, FR12            | Simulator and emulator captures; right-to-left captures                                                                                                                                                                                                                    | badges; menus with checkable groups and a title; a symbol-only icon; a submenu                                                                                                                                   | an item out of reading order in right-to-left, a lost item state, or a missing checked row fails                                                                                                                                                       | `audit:react-native/TopNav/items`   |
| FR13, FR14            | Simulator captures on iOS 26 and an earlier iOS; emulator captures                                                                                                                                                                                                         | subtitles; a toolbar with a status item; `hidesTabBarWhenPushed`                                                                                                                                                 | a toolbar drawn on Android, or a subtitle shown below iOS 26 under `system`, fails                                                                                                                                                                     | `audit:react-native/TopNav/items`   |
| FR15, FR16, AR6, ORD4 | Captures of the drawn header with each `surface` and theme `material`, with Reduce Transparency and Increase Contrast, and with each style setting; unit tests of settings as theme functions and as plain values, in both renderings, on a screen with its own appearance | glass, material and solid drawn; `surface` set under `system`; opaque; scrolled; a theme-function tint; a plain tint equal to the theme default; an extended defaults function; a dark screen over a light stack | glass under a contrast setting, a `surface` that changes the system bar, a theme-derived colour left in the outer mode, a plain value re-inked or read differently by the drawn header, or a dropped style setting without a development warning fails | `audit:react-native/TopNav/look`    |
| FR17, FR18            | An app on another router with Astryx components in its screens; a build with each listed library linked                                                                                                                                                                    | Expo Router screens; react-native-screens linked                                                                                                                                                                 | Astryx chrome under another router, a third-party native dependency, or a build conflict fails                                                                                                                                                         | `audit:react-native/TopNav/routers` |
| FR19                  | First-frame captures of a pushed screen in both renderings                                                                                                                                                                                                                 | large title; search row; inline title                                                                                                                                                                            | content under the header, or an edge padded twice, fails                                                                                                                                                                                               | `audit:react-native/TopNav/render`  |
| FR20                  | Unit tests through the testing doubles; Simulator and emulator captures of a `Header` in a sheet and in another router's screen                                                                                                                                            | first layout; a search row; a text size change; `render=\"system\"` outside the router                                                                                                                           | no `onHeightChange` call, a stale height after a change, an inset the header adds itself, or a missing bar under `system` outside the router fails                                                                                                     | `audit:react-native/TopNav/render`  |
| AR1, AR3, AR5         | VoiceOver and TalkBack checks; largest text size captures                                                                                                                                                                                                                  | push; title menu; bar items with badges; Large Content Viewer                                                                                                                                                    | a title that is not a heading, a lost item name or state, or a bar that grows with text size fails                                                                                                                                                     | `audit:react-native/TopNav/a11y`    |
| PR2                   | Unit tests counting record writes and renders                                                                                                                                                                                                                              | an unchanged re-render; one changed value                                                                                                                                                                        | a write or a screen render for an unchanged value fails                                                                                                                                                                                                | `audit:react-native/TopNav/options` |

## Decision log

### DEC-1 — React Native's TopNav is the screen header, exported as `Header`

**Reference:** `component:react-native/TopNav/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

On a phone the top bar belongs to each screen of a stack, and both platforms
call it a header, so React Native exports TopNav as `Header`. It keeps
TopNav's slot names (`heading`, `startContent`, `endContent`), so a builder
writes start and end, never left and right, on both the web and a phone.

Rejected: a separate component with no core record, because it would invent a
second vocabulary for the same bar.

### DEC-2 — Composed parts author the header; a plain record carries it

**Reference:** `component:react-native/TopNav/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The header has one authoring path: composed parts in the screen, which
register through context, so an app's own wrapper components work. What they
register is a plain header record, the wire format the system bar and the
drawn header both read. This matches the platforms' own model, a navigation
item record that the bar renders, and lets an app put its own components in
the bar while the router keeps a serialisable form.

Rejected: the flat record as app API, because an app could not place a
component in the bar or compose the header from its own components.

### DEC-3 — One rendering setting; `auto` is the system header on iOS and the drawn header on Android

**Reference:** `component:react-native/TopNav/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

`render` (`auto`, `system`, `drawn`) says who draws the header's pixels: the
stack host presenting the platform's bar, or Astryx drawing it in React. Glass
and material are `surface`, which only the drawn header reads. `auto`, the
default, is the system navigation bar on iOS and the header Astryx draws on
Android, unless the theme's `render.default` overrides it. The choice is this component's, not
the navigation library's, and it holds over any library-wide default for drawn
chrome. An app can choose either rendering for any navigator or screen.

### DEC-4 — Android header search is the drawn search row

**Reference:** `component:react-native/TopNav/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

On Android, header search defaults to Astryx's drawn search row, in both
renderings, not the Material search bar.

### DEC-5 — Astryx's router carries the header; the navigation library stays neutral

**Reference:** `component:react-native/TopNav/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

Astryx's router supports this header, so an app that uses it declares the
header once per screen. An app that uses another router, such as Expo Router,
gets Astryx's components inside its screens but not Astryx's header. The
header needs no third-party native library and works beside the common
navigation, gesture and safe-area libraries.

### DEC-6 — Outside the router, the header draws in place and reports its height

**Reference:** `component:react-native/TopNav/DEC-6`
**Decider:** imdreamrunner, 2026-11-18

A `Header` outside a stack screen of Astryx's router draws the drawn header
where the app places it and reports its height through `onHeightChange`; the
content pads itself by that height. A sheet or another router's screen can then
have an Astryx bar without Astryx's router.

Rejected: rendering nothing outside the router, because sheets and other
routers' screens would have no Astryx bar.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.

Docs note: the consumer docs for `Header` show a header outside the router (a
sheet, another router's screen) with its content padded by the height
`onHeightChange` reports (FR20).
