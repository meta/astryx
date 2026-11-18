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
app's light or dark mode, and Reduce Transparency and Increase Contrast give a
solid, readable surface. The developer writes one tree for both platforms and
never checks the OS version.

This record details the platform's system materials in the core of
`spec:AST-112` (`spec:AST-112/FR1`). It builds on the result vocabulary
(`spec:AST-112/FR6`), the capability shape and its view probes
(`spec:AST-112/FR7`), additive evolution (`spec:AST-112/FR8`), the theme mapped
onto native appearance (`spec:AST-112/FR9`), and Astryx Stage
(`spec:AST-112/FR12`). It specifies four native components, `AstryxGlassView`,
`AstryxGlassContainerView`, `AstryxMaterialView`, and `AstryxScrollEdgeView`,
and the library's paint rules that choose between them and a drawn fill.

## Why this exists

| Piece                                         | What the ecosystem already does well                                                                                                                                                                             | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxMaterialView`                          | expo-blur and @react-native-community/blur draw iOS `UIVisualEffectView` blurs, the system materials included, with a tint and an intensity, and each offers an Android blur. Both are mature and simple to use. | Neither draws `UIGlassEffect`. Astryx needs one leaf that draws Liquid Glass on iOS 26 and later and the matching system material below it, follows or pins the theme's colour mode, and has a view probe, so the library picks its fallback before it renders (FR6). One dependency set (`spec:AST-112/FR2`) and Astryx Stage parity complete the case.                                                                                                                                                                      |
| `AstryxGlassView`, `AstryxGlassContainerView` | expo-glass-effect and @callstack/liquid-glass wrap `UIGlassEffect` and `UIGlassContainerEffect` well: regular and clear glass, a tint, interactive glass, a container with spacing, and an availability check.   | The library's chrome needs more in one view: content inside the glass so a press on a child makes the glass respond, UIKit's materialize and dematerialize, a layout spring that morphs grouped glass when React Native moves it, a shape morph driven by a native-driver `Animated` value (FR3), touches that pass through outside the glass shape, the pre-26 blur with its hairline edge, a registered Android view so one tree runs on both platforms, and Astryx Stage parity. No extra dependency (`spec:AST-112/FR2`). |
| `AstryxScrollEdgeView`                        | react-native-screens sets the scroll-edge effects of the scroll view under a system header that it presents.                                                                                                     | Astryx draws its own bars (`spec:AST-112/DEC-9`). A drawn bar gets the system's edge effect only when the bar registers as the edge's element container, so the effect follows the bar's own glass, labels, and controls. No router is needed to find the scroll view (DEC-4).                                                                                                                                                                                                                                                |

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What a person sees                                                                                                                                 |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | native component (Fabric Native Component) | Through the library's `GlassSurface`: `TabBar` (and `FloatingTabBar`, which renders a `TabBar`), `Header` (its floating variant included), `FloatingHeader`, `BarButton`, `BarButtonGroup`, `BottomAccessory`, `SearchBar`, `KeyboardAccessoryView`, `IconButton` with `surface="glass"`, `Button`'s glass surface, and `DropdownMenu`'s icon trigger. The router's stack and tab navigators draw `Header` and `TabBar`. Apps: `NativeGlassView` and `GlassSurface` from `.`                             | Glass bars, capsules, and round buttons that brighten and lift under a finger, appear and disappear with UIKit's motion, and spring to a new shape |
| `AstryxGlassContainerView` | native component (Fabric Native Component) | Through the library's `GlassGroup`: `TabBar` (and `FloatingTabBar`), `FloatingHeader`, `BarButtonGroup`. Apps: `GlassContainerView`, `GlassGroup`, and `MaterialGroup` from `.`                                                                                                                                                                                                                                                                                                                          | A tab bar's pill and the circle beside it, or a header's button group, read as one piece of glass that merges where they meet                      |
| `AstryxMaterialView`       | native component (Fabric Native Component) | Overlays through the library's overlay backdrop: `AlertDialog`, `Dialog`, `Popover` (and the surfaces drawn through it: `DropdownMenu`, `ContextMenu`, `Selector`'s picker, `TabList`'s menu, `HoverCard`, `TopNav`'s menus), `BottomSheet`, `InlineSheet`. Floating surfaces through `MaterialBackdrop`: `DockedBar`, `Toast`, and `ChatLayoutScrollButton` (in `ChatLayout`). Every `GlassSurface` where glass draws but the glass view is absent. Apps: `MaterialView` and `MaterialSurface` from `.` | A menu, sheet, or dialog in system glass on iOS 26 and later; a frosted docked bar or toast where the app asks for material                        |
| `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `Header` with `scrollEdge="soft"` or `"hard"` (the bar variants on iOS and the floating variant); the router's stack navigator through its drawn header and header search field. Apps: `NativeScrollEdgeView` from `.`                                                                                                                                                                                                                                                                                   | Rows that soften or fade under the header as they scroll beneath it, as under a system navigation bar                                              |

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
- Liquid Glass's system Clear and Tinted appearance setting. It has no public
  read API, so drawn surfaces keep the app's variant and tint.
