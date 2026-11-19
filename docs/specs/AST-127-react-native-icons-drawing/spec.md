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
drawings on every screen: a chevron in a list row, a close mark in a sheet, a
theme's own image icons in a menu, a chart's lines and bars. A developer writes
`<Icon icon="close" />` or `<LineChart … />` and gets a sharp, tinted drawing at
the right size in the view's first frame. On iOS a built-in icon name shows its
SF Symbol by default. An icon the app or theme defines replaces it, and a drawn
glyph stands in where no system symbol exists, which on Android is every
built-in name (OQ1). Icons mirror in right-to-left layouts, are named or hidden
for screen readers, and enlarge in the iOS Large Content Viewer where a
fixed-size control needs it. The package installs no icon font, SVG library, or
image library; an app may still use such libraries beside these components
(`spec:AST-140/FR9`).

This record details the icon and drawing pieces of the platform layer of
`spec:AST-112`: the always-present core (`spec:AST-112/FR1`), the capability
shape (`spec:AST-112/FR7`), and the mapping of Astryx icon names onto system
symbols (`spec:AST-112/FR9`). It follows the shared platform rules of
`spec:AST-140`: the missing piece (FR2), the result vocabulary (FR3), additive
evolution (FR5), threading (FR6), conformance suites (FR7), and coexistence with
other libraries (FR9). Icon names and theme icons follow `spec:AST-082/FR17`,
apart from the departures listed under Current-state impact.

## Why this exists

- **`AstryxSymbolView`.** Icons default to system symbols, so the core needs an
  SF Symbols view that takes Astryx's name mapping, Bold Text, and Reduce Motion
  into account, inside Astryx's own native code (`spec:AST-112/FR2`).
- **`AstryxVectorView` and `AstryxVectorInfo`.** Drawn glyphs and charts need
  one small scene format that iOS and Android draw the same way, on one native
  view per drawing, growing by named features.
- **`AstryxIconView` and `AstryxIcons`.** React Native's `Image` loads every
  source asynchronously, so a menu can open with empty icon slots. A theme's or
  app's image icons need to appear in the view's first frame, and their prefetch
  needs to resolve a result.

## Who uses it

