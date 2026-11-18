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
component props and the theme's native intent, never with a glass component,
writes one tree for both platforms, and never checks the OS version.

This record details the platform's system materials in the core of
`spec:AST-112` (`spec:AST-112/FR1`). It builds on the result vocabulary
(`spec:AST-112/FR6`), the capability shape and its view probes
(`spec:AST-112/FR7`), additive evolution (`spec:AST-112/FR8`), and the theme
mapped onto native appearance (`spec:AST-112/FR9`). It specifies the look's
public contract, the four internal native components that render it
(`AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, and
`AstryxScrollEdgeView`), and the library's paint rules that choose between them
and a drawn fill.

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
  into one shape only inside a glass container (FR5). Whether it and
  `AstryxMaterialView` stay separate from `AstryxGlassView` is OQ1.
- `AstryxScrollEdgeView`: a drawn bar gets the system's scroll-edge
  effect only when the bar registers with that edge, and the library's bars
  are drawn (`spec:AST-112/DEC-9`, FR8, DEC-4).

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                         | What a person sees                                                                                                                                 |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | native component (Fabric Native Component) | `TabBar` (and `FloatingTabBar`, which renders a `TabBar`), `Header` (its composed parts), `BarButton`, `BarButtonGroup`, the tab accessory (both its `'expanded'` and `'inline'` placements), `SearchBar`, `KeyboardAccessoryView`, `IconButton` and `Button` with `surface="glass"`, and `DropdownMenu`'s icon trigger, each through its own props. The router's stack and tab navigators draw `Header` and `TabBar` | Glass bars, capsules, and round buttons that brighten and lift under a finger, appear and disappear with UIKit's motion, and spring to a new shape |
| `AstryxGlassContainerView` | native component (Fabric Native Component) | `TabBar` (and `FloatingTabBar`), `Header`, and `BarButtonGroup`, which group their glass items                                                                                                                                                                                                                                                                                                                        | Adjacent bar items, such as a row of header buttons, look like one piece of glass that joins where they come close                                 |
| `AstryxMaterialView`       | native component (Fabric Native Component) | Overlays: `AlertDialog`, `Dialog`, `Popover` (and the surfaces drawn through it: `DropdownMenu`, `ContextMenu`, `Selector`'s picker, `TabList`'s menu, `HoverCard`, `TopNav`'s menus), `BottomSheet`, `InlineSheet`. Floating surfaces: `Toast` and `ChatLayoutScrollButton` (in `ChatLayout`). Every glass component above where glass paints but the glass view is absent                                           | A menu, sheet, or dialog in system glass on iOS 26 and later; a frosted toast or scroll button where the app asks for material                     |
| `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `Header`; the router's stack navigator through its drawn header and header search field                                                                                                                                                                                                                                                                                                                               | Rows that soften or fade under the header as they scroll beneath it, as under a system navigation bar                                              |

## Non-goals

- The contract of each component that paints a surface (its size, colours,
  layout, and states). Each component's own record and `spec:AST-082/FR3` own
  it; this record owns the native surfaces and the paint rules they share.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.
- The system bars that the `navigation` hosts present (`UINavigationBar`,
  `UITabBar`, and their glass). The navigation hosts' record owns them.
- A simulated backdrop blur on Android (DEC-2).
- Following the system's Clear or Tinted Liquid Glass setting. iOS offers no
  public way to read it; drawn surfaces use the variant and tint the app sets.
- Astryx Stage and the Astryx app's Preview are specified in `spec:AST-139`;
  they conform to this record's contracts.

## Requirements

- **FR1 — Glass and material are a look, not a component.** An app chooses the
  look; it never renders a glass or material component:
  - Component props: a component that offers `surface` (`IconButton`,
    `Button`) draws glass with `surface="glass"`. The library's bars, bar
    buttons, tab accessory, and search field draw chrome glass by default;
    floating surfaces and overlays follow FR7.
  - Theme intent: the theme's `material` member in `defineNativeTheme`, durable
    or in a `platforms.ios` or `platforms.android` entry (`spec:AST-082/FR10`),
    sets the look for every surface (FR7).
  - `AstryxGlassView`, `AstryxGlassContainerView`, `AstryxMaterialView`, and
    `AstryxScrollEdgeView` are internal platform components that render the
    look: system glass and materials on iOS, a drawn or Material surface on
    Android. `.` exports no glass or material component, layout helper, or
    probe.
  - FR1 gap: `.` exports GlassSurface, GlassGroup, GlassContainerView,
    NativeGlassView, MaterialView, MaterialSurface, MaterialGroup,
    MaterialBackdrop and NativeScrollEdgeView (and their helpers) as public
    API; the target keeps them internal.
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
  - Props: `variant` (`regular` or `clear`), `glassTint`, `interactive`
    (default false), `cornerRadius` (points) or `shape: 'capsule'` (half the
    shorter side), `materialized` (default true), `animatesLayout`,
    `morphFrom`, `morphTo`, `progress` (FR4), `intensity` (the material before
    iOS 26), and `colorScheme` (FR6), plus the View props.
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
  - The library renders Liquid Glass only where the binary registers the view
    on iOS 26 or later.
- **FR4 — Glass moves without JavaScript per frame.**
  - With `animatesLayout`, a React Native commit that moves or resizes the glass
    on screen, through its own frame or a parent's, makes the glass spring from
    its old shape to the new one while the children jump to their new place. A
    move is measured relative to the enclosing glass container, or else the
    enclosing scroll view, or else the window, so a scroll alone never springs
    the glass. Neither the first layout nor a morph-only change springs.
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
  they separate. Before iOS 26 it only contains its children. It paints nothing
  itself, and touches that hit none of its children go to whatever lies beneath
  it.
- **FR6 — Surfaces use the app's colour mode.** The native views take
  `colorScheme`: `light` or `dark` fixes the material's appearance, and
  `unspecified` tracks the OS. Unless the library fixes a mode, a surface uses
  the nearest `PlatformAppearanceProvider`'s scheme, or the OS's when there is
  none. The library's own chrome fixes its
  glass to the Astryx theme's mode, so a dark Astryx theme on a light OS shows
  dark glass. The pre-26 outline uses the resolved mode. Unless a component
  passes a tint, chrome glass is tinted with the theme's surface colour at 0.6
  alpha.
- **FR7 — The library picks one paint per surface.** Each surface settles on a
  paint before it renders, from the theme's `material` member, the
  accessibility settings, the component's props, the app's preference, and
  which native views the binary registers:

  - The theme's resolved `material` member (`spec:AST-082/FR10`, the durable
    member or an `ios` entry's) comes first. `opaque` paints every surface
    `opaque`. `translucent` or an iOS glass value asks for the system
    material: floating surfaces and overlays then take `native` wherever
    `AstryxMaterialView` is present (system glass on iOS 26 and later, the system
    blur before it), unless the app explicitly sets `surfaceMaterial="opaque"`
    or an accessibility setting below applies. With no member the table applies
    as written.
  - `surfaceMaterial` on `AstryxCapabilitiesProvider` is the app's preference
    for floating surfaces: `opaque`, `translucent`, or `material`; when the app
    does not set it, floating surfaces take `opaque` unless the theme asks for
    the system material. Overlays read it only when the app sets it
    explicitly. It never overrides a theme whose `material` is `opaque`.
  - `opaque` is the solid theme surface with an outline at the theme's border
    width. The outline uses the secondary text colour under Increase Contrast,
    the emphasized border colour under Reduce Transparency, and the regular
    border colour otherwise. With both settings on, Increase Contrast's colour
    applies.

  | Surface                                                                        | Paint chosen                                                                                                                                                                                                                                                                                                                                                                                    |
  | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Chrome (bars, bar buttons, the tab accessory, the search field, glass buttons) | `opaque` with Increase Contrast or Reduce Transparency on, or when the component's props ask for it; otherwise `translucent` if glass cannot paint here; otherwise `glass` (children inside `AstryxGlassView`) if that view exists, else `native` (`AstryxMaterialView` under the children). Chrome requests material unless its props say otherwise.                                           |
  | Floating surfaces (toasts, the chat scroll button)                             | `opaque` when `surfaceMaterial` resolves to `opaque` or Reduce Transparency or Increase Contrast is on; `translucent` when `surfaceMaterial` is `translucent`; otherwise `native` if `AstryxMaterialView` supports the variant, else `translucent`.                                                                                                                                             |
  | Overlays (menus, popovers, sheets, dialogs)                                    | `native` (system glass under the content, clear fill) on iOS 26 or later with the platform on and `AstryxMaterialView` present, whether or not the app sets `surfaceMaterial`; otherwise `opaque`. `opaque` also applies with Reduce Transparency on, when the app explicitly sets `surfaceMaterial="opaque"`, and to drawn menus and the `Selector` picker at accessibility text sizes (FR10). |
  - `translucent` is the surface's token colour with its alpha scaled by the
    intensity (0.6, 0.72, 0.82, 0.9, and 0.94 from `ultraThin` to `chrome`) and
    a one-pixel outline. Overlays have no `translucent` paint.
  - Grouped chrome uses `AstryxGlassContainerView` for the `glass` and
    `native` paints and a plain View for the others.
  - With `isPlatformEnabled: false` on the app root, every surface uses its
    drawn paint.

- **FR8 — System scroll-edge effects under a drawn bar.**
  `AstryxScrollEdgeView` wraps a bar that the library draws over the edge of a
  scroll view:
  - Props: `edge` (`top` or `bottom`; default `top`), `effect` (`automatic`,
    `soft`, `hard`, or `hidden`; default `automatic`), and
    `scrollViewNativeID`, plus the View props. Its children render normally.
  - On iOS 26 and later the view sets the edge effect of the scroll view's
    `edge` to `effect` (`UIScrollEdgeEffect`) and registers itself as that
    edge's element container (`UIScrollEdgeElementContainerInteraction`). The
    effect then spans the whole bar and shapes itself around the bar's controls
    and text, as it does for a system bar. Before iOS 26 the view only contains
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
    precedence.
  - The library applies the view wherever the binary registers it on iOS 26 or
    later
    with the platform on, independent of the glass paint, so a solid bar under
    Reduce Transparency still gets the system edge.
- **FR9 — A missing surface keeps its content.** When a view is not there
  (the iOS-only views on Android, an app without the platform, Jest, a binary
  that lacks the view), the library renders the content in a plain View with
  the same layout and accessibility props, turns the corner radius into a
  border radius, and paints its fallback (`spec:AST-112/FR7`):
  - Android registers `AstryxGlassView` as an ordinary view group, so a tree
    that renders it runs as is; the glass props are accepted and do nothing,
    and touches hit its full box. Android has no material view, so chrome and floating surfaces use `translucent` and overlays use
    `opaque`. Android registers none of the other three views.
  - Where the scroll-edge view is missing, the library draws its own fallback
    edge or none.
  - Before iOS 26 the two glass views paint the system blur material (FR2,
    FR3), and the container and scroll-edge views only contain their children.
- **FR10 — Accessibility.**
  - Surfaces are decorative. A surface passes the component's accessibility
    props to whichever view renders it, native or plain, and contributes no
    accessibility element itself, so VoiceOver and TalkBack reach the content
    inside. The scroll-edge view's helper element for UIKit is hidden from
    assistive technologies and ignores touches.
  - With Reduce Transparency or Increase Contrast on, chrome and floating
    surfaces switch to `opaque`, with the outline colour FR7 gives each
    setting. Overlays switch to `opaque` for Reduce Transparency; for Increase
    Contrast they keep glass and add the outline iOS gives glass in that
    setting. The library reads both settings from `AstryxAccessibilitySettings`
    and repaints when either changes.
  - With Show Borders on, an interactive drawn surface shows the outline iOS
    draws on glass in that setting.
  - Reduce Motion removes the layout spring (FR4). At accessibility text sizes,
    drawn menus and the `Selector` picker use an opaque fill, so large text is
    never shown through glass over other content.
- **FR11 — The native contract.**

  | Contract                   | Kind                                       | Props                                                                                                                                                            | Commands | Events | Platforms    |
  | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------ |
  | `AstryxGlassView`          | native component (Fabric Native Component) | `variant`, `glassTint`, `interactive`, `cornerRadius`, `shape`, `materialized`, `animatesLayout`, `morphFrom`, `morphTo`, `progress`, `intensity`, `colorScheme` | —        | —      | iOS, Android |
  | `AstryxGlassContainerView` | native component (Fabric Native Component) | `spacing`                                                                                                                                                        | —        | —      | iOS          |
  | `AstryxMaterialView`       | native component (Fabric Native Component) | `variant`, `intensity`, `colorScheme`, `glassTint`, `interactive`, `cornerRadius`                                                                                | —        | —      | iOS          |
  | `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `edge`, `effect`, `scrollViewNativeID`                                                                                                                           | —        | —      | iOS          |
  - The four contracts are internal platform components (FR1). Every one is in
    the platform's always-present core and links by default
    (`spec:AST-112/FR1`, `spec:AST-112/FR3`).
  - The native code uses public platform API only: public UIKit on iOS and
    public Android SDK classes on Android. The one exception is React Native's
    record of the props its native driver manages, which the glass view reads so
    a React commit does not reset a driven `progress` (FR4); React Native marks
    that record unstable, and without it a commit puts back the JavaScript value.
  - On the wire, `colorScheme` is `unspecified` (follow the OS), `light`, or
    `dark`. `shape: 'capsule'`, like any negative radius, rounds to half the
    shorter side.
  - The contracts evolve under `spec:AST-112/FR8`.

### Platform support

| Contract                   | iOS                                                                                                                                                                                            | Android                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | iOS 26 and later: `UIVisualEffectView` with `UIGlassEffect`, children in its content view, the system's glass fade and the layout spring. Earlier: `UIBlurEffect` system material and hairline | A plain view group around the children; glass props have no effect; the library paints the tonal fill |
| `AstryxGlassContainerView` | iOS 26 and later: `UIGlassContainerEffect`. Earlier: plain container                                                                                                                           | Not registered; the library renders a plain View                                                      |
| `AstryxMaterialView`       | iOS 26 and later: `UIGlassEffect` for `glass` and `glassClear`. `blur` and earlier iOS: `UIBlurEffect` system materials                                                                        | Not registered; floating surfaces paint the translucent token fill and overlays paint opaque (FR9)    |
| `AstryxScrollEdgeView`     | iOS 26 and later: `UIScrollEdgeEffect` style and `UIScrollEdgeElementContainerInteraction`. Earlier: plain container                                                                           | Not registered; no scroll-edge effect                                                                 |

- Supported feature/engine floor: the floor of `spec:AST-112`. Liquid Glass,
  glass grouping, and scroll-edge effects need iOS 26 and later; the system blur
  materials cover earlier iOS; Android draws no backdrop material.
- Unsupported behavior: where a native view is absent, the library renders the
  content in a plain View and paints its fallback (FR7, FR9);
  a binary that lacks a named feature behaves as `spec:AST-112/FR8` states.
- Browser evidence: none. Claims are proven on the iOS Simulator (iOS 26 and
  earlier), the Android emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- This record details the system materials of the platform's core
  (`spec:AST-112/FR1`), their view probes and fallbacks (`spec:AST-112/FR7`),
  the theme mapped onto native appearance (`spec:AST-112/FR9`), and the theme's
  `material` member on React Native (`spec:AST-082/FR10`).
- Relies on `spec:AST-112` FR3 (amended): Astryx's own native pieces, these
  four contracts included, link by default.
- Relies on `spec:AST-112` FR8 (amended): contracts start at revision 1 and add
  behaviour as named features the binary reports.

## Verification

| Contract | Verification                                                                                                                             | Representative states                                                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The package's public-surface check of `.`; unit tests of component props and theme intent                                                | `IconButton` and `Button` with `surface="glass"`; a theme with each `material` value, durable and in a platform entry; the package's export list                                                                                                  | `.` exports a glass or material component, layout helper, or probe, or a component prop or theme value does not change the look                                                                                                                                                                                                                                                           |
| FR2      | Unit tests through the `./testing` doubles (view registered and absent); iOS Simulator captures on iOS 26 and an earlier iOS             | each variant and intensity; a corner radius; a tint; interactive glass                                                                                                                                                                            | A variant draws the wrong effect for the OS, the library treats an absent view as present, or a styling prop has no default                                                                                                                                                                                                                                                               |
| FR3      | Unit tests of the prop mapping; Simulator checks of the press, materialize, and hit testing                                              | a capsule; `materialized` toggled on screen; a press on a child; a touch outside the shape under `auto` and under `box-none`                                                                                                                      | A press inside the glass does not reach the child or the glass, a dematerialize drops the children, or a touch outside the shape is taken                                                                                                                                                                                                                                                 |
| FR4      | UI-thread frame checks on the Simulator (no JavaScript per frame during the spring and the morph)                                        | a moved and a resized glass in a container; a scroll; a native-driver `progress`; Reduce Motion                                                                                                                                                   | A frame needs JavaScript, a scroll springs the glass, a React commit resets a driven `progress`, or Reduce Motion still springs                                                                                                                                                                                                                                                           |
| FR5      | Simulator captures                                                                                                                       | two glass shapes inside and outside `spacing`; a touch between them                                                                                                                                                                               | Shapes inside `spacing` do not merge, or the container takes a touch that hit no child                                                                                                                                                                                                                                                                                                    |
| FR6      | Unit tests of the wire value; Simulator captures in light and dark                                                                       | `light`, `dark`, `system`; a dark theme over a light OS                                                                                                                                                                                           | The glass follows the OS while the theme pins a mode, or `system` pins a mode                                                                                                                                                                                                                                                                                                             |
| FR7      | Unit tests of each paint hook with the doubles and accessibility settings                                                                | each row of the table; each system setting; `surfaceMaterial` unset and each value; a theme with `material: 'opaque'` and with `material: 'translucent'`; `surfaceMaterial="opaque"` set explicitly; the platform off; an accessibility text size | A surface paints glass under Reduce Transparency, an overlay paints a translucent fill, or a missing view paints `glass`, or a surface paints glass under a theme whose `material` is `opaque`; a `translucent` theme leaves a floating surface or an overlay `opaque` where `MaterialView` is present and nothing forces `opaque`; or an unset `surfaceMaterial` turns overlays `opaque` |
| FR8      | Simulator checks with a named and an unnamed scroll view                                                                                 | `top` and `bottom`; each effect; unmount; a second writer on the same edge                                                                                                                                                                        | The effect misses the bar, the view restores over another writer's later value, or the edge keeps its value after unmount                                                                                                                                                                                                                                                                 |
| FR9      | Unit tests through the `./testing` doubles in their absent, older, and current shapes; Android emulator captures                         | each view absent; Android; iOS below 26                                                                                                                                                                                                           | Children disappear, a layout or accessibility prop is dropped, or a probe answers true on Android for an iOS-only view                                                                                                                                                                                                                                                                    |
| FR10     | Unit tests of accessibility prop forwarding in both renders; VoiceOver and TalkBack on the Simulator and emulator; settings toggled live | each accessibility prop; Reduce Transparency, Increase Contrast, both together, Show Borders, Reduce Motion; an accessibility text size                                                                                                           | The surface adds an element, an accessibility prop is dropped, or a setting change does not repaint                                                                                                                                                                                                                                                                                       |
| FR11     | The platform's spec rules check; a review of the native sources' API use; the `spec:AST-112/FR8` checks over this group's contracts      | each contract's props; a native source that calls a non-public API                                                                                                                                                                                | A contract lists a prop outside the table, or native code calls a non-public API other than the named exception                                                                                                                                                                                                                                                                           |

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

Rejected: a backdrop leaf behind the content for chrome, because the glass then
never responds to a press and cannot morph.

### DEC-2 — Android paints the theme's fill, not a simulated glass

**Reference:** `spec:AST-123/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Android offers no system material that blurs what lies behind a view, and its
design language favours solid tinted surfaces.
`AstryxGlassView` is a plain view on Android so one tree runs on both platforms,
and the library paints the token fill at the intensity's alpha.

Rejected: blurring with `RenderEffect`, because it applies to the view's own
pixels rather than to the content behind the view.

### DEC-3 — Accessibility settings choose the library's solid paint

**Reference:** `spec:AST-123/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Under Reduce Transparency and Increase Contrast, chrome and floating surfaces
take the library's own opaque surface with an edge instead of UIKit's opaque
glass, so they read the same on iOS and Android and the edge follows the
theme. Overlays, which iOS draws in glass, keep the system glass
and its outline under Increase Contrast and go opaque under Reduce
Transparency (FR10).

### DEC-4 — The scroll-edge view finds its scroll view natively

**Reference:** `spec:AST-123/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A bar names its scroll view by `nativeID`, or the view takes the nearest one
beside it, so a drawn bar works in any screen with or without the Astryx router.
It restores only the value it wrote, so it coexists with a system header on the
same scroll view.

Rejected: a scroll-view ref passed from the router, because an app-drawn bar
outside the router would get no edge effect.

### DEC-5 — Glass motion runs on the UI thread

**Reference:** `spec:AST-123/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The layout spring starts natively from the mounting transaction that moved the
glass, and the morph's `progress` takes a native-driver `Animated` value. Glass
then moves at the display's frame rate while the JavaScript thread is busy.

Rejected: shape props sent from JavaScript on every frame, because a busy
JavaScript thread drops frames.

### DEC-6 — Glass is a look the app asks for, not a component it renders

**Reference:** `spec:AST-123/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

An app states the look through component props and the theme's native intent.
The library then decides per platform, OS version, and accessibility setting
whether system glass, a system material, a drawn surface, or a solid surface
renders it, and the native components stay free to change.

Rejected: public glass and material components, because an app would hard-code
one platform's effect and bypass the theme and accessibility rules.

## Open questions

- **OQ1 — `AstryxMaterialView` and `AstryxGlassView` are two contracts for one
  material: do they merge into one?** (`human-api`) Options: keep both, a leaf
  behind content and a container of content; or one glass view for every
  surface, with a leaf use and a `blur` variant.
- **OQ2 — Does the app root's `surfaceMaterial` preference stay beside the
  theme's `material` intent?** (`human-api`) Options: keep it as an app-wide
  choice for floating surfaces; or let theme intent and component props alone
  set the look (FR1).
- **OQ3 — Does Android draw a system blur where the OS has one?**
  (`human-design`) Android 12 and later blur the window behind a dialog.
  Options: overlays use it where available; or Android keeps the tonal fill
  everywhere (DEC-2).
- **OQ4 — Do two bars on one edge of one scroll view restore the original
  effect when they detach out of order?** (`checkable`) A bar restores only the
  value it wrote, so the second bar to detach restores the first bar's value.
- **OQ5 — Does the surface paint preference join a package-wide choice between
  system and drawn rendering?** (`human-api`) `surfaceMaterial` and the chrome's
  default paint answer it for surfaces only.
