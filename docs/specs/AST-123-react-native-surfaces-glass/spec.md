---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-123
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

# React Native platform: Surfaces and glass system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer builds floating chrome and overlays: a tab bar over a photo grid, a
header over a chat screen, a round glass button, a menu, a sheet, a toast. On
iOS these surfaces look and behave like the system's own: Liquid Glass on iOS
26 and later that responds to a press, merges with its neighbours, and morphs to
a new shape; a system blur material on earlier iOS; and the soft or hard edge
effect where content scrolls under a bar. On Android they paint the theme's
tonal fill. In every case the content stays on screen, the surface follows the
app's light or dark mode, Reduce Transparency gives a solid surface, and
Increase Contrast a solid or outlined one. The developer picks the look with
the theme's native intent and, per button, a `surface` prop, writes one tree for both
platforms, and the library adapts the look to each OS version.

This record details the platform's system materials in the core of
`spec:AST-112` (`spec:AST-112/FR1`), its Surfaces and glass group
(`spec:AST-112/FR7`). It follows `spec:AST-140`, which owns
the shared platform rules: registration (`spec:AST-140/FR1`), a missing piece
(`spec:AST-140/FR2`), the result vocabulary (`spec:AST-140/FR3`), additive
evolution (`spec:AST-140/FR5`), threading (`spec:AST-140/FR6`), and
coexistence (`spec:AST-140/FR9`). It builds on the capability shape
(`spec:AST-112/FR7`) and the theme mapped onto native appearance
(`spec:AST-112/FR9`). It specifies the look's
public contract, the four internal native components that render it
(`AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, and
`AstryxScrollEdgeView`), and the library's paint rules that choose between them
and a token fill.

## Why this exists

- `AstryxMaterialView`: the library needs one leaf that paints Liquid Glass on
  iOS 26 and later and the matching system blur before it, in the theme's
  colour mode, and lets the library know whether it exists, so the library
  picks its fallback before it renders (FR2, FR7).
- `AstryxGlassView`: the library's chrome needs its content inside the glass, so
  a press lights the glass, plus the system's glass fade, layout springs, and
  shape morphs without JavaScript per frame, in one view that also runs on
  Android (FR3, FR4, DEC-1, DEC-5).
- `AstryxGlassContainerView`: neighbouring glass in the library's bars joins
  into one shape inside a glass container (FR5). Whether it and
  `AstryxMaterialView` stay separate from `AstryxGlassView` is OQ1.
- `AstryxScrollEdgeView`: a bar built in React gets the system's scroll-edge
  effect by registering with that edge, and the library builds
  its own bars in React (`spec:AST-112/DEC-9`, FR8, DEC-4).

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                              | What a person sees                                                                                                                                 |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | native component (Fabric Native Component) | `TabBar` (and `FloatingTabBar`, which renders a `TabBar`), `TopNav` (its `TopNav<Part>` parts; component:react-native/TopNav), `BarButton`, `BarButtonGroup`, the tab accessory (both its `'expanded'` and `'inline'` placements), `SearchBar`, `KeyboardAccessoryView`, `IconButton` and `Button` with `surface="glass"`, and `DropdownMenu`'s icon trigger, each through its own props. The router's stack and tab navigators draw `TopNav` and `TabBar` | Glass bars, capsules, and round buttons that brighten and lift under a finger, appear and disappear with UIKit's motion, and spring to a new shape |
| `AstryxGlassContainerView` | native component (Fabric Native Component) | `TabBar` (and `FloatingTabBar`), `TopNav`, and `BarButtonGroup`, which group their glass items                                                                                                                                                                                                                                                                                                                                                             | Adjacent bar items, such as a row of header buttons, look like one piece of glass that joins where they come close                                 |
| `AstryxMaterialView`       | native component (Fabric Native Component) | Overlays the library builds: `AlertDialog`, `Dialog`, `Popover` (and the surfaces built on it: `DropdownMenu`, `ContextMenu`, `Selector`'s picker, `TabList`'s menu, `HoverCard`, `TopNav`'s menus), `BottomSheet` and `InlineSheet` when the library builds them. Floating surfaces: `Toast` and `ChatLayoutScrollButton` (in `ChatLayout`). Every glass component above where glass paints but the glass view is absent                                  | A menu, sheet, or dialog in system glass on iOS 26 and later; a frosted toast or scroll button where the app asks for material                     |
| `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `TopNav`; the router's stack navigator through its header built in React and header search field                                                                                                                                                                                                                                                                                                                                                           | Rows that soften or fade under the header as they scroll beneath it, as under a system navigation bar                                              |

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

- **FR1 — Glass and material are a look.** An app chooses the look through
  theme intent and, on `Button` and `IconButton`, a `surface` prop, and the
  native views that render it stay internal behind the library's components:
  - `Button` and `IconButton` take `surface`, a platform prop in every native
    platform's contract (`spec:AST-082` DEC-2 as amended); the core and web
    contracts do not have it; it has no default (unset follows the theme and
    placement). `plain` keeps the paint their own record gives them, and
    `glass` draws chrome glass (FR7). `surface` is a per-call-site appearance
    choice: each use picks the glass or the plain look for its place (DEC-7).
  - The bars, bar buttons, tab accessory, and search field paint chrome glass,
    and the overlays the library builds and floating surfaces paint the
    material FR7 chooses; each takes its look from the theme's `material`
    member and the accessibility settings (FR7, OQ5).
  - Theme intent: the theme's `material` member in `defineNativeTheme`, durable
    or in a `platforms.ios` or `platforms.android` entry (`spec:AST-082/FR10`),
    sets the look for every surface (FR7).
  - The library draws these surfaces in React, and the native components in
    this record render their glass or material look under the drawn element;
    on Android the look paints as FR9 states. A bar, menu, or sheet the system
    presents belongs to the navigation hosts' or the menus and presentation
    record.
  - `AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, and
    `AstryxScrollEdgeView` are internal platform components that render the
    look: system glass and materials on iOS, the library's token fill or a
    Material surface on Android. No public JavaScript glass or material
    component exists: `.` exports the components that use them, and the
    native views, their layout helpers, and their probes stay internal.
  - FR1 gap: `.` exports GlassSurface, GlassGroup, GlassContainerView,
    NativeGlassView, MaterialView, MaterialSurface, MaterialGroup,
    MaterialBackdrop and NativeScrollEdgeView (and their helpers) as public
    API; the target keeps them internal.
  - FR1 gap: the app root's `isPlatformEnabled` switches every surface
    between the native components and the token paints; the target uses the
    theme's `material` member and, on `Button` and `IconButton`, `surface`.
- **FR2 — A system material behind content.** `AstryxMaterialView` paints a
  system material behind whatever a surface draws over it:
  - Props: `variant` (`glass`, `glassClear`, or `blur`; default `glass`),
    `intensity` (`ultraThin`, `thin`, `regular`, `thick`, `chrome`; default
    `regular`), `colorScheme` (FR6), `glassTint`, `interactive` (default
    false), and `cornerRadius` (points, continuous corners, capped at half the
    shorter side). With no props it draws the default glass.
  - On iOS 26 and later, `glass` and `glassClear` paint `UIGlassEffect` in its
    regular or clear style, with the tint and, when `interactive`, the touch
    response. `blur` on any iOS, and every variant before iOS 26, paints the
    `UIBlurEffect` system material named by `intensity`.
  - Wherever the binary registers the view, every variant paints (as a blur
    before iOS 26), so the library treats the material as available there.
- **FR3 — Glass that holds its content.** `AstryxGlassView` is a glass surface
  with its React children inside the glass:
  - Props: `variant` (`regular` or `clear`; default `regular`), `glassTint`, `interactive`
    (default false), `cornerRadius` (points) or `shape: 'capsule'` (half the
    shorter side), `materialized` (default true), `animatesLayout` (default false),
    `morphFrom`, `morphTo`, `progress` (FR4; default 0), `intensity` (the
    material before iOS 26; default `regular`), and `colorScheme` (FR6), plus the View props.
  - On iOS 26 and later the children sit in the content of a `UIGlassEffect`
    view. A press on a Pressable inside interactive glass reaches the Pressable
    and also lights the glass. Before iOS 26 the surface is the `intensity`
    system material, outlined by a one-pixel line, under the children.
  - `materialized: false` hides the glass and leaves the children in place.
    While the view is on screen, the glass fades in or out with the system's
    animation, and a new tint blends from the old one.
  - Touches: a child receives a touch on itself, inside or outside the glass
    shape. On empty glass, `pointerEvents="auto"` makes the visible glass shape
    the touch target and lets touches outside that shape through;
    `pointerEvents="box-none"` lets every such touch through; `none` and
    `box-only` behave as on a View.
  - The library renders Liquid Glass where the binary registers the view
    on iOS 26 or later.
- **FR4 — Glass moves without JavaScript per frame.** The motion runs on the
  UI thread (`spec:AST-140/FR6`):
  - With `animatesLayout`, a React Native commit that moves or resizes the glass
    on screen, through its own frame or a parent's, makes the glass spring from
    its old shape to the new one while the children jump to their new place. A
    move is measured relative to the enclosing glass container, or else the
    enclosing scroll view, or else the window, so the spring follows real
    moves. A scroll, the first layout, and a morph-only change start no
    spring.
  - `morphFrom` and `morphTo` are two rectangles with corner radii, in the
    view's own coordinates; `progress` between 0 and 1 blends the glass shape
    between them. A native-driver `Animated` value can drive `progress`, and a
    React commit keeps the driven value instead of restoring the JavaScript
    one.
  - With Reduce Motion on, the glass takes each new shape without a spring.
- **FR5 — Neighbouring glass merges.** `AstryxGlassContainerView` (prop `spacing`,
  points, default 0) groups the glass placed inside it. On iOS 26 and later its
  children sit in a `UIGlassContainerEffect` view, so two glass shapes closer
  than `spacing` render as one blended piece of glass and blend apart again as
  they separate. Before iOS 26 it contains its children. It is transparent
  itself, and a touch outside its children passes to whatever lies beneath it.
- **FR6 — Surfaces use the app's colour mode.** The native views take
  `colorScheme`: `light` or `dark` fixes the material's appearance, and
  `unspecified` tracks the OS. Unless the library fixes a mode, a surface uses
  the nearest `PlatformAppearanceProvider`'s scheme, or the OS's when there is
  none. The library's own surfaces (chrome,
  floating surfaces, and overlays) fix their material to the Astryx theme's
  mode, so a dark Astryx theme on a light OS shows dark glass. The pre-26 outline uses the resolved mode. Unless a component
  passes a tint, chrome glass is tinted with the theme's surface colour at 0.6
  alpha.
- **FR7 — The library picks one paint per surface.** Each surface settles on a
  paint before it renders, from the theme's `material` member, the
  accessibility settings, `surface` on `Button` and `IconButton`, the
  placement of an unset button, and which native views the binary registers:

  - The theme's resolved `material` member (`spec:AST-082/FR10`) comes first:
    of the running platform's entries (`ios` or `android`) whose OS version
    range includes the running version and that set `material`, the last one
    applies; with none, the durable member applies. `opaque` paints every surface
    in the table below `opaque`. `translucent` or an iOS glass value asks for the system
    material: floating surfaces and overlays then take `native` wherever
    `AstryxMaterialView` is present (system glass on iOS 26 and later, the system
    blur before it), unless an accessibility setting below applies. With no
    member the table applies as written.
  - `opaque` is the solid theme surface with an outline at the theme's border
    width. The outline uses the secondary text colour under Increase Contrast,
    the emphasized border colour under Reduce Transparency, and the regular
    border colour otherwise. With both settings on, Increase Contrast's colour
    applies.

  | Surface                                                                        | Paint chosen                                                                                                                                                                                                                                                                       |
  | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Chrome (bars, bar buttons, the tab accessory, the search field, glass buttons) | `opaque` with Increase Contrast or Reduce Transparency on; otherwise `translucent` if glass cannot paint here; otherwise `glass` (children inside `AstryxGlassView`) if that view exists, else `native` (`AstryxMaterialView` under the children).                                 |
  | Floating surfaces (toasts, the chat scroll button)                             | `opaque` when Reduce Transparency or Increase Contrast is on, or when the theme sets no system material; otherwise `native` if `AstryxMaterialView` supports the variant, else `translucent`.                                                                                      |
  | Overlays the library builds (menus, popovers, sheets, dialogs)                 | `native` (system glass under the content, clear fill) on iOS 26 or later when `AstryxMaterialView` is present; otherwise `opaque`. `opaque` also applies with Reduce Transparency on and to the menus and `Selector` picker the library builds at accessibility text sizes (FR10). |
  - `translucent` is the surface's token colour with its alpha scaled by the
    intensity (0.6, 0.72, 0.82, 0.9, and 0.94 from `ultraThin` to `chrome`) and
    a one-pixel outline. Overlays paint `native` or `opaque`.
  - Grouped chrome uses `AstryxGlassContainerView` for the `glass` and
    `native` paints and a plain View for the others.
  - A `plain` `IconButton` or `Button` keeps the paint its own record gives
    it, and a `glass` one follows the chrome row. An unset `Button` or
    `IconButton` in a bar, the tab accessory, or the search field follows the
    chrome row; elsewhere it keeps the paint its own record gives it (FR1).

- **FR8 — System scroll-edge effects under a bar built in React.**
  `AstryxScrollEdgeView` wraps a bar that the library builds in React over the
  edge of a scroll view:
  - Props: `edge` (`top` or `bottom`; default `top`), `effect` (`automatic`,
    `soft`, `hard`, or `hidden`; default `automatic`), and
    `scrollViewNativeID`, plus the View props. Its children render normally.
  - On iOS 26 and later the view sets the edge effect of the scroll view's
    `edge` to `effect` (`UIScrollEdgeEffect`) and registers itself as that
    edge's element container (`UIScrollEdgeElementContainerInteraction`). The
    effect then spans the whole bar and shapes itself around the bar's controls
    and text, as it does for a system bar. Before iOS 26 the view contains
    its children.
  - Target: the scroll view whose `nativeID` matches `scrollViewNativeID`
    (ScrollView, FlatList, and SectionList accept a `nativeID`), or else the
    closest scroll view next to the bar on the same screen. The view resolves it
    from the native view tree, with or without a router, and the navigation
    hosts resolve a page's scroll view from the same `nativeID`.
  - The view applies its effect when it attaches to a scroll view and whenever
    `edge` or `effect` changes. When it detaches (unmount, window exit, a new
    edge, or a new target) it removes its registration and puts back the
    scroll view's earlier effect, unless something else changed that edge after
    it. A later write by another party, such as a system header, takes
    precedence (`spec:AST-140/FR9`).
  - The library applies the view wherever the binary registers it on iOS 26 or
    later, independent of the glass paint, so a solid bar under
    Reduce Transparency still gets the system edge.
- **FR9 — A missing surface keeps its content.** When a view is not there
  (the iOS-only views on Android, an app without the platform, Jest, a binary
  that lacks the view), the library renders the content in a plain View with
  the same layout and accessibility props, turns the corner radius into a
  border radius, and paints its fallback (`spec:AST-140/FR2`):
  - Android registers `AstryxGlassView` as an ordinary view group, so a tree
    that renders it runs as is; the glass props are accepted and do nothing,
    and touches hit its full box. Where FR7 would choose `glass` or `native`,
    Android paints chrome and floating surfaces `translucent` and overlays
    `opaque`. Android registers the glass view alone of the four.
  - Where the scroll-edge view is missing, the bar keeps its own paint at the
    edge.
  - Before iOS 26 the two glass views paint the system blur material (FR2,
    FR3), and the container and scroll-edge views contain their children.
- **FR10 — Accessibility.**
  - Surfaces are decorative. A surface passes the component's accessibility
    props to whichever view renders it, native or plain, and VoiceOver and
    TalkBack reach the content inside it directly. The scroll-edge view's
    helper element for UIKit is hidden from assistive technologies and lets
    touches through.
  - With Reduce Transparency or Increase Contrast on, chrome and floating
    surfaces switch to `opaque`, with the outline colour FR7 gives each
    setting. Overlays switch to `opaque` for Reduce Transparency; for Increase
    Contrast they keep glass and add the outline iOS gives glass in that
    setting. The library reads both settings from `AstryxAccessibilitySettings`
    and repaints when either changes.
  - With Show Borders on, an interactive surface in a `translucent` or
    `opaque` paint shows the outline iOS draws on glass in that setting.
  - Reduce Motion removes the layout spring (FR4). At accessibility text sizes,
    menus and the `Selector` picker the library builds use an opaque fill, so
    large text always sits on a solid surface.
- **FR11 — The native contract.**

  | Contract                   | Kind                                       | Props                                                                                                                                                            | Commands | Events | Platforms    |
  | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------ |
  | `AstryxGlassView`          | native component (Fabric Native Component) | `variant`, `glassTint`, `interactive`, `cornerRadius`, `shape`, `materialized`, `animatesLayout`, `morphFrom`, `morphTo`, `progress`, `intensity`, `colorScheme` | —        | —      | iOS, Android |
  | `AstryxGlassContainerView` | native component (Fabric Native Component) | `spacing`                                                                                                                                                        | —        | —      | iOS          |
  | `AstryxMaterialView`       | native component (Fabric Native Component) | `variant`, `intensity`, `colorScheme`, `glassTint`, `interactive`, `cornerRadius`                                                                                | —        | —      | iOS          |
  | `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `edge`, `effect`, `scrollViewNativeID`                                                                                                                           | —        | —      | iOS          |
  - The four contracts are internal platform components (FR1). Every one is in
    the platform's always-present core, registers as `spec:AST-140/FR1`
    states, and links by default (`spec:AST-112/FR3`).
  - The native code uses public platform API only: public UIKit on iOS and
    public Android SDK classes on Android. The one exception is React Native's
    record of the props its native driver manages, which the glass view reads so
    a React commit keeps a driven `progress` (FR4); React Native marks that
    record unstable, and where it is missing a commit puts back the JavaScript
    value.
  - On the wire, `colorScheme` is `unspecified` (follow the OS), `light`, or
    `dark`. `shape: 'capsule'`, like any negative radius, rounds to half the
    shorter side.
  - The contracts grow by named features (`spec:AST-140/FR5`).

### Platform support

| Contract                   | iOS                                                                                                                                                                                            | Android                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | iOS 26 and later: `UIVisualEffectView` with `UIGlassEffect`, children in its content view, the system's glass fade and the layout spring. Earlier: `UIBlurEffect` system material and hairline | A plain view group around the children; glass props have no effect; the library paints the tonal fill                               |
| `AstryxGlassContainerView` | iOS 26 and later: `UIGlassContainerEffect`. Earlier: plain container                                                                                                                           | Not registered; the library renders a plain View                                                                                    |
| `AstryxMaterialView`       | iOS 26 and later: `UIGlassEffect` for `glass` and `glassClear`. `blur` and earlier iOS: `UIBlurEffect` system materials                                                                        | Not registered; where FR7 would choose `native`, floating surfaces paint the translucent token fill and overlays paint opaque (FR9) |
| `AstryxScrollEdgeView`     | iOS 26 and later: `UIScrollEdgeEffect` style and `UIScrollEdgeElementContainerInteraction`. Earlier: plain container                                                                           | Not registered; no scroll-edge effect                                                                                               |

- Supported feature/engine floor: the floor of `spec:AST-112`. Liquid Glass,
  glass grouping, and scroll-edge effects need iOS 26 and later; the system blur
  materials cover earlier iOS; Android paints the token fills.
- Unsupported behavior: where a native view is absent, the library renders the
  content in a plain View and paints its fallback (FR7, FR9);
  a binary that lacks a named feature behaves as `spec:AST-140/FR5` states.
- Browser evidence: none. Claims are proven on the iOS Simulator (iOS 26 and
  earlier), the Android emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- This record details the system materials of the platform's core
  (`spec:AST-112/FR1`) as its Surfaces and glass group (`spec:AST-112/FR7`), their fallbacks when absent (`spec:AST-140/FR2`),
  the theme mapped onto native appearance (`spec:AST-112/FR9`), and the theme's
  `material` member on React Native (`spec:AST-082/FR10`).
- Relies on `spec:AST-112` FR3 (amended): Astryx's own native pieces, these
  four contracts included, link by default.
- Relies on `spec:AST-082` DEC-2 as amended: `surface` on `Button` and
  `IconButton` is a component prop, a per-call-site appearance choice (DEC-7).
- Relies on `spec:AST-140` FR5: contracts grow by named features the binary
  reports.

## Verification

| Contract | Verification                                                                                                                                               | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | The package's public-surface check of `.`; unit tests of `surface` and theme intent; the contract check of each platform's props                           | `IconButton` and `Button` with `surface` set to `glass`, set to `plain`, and unset; a theme with each `material` value, durable and in a platform entry; the package's export list; the native, core and web contracts                                                                                                                                                                                                                                                                              | `.` exports a glass or material component, layout helper, or probe, or `surface` or a theme value does not change the look, or a `plain` button uses a native component, or an unset `surface` ignores the theme and placement, or `surface` is missing from a native platform's contract or present in the core or web contract                                                                                                                                                                                                                                                                                                                                                                 |
| FR2      | Unit tests through the `./testing` doubles (view registered and absent); iOS Simulator captures on iOS 26 and an earlier iOS                               | each variant and intensity; a corner radius; a tint; interactive glass                                                                                                                                                                                                                                                                                                                                                                                                                              | A variant draws the wrong effect for the OS, the library treats an absent view as present, or a styling prop has no default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR3      | Unit tests of the prop mapping; Simulator checks of the press, materialize, and hit testing                                                                | a capsule; `materialized` toggled on screen; a press on a child; a touch outside the shape under `auto` and under `box-none`                                                                                                                                                                                                                                                                                                                                                                        | A press inside the glass does not reach the child or the glass, a dematerialize drops the children, or a touch outside the shape is taken                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR4      | UI-thread frame checks on the Simulator (no JavaScript per frame during the spring and the morph)                                                          | a moved and a resized glass in a container; a scroll; a native-driver `progress`; Reduce Motion                                                                                                                                                                                                                                                                                                                                                                                                     | A frame needs JavaScript, a scroll springs the glass, a React commit resets a driven `progress`, or Reduce Motion still springs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR5      | Simulator captures                                                                                                                                         | two glass shapes inside and outside `spacing`; a touch between them                                                                                                                                                                                                                                                                                                                                                                                                                                 | Shapes inside `spacing` do not merge, or the container takes a touch that hit no child                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR6      | Unit tests of the wire value; Simulator captures in light and dark                                                                                         | `light`, `dark`, `unspecified`; a dark theme over a light OS; a floating surface and an overlay under a dark theme on a light OS                                                                                                                                                                                                                                                                                                                                                                    | The glass follows the OS while the theme pins a mode, or `unspecified` pins a mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR7      | Unit tests of each paint hook with the doubles and accessibility settings                                                                                  | each row of the table; each system setting; a theme with no `material`, with `material: 'opaque'` and with `material: 'translucent'`; a theme whose `android` entry sets `material: 'opaque'`; a `plain` and a `glass` `Button`; an unset `Button` and `IconButton` in a bar, in the tab accessory, in the search field, and in a form; an accessibility text size; an `ios` entry scoped to iOS 26 and later over a durable `material: 'opaque'`, on iOS 18; a glass surface on iOS and on Android | A surface paints glass under Reduce Transparency, an overlay paints a translucent fill, or a missing view paints `glass`, or a surface paints glass under a theme whose `material` is `opaque`; a `translucent` theme leaves a floating surface or an overlay `opaque` where `AstryxMaterialView` is present and nothing forces `opaque`; or a theme with no `material` turns overlays `opaque`; or a platform entry's `material` is ignored on its platform; or an entry applies outside its OS version range; or a `plain` button uses a native view; or an unset button in a bar, the tab accessory or the search field misses the chrome row, or one elsewhere leaves its own record's paint |
| FR8      | Simulator checks with a named and an unnamed scroll view                                                                                                   | `top` and `bottom`; each effect; unmount; a second writer on the same edge                                                                                                                                                                                                                                                                                                                                                                                                                          | The effect misses the bar, the view restores over another writer's later value, or the edge keeps its value after unmount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR9      | Unit tests through the `./testing` doubles in their absent, older, and current shapes; Android emulator captures                                           | each view absent; Android; iOS below 26; a floating surface on Android with no theme `material`                                                                                                                                                                                                                                                                                                                                                                                                     | Children disappear, a layout or accessibility prop is dropped, or the library treats an iOS-only view as present on Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR10     | Unit tests of accessibility prop forwarding with and without the native view; VoiceOver and TalkBack on the Simulator and emulator; settings toggled live  | each accessibility prop; Reduce Transparency, Increase Contrast, both together, Show Borders, Reduce Motion; an accessibility text size                                                                                                                                                                                                                                                                                                                                                             | The surface adds an element, an accessibility prop is dropped, or a setting change does not repaint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR11     | The platform's spec rules check; a review of the native sources' API use; the `spec:AST-140/FR5` and `spec:AST-140/FR7` checks over this group's contracts | each contract's props; a native source that calls a non-public API                                                                                                                                                                                                                                                                                                                                                                                                                                  | A contract lists a prop outside the table, or native code calls a non-public API other than the named exception                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Decision log

### DEC-1 — The content lives inside the glass

**Reference:** `spec:AST-123/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Liquid Glass responds to touches on its own descendants and morphs with its
neighbours only when the content is inside the effect view. `AstryxGlassView`
mounts its children there: a glass button then lights up when pressed, and
nearby glass items join into one shape. `AstryxMaterialView` stays the leaf
material for surfaces that only need a backdrop, such as overlays and
toasts.

### DEC-2 — Android paints the theme's fill

**Reference:** `spec:AST-123/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Android's design language favours solid tinted surfaces, so the library
paints the token fill at the intensity's alpha. `AstryxGlassView` is a plain
view on Android so one tree runs on both platforms.

### DEC-3 — Accessibility settings choose the library's solid paint

**Reference:** `spec:AST-123/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Under Reduce Transparency and Increase Contrast, chrome and floating surfaces
take the library's own opaque surface with an edge, so they read the same on
iOS and Android and the edge follows the theme. Overlays, which iOS draws in glass, keep the system glass
and its outline under Increase Contrast and go opaque under Reduce
Transparency (FR10).

### DEC-4 — The scroll-edge view finds its scroll view natively

**Reference:** `spec:AST-123/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A bar names its scroll view by `nativeID`, or the view takes the nearest one
beside it, so a bar built in React works in any screen with or without the
Astryx router.
It restores only the value it wrote, so it coexists with a system header on the
same scroll view.

### DEC-5 — Glass motion runs on the UI thread

**Reference:** `spec:AST-123/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The layout spring starts natively from the mounting transaction that moved the
glass, and the morph's `progress` takes a native-driver `Animated` value. Glass
then moves at the display's frame rate while the JavaScript thread is busy.

### DEC-6 — Glass is a look the app asks for; its native views are internal

**Reference:** `spec:AST-123/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An app states the look through the theme's native intent and, on `Button` and
`IconButton`, `surface`.
The library then decides per platform, OS version, and accessibility setting
whether system glass, a system material, a translucent token fill, or a solid
surface renders it. The native views stay internal behind the components, so
every surface follows the theme and the accessibility rules on each platform
and the native views stay free to change.

### DEC-7 — Button and IconButton take `surface` per call site

**Reference:** `spec:AST-123/DEC-7`
**Decider:** cixzhang, 2026-11-18

`Button` and `IconButton` take `surface` as a component prop, because the same
component moves between a native and a non-native appearance from one call
site to the next: a glass button over a photo, a plain one in a form. The prop
sets the appearance for that use, and the theme and the accessibility rules
still decide how a `glass` surface paints (FR7).

## Open questions

- **OQ1 — `AstryxMaterialView` and `AstryxGlassView` are two contracts for one
  material: do they merge into one?** (`human-api`) Options: keep both, a leaf
  behind content and a container of content; or one glass view for every
  surface, with a leaf use and a `blur` variant.
- **OQ3 — Does Android draw a system blur where the OS has one?**
  (`human-design`) Android 12 and later blur the window behind a dialog.
  Options: overlays use it where available; or Android keeps the tonal fill
  everywhere (DEC-2).
- **OQ4 — Do two bars on one edge of one scroll view restore the original
  effect when they detach out of order?** (`checkable`) A bar restores only the
  value it wrote, so the second bar to detach restores the first bar's value.
- **OQ5 — Which surface-specific props do the bars, overlays, and floating
  surfaces take, and does an app-wide preference such as `surfaceMaterial` on
  `AstryxCapabilitiesProvider` join them?** (`human-api`) `spec:AST-082/OQ7`
  owns the surface-specific props; this question keeps the app-wide
  preference. Until both are decided, they take their look from the theme's `material` member and the
  accessibility settings (FR7).