| Native piece       | Kind                                       | Astryx components that use it                                                                                                                                                                                                                                                                                                        | What a person sees                                                                                                                                                 |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxSymbolView` | native component (Fabric Native Component) | `Icon` on iOS for every built-in name with an SF Symbol under the default icon source, and for a theme's `systemName` entries, and so every component that renders an Icon; `PlatformSymbol`                                                                                                                                         | SF Symbols in buttons, rows, tabs, and bars on iOS, with symbol effects where an app asks for them.                                                                |
| `AstryxVectorView` | native component (Fabric Native Component) | `Icon` for a name no system symbol or defined icon draws, and so every component that renders an Icon (`Button`, `IconButton`, `Badge`, `Banner`, `TabBar`, `TabList`, `BarButton`, `DropdownMenu`, `Item`, `SearchField`, `Table`, …); `Vector`, and through it `AreaChart`, `BarChart`, `LineChart`, `DonutChart`, and `Sparkline` | Drawn icons where no system symbol exists; a chart's lines, areas, bars, and arcs; the enlarged glyph of a fixed-size bar control in the iOS Large Content Viewer. |
| `AstryxVectorInfo` | native module (Turbo Native Module)        | `Vector`, and through it the five charts                                                                                                                                                                                                                                                                                             | Nothing directly: a chart draws its clips and masks where the binary reads them.                                                                                   |
| `AstryxIconView`   | native component (Fabric Native Component) | `Icon` for an icon the app registers as an image or a theme names with `assetName`, and so every component that renders such an Icon                                                                                                                                                                                                 | A theme's or app's image icon, tinted, in the same frame as its row.                                                                                               |
| `AstryxIcons`      | native module (Turbo Native Module)        | `AstryxProvider`, and so `AstryxAppRoot`: it prefetches the active theme's image icons                                                                                                                                                                                                                                               | Nothing directly: a menu's image icons appear together with their rows.                                                                                            |

## Non-goals

- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI
  job/workflow topology belong in architecture or implementation unless callers
  or interoperating systems intentionally depend on that exact mechanism as a
  public protocol. The vector scene format is such a protocol: every renderer
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

All five contracts belong to the platform's core: every binary has them.

### Icons

- **FR1 — The icon view shows an image mask in its first frame.** `Icon` draws
  an image icon through `AstryxIconView`, an internal native view behind the
  component (`spec:AST-112/FR5`). The view takes `uri` and
  `scale` (a resolved asset: `Image.resolveAssetSource(source)`), `tintColor`,
  and `mirrored` (default false).
  - The view paints `tintColor` wherever the mask is opaque and scales the mask to
    fit inside its frame without distortion.
  - A mask from the app bundle, from disk, from a `data:` URI, or one already
    shown in this process appears in the view's first frame. A remote
    (`http(s)`) mask appears when its download ends, while the UI thread keeps
    running. Views that ask for the same URI at the same time cause one
    download, and a mask stays available to later views at the same URI and
    scale until the system reclaims memory.
  - Where the view is absent (Jest, a binary without it), `Icon` falls back to
    React Native's `Image` with the same mask, fit, tint, and mirroring, shown
    directly. The icon then appears when that asynchronous load completes.
- **FR2 — `AstryxIcons.prefetch` warms the masks and resolves a result.**
  `AstryxIcons` has the capability shape (`spec:AST-112/FR7`) and
  `prefetch({uris, scale})`.
  - It downloads every remote mask that is not already available. It skips local
    masks, which the view reads itself, so startup puts no decoding on the UI
    thread.
  - It resolves `{ok: true, loaded, failed}` after every requested download
    ends. `loaded` is the number of masks it made available; `failed` is the
    number that could not load when at least one other mask did. It always
    resolves. Its reasons are `no-module`, `unsupported` (a binary without
    `prefetch`), `unavailable` (`isSupported()` answers false), `fetch-failed`
    (no missing mask loaded), and `error`. An empty list resolves `ok` with zero
    counts and calls nothing; a list with nothing to download resolves `ok` with
    `loaded: 0`.
  - `isAvailable()` is true where the module has `prefetch` and `isSupported()`
    allows it.
  - `AstryxProvider` prefetches the active theme's image icons each time that
    set changes, where the icon view and the module are present and the platform
    is on.
  - The native `cacheInfo()` answers how many masks are available, for tests
    (OQ3).
- **FR3 — The symbol view shows an SF Symbol (iOS).** `Icon` draws a system
  symbol through `AstryxSymbolView`, an internal native view behind the
  component (`spec:AST-112/FR5`). The view takes
  `systemName`, `pointSize`, `symbolColor`, `weight` (`ultraLight` through
  `black`, default `regular`), `mirrored`, and the effect props `effect`,
  `effectTrigger`, and `effectRepeat`.
  - The view draws the symbol in one color, `symbolColor`, with a margin of 1/12 of
    the view's side on each edge and aspect fit. The symbol's point size equals
    the view's side, so its line weight matches text of that size.
  - `effect` names the kind: `bounce`, `pulse`,
    `variableColor`, `scale` (iOS 17), `wiggle`, `rotate`, `breathe` (iOS 18),
    `drawOn`, `drawOff` (iOS 26). A one-shot effect runs on each change of
    `effectTrigger` after the view mounts. With `effectRepeat`, the effect runs
    again and again until the view unmounts or the prop changes. On an iOS version that
    predates the effect, the view shows the still symbol. Effects run on the UI
    thread, independent of JavaScript.
  - For a name the system does not know, the view stays empty and writes one log
    line.
  - Where the view is absent (Android, Jest, any binary without it), `Icon`
    takes the next step of FR4.
- **FR4 — `Icon` resolves a name to a defined icon, then a system symbol, then a
  drawn glyph.** The built-in names are core's (`spec:AST-082/FR17`); any other
  name is namespaced (`<library>:<name>`). In this order:
  - A theme entry that names a shipped image (`assetName`) shows that image
    through the icon view (FR1); one that names a platform symbol (`systemName`)
    shows it through the symbol view (FR3) on iOS.
  - An image the app registers for the name shows through the icon view.
  - Under the `platform` icon source, a built-in name shows its system symbol:
    on iOS, the SF Symbol that `@astryxdesign/native`'s `NATIVE_ICON_DEFAULTS`
    gives it (`spec:AST-082/FR17`), where the symbol view is present and the
    running iOS meets that symbol's minimum.
  - Otherwise the shared drawn glyph for the built-in name draws as a vector
    scene, at one stroke weight, `regular` (OQ1).
  - An unknown name, built-in or namespaced, stops a development build with a
    message that names it and draws nothing in a release build
    (`spec:AST-082/FR3`); so does a theme entry that names an image the app does
    not ship.
  - The icon source is `platform` or `theme`. The `iconSource` preference of
    `AstryxCapabilitiesProvider`, a value or a function of the theme's name,
    decides; without it, the source is `platform`. Under `theme`, built-in names
    skip system symbols.
- **FR5 — The library applies Astryx's display rules before the views draw.**
  - Right-to-left: `chevronLeft`, `chevronRight`, `chevronsLeft`,
    `chevronsRight`, and `externalLink` mirror; `chevronDown`, `arrowUp`,
    `arrowDown`, `arrowsUpDown`, `upload`, `check`, and `close` keep their
    direction. The
    library sends `mirrored`, and each view flips its drawing horizontally.
  - When Bold Text is on, the library sends the next heavier symbol weight. When
    Reduce Motion is on, the library shows the still symbol.
  - Colors come from the theme for the current color scheme. A scene carries
    concrete colors, so a scheme change draws a new scene. A color with no
    concrete value, such as a `PlatformColor`, leaves the glyph empty, and a
    development warning names it.
  - A labeled icon is one image with that label for screen readers; an unlabeled
    icon is hidden from them (`spec:AST-082/FR17`).

### Drawing

- **FR6 — One vector scene format, read the same everywhere.** A vector scene
  is data the platform owns and the library writes, internal to `Icon` and
  `Vector`: `viewBox` (`[x, y, width, height]` or null for the view's own
  points), `fit` (`meet`, `slice`, `none`), `alignX` and `alignY` (0, 0.5, or
  1, as SVG's `preserveAspectRatio`), and `shapes`, back to front.
  - A shape's `path` is a flat list of numbers in absolute coordinates: `0 x y`
    moves, `1 x y` draws a line, `2 x1 y1 x2 y2 x y` a cubic curve,
    `3 x1 y1 x y` a quadratic curve, and `4` closes the subpath.
  - A shape also has `fill` and `stroke` (`#RRGGBBAA`, or a linear or radial
    gradient whose coordinates are fractions of the shape's bounding box by
    default or user-space values), `fillRule`, `strokeWidth`, caps, joins, miter
    limit, dashes, `opacity`, `transform` (six numbers `[a, b, c, d, e, f]` of
    an affine matrix), and `nonScalingStroke`.
  - A group (the `groups` feature) composites its `children` as one layer, with an
    optional clip path, an alpha or luminance mask, a group `opacity`, and a
    `transform`.
  - Only the viewBox mapping changes a stroke's width. A `transform` on a shape
    or group changes positions, not stroke widths, so a chart's data scaling
    does not thicken its lines. A shape with `opacity` below 1 fades its fill
    and stroke together, so the fill does not show through the stroke.
  - Any input is safe: a renderer reads every scene to the end. A renderer skips
    a node whose type it does not know or whose required numbers are not finite.
    An optional number that is not finite falls back to its default. A scene it
    cannot read draws nothing and is reported once per scene: `unreadable`,
    `unsupported` (a named feature the binary lacks), or `too-deep` (JSON nested deeper than 100 levels;
    this limit protects each reader's stack and is lower than any reader's
    parser limit).
  - The format grows by named features (`spec:AST-140/FR5`): each new field is
    optional, and its default draws every existing scene as before.
  - One set of shared conformance cases fixes what every reader (iOS, Android,
    and the JavaScript reference reader) draws and reports (`spec:AST-140/FR7`).