- How Astryx Stage renders glass internally, beyond the parity of FR10.

## Requirements

- **FR1 — A system material behind content.** `MaterialView` draws a system
  material as a leaf behind a surface's content:
  - Props: `variant` (`glass`, `glassClear`, or `blur`; default `glass`),
    `intensity` (`ultraThin`, `thin`, `regular`, `thick`, `chrome`; default
    `regular`), `colorScheme` (FR5), `tint`, `interactive` (default false),
    `cornerRadius` (points, continuous corners, at most half the short side),
    and every View prop. Every styling prop has a default, so
    `<MaterialView style={…} />` is a complete call.
  - On iOS 26 and later, `glass` and `glassClear` draw `UIGlassEffect` (regular
    or clear style) with the tint and the interactive response. `blur`, and every
    variant below iOS 26, draws the `UIBlurEffect` system material that
    `intensity` names (ultra thin to chrome).
  - Probes: `isMaterialViewAvailable()` and `MaterialView.supports(variant)`.
    Both answer true wherever the native view is registered, because every
    variant draws there (below iOS 26 as a blur).
  - The deprecated `appearance` prop and `supportsMaterialVariant` stay exported
    under `spec:AST-112/FR5`; `colorScheme` and `MaterialView.supports` replace
    them.
- **FR2 — Glass with its content inside.** `NativeGlassView` is a glass surface
  whose React children live inside the glass:
  - Props: `variant` (`regular` or `clear`), `tint`, `interactive` (default
    false), `cornerRadius` (points, or `'capsule'`: half the short side),
    `materialized` (default true), `animatesLayout`, `morphFrom`, `morphTo`,
    `progress` (FR3), `intensity` (the material below iOS 26), `colorScheme`
    (FR5), `ref`, and every View and accessibility prop.
  - On iOS 26 and later the children mount inside a `UIGlassEffect` view, so an
    interactive glass responds to a press on a Pressable inside it, and the press
    still reaches the Pressable. Below iOS 26 the glass is the `intensity` system
    material with a one-pixel hairline edge, behind the children.
  - `materialized: false` removes the glass and keeps the children. A change on
    screen animates the effect to or from nothing (UIKit's materialize and
    dematerialize); a tint change on shown glass cross-fades the same way.
  - Touches: a touch on a child reaches the child wherever the child is. Where no
    child is, under `pointerEvents` `auto` the glass is the target inside its
    shown shape and the touch passes through outside it; under `box-none` the
    touch always passes through; `none` and `box-only` act as on a View.
  - Probes: `isNativeGlassViewAvailable()` answers whether the binary registers
    the view; `isLiquidGlassAvailable()` answers true only on iOS 26 and later
    with the view registered.
