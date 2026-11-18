---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-127
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

# React Native platform: Icons and drawing system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app built with `@astryxdesign/react-native` shows icons and simple vector
drawings in every screen: a chevron in a list row, a close glyph in a sheet, a
theme's own image icons in a menu, a chart's lines and bars. A developer writes
`<Icon icon="close" />` or `<LineChart … />` and gets a crisp, tinted drawing at
the right size in the view's first frame, mirrored in right-to-left layouts,
named or hidden for screen readers, enlarged in the iOS Large Content Viewer
where a fixed-size control needs it, and the same in Astryx Stage. On iOS an app
may choose SF Symbols, with their effects, in place of the drawn glyphs. No icon
font, SVG library, or image library is installed for any of it.

This record details the icon and drawing pieces of the platform layer of
`spec:AST-112`: the always-present core (`spec:AST-112/FR1`), the result
vocabulary (`spec:AST-112/FR6`), the capability shape (`spec:AST-112/FR7`),
additive evolution (`spec:AST-112/FR8`), the mapping of Astryx icon names onto
the platform (`spec:AST-112/FR9`), and Astryx Stage as the contract developers
build against (`spec:AST-112/FR12`). Icon names follow `spec:AST-082/FR17`.

## Why this exists

| Piece                                  | What the ecosystem offers                                                                                                                                                                                                                   | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxVectorView`, `AstryxVectorInfo` | react-native-svg is mature and complete: the SVG element set, text, filters, touch handling, and animation with react-native-reanimated.                                                                                                    | Astryx draws a small, closed set (paths, paints, groups) that three renderers (iOS, Android, Astryx Stage) must read identically against one set of conformance cases. A scene is data in one prop on one native view, versioned and additive, with stroke rules a chart needs, a Large Content Viewer image, and no third-party native dependency in the package (`spec:AST-112/FR2`).                    |
| `AstryxIconView`, `AstryxIcons`        | React Native's `Image` tints a mask and caches decoded images. expo-image adds disk and memory caches, prefetch, tint, and transitions. react-native-vector-icons and @expo/vector-icons draw icon fonts as text, synchronously and tinted. | `Image` and expo-image load each source asynchronously, so a menu can appear with empty icon slots that fill in separately. An icon font fixes the stroke weight and the glyph set at build time. Astryx needs a theme's registered image masks set in the view's first frame, one shared fetch per mask, a prefetch that resolves a result, and no request a previewed project can route through the app. |
| `AstryxSymbolView`                     | expo-symbols draws SF Symbols with weights, scales, rendering modes, and symbol effects.                                                                                                                                                    | The functional gap is small. expo-symbols needs the Expo modules runtime, which no package of the set requires (`spec:AST-112/FR11`); Astryx also needs its icon-name mapping, the Bold Text weight step, Reduce Motion, and a matching implementation in Astryx Stage.                                                                                                                                    |

## Who uses it

| Native piece       | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                               | What a person sees                                                                                                                                                     |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxVectorView` | native component (Fabric Native Component) | `Icon` for every built-in glyph, and so every component that renders an Icon (`Button`, `IconButton`, `Badge`, `Banner`, `TabBar`, `TabList`, `BarButton`, `DropdownMenu`, `Item`, `SearchField`, `Table`, …); `Vector`, and through it `AreaChart`, `BarChart`, `LineChart`, `DonutChart`, and `Sparkline` | Built-in icons; a chart's lines, areas, bars, and arcs; at an accessibility text size, the enlarged glyph of a fixed-size bar control in the iOS Large Content Viewer. |
| `AstryxVectorInfo` | native module (Turbo Native Module)        | `Vector`, and through it the five charts                                                                                                                                                                                                                                                                    | Nothing directly: a chart draws its clips and masks where the binary reads them.                                                                                       |
| `AstryxIconView`   | native component (Fabric Native Component) | `Icon` for an icon an app or theme registers as an image, and so every component that renders such an Icon                                                                                                                                                                                                  | A theme's or app's image icon, tinted, in the same frame as its row.                                                                                                   |
| `AstryxIcons`      | native module (Turbo Native Module)        | `AstryxProvider`, and so `AstryxAppRoot`: it prefetches the active theme's registered image icons                                                                                                                                                                                                           | Nothing directly: a menu's image icons appear together with their rows.                                                                                                |
| `AstryxSymbolView` | native component (Fabric Native Component) | `Icon` when the icon source is `platform` (the `iconSource` preference of `AstryxCapabilitiesProvider`, or a theme that asks for platform icons); `PlatformSymbol`                                                                                                                                          | SF Symbols in place of the drawn glyphs on iOS, with symbol effects where an app asks for them.                                                                        |