- **FR7 — The vector view draws one scene on one native view.** `Icon` and
  `Vector` draw through `AstryxVectorView`, an internal native view behind them
  (`spec:AST-112/FR5`). The view takes a scene and
  `isLargeContentImage`.
  - A new scene object sends the scene to the native view once; a re-render with
    the same object keeps the drawing as it is. Drawing happens on the UI
    thread, independent of JavaScript.
  - Touches pass through the view. Without an `accessibilityLabel`, screen
    readers skip it; with one, they read it as a single image. Accessibility
    props that the caller sets override these defaults.
  - The view's errors reach the component as one `AstryxFailure`: `unreadable`,
    `unsupported`, or `too-deep` from the native side, `error` for a reason the
    JavaScript does not know, and `no-native-view` once per mount where the
    view is absent.
  - Where the view is absent, the component renders an empty React Native view
    with the same style, accessibility props, and ref, so the surrounding layout
    stays in place.
  - `Icon` treats an absent vector view as a broken install: the glyph's space
    stays empty, and a development warning names the view. `Vector` keeps its
    size.
- **FR8 — `AstryxVectorInfo` reports the scene features a binary reads.**
  `AstryxVectorInfo` has the capability shape and no methods. It lists the
  named scene features the binary's vector view reads: `groups` in this
  contract set. The module and the vector view ship together (OQ2).
  - `Vector` writes a group when a drawing uses one and the binary lists
    `groups`. Where the view exists and the report lists nothing usable,
    `Vector` writes the scene without groups and warns once in development that
    the two disagree.
