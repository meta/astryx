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

| Piece                                         | What the ecosystem already does well                                                                                                                                                                             | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxMaterialView`                          | expo-blur and @react-native-community/blur draw iOS `UIVisualEffectView` blurs, the system materials included, with a tint and an intensity, and each offers an Android blur. Both are mature and simple to use. | Neither draws `UIGlassEffect`. Astryx needs one leaf that draws Liquid Glass on iOS 26 and later and the matching system material below it, follows or pins the theme's colour mode, and has a view probe, so the library picks its fallback before it renders (FR6). One dependency set (`spec:AST-112/FR2`) and Astryx Stage parity complete the case.                                                                                                                                                                               |
| `AstryxGlassView`, `AstryxGlassContainerView` | expo-glass-effect and @callstack/liquid-glass wrap `UIGlassEffect` and `UIGlassContainerEffect` well: regular and clear glass, a tint, interactive glass, a container with spacing, and an availability check.   | The library's chrome needs more in one view: content inside the glass so a press on a child makes the glass respond, the system's fade-in and fade-out of the glass, a layout spring that morphs grouped glass when React Native moves it, a shape morph driven by a native-driver `Animated` value (FR3), touches that pass through outside the glass shape, the pre-26 blur with its hairline edge, a registered Android view so one tree runs on both platforms, and Astryx Stage parity. No extra dependency (`spec:AST-112/FR2`). |
| `AstryxScrollEdgeView`                        | react-native-screens sets the scroll-edge effects of the scroll view under a system header that it presents.                                                                                                     | Astryx draws its own bars (`spec:AST-112/DEC-9`). A drawn bar gets the system's edge effect only when the bar registers as the edge's element container, so the effect takes the outline of what the bar contains. No router is needed to find the scroll view (DEC-4).                                                                                                                                                                                                                                                                |

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What a person sees                                                                                                                                 |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | native component (Fabric Native Component) | Through the library's `GlassSurface`: `TabBar` (and `FloatingTabBar`, which renders a `TabBar`), `Header` (its floating variant included), `FloatingHeader`, `BarButton`, `BarButtonGroup`, `BottomAccessory`, `SearchBar`, `KeyboardAccessoryView`, `IconButton` with `surface="glass"`, `Button`'s glass surface, and `DropdownMenu`'s icon trigger. The router's stack and tab navigators draw `Header` and `TabBar`. Apps: `NativeGlassView` and `GlassSurface` from `.`                             | Glass bars, capsules, and round buttons that brighten and lift under a finger, appear and disappear with UIKit's motion, and spring to a new shape |
| `AstryxGlassContainerView` | native component (Fabric Native Component) | Through the library's `GlassGroup`: `TabBar` (and `FloatingTabBar`), `FloatingHeader`, `BarButtonGroup`. Apps: `GlassContainerView`, `GlassGroup`, and `MaterialGroup` from `.`                                                                                                                                                                                                                                                                                                                          | Adjacent bar items, such as a row of header buttons, look like one piece of glass that joins where they come close                                 |
| `AstryxMaterialView`       | native component (Fabric Native Component) | Overlays through the library's overlay backdrop: `AlertDialog`, `Dialog`, `Popover` (and the surfaces drawn through it: `DropdownMenu`, `ContextMenu`, `Selector`'s picker, `TabList`'s menu, `HoverCard`, `TopNav`'s menus), `BottomSheet`, `InlineSheet`. Floating surfaces through `MaterialBackdrop`: `DockedBar`, `Toast`, and `ChatLayoutScrollButton` (in `ChatLayout`). Every `GlassSurface` where glass draws but the glass view is absent. Apps: `MaterialView` and `MaterialSurface` from `.` | A menu, sheet, or dialog in system glass on iOS 26 and later; a frosted docked bar or toast where the app asks for material                        |
| `AstryxScrollEdgeView`     | native component (Fabric Native Component) | `Header`; the router's stack navigator through its drawn header and header search field. Apps: `NativeScrollEdgeView` from `.`                                                                                                                                                                                                                                                                                                                                                                           | Rows that soften or fade under the header as they scroll beneath it, as under a system navigation bar                                              |

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
- How Astryx Stage renders glass internally, beyond the parity of FR10.

## Requirements

- **FR1 — A system material behind content.** `MaterialView` paints a system
  material behind whatever a surface draws over it:
  - Props: `variant` (`glass`, `glassClear`, or `blur`; default `glass`),
    `intensity` (`ultraThin`, `thin`, `regular`, `thick`, `chrome`; default
    `regular`), `colorScheme` (FR5), `tint`, `interactive` (default false),
    `cornerRadius` (points, continuous corners, capped at half the shorter side),
    and the View props. A call that passes only a style draws the default glass.
  - On iOS 26 and later, `glass` and `glassClear` paint `UIGlassEffect` in its
    regular or clear style, with the tint and, when `interactive`, the touch
    response. `blur` on any iOS, and every variant before iOS 26, paints the
    `UIBlurEffect` system material named by `intensity`.
  - Probes: `isMaterialViewAvailable()` and `MaterialView.supports(variant)`.
    Both are true wherever the binary registers the view, since every variant
    paints there (as a blur before iOS 26).
  - `colorScheme` and `MaterialView.supports` replace the deprecated
    `appearance` prop and `supportsMaterialVariant`, which stay exported under
    `spec:AST-112/FR5`.
- **FR2 — Glass that holds its content.** `NativeGlassView` is a glass surface
  with its React children inside the glass:
  - Props: `variant` (`regular` or `clear`), `tint`, `interactive` (default
    false), `cornerRadius` (points, or `'capsule'` for half the shorter side),
    `materialized` (default true), `animatesLayout`, `morphFrom`, `morphTo`,
    `progress` (FR3), `intensity` (the material before iOS 26), `colorScheme`
    (FR5), `ref`, and the View and accessibility props.
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
  - Probes: `isNativeGlassViewAvailable()` tells whether the binary registers
    the view, and `isLiquidGlassAvailable()` is true only where it does on iOS
    26 or later.
- **FR3 — Glass moves without JavaScript per frame.**
  - With `animatesLayout`, a React Native commit that moves or resizes the glass
    on screen, through its own frame or a parent's, makes the glass spring from
    its old shape to the new one while the children jump to their new place. A
    move is measured relative to the enclosing glass container, or else the
    enclosing scroll view, or else the window, so a scroll alone never springs
    the glass. Neither the first layout nor a morph-only change springs.
  - `morphFrom` and `morphTo` are two rectangles with corner radii, in the
    view's own coordinates; `progress` between 0 and 1 blends the glass shape
    between them. A native-driver `Animated` value can drive `progress` (wrap
    the view with `Animated.createAnimatedComponent`), and a React commit keeps
    the driven value instead of restoring the JavaScript one.
  - With Reduce Motion on, the glass takes each new shape without a spring.
- **FR4 — Neighbouring glass merges.** `GlassContainerView` (prop `spacing`,
  points, default 0) groups the glass placed inside it. On iOS 26 and later its
  children sit in a `UIGlassContainerEffect` view, so two glass shapes closer
  than `spacing` render as one blended piece of glass and blend apart again as
  they separate. Before iOS 26 it only contains its children. It paints nothing
  itself, and touches that hit none of its children go to whatever lies beneath
  it. Probe: `isGlassContainerViewAvailable()`.
- **FR5 — Surfaces use the app's colour mode.** Each view takes `colorScheme`:
  `light` or `dark` fixes the material's appearance, and `system` tracks the OS.
  Without the prop, the view uses the nearest `PlatformAppearanceProvider`'s
  scheme, or `system` when there is none. The library's own chrome fixes its
  glass to the Astryx theme's mode, so a dark Astryx theme on a light OS shows
  dark glass. The pre-26 outline uses the resolved mode. Unless a component
  passes a tint, chrome glass is tinted with the theme's surface colour at 0.6
  alpha.
- **FR6 — The library picks one paint per surface.** Each surface settles on a
  paint before it renders, from the accessibility settings, the app's
  preference, and the probes:

  | Surface                                                   | Paint chosen                                                                                                                                                                                                                                                                                                                 |
  | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Chrome (`GlassSurface`, `GlassGroup`)                     | `opaque` with Increase Contrast or Reduce Transparency on, or when the caller asks for it; otherwise `translucent` if glass cannot paint here; otherwise `glass` (children inside `NativeGlassView`) if that view exists, else `native` (`MaterialView` under the children). Chrome requests material unless told otherwise. |
  | Floating surfaces (`MaterialSurface`, `MaterialBackdrop`) | The app's `surfaceMaterial` preference on `AstryxCapabilitiesProvider` (`opaque` when unset); `opaque` too with Reduce Transparency or Increase Contrast on; otherwise `native` if `MaterialView` supports the variant, else `translucent`.                                                                                  |
  | Overlays (menus, popovers, sheets, dialogs)               | `native` (system glass under the content, clear fill) only on iOS 26 or later with the platform on and `MaterialView` present; otherwise `opaque`, which also applies with Reduce Transparency on and when the app sets `surfaceMaterial="opaque"`.                                                                          |
  - `translucent` is the surface's token colour with its alpha scaled by the
    intensity (0.6, 0.72, 0.82, 0.9, and 0.94 from `ultraThin` to `chrome`) and
    a one-pixel outline. Overlays have no `translucent` paint.
  - `GlassGroup` and `MaterialGroup` use `GlassContainerView` for the `glass`
    and `native` paints and a plain View for the others.
  - With `isPlatformEnabled: false` on the app root, every surface uses its
    drawn paint.

- **FR7 — System scroll-edge effects under a drawn bar.**
  `NativeScrollEdgeView` wraps a bar that the app draws over the edge of a
  scroll view:
  - Props: `edge` (`top` or `bottom`; default `top`), `effect` (`automatic`,
    `soft`, `hard`, or `hidden`; default `automatic`), `scrollViewNativeID`, and
    the layout, accessibility, and `ref` props. Its children render normally.
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
  - Probes: `isNativeScrollEdgeViewAvailable()`, and
    `supportsScrollEdgeEffects()`, true only where the view exists on iOS 26 or
    later. The library applies the view wherever it exists on iOS 26 or later
    with the platform on, independent of the glass paint, so a solid bar under
    Reduce Transparency still gets the system edge.
- **FR8 — A missing surface keeps its content.** When a view is not there
  (the iOS-only views on Android, an app without the platform, Jest, a binary
  that lacks the view), its component renders the children in a plain View
  with the same layout, accessibility, and `ref` props, turns `cornerRadius`
  into a border radius, and its probe returns false so the library falls back
  (`spec:AST-112/FR7`):
  - Android registers `AstryxGlassView` as an ordinary view group, so a tree
    that uses `NativeGlassView` runs as is; the glass props are accepted and do
    nothing, and touches hit its full box. `MaterialView.supports` is false on
    Android, so chrome and floating surfaces use `translucent` and overlays use
    `opaque`. Android registers none of the other three views.
  - Where the scroll-edge view is missing, the library draws its own fallback
    edge or none.
  - Before iOS 26 the two glass views paint the system blur material (FR1,
    FR2), and the container and scroll-edge views only contain their children.
- **FR9 — Accessibility.**
  - Surfaces are decorative. Each view passes every accessibility prop and its
    `ref` to whichever view it renders, native or plain, and contributes no
    accessibility element itself, so VoiceOver and TalkBack reach the content
    inside. The scroll-edge view's helper element for UIKit is hidden from
    assistive technologies and ignores touches.
  - With Reduce Transparency or Increase Contrast on, chrome and floating
    surfaces switch to `opaque`: the solid theme surface and an outline whose
    weight depends on which setting caused it (FR6). Overlays switch to
    `opaque` for Reduce Transparency; for Increase Contrast they keep glass and
    add the outline iOS gives glass in that setting. The library reads both
    settings from `AstryxAccessibilitySettings` and repaints when either
    changes.
  - With Show Borders on, an interactive drawn surface shows the outline iOS
    draws on glass in that setting.
  - Reduce Motion removes the layout spring (FR3). At accessibility text sizes,
    drawn menus and the `Selector` picker use an opaque fill, so large text is
    never shown through glass over other content.
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
    carries the pinned mode. `shape: 'capsule'`, like any negative radius,
    rounds to half the shorter side.
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

| Contract                   | iOS                                                                                                                                                                                            | Android                                                                                               | Astryx Stage                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGlassView`          | iOS 26 and later: `UIVisualEffectView` with `UIGlassEffect`, children in its content view, the system's glass fade and the layout spring. Earlier: `UIBlurEffect` system material and hairline | A plain view group around the children; glass props have no effect; the library paints the tonal fill | iOS profiles: simulated Liquid Glass with the iOS behaviour; pre-26 look: blur and hairline. Android profiles: plain view |
| `AstryxGlassContainerView` | iOS 26 and later: `UIGlassContainerEffect`. Earlier: plain container                                                                                                                           | Not registered; the library renders a plain View                                                      | Merges neighbouring glass into one outline within `spacing`                                                               |
| `AstryxMaterialView`       | iOS 26 and later: `UIGlassEffect` for `glass` and `glassClear`. `blur` and earlier iOS: `UIBlurEffect` system materials                                                                        | Not registered; the library paints the translucent token fill                                         | The same material per variant and OS look                                                                                 |
| `AstryxScrollEdgeView`     | iOS 26 and later: `UIScrollEdgeEffect` style and `UIScrollEdgeElementContainerInteraction`. Earlier: plain container                                                                           | Not registered; no scroll-edge effect                                                                 | Soft and hard bands over the target scroll view; nothing on Android profiles                                              |

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
mounts its children there: a glass button then lights up when pressed, and
nearby glass items join into one shape. `MaterialView` stays the leaf
material for surfaces that only need a backdrop, such as overlays and docked
bars.

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