## Non-goals

- The `Icon`, `Vector`, and chart component contracts. Their own records and
  `spec:AST-082/FR3` own them; this record owns the native pieces they draw with
  and the behavior those pieces guarantee.
- Icon set integrations and theme icon variants (`spec:AST-084`,
  `spec:AST-087`): which names exist and which artwork a theme selects. This
  record draws a resolved glyph, image, or symbol.
- Text, filters, shadows, raster images, path animation, and hit testing in a
  vector scene. Text lies over a drawing; touches go to the view under it.
- Android system symbols. No piece draws Material Symbols (OQ1).
- The system menu's own symbol images, which the menu host draws from the same
  name table (the Menus and presentation record owns the host).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI
  job/workflow topology belong in architecture or implementation unless callers
  or interoperating systems intentionally depend on that exact mechanism as a
  public protocol. The vector scene format is such a protocol: three renderers
  and the library's writer depend on it (FR6).

## Requirements

### Native contract

| Contract           | Kind                                       | Props                                                                                                     | Commands | Events          | Platforms    |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------- | --------------- | ------------ |
| `AstryxIconView`   | native component (Fabric Native Component) | `uri`, `scale`, `tintColor`, `mirrored`                                                                   | none     | none            | iOS, Android |
| `AstryxSymbolView` | native component (Fabric Native Component) | `systemName`, `pointSize`, `weight`, `symbolColor`, `mirrored`, `effect`, `effectTrigger`, `effectRepeat` | none     | none            | iOS          |
| `AstryxVectorView` | native component (Fabric Native Component) | `scene`, `isLargeContentImage`                                                                            | none     | `onVectorError` | iOS, Android |

| Contract           | Kind                                | Methods                                                | Platforms    |
| ------------------ | ----------------------------------- | ------------------------------------------------------ | ------------ |
| `AstryxIcons`      | native module (Turbo Native Module) | `getConstants`, `isSupported`, `prefetch`, `cacheInfo` | iOS, Android |
| `AstryxVectorInfo` | native module (Turbo Native Module) | `getConstants`                                         | iOS, Android |

All five contracts belong to the platform's core: every binary links them, and
no app opts them in (`spec:AST-112/FR3`).

### Icons

- **FR1 — `NativeIconView` draws an image mask in its first frame.** The `.`
  entry exports `NativeIconView` with `uri` and `scale` (a resolved asset:
  `Image.resolveAssetSource(source)`), `tint`, `mirrored` (default false),
  `style`, the view accessibility props, and a ref to the rendered view, and the
  probe `isNativeIconViewAvailable()`.
  - The view paints `tint` wherever the mask is opaque and scales the mask to
    fit inside its frame without distortion.
  - A mask in the process-wide cache, in the app bundle, on disk, or in a
    `data:` URI is decoded and set on the UI thread while the props apply,
    before the first frame. The view fetches an `http(s)` mask off the UI
    thread, stores it, and shows it on arrival. Views that ask for the same URI
    at the same time cause one download.
  - The cache keys a mask by URI and scale. It is bounded by the device's
    memory, not by a count: the system evicts the least recently used masks
    under its limit, and an evicted mask loads again on its next use.
  - Where the view is absent (Jest, a binary without it), `NativeIconView` falls
    back to React Native's `Image` with the same mask, fit, tint, and mirroring
    and no fade-in. The icon then appears when that asynchronous load completes.