- **FR9 — A drawn glyph is the Large Content Viewer image (iOS).** When
  `isLargeContentImage` is true, the vector view renders its scene into a
  template image. It gives that image, scaled by the system, to the closest
  enclosing React Native view in its surface that has
  `accessibilityShowsLargeContentViewer`. The system viewer applies its own
  tint.
  - A new scene replaces the image, for example when a play button becomes a
    pause button. The image is flipped when the view is mirrored and rendered
    again when the display scale changes. When the view leaves the window, is
    recycled, or the prop becomes false, the view removes the image, unless
    another glyph has replaced it on that control.
  - The search for that enclosing view stays within the view's own surface and
    changes React Native views alone.
  - The library marks at most one glyph per control. For an icon shown as a
    symbol or an image, the viewer shows only the control's title; under the
    default icon source on iOS, that is every built-in name with an SF Symbol.
  - Android ignores the prop.

### Behaviour across binaries

- **FR10 — The group grows by named features.** Each contract keeps the baseline that `spec:AST-140/FR5` sets, on iOS and Android,
  `isLargeContentImage` included. The vector scene's named feature is `groups`
  (FR6, FR8).
- **FR11 — An absent piece falls back.** Every probe answers false, every call
  resolves a result (`spec:AST-140/FR3`), and every absent view reports
  `no-native-view` and draws its fallback (`spec:AST-140/FR2`). Setting the
  `isPlatformEnabled` preference of `AstryxCapabilitiesProvider` (default true)
  to false sends `Icon`'s symbols and image icons and `Vector` to their
  fallbacks, and `Vector` keeps its size. `Icon` still draws built-in names as
  drawn glyphs on `AstryxVectorView`, because the vector view is core and every
  screen keeps its icons.
- **FR12 — Native code uses public platform API only.** The views and modules
  use the public APIs of UIKit, Core Graphics, Foundation, the Android SDK, and
  React Native.

### Platform support