- **FR3 — Glass motion runs on the UI thread.** No glass motion runs JavaScript
  per frame:
  - `animatesLayout`: when a React Native commit moves or resizes the glass on
    screen (its own frame or an ancestor's), the glass springs from where it was
    to its new shape, and the children take their new place at once. Positions
    compare in the nearest glass container's space, else the nearest scroll
    view's, else the window's, so scrolling is not a move. The first layout and a
    commit that changes only the morph do not spring.
  - `morphFrom` and `morphTo` (rects with a corner radius, in the view's own
    points) with `progress` from 0 to 1: the glass takes the interpolated shape
    inside the view. `progress` accepts a native-driver `Animated` value through
    `Animated.createAnimatedComponent(NativeGlassView)`; a later React commit
    does not put back the JavaScript value while the native driver owns it.
  - Reduce Motion: no spring; the glass takes its new shape at once.
- **FR4 — Glass groups merge.** `GlassContainerView` (prop `spacing`, points,
  default 0) groups the glass inside it: on iOS 26 and later its children mount
  inside a `UIGlassContainerEffect` view, so glass shapes within `spacing` of
  each other draw as one material that merges and morphs, as SwiftUI's
  `GlassEffectContainer` does. Below iOS 26 it is a plain container. It draws
  nothing of its own, and a touch that hits no child passes through it, so a
  container wider than its glass never blocks the content under it. Probe:
  `isGlassContainerViewAvailable()`.
- **FR5 — Surfaces follow the theme's colour mode.** Each view's `colorScheme`
  is `light`, `dark`, or `system`. `light` and `dark` pin the material's
  appearance; `system` lets it follow the OS. The default is the scheme of the
  nearest `PlatformAppearanceProvider`, else `system`. The library's chrome pins
  the glass to the Astryx theme's mode, so a dark theme over a light OS draws
  dark glass. The pre-26 hairline follows the resolved mode. Chrome glass carries
  the chrome tint (the theme's surface colour at 0.6 alpha) unless a component
  gives its own tint.
- **FR6 — The library chooses one paint per surface.** Before it renders, each
  surface resolves one paint from the system settings, the app's preference, and
  the view probes:

  | Surface                                                   | Paints, in order                                                                                                                                                                                                                                                                                                                                  |
  | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Chrome (`GlassSurface`, `GlassGroup`)                     | `opaque` under Increase Contrast or Reduce Transparency, or when the caller passes `material="opaque"`; `translucent` where glass does not draw; `glass` (content inside `NativeGlassView`) where the glass view is available; else `native` (`MaterialView` behind the content). Chrome asks for material by default.                            |
  | Floating surfaces (`MaterialSurface`, `MaterialBackdrop`) | The `surfaceMaterial` preference of `AstryxCapabilitiesProvider` (default `opaque`); `opaque` also under Reduce Transparency or Increase Contrast; `native` where `MaterialView` supports the variant; else `translucent`.                                                                                                                        |
  | Overlays (menus, popovers, sheets, dialogs)               | `native` (system glass behind the content, transparent fill) only on iOS 26 and later with the platform on and `MaterialView` available; `opaque` everywhere else, under Reduce Transparency, when the app sets `surfaceMaterial="opaque"`, for a drawn menu at the accessibility text sizes, and for a non-modal sheet resting on bottom chrome. |
  - `translucent` is the surface's own token fill at an alpha per intensity
    (ultra thin 0.6, thin 0.72, regular 0.82, thick 0.9, chrome 0.94) with a
    hairline edge. An overlay never paints a hand-made translucent fill.
  - Grouping (`GlassGroup`, `MaterialGroup`) uses `GlassContainerView` under the
    `glass` and `native` paints and a plain View otherwise.
  - `isPlatformEnabled: false` on the app root sends every surface to its drawn
    paint.

- **FR7 — The scroll-edge effect for a drawn bar.** `NativeScrollEdgeView` wraps
  a bar the app draws over a scroll view's edge (a header, a tab bar, a toolbar):
  - Props: `edge` (`top` or `bottom`; default `top`), `effect` (`automatic`,
    `soft`, `hard`, or `hidden`; default `automatic`), `scrollViewNativeID`, and
    layout, accessibility, and `ref` props. Its children render as usual.
  - On iOS 26 and later it sets the scroll view's edge effect for `edge` to
    `effect` (`UIScrollEdgeEffect`) and adds a
    `UIScrollEdgeElementContainerInteraction` for that scroll view and edge, so
    the effect covers the bar and follows its own elements as it does under a
    system bar, whatever the bar holds. Below iOS 26 it is a plain container.
  - The scroll view is the one whose `nativeID` equals `scrollViewNativeID`
    (a ScrollView, FlatList, or SectionList takes it as a prop). Without one it
    is the nearest scroll view beside the bar in the same screen. The view finds
    it in the native hierarchy and needs no router; the same `nativeID` names a
    page's scroll view for the navigation hosts too.
  - The view writes its edge when it attaches (window entry or a new target) and
    when `edge` or `effect` changes. On unmount, leaving the window, an edge
    change, or a new target it removes the interaction and restores the effect
    the scroll view had before, but only while the edge still holds the value
    this view wrote. Another writer on the same edge, such as a system header,
    wins when it writes later.
  - Probes: `isNativeScrollEdgeViewAvailable()` and
    `supportsScrollEdgeEffects()` (true only on iOS 26 and later with the view
    registered). The library uses the view wherever it is registered on iOS 26
    and later with the platform on, whether or not glass draws, so a solid bar
    under Reduce Transparency keeps the system's edge.
- **FR8 — Content never disappears with a surface.** Where a view is absent
  (Android for the iOS-only views, an app built without the platform, Jest, a
  binary without the view), each component renders its children in a plain View
  with the same layout, accessibility, and `ref` props, a `cornerRadius` becomes
  the View's border radius, and the probe answers false so the library paints
  its fallback (`spec:AST-112/FR7`):
  - Android: `AstryxGlassView` is registered as a plain view group around its
    children, so a tree that renders `NativeGlassView` runs unchanged; every
    glass prop is accepted and has no effect, and it hit-tests as its box.
    `MaterialView.supports` answers false there, so chrome and floating surfaces
    paint `translucent` and overlays paint `opaque`. `AstryxGlassContainerView`,
    `AstryxMaterialView`, and `AstryxScrollEdgeView` are not registered.
  - Without the scroll-edge view on iOS, `Header` draws its own band behind the
    bar (the body colour for `hard`, the body colour at 0.82 alpha for `soft`)
    that fades in over the first 12 points of scroll on the native driver. On
    Android `Header` draws no scroll edge.
  - Below iOS 26 the glass views draw the system blur material (FR1, FR2), and
    the container and scroll-edge views are plain containers.
- **FR9 — Accessibility.**
  - The surfaces are decoration. Each view forwards every accessibility prop and
    its `ref` to the rendered view, native or plain, and adds no element of its
    own; VoiceOver and TalkBack read the content inside. The scroll-edge view's
    element proxy for UIKit is hidden from accessibility and takes no touches.
  - Reduce Transparency and Increase Contrast: chrome and floating surfaces paint
    `opaque`, the solid theme surface with an edge whose weight follows the
    reason (FR6). Overlays paint `opaque` under Reduce Transparency and keep
    glass under Increase Contrast with the hairline edge iOS draws around its
    glass in that setting. The library reads both settings live from
    `AstryxAccessibilitySettings` and repaints when they change.
  - Show Borders gives an interactive drawn surface the outline the system draws
    on glass under that setting.
  - Reduce Motion stops the glass layout spring (FR3). At the accessibility text
    sizes, drawn menus and the `Selector`'s picker keep an opaque fill, so large
    text never reads through glass onto the content behind it.
- **FR10 — The native contract.**

  | Contract                   | Kind                                       | Props                                                                                                                                                            | Commands | Events | Platforms    |
  | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------ |
  | `AstryxGlassView`          | native component (Fabric Native Component) | `variant`, `glassTint`, `interactive`, `cornerRadius`, `shape`, `materialized`, `animatesLayout`, `morphFrom`, `morphTo`, `progress`, `intensity`, `colorScheme` | —        | —      | iOS, Android |
  | `AstryxGlassContainerView` | native component (Fabric Native Component) | `spacing`                                                                                                                                                        | —        | —      | iOS          |
  | `AstryxMaterialView`       | native component (Fabric Native Component) | `variant`, `intensity`, `appearance`, `colorScheme`, `glassTint`, `interactive`, `cornerRadius`                                                                  | —        | —      | iOS          |
  | `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `edge`, `effect`, `scrollViewNativeID`                                                                                                                           | —        | —      | iOS          |
  - Every contract is in the platform's always-present core (`spec:AST-112/FR1`)
    and links with no opt-in.
  - The native code uses public platform API only: public UIKit on iOS and
    public Android SDK classes on Android. The one exception is React Native's
    record of the props its native driver manages, which the glass view reads so
    a React commit does not reset a driven `progress` (FR3); React Native marks
    that record unstable, and without it a commit puts back the JavaScript value.
  - On the wire, `colorScheme` is `unspecified` (follow the trait collection),
    `light`, or `dark`; on `AstryxMaterialView` it wins over `appearance`, which
    carries the pinned mode. `shape: 'capsule'` or a negative radius is half the
    short side.
  - Every contract in the group is at revision 1. A behaviour added after
    revision 1 is a named feature (`<Contract>.<feature>`) that the binary lists
    and the JavaScript checks with `hasContractFeature` before it uses it.
    Without the feature the JavaScript keeps the revision-1 behaviour or answers
    `unsupported`, and says so once; it never takes a silent weaker path.
  - Astryx Stage pairs with the package through the package's spec hashes and
    its Stage version floor: the package names the oldest Stage that implements
    its contract set, and an older Stage refuses the project with the gaps
    listed.
  - Astryx Stage draws each contract with the behaviour of FR1 to FR8 on its iOS
    profiles (simulated Liquid Glass with grouping, materialize, layout spring,
    morph, and the press response; the system blur on the pre-26 look; the soft
    and hard edge bands from the edge to the bar's elements) and draws
    `AstryxGlassView` as a plain view on its Android profiles.

### Platform support

| Contract                   | iOS                                                                                                                                                                             | Android                                                                                               | Astryx Stage                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | iOS 26 and later: `UIVisualEffectView` with `UIGlassEffect`, children in its content view, UIKit's materialize and spring. Earlier: `UIBlurEffect` system material and hairline | A plain view group around the children; glass props have no effect; the library paints the tonal fill | iOS profiles: simulated Liquid Glass with the iOS behaviour; pre-26 look: blur and hairline. Android profiles: plain view |
| `AstryxGlassContainerView` | iOS 26 and later: `UIGlassContainerEffect`. Earlier: plain container                                                                                                            | Not registered; the library renders a plain View                                                      | Merges neighbouring glass into one outline within `spacing`                                                               |
| `AstryxMaterialView`       | iOS 26 and later: `UIGlassEffect` for `glass` and `glassClear`. `blur` and earlier iOS: `UIBlurEffect` system materials                                                         | Not registered; the library paints the translucent token fill                                         | The same material per variant and OS look                                                                                 |
| `AstryxScrollEdgeView`     | iOS 26 and later: `UIScrollEdgeEffect` style and `UIScrollEdgeElementContainerInteraction`. Earlier: plain container                                                            | Not registered; no scroll-edge effect                                                                 | Soft and hard bands over the target scroll view; nothing on Android profiles                                              |

- Supported feature/engine floor: the floor of `spec:AST-112`. Liquid Glass,
  glass grouping, and scroll-edge effects need iOS 26 and later; the system blur
  materials cover earlier iOS; Android draws no backdrop material.
- Unsupported behavior: an absent view renders its children in a plain View and
  its probe answers false, and the library draws its fallback paint (FR6, FR8);
  a feature a binary does not list keeps the revision-1 behaviour or answers
  `unsupported` (FR10).
- Browser evidence: none. Claims are proven on the iOS Simulator (iOS 26 and
  earlier), the Android emulator, devices, and Astryx Stage
  (`spec:AST-112/FR15`).

## Current-state impact

- None beyond `spec:AST-112`. This record details the system materials of the
  core (`spec:AST-112/FR1`), their view probes and fallbacks
  (`spec:AST-112/FR7`), the theme mapped onto native appearance
  (`spec:AST-112/FR9`), and their Astryx Stage parity (`spec:AST-112/FR12`).
- The four contracts are core and link by default, as `spec:AST-112/FR1`
  states; the record changes no capability's opt-in.

## Verification

| Contract | Verification                                                                                                                                                                         | Representative states                                                                                                        | Mutation or failure expectation                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests through the `./testing` doubles (view registered and absent); iOS Simulator captures on iOS 26 and an earlier iOS                                                         | each variant and intensity; a corner radius; a tint; interactive glass                                                       | A variant draws the wrong effect for the OS, a probe answers true where the view is absent, or a styling prop has no default                                                                        |
| FR2      | Unit tests of the prop mapping and probes; Simulator checks of the press, materialize, and hit testing                                                                               | a capsule; `materialized` toggled on screen; a press on a child; a touch outside the shape under `auto` and under `box-none` | A press inside the glass does not reach the child or the glass, a dematerialize drops the children, or a touch outside the shape is taken                                                           |
| FR3      | UI-thread frame checks on the Simulator (no JavaScript per frame during the spring and the morph); Astryx Stage scripts of the spring and the morph                                  | a moved and a resized glass in a container; a scroll; a native-driver `progress`; Reduce Motion                              | A frame needs JavaScript, a scroll springs the glass, a React commit resets a driven `progress`, or Reduce Motion still springs                                                                     |
| FR4      | Simulator captures; Astryx Stage container scripts on the iOS 26 and pre-26 looks                                                                                                    | two glass shapes inside and outside `spacing`; a touch between them                                                          | Shapes inside `spacing` do not merge, or the container takes a touch that hit no child                                                                                                              |
| FR5      | Unit tests of the wire value; Simulator captures in light and dark                                                                                                                   | `light`, `dark`, `system`; a dark theme over a light OS                                                                      | The glass follows the OS while the theme pins a mode, or `system` pins a mode                                                                                                                       |
| FR6      | Unit tests of each paint hook with the doubles and accessibility settings                                                                                                            | each row of the table; each system setting; `surfaceMaterial` set and unset; the platform off                                | A surface paints glass under Reduce Transparency, an overlay paints a translucent fill, or a missing view paints `glass`                                                                            |
| FR7      | Simulator checks with a named and an unnamed scroll view; Astryx Stage scroll-edge scripts                                                                                           | `top` and `bottom`; each effect; unmount; a second writer on the same edge                                                   | The effect misses the bar, the view restores over another writer's later value, or the edge keeps its value after unmount                                                                           |
| FR8      | Unit tests through the `./testing` doubles in their absent, older, and current shapes; Android emulator captures; Astryx Stage Android profile                                       | each view absent; Android; iOS below 26                                                                                      | Children disappear, a layout or accessibility prop is dropped, or a probe answers true on Android for an iOS-only view                                                                              |
| FR9      | Unit tests of prop and `ref` forwarding in both renders; VoiceOver and TalkBack on the Simulator and emulator; settings toggled live                                                 | each accessibility prop; Reduce Transparency, Increase Contrast, Show Borders, Reduce Motion; an accessibility text size     | The surface adds an element, an accessibility prop is dropped, or a setting change does not repaint                                                                                                 |
| FR10     | The platform's spec rules check; the contract table and named-feature check; a review of the native sources' API use; Astryx Stage contract suites and the Stage version floor check | each contract's props; a binary without a named feature; an older Stage                                                      | A contract changes without a named feature, the JavaScript uses an unlisted feature silently, an older Stage runs the project, or native code calls a non-public API other than the named exception |

## Decision log

### DEC-1 — The content lives inside the glass

**Reference:** `spec:AST-123/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Liquid Glass responds to touches on its own descendants and morphs with its
neighbours only when the content is inside the effect view. `NativeGlassView`
mounts its children there, so a glass button brightens under the finger and a
tab bar's pill merges with the circle beside it. `MaterialView` stays the leaf
material for surfaces that only need a backdrop, such as overlays and docked
bars.

Rejected: a backdrop leaf behind the content for chrome, because the glass then
never responds to a press and cannot morph.

### DEC-2 — Android paints the theme's fill, not a simulated glass

**Reference:** `spec:AST-123/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Android has no system backdrop material, and Material 3 uses tonal surfaces.
`AstryxGlassView` is a plain view on Android so one tree runs on both platforms,
and the library paints the token fill at the intensity's alpha.

Rejected: a `RenderEffect` blur, because it blurs a view's own content, not what
lies behind it.

### DEC-3 — Accessibility settings choose the library's solid paint

**Reference:** `spec:AST-123/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Under Reduce Transparency and Increase Contrast the library paints its own
opaque surface with an edge instead of relying on UIKit's opaque glass. The
surface then reads the same on iOS, Android, and Astryx Stage, and its edge
follows the theme.

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

## Open questions

- **OQ1 — `AstryxMaterialView` and `AstryxGlassView` are two contracts for one
  material: do they merge into one?** (`human-api`) Options: keep both, a leaf
  behind content and a container of content; or one glass view for every
  surface, with a leaf use and a `blur` variant, and `MaterialView` kept as a
  library wrapper over it.
- **OQ2 — Does `MaterialGroup` stay public?** (`human-api`) No Astryx component
  renders it; `GlassGroup` groups every library surface. Options: keep it as app
  API; or deprecate it in favour of `GlassGroup`.
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