- **FR2 — A previewed project never fetches through an icon.** In a project that
  runs inside the Astryx app's preview host, `AstryxIconView` draws a bundled
  mask, a `data:` URI, and a file the project may read, and nothing else.
  `NativeIconView` gives a remote mask to the native view only when it knows the
  runtime belongs to the app. In any other runtime it uses `Image`, so the
  project's own image loading and network rules apply. A project never receives
  a mask that the app's runtime cached.
- **FR3 — `AstryxIcons.prefetch` warms the cache and resolves a result.**
  `AstryxIcons` has the capability shape (`spec:AST-112/FR7`) and
  `prefetch({uris, scale})`.
  - It loads every remote mask the cache lacks. It skips local masks, which the
    view decodes itself, so startup puts no decoding on the UI thread. It also
    skips masks that are cached or loading.
  - It resolves `{ok: true, loaded, failed}` after every requested load ends.
    `loaded` is the number of new masks in the cache; `failed` is the number of
    masks that could not load when at least one other mask did. It never
    rejects. Its reasons are `no-module`, `unsupported` (a binary without
    `prefetch`), `unavailable` (`isSupported()` answers false), `fetch-failed`
    (no missing mask loaded), `not-allowed` (a previewed project's runtime), and
    `error`. An empty list resolves `ok` with zero counts and calls nothing.
  - `isAvailable()` is true only where the module has `prefetch` and
    `isSupported()` does not answer false.
  - `AstryxProvider` prefetches the active theme's registered image icons each
    time the set changes, where the icon view and the module are present and the
    platform is on. A nested provider prefetches its own set, and the cache
    downloads only the masks it lacks.
  - The native `cacheInfo()` answers how many masks the cache holds. The
    `AstryxIcons` object does not expose it (OQ3).
- **FR4 — `SymbolView` draws an SF Symbol (iOS).** The `.` entry exports
  `SymbolView` with `symbolName`, `size`, `color`, `weight` (`ultraLight`
  through `black`, default `regular`), `mirrored`, `effect`, `fallback`, and
  `onError`, and the probe `isSymbolViewAvailable()`, which is false off iOS.
  - The view draws the symbol monochrome in `color`, with a margin of 1/12 of
    the view's side on each edge and aspect fit. The symbol's point size equals
    the view's side, so its line weight matches text of that size.
  - `effect` is `{kind, trigger?, repeat?}`. Kinds: `bounce`, `pulse`,
    `variableColor`, `scale` (iOS 17), `wiggle`, `rotate`, `breathe` (iOS 18),
    `drawOn`, `drawOff` (iOS 26). A one-shot effect runs on every change of
    `trigger`, and not for the value the view mounts with. With `repeat`, the
    effect runs again and again until the view unmounts or the prop changes. On
    an iOS version without the effect, the view shows the symbol with no effect.
    UIKit runs every effect on the UI thread, with no JavaScript per frame.
  - For a name that UIKit does not know, the view stays empty and writes one log
    line.
  - Where the view is absent (Android, Jest, any binary without it),
    `SymbolView` renders `fallback` (nothing by default) and reports
    `onError({reason: 'no-native-view'})` once per mount.
- **FR5 — The library maps Astryx icon names and settings onto the views.**
  `Icon` resolves a name in this order (`spec:AST-112/FR9`):
  - A built-in name with an SF Symbol in the library's name table, under the
    `platform` icon source on iOS with the symbol view present and an iOS at or
    above that symbol's minimum, draws `SymbolView`. The table gives each
    built-in name an SF Symbol with its minimum iOS, and a Material Symbols
    name, or no entry when the system has no close match; a name without one
    keeps the drawn glyph. `PlatformSymbol` draws a name the same way and
    renders its `fallback` wherever no symbol draws it.
  - Otherwise a built-in glyph draws as a vector scene (FR6), one scene per
    glyph, color, and weight (`thin` through `bold`, the prop, then the theme's
    default, then `regular`), at the icon size.
  - Otherwise an image an app or theme registers draws through `NativeIconView`
    (FR1).
  - The library decides mirroring: chevrons, double chevrons, `externalLink`,
    `reply`, `undo`, and `arrowRight` mirror in a right-to-left layout; vertical
    arrows, `check`, `close`, and media playback glyphs do not. Each view flips
    the drawing horizontally when told.
  - When Bold Text is on, the library sends the next heavier symbol weight. When
    Reduce Motion is on, the library sends no `effect` to the view.
  - Colors come from the theme for the current color scheme. A scene carries
    concrete colors, so a scheme change draws a new scene. A color with no
    concrete value, such as a `PlatformColor`, draws no glyph, and a development
    warning names it.

### Drawing

- **FR6 — One vector scene format, read the same everywhere.** A `VectorScene`
  is data the platform owns and the library writes: `version`, `viewBox`
  (`[x, y, width, height]` or null for the view's own points), `fit` (`meet`,
  `slice`, `none`), `alignX` and `alignY` (as SVG's `preserveAspectRatio`), and
  `shapes`, back to front.
  - A shape has a `path` (a flat list of numbers that encodes move, line, cubic,
    quadratic, and close commands in absolute coordinates), `fill` and `stroke`
    (`#RRGGBBAA`, or a linear or radial gradient in box or user units),
    `fillRule`, `strokeWidth`, caps, joins, miter limit, dashes, `opacity`,
    `transform`, and `nonScalingStroke`. A group (`version: 2`) composites its
    `children` as one layer, with an optional clip path, an alpha or luminance
    mask, a group `opacity`, and a `transform`.
  - Only the viewBox mapping changes a stroke's width. A `transform` on a shape
    or group changes positions, not stroke widths, so a chart's data scaling
    does not thicken its lines. A shape with `opacity` below 1 fades its fill
    and stroke together, so the fill does not show through the stroke.
  - Any input is safe: a renderer does not crash on it. A renderer ignores a
    node whose type it does not know or whose required numbers are not finite
    numbers. An optional number that is not finite falls back to its default. A
    scene it cannot read draws nothing and is reported once per scene:
    `unreadable`, `unsupported-version`, or `too-deep` (JSON nested deeper than
    100 levels; this limit protects each reader's stack and is lower than any
    reader's parser limit).
  - The format grows only by new optional fields whose defaults leave every
    existing scene unchanged. A rule that would change how an existing scene
    looks gets a new `version` number.
  - One set of shared conformance cases fixes what every reader (iOS, Android,
    Astryx Stage, and the JavaScript reference reader) draws and reports.
- **FR7 — `NativeVectorView` draws one scene on one native view.** The `.` entry
  exports `NativeVectorView` with `scene`, `isLargeContentImage`, `fallback`,
  `onError`, the view props, and a ref, the scene types, and the probe
  `isNativeVectorViewAvailable()`.
  - `NativeVectorView` turns a scene object into JSON one time; passing the same
    object again sends nothing new. The native view reads it on the UI thread
    when the prop changes, builds its paths once, and draws them in the system's
    draw pass (CoreGraphics on iOS, Canvas on Android). Drawing runs no
    JavaScript.
  - Touches pass through the view (`pointerEvents` defaults to `none`). Without
    an `accessibilityLabel`, screen readers skip it; with one, they read it as a
    single image. Accessibility props that the caller sets override these
    defaults.
  - `onError` delivers one `AstryxFailure`: `unreadable`, `unsupported-version`,
    or `too-deep` from the native side, `error` for a reason the JavaScript does
    not know, and `no-native-view` once per mount where the view is absent.
  - Where the view is absent, it renders `fallback`. The default fallback is an
    empty React Native view that takes the same style, accessibility props, and
    ref, so surrounding layout does not move.
  - `Icon` treats an absent vector view as a broken install: the glyph draws
    nothing, and a development warning names the view. `Vector` draws nothing
    and keeps its size.
- **FR8 — `AstryxVectorInfo` reports the scene versions a binary reads.**
  `AstryxVectorInfo` has the capability shape and no methods. `version()`
  answers the highest scene version the binary's vector view reads, 2 for this
  contract set, and null when the module is missing. A binary that lacks the
  module also lacks the vector view.
  - `Vector` writes version 2 only when a drawing uses a group, and version 1
    otherwise. It reads the report once per mount. If the view exists but the
    report has no usable number, `Vector` writes version 1 and warns once in
    development that the two disagree.
- **FR9 — The glyph is the Large Content Viewer image (iOS).** When
  `isLargeContentImage` is true, the vector view renders its scene into a
  template image. It gives that image, with `scalesLargeContentImage`, to the
  closest enclosing React Native view in its surface that has
  `accessibilityShowsLargeContentViewer`. The system viewer applies its own
  tint.
  - A new scene replaces the image, for example when a play button becomes a
    pause button. The image is flipped when the view is mirrored and rendered
    again when the display scale changes. When the view leaves the window, is
    recycled, or the prop becomes false, the view removes the image, unless
    another glyph has replaced it on that control.
  - The search for that enclosing view never leaves the view's own surface and
    changes only React Native views, so a previewed project cannot change the
    app's own bars.
  - The library marks at most one glyph per control. For an icon drawn as a
    symbol or a registered image, the viewer shows only the control's title.
  - Android has no Large Content Viewer and ignores the prop.

### Behaviour across binaries

- **FR10 — Every contract in the group is at revision 1 on every platform it
  lists.** The iOS and Android binaries report revision 1 for each contract,
  `isLargeContentImage` included. A behavior added after revision 1 is a named
  feature (`<Contract>.<feature>`) that the binary lists and the JavaScript
  checks with `hasContractFeature` before it uses it. Without the feature the
  JavaScript keeps the revision-1 behavior or answers `unsupported`, and a
  warning names the missing feature; it never takes a silent weaker path. A
  scene version after 2 is such a named feature (OQ2).
- **FR11 — Astryx Stage pairs through the version floor.** The package names the
  oldest Astryx Stage that implements its contract set. An older Stage refuses
  the project and lists the gaps.
- **FR12 — Absence never throws.** Every probe answers false, every call
  resolves a result (`spec:AST-112/FR6`), and every absent view reports
  `no-native-view` and draws its fallback (`spec:AST-112/FR7`). The
  `isPlatformEnabled={false}` switch sends `SymbolView`, `NativeIconView`, and
  `Vector` to their fallbacks; `Icon` still draws its built-in glyphs, because
  the vector view is core.
- **FR13 — Native code uses public platform API only.** The views and modules
  use the public APIs of UIKit, Core Graphics, Foundation, the Android SDK, and
  React Native. This group needs no exception.

### Platform support

| Contract           | iOS                                                                                           | Android                                                                      | Astryx Stage                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AstryxIconView`   | `UIImageView` with template rendering; `NSCache` keyed by URI and scale; `NSURLSession` fetch | `AppCompatImageView` tinted `SRC_IN`; `LruCache` sized from the app's memory | Local masks tinted, fitted, and mirrored; a previewed project's remote mask draws nothing                                |
| `AstryxIcons`      | Shared fetches; resolves counts                                                               | Shared fetches; resolves counts                                              | Counts and `not-allowed` as on device                                                                                    |
| `AstryxSymbolView` | `UIImageView` with `UIImage.SymbolConfiguration` and `addSymbolEffect`                        | Absent: `fallback`                                                           | macOS: the system symbol catalog; Linux: the library glyph with an approximated stroke; effects shown in their end state |
| `AstryxVectorView` | CoreGraphics in a drawing view; `largeContentImage`                                           | `Canvas`, `Path`, and shaders; the Large Content Viewer prop ignored         | Skia; the Large Content Viewer image reported in the accessibility dump (no system viewer)                               |
| `AstryxVectorInfo` | Reports 2                                                                                     | Reports 2                                                                    | Reports 2                                                                                                                |

- FR1 gap: in Astryx Stage, an app runtime's remote (`http(s)`) mask draws
  nothing, and `prefetch` counts it without fetching it.
- FR4 gap: Astryx Stage shows each symbol effect in its end state and does not
  animate it, and off macOS it draws the library glyph in place of the SF
  Symbol.
- Supported feature/engine floor: `spec:AST-112` Platform support (iOS at React
  Native's minimum, Android API level 24, New Architecture only); symbol effects
  need iOS 17, 18, or 26 by kind (FR4); the Astryx Stage version floor (FR11).
- Unsupported behavior: an absent view draws its fallback and reports
  `no-native-view`; an absent module answers `no-module`; a binary without a
  named feature answers `unsupported` or keeps the revision-1 behavior with a
  warning (FR10, FR12).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112/FR1` (system symbols in the core, here with the icon,
  vector, and cache pieces), FR6 and FR7 for these contracts, FR8 for their
  evolution, FR9 for the icon-name mapping, and FR12 for their Stage behavior.
- `spec:AST-112/FR8` counts a behavior revision per module and a version history
  per component. For this group's contracts, FR10 replaces that count with
  revision 1 plus named features.
- The group's contracts are core in `spec:AST-112/FR1` and stay core; the
  capability model changes nothing here.
- `spec:AST-082/FR17` is unchanged. OQ1 asks how the drawn-glyph default meets
  its platform-symbol default.

## Verification

| Contract | Verification                                                                                                                         | Representative states                                                                                               | Mutation or failure expectation                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Unit tests through the `./testing` doubles; Simulator and emulator frame captures; Astryx Stage contract suite                       | cached, bundled, `data:`, and remote masks; a scale change; the view absent                                         | A cached or bundled mask missing from the first frame, a second fetch for one URI, or no `Image` fallback where the view is absent         |
| FR2      | Astryx Stage contract suite in a previewed project; device check in the Astryx app's preview                                         | a remote mask; an app file; a project file                                                                          | A request leaves through an icon, or a project draws an app file or an app-cached mask                                                     |
| FR3      | Unit tests through `mockIcons()` in its absent, older, and current shapes                                                            | no module; no `prefetch`; `isSupported` false; all, some, and no masks loaded; a previewed project; an empty list   | A rejection, a reason outside the set, or a call for an empty list                                                                         |
| FR4      | iOS Simulator frame captures per iOS major; Astryx Stage contract suite; unit tests of the absent view                               | each weight; mirrored; each effect kind; a trigger change; a trigger at mount; repeat; an unknown name; Android     | An effect that plays at mount, plays on an iOS without it, or runs JavaScript per frame; no `no-native-view` report where absent           |
| FR5      | Library unit tests of the name table, the icon source, mirroring, Bold Text, and Reduce Motion                                       | `platform` and default icon sources; a symbol above the running iOS; RTL; Bold Text; Reduce Motion; a scheme change | A symbol drawn under the default source, a mirrored vertical arrow, an effect under Reduce Motion, or a stale color after a scheme change  |
| FR6      | The shared conformance cases run by each reader; unit tests of the writer                                                            | each shape and paint; version 2 groups; unknown nodes; non-finite numbers; a bad viewBox; deep JSON                 | A reader that crashes, draws a skipped node, or reports a reason other than the case's                                                     |
| FR7      | Unit tests through `installPlainVectorViewForTesting`; UI-thread frame checks (no JavaScript per frame); Astryx Stage contract suite | a new scene object; the same object again; a label; no label; the view absent                                       | A second serialization of one object, a touch taken, a decorative drawing exposed to screen readers, or a fallback that changes the layout |
| FR8      | Unit tests through `mockVectorInfo()`                                                                                                | no module; version 2; a view without a report                                                                       | A version 2 scene sent to a binary that does not read it, or a silent blank drawing                                                        |
| FR9      | iOS Simulator accessibility checks at an accessibility text size; Astryx Stage accessibility dump                                    | a marked glyph; a glyph change; RTL; unmount; two marked glyphs; a previewed project                                | No image in the viewer, a stale image after a glyph change, an image left after unmount, or a write outside the surface                    |
| FR10     | The platform's spec rules check; unit tests of `hasContractFeature` with and without a feature                                       | a binary that lists a feature; one that does not                                                                    | A contract above revision 1, or a feature used without its check                                                                           |
| FR11     | Astryx Stage refusal test against the version floor                                                                                  | a Stage below the floor                                                                                             | A project that runs on a Stage below the floor                                                                                             |
| FR12     | Unit tests of every probe, call, and view in the absent shape; `isPlatformEnabled={false}` library tests                             | Jest with no natives; the platform off                                                                              | A throw, a rejection, or an `Icon` glyph missing with the platform off                                                                     |
| FR13     | Review of the native sources' imports and calls                                                                                      | each view and module on iOS and Android                                                                             | A call to an API outside the platform's public SDKs                                                                                        |

## Decision log

### DEC-1 — Built-in icons are drawn vector glyphs; platform symbols are opt-in

**Reference:** `spec:AST-127/DEC-1` **Decider:** imdreamrunner, 2026-11-17

A built-in glyph draws from path data on the platform's vector view, so it has
the same shape on iOS, on Android, and in Astryx Stage, follows the theme's
stroke weight, and covers every built-in name. SF Symbols draw where an app or
theme asks for the `platform` icon source, for apps that prefer the system look
on iOS.

Rejected: an icon font, because a font fixes the stroke weight and the glyph set
at build time.

### DEC-2 — One data-only scene format on one native view

**Reference:** `spec:AST-127/DEC-2` **Decider:** imdreamrunner, 2026-11-17

A drawing is one versioned scene in one prop, read by every renderer against
shared conformance cases, so Astryx Stage draws what the device draws, an older
binary reports what it cannot read, and drawing costs no JavaScript.

Rejected: a tree of native elements per drawing, because each element is a
native view with its own props to keep in step across three renderers.

### DEC-3 — Image icons draw from a process cache in their first frame

**Reference:** `spec:AST-127/DEC-3` **Decider:** imdreamrunner, 2026-11-17

A menu or list shows its icons with its rows, not one by one. The icon view sets
a cached or local mask while its props apply, and the provider prefetches a
theme's remote masks. A previewed project never fetches through the app.

Rejected: React Native's `Image` for every icon, because it loads each source
asynchronously.

### DEC-4 — The library decides; the views draw

**Reference:** `spec:AST-127/DEC-4` **Decider:** imdreamrunner, 2026-11-17

Which icons mirror, the Bold Text weight step, and dropping effects under Reduce
Motion are Astryx's rules, so the library applies them and the views take plain
flags. The views stay small and the same in every renderer.

### DEC-5 — The glyph's own vector view supplies the Large Content Viewer image

**Reference:** `spec:AST-127/DEC-5` **Decider:** imdreamrunner, 2026-11-17

React Native's views have no prop for a large-content image. The vector view
already holds the glyph's paths, so it renders them a second time for the
viewer. When the glyph changes, the image changes too, and JavaScript never
handles image data.

Rejected: an image or icon-name prop on the press, because a second native view
would render the glyph again and the two could differ.

## Open questions

- **OQ1 — How does the drawn-glyph default meet `spec:AST-082/FR17`, which
  defaults native icons to platform symbols?** (`human-design`) Options: keep
  drawn glyphs as the default and amend FR17 for this platform; or default to SF
  Symbols on iOS and Material Symbols on Android, which needs an Android symbol
  view and a faithful system glyph for every built-in name.
- **OQ2 — Does `AstryxVectorInfo` fold into the platform info's named
  features?** (`human-api`) Options: keep `AstryxVectorInfo` and its reported
  scene version; or list each scene version after 1 as a named feature of
  `AstryxVectorView` in the platform info's list and retire `AstryxVectorInfo`.
- **OQ3 — Is `cacheInfo` part of the `AstryxIcons` API?** (`checkable`) Options:
  expose it on `AstryxIcons` for an app's status page; or keep it a native
  diagnostic that only tests read.