| Contract           | iOS                                                   | Android                                               |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| `AstryxIconView`   | Masks tinted, fitted, and mirrored                    | Masks tinted, fitted, and mirrored                    |
| `AstryxIcons`      | Shared downloads; resolves counts                     | Shared downloads; resolves counts                     |
| `AstryxSymbolView` | SF Symbols with weights and symbol effects            | `Icon` takes the next step of FR4                     |
| `AstryxVectorView` | Core Graphics drawing; the Large Content Viewer image | Canvas drawing; the Large Content Viewer prop ignored |
| `AstryxVectorInfo` | Lists `groups`                                        | Lists `groups`                                        |

- FR4 gap: against `spec:AST-082/FR17`, on Android every built-in name without
  a defined icon draws its drawn glyph.
- FR4 gap: the library reads its own SF Symbol table in place of
  `NATIVE_ICON_DEFAULTS`, and that table leaves out each symbol's minimum iOS.
- Supported feature/engine floor: `spec:AST-112` Platform support (iOS at React
  Native's minimum, Android API level 24, New Architecture only); each SF
  Symbol's minimum iOS; symbol effects by kind on iOS 17, 18, or 26 (FR3).
- Unsupported behavior: an absent view draws its fallback and reports
  `no-native-view`; an absent module answers `no-module`; a binary without a
  named feature keeps the baseline behavior, draws its fallback, or answers
  `unsupported` (`spec:AST-140/FR5`, FR11).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Relies on `spec:AST-112` FR3 (amended): the library's own native pieces link
  by default, so these five core contracts are in every binary.
- Relies on `spec:AST-140/FR5`: each contract keeps the baseline that `spec:AST-140/FR5` sets, and later behavior is a named feature the binary reports.
- Changes `spec:AST-112/FR1`: the core's list gains `AstryxIconView`,
  `AstryxIcons`, `AstryxVectorView`, and `AstryxVectorInfo` beside system
  symbols.
- Follows `spec:AST-112/FR9` and `spec:AST-082/FR17` on iOS: built-in names map
  onto SF Symbols by default, and an icon the app or theme defines replaces the
  default.
- Follows `spec:AST-112` FR5: the icon, symbol, and vector views are
  internal behind `Icon` and `Vector`.
- Departs from `spec:AST-082` FR17 and DEC-10 while OQ1 is open: on Android, a
  theme's Android symbol entry and a built-in name without a symbol draw the
  drawn glyph.

## Verification

| Contract | Verification                                                                                                                                | Representative states                                                                                                                              | Mutation or failure expectation                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests through the `./testing` doubles; Simulator and emulator frame captures                                                           | bundled, disk, `data:`, and remote masks; a mask shown before; a scale change; the view absent                                                     | A local mask missing from the first frame, two downloads for one URI, or no `Image` fallback where the view is absent                         |
| FR2      | Unit tests through `mockIcons()` in its absent, older, and current shapes                                                                   | no module; no `prefetch`; `isSupported` false; all, some, and no masks loaded; an empty list                                                       | A rejection, a reason outside the set, or a call for an empty list                                                                            |
| FR3      | iOS Simulator frame captures per iOS major; unit tests of the absent view through `Icon`                                                    | each weight; mirrored; each effect kind; a trigger change; a trigger at mount; repeat; an unknown name; Android                                    | An effect that plays at mount, plays on an iOS without it, or runs JavaScript per frame; or an empty icon where the view is absent            |
| FR4      | Library unit tests of name resolution and the icon source                                                                                   | a theme `assetName` and `systemName` entry; an app image; each icon source; a symbol above the running iOS; an unknown built-in or namespaced name | A built-in symbol drawn over an icon the app or theme defines, a symbol under `theme`, or an unknown name that draws in development           |
| FR5      | Library unit tests of mirroring, Bold Text, Reduce Motion, colors, and labels                                                               | RTL; Bold Text; Reduce Motion; a scheme change; a `PlatformColor`; a label                                                                         | A mirrored vertical arrow, an effect under Reduce Motion, a stale color after a scheme change, or an unlabeled icon exposed to screen readers |
| FR6      | The shared conformance cases run by each reader; unit tests of the writer                                                                   | each path command, paint, and transform; groups; unknown nodes; non-finite numbers; a bad viewBox; deep JSON                                       | A reader that crashes, draws an ignored node, or reports a reason other than the case's                                                       |
| FR7      | Unit tests through `installPlainVectorViewForTesting`; accessibility-hierarchy checks on the Simulator and emulator; UI-thread frame checks | a new scene object; the same object again; a label; no label; the view absent                                                                      | A resend for the same object, a touch taken, an unlabeled drawing exposed to screen readers, or a fallback that changes the layout            |
| FR8      | Unit tests through `mockVectorInfo()`                                                                                                       | no module; `groups` listed; a view without a report                                                                                                | A group sent to a binary that does not list `groups`, or a silent blank drawing                                                               |
| FR9      | iOS Simulator accessibility checks at an accessibility text size                                                                            | a marked glyph; a glyph change; RTL; unmount; two marked glyphs                                                                                    | No image in the viewer, a stale image after a glyph change, an image left after unmount, or a change outside the surface                      |
| FR10     | The platform's spec rules check                                                                                                             | each contract on iOS and Android                                                                                                                   | A contract whose baseline changes, or one with a named feature this record does not list                                                      |
| FR11     | Unit tests of every probe, call, and view in the absent shape; `isPlatformEnabled={false}` library tests                                    | Jest with no natives; the platform off                                                                                                             | A throw, a rejection, or an `Icon` that shows nothing with the platform off                                                                   |
| FR12     | Review of the native sources' imports and calls                                                                                             | each view and module on iOS and Android                                                                                                            | A call to an API outside the platform's public SDKs                                                                                           |

## Decision log

### DEC-1 — One data-only scene format on one native view

**Reference:** `spec:AST-127/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A drawing is one scene in one prop, growing by named features and read by
every renderer against shared conformance cases, so iOS and Android draw the
same picture, a binary reports what it cannot read, and drawing runs on the UI
thread alone.

### DEC-2 — Image icons appear in their first frame

**Reference:** `spec:AST-127/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A menu or list shows its icons with its rows. The icon view shows a local or
already-downloaded mask as soon as it mounts, and the provider prefetches a
theme's remote masks.

### DEC-3 — The library decides; the views draw

**Reference:** `spec:AST-127/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Which icons mirror, the Bold Text weight step, and dropping effects under Reduce
Motion are Astryx's rules, so the library applies them and the views take plain
flags. The views stay small and the same in every renderer.

### DEC-4 — The drawn glyph's own view supplies the Large Content Viewer image

**Reference:** `spec:AST-127/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

React Native's views have no prop for a large-content image. The vector view
already holds the glyph's paths, so it renders them a second time for the
viewer. When the glyph changes, the image changes too, and the image data
stays native.

## Open questions

- **OQ1 — Are drawn glyphs the default, or only the stand-in where no system
  symbol exists?** (`human-design`) This belongs with the open question of
  system versus drawn rendering across Astryx's chrome. Options:
  - **System symbols by default (this record).** Icons look native on each
    platform. Costs: a name without a faithful symbol, an older iOS, Android
    without a system icon view fall back to the drawn glyph, so one app mixes
    two icon styles; and that stand-in must be reconciled with
    `spec:AST-082/FR17`, under which a native platform has no default for a name
    it does not map.
  - **Drawn glyphs by default.** Every name has the same shape on iOS and
    Android and takes one stroke weight everywhere. Costs: departs from
    `spec:AST-082/FR17` and `spec:AST-112/FR9`, and icons do not match the
    system's own.
- **OQ2 — Do the scene's named features move into the platform info?**
  (`human-api`) Options: keep `AstryxVectorInfo` listing them; or list them as
  named features of `AstryxVectorView` in the platform info
  (`spec:AST-140/FR5`) and retire `AstryxVectorInfo`.
- **OQ3 — Is `cacheInfo` part of the `AstryxIcons` API?** (`checkable`) Options:
  expose it on `AstryxIcons` for an app's status page; or keep it a native
  diagnostic that only tests read.
