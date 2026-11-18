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
the right size in the view's first frame. By default a built-in icon name shows
the platform's system symbol, such as an SF Symbol on iOS; an icon the app or
theme defines replaces it, and a drawn glyph stands in where no system symbol
exists. Icons mirror in right-to-left layouts, are named or hidden for screen
readers, enlarge in the iOS Large Content Viewer where a fixed-size control
needs it. The package installs no icon font, SVG library, or image library; an
app may still use such libraries beside these components (`spec:AST-140/FR9`).

This record details the icon and drawing pieces of the platform layer of
`spec:AST-112`: the always-present core (`spec:AST-112/FR1`), the capability
shape (`spec:AST-112/FR7`), and the mapping of Astryx icon names onto system
symbols (`spec:AST-112/FR9`). It follows the shared platform rules of
`spec:AST-140`: the missing piece (FR2), the result vocabulary (FR3), additive
evolution (FR5), threading (FR6), conformance suites (FR7), and coexistence with
other libraries (FR9). Icon names and theme icons follow `spec:AST-082/FR17`.

## Why this exists

- **`AstryxSymbolView`.** Icons default to system symbols, so the core needs an
  SF Symbols view that takes Astryx's name mapping, Bold Text, and Reduce Motion
  into account and needs no other native package (`spec:AST-112/FR2`).
- **`AstryxVectorView` and `AstryxVectorInfo`.** Drawn glyphs and charts need
  one small, versioned scene format that iOS and Android draw the same way, on
  one native view per drawing, with no other native package.
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

- The `Icon`, `Vector`, and chart component contracts. Their own records and
  `spec:AST-082/FR3` own them; this record owns the native pieces they draw with
  and the behavior those pieces guarantee.
- Icon set integrations and theme icon variants (`spec:AST-084`,
  `spec:AST-087`): which names exist and which artwork a theme selects.
- Text, filters, shadows, raster images, path animation, and hit testing in a
  vector scene. Text lies over a drawing; touches go to the view under it.
- The system menu's own symbol images (the Menus and presentation record owns
  the menu host).
- Astryx Stage (`spec:AST-139`) and Preview in the Astryx app (`spec:AST-141`)
  are separate products; they conform to this record's contracts.
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

- **FR1 — `NativeIconView` shows an image mask in its first frame.** The `.`
  entry exports `NativeIconView` with `uri` and `scale` (a resolved asset:
  `Image.resolveAssetSource(source)`), `tint`, `mirrored` (default false),
  `style`, the view accessibility props, and a ref to the rendered view, and the
  probe `isNativeIconViewAvailable()`.
  - The view paints `tint` wherever the mask is opaque and scales the mask to
    fit inside its frame without distortion.
  - A mask from the app bundle, from disk, from a `data:` URI, or one already
    shown in this process appears in the view's first frame. A remote
    (`http(s)`) mask appears when its download ends, and the UI thread never
    waits for it. Views that ask for the same URI at the same time cause one
    download, and a mask stays available to later views at the same URI and
    scale until the system reclaims memory.
  - Where the view is absent (Jest, a binary without it), `NativeIconView` falls
    back to React Native's `Image` with the same mask, fit, tint, and mirroring
    and no fade-in. The icon then appears when that asynchronous load completes.
- **FR2 — `AstryxIcons.prefetch` warms the masks and resolves a result.**
  `AstryxIcons` has the capability shape (`spec:AST-112/FR7`) and
  `prefetch({uris, scale})`.
  - It downloads every remote mask that is not already available. It skips local
    masks, which the view reads itself, so startup puts no decoding on the UI
    thread.
  - It resolves `{ok: true, loaded, failed}` after every requested download
    ends. `loaded` is the number of masks it made available; `failed` is the
    number that could not load when at least one other mask did. It never
    rejects. Its reasons are `no-module`, `unsupported` (a binary without
    `prefetch`), `unavailable` (`isSupported()` answers false), `fetch-failed`
    (no missing mask loaded), and `error`. An empty list resolves `ok` with zero
    counts and calls nothing.
  - `isAvailable()` is true only where the module has `prefetch` and
    `isSupported()` does not answer false.
  - `AstryxProvider` prefetches the active theme's image icons each time that
    set changes, where the icon view and the module are present and the platform
    is on.
  - The native `cacheInfo()` answers how many masks are available. The
    `AstryxIcons` object does not expose it (OQ3).
- **FR3 — `SymbolView` shows an SF Symbol (iOS).** The `.` entry exports
  `SymbolView` with `symbolName`, `size`, `color`, `weight` (`ultraLight`
  through `black`, default `regular`), `mirrored`, `effect`, `fallback`, and
  `onError`, and the probe `isSymbolViewAvailable()`, which is false off iOS.
  - The view draws the symbol in one color, `color`, with a margin of 1/12 of
    the view's side on each edge and aspect fit. The symbol's point size equals
    the view's side, so its line weight matches text of that size.
  - `effect` is `{kind, trigger?, repeat?}`. Kinds: `bounce`, `pulse`,
    `variableColor`, `scale` (iOS 17), `wiggle`, `rotate`, `breathe` (iOS 18),
    `drawOn`, `drawOff` (iOS 26). A one-shot effect runs on every change of
    `trigger`, and not for the value the view mounts with. With `repeat`, the
    effect runs again and again until the view unmounts or the prop changes. On
    an iOS version without the effect, the view shows the symbol with no effect.
    Effects run on the UI thread with no JavaScript per frame.
  - For a name the system does not know, the view stays empty and writes one log
    line.
  - Where the view is absent (Android, Jest, any binary without it),
    `SymbolView` renders `fallback` (nothing by default) and reports
    `onError({reason: 'no-native-view'})` once per mount.
- **FR4 — `Icon` resolves a name to a defined icon, then a system symbol, then a
  drawn glyph.** The built-in names are core's (`spec:AST-082/FR17`); any other
  name is namespaced (`<library>:<name>`). In this order:
  - A theme entry that names a shipped image (`assetName`) shows that image
    through `NativeIconView`; one that names a platform symbol (`systemName`)
    shows it through `SymbolView` on iOS.
  - An image the app registers for the name shows through `NativeIconView`.
  - A glyph the theme defines for the name draws as a vector scene (FR6).
  - Under the `platform` icon source, a built-in name shows its system symbol:
    on iOS, the SF Symbol the library's name table gives it, where the symbol
    view is present and the running iOS meets that symbol's minimum.
  - Otherwise the shared drawn glyph for the built-in name draws as a vector
    scene, at the theme's stroke weight (OQ1).
  - An unknown built-in name stops a development build with a message that names
    it and draws nothing in a release build; so does a theme entry that names an
    image the app does not ship. A namespaced name nothing registers draws
    nothing.
  - The icon source is `platform` or `theme`. The `iconSource` preference of
    `AstryxCapabilitiesProvider`, a value or a function of the theme's name,
    decides; without it, the theme's own setting decides; without either, the
    source is `platform`. Under `theme`, built-in names skip system symbols.
- **FR5 — The library applies Astryx's display rules before the views draw.**
  - Right-to-left: `chevronLeft`, `chevronRight`, `chevronsLeft`,
    `chevronsRight`, and `externalLink` mirror; `chevronDown`, `arrowUp`,
    `arrowDown`, `arrowsUpDown`, `upload`, `check`, and `close` do not. The
    library sends `mirrored`, and each view flips its drawing horizontally.
  - When Bold Text is on, the library sends the next heavier symbol weight. When
    Reduce Motion is on, the library sends no `effect` to the view.
  - Colors come from the theme for the current color scheme. A scene carries
    concrete colors, so a scheme change draws a new scene. A color with no
    concrete value, such as a `PlatformColor`, draws no glyph, and a development
    warning names it.
  - A labeled icon is one image with that label for screen readers; an unlabeled
    icon is hidden from them (`spec:AST-082/FR17`).

### Drawing

- **FR6 — One vector scene format, read the same everywhere.** A `VectorScene`
  is data the platform owns and the library writes: `version`, `viewBox`
  (`[x, y, width, height]` or null for the view's own points), `fit` (`meet`,
  `slice`, `none`), `alignX` and `alignY` (0, 0.5, or 1, as SVG's
  `preserveAspectRatio`), and `shapes`, back to front.
  - A shape's `path` is a flat list of numbers in absolute coordinates: `0 x y`
    moves, `1 x y` draws a line, `2 x1 y1 x2 y2 x y` a cubic curve,
    `3 x1 y1 x y` a quadratic curve, and `4` closes the subpath.
  - A shape also has `fill` and `stroke` (`#RRGGBBAA`, or a linear or radial
    gradient whose coordinates are fractions of the shape's bounding box by
    default or user-space values), `fillRule`, `strokeWidth`, caps, joins, miter
    limit, dashes, `opacity`, `transform` (six numbers `[a, b, c, d, e, f]` of
    an affine matrix), and `nonScalingStroke`.
  - A group (`version: 2`) composites its `children` as one layer, with an
    optional clip path, an alpha or luminance mask, a group `opacity`, and a
    `transform`.
  - Only the viewBox mapping changes a stroke's width. A `transform` on a shape
    or group changes positions, not stroke widths, so a chart's data scaling
    does not thicken its lines. A shape with `opacity` below 1 fades its fill
    and stroke together, so the fill does not show through the stroke.
  - Any input is safe: a renderer does not crash on it. A renderer ignores a
    node whose type it does not know or whose required numbers are not finite.
    An optional number that is not finite falls back to its default. A scene it
    cannot read draws nothing and is reported once per scene: `unreadable`,
    `unsupported-version`, or `too-deep` (JSON nested deeper than 100 levels;
    this limit protects each reader's stack and is lower than any reader's
    parser limit).
  - The format grows only by new optional fields whose defaults leave every
    existing scene unchanged. A rule that would change how an existing scene
    looks gets a new `version` number.
  - One set of shared conformance cases fixes what every reader (iOS, Android,
    and the JavaScript reference reader) draws and reports (`spec:AST-140/FR7`).
- **FR7 — `NativeVectorView` draws one scene on one native view.** The `.` entry
  exports `NativeVectorView` with `scene`, `isLargeContentImage`, `fallback`,
  `onError`, the view props, and a ref, the scene types, and the probe
  `isNativeVectorViewAvailable()`.
  - A new scene object sends the scene to the native view once; a re-render with
    the same object sends nothing. Drawing happens on the UI thread with no
    JavaScript per frame.
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
  - `Icon` treats an absent vector view as a broken install: a drawn glyph shows
    nothing, and a development warning names the view. `Vector` draws nothing
    and keeps its size.
- **FR8 — `AstryxVectorInfo` reports the scene versions a binary reads.**
  `AstryxVectorInfo` has the capability shape and no methods. `version()`
  answers the highest scene version the binary's vector view reads, 2 for this
  contract set, and null when the module is missing. A binary that lacks the
  module also lacks the vector view (OQ2).
  - `Vector` writes version 2 only when a drawing uses a group, and version 1
    otherwise. If the view exists but the report has no usable number, `Vector`
    writes version 1 and warns once in development that the two disagree.
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
  - The search for that enclosing view never leaves the view's own surface and
    changes only React Native views.
  - The library marks at most one glyph per control. For an icon shown as a
    symbol or an image, the viewer shows only the control's title.
  - Android has no Large Content Viewer and ignores the prop.

### Behaviour across binaries

- **FR10 — The group is at its baseline.** Every contract in this group is at
  revision 1 on iOS and Android, `isLargeContentImage` included, and lists no
  named feature (`spec:AST-140/FR5`).
- **FR11 — Absence never throws.** Every probe answers false, every call
  resolves a result (`spec:AST-140/FR3`), and every absent view reports
  `no-native-view` and draws its fallback (`spec:AST-140/FR2`). The
  `isPlatformEnabled={false}` switch sends `SymbolView`, `NativeIconView`, and
  `Vector` to their fallbacks; `Icon` then draws built-in names as drawn glyphs,
  because the vector view is core.
- **FR12 — Native code uses public platform API only.** The views and modules
  use the public APIs of UIKit, Core Graphics, Foundation, the Android SDK, and
  React Native. This group needs no exception.

### Platform support

| Contract           | iOS                                                   | Android                                               |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| `AstryxIconView`   | Masks tinted, fitted, and mirrored                    | Masks tinted, fitted, and mirrored                    |
| `AstryxIcons`      | Shared downloads; resolves counts                     | Shared downloads; resolves counts                     |
| `AstryxSymbolView` | SF Symbols with weights and symbol effects            | Absent: `fallback`                                    |
| `AstryxVectorView` | Core Graphics drawing; the Large Content Viewer image | Canvas drawing; the Large Content Viewer prop ignored |
| `AstryxVectorInfo` | Reports 2                                             | Reports 2                                             |

- FR4 gap: no contract shows Android's system icons, so on Android every
  built-in name without a defined icon draws its drawn glyph.
- Supported feature/engine floor: `spec:AST-112` Platform support (iOS at React
  Native's minimum, Android API level 24, New Architecture only); each SF
  Symbol's minimum iOS in the library's name table; symbol effects by kind on
  iOS 17, 18, or 26 (FR3).
- Unsupported behavior: an absent view draws its fallback and reports
  `no-native-view`; an absent module answers `no-module`; a binary without a
  named feature keeps the revision-1 behavior, draws its fallback, or answers
  `unsupported` (`spec:AST-140/FR5`, FR11).
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Relies on `spec:AST-112` FR3 (amended): the library's own native pieces link
  by default, so these five core contracts are in every binary.
- Relies on `spec:AST-140/FR5`: every contract starts at revision 1 and later
  behavior is a named feature the binary reports.
- Changes `spec:AST-112/FR1`: the core's list gains `AstryxIconView`,
  `AstryxIcons`, `AstryxVectorView`, and `AstryxVectorInfo` beside system
  symbols.
- Follows `spec:AST-112/FR9` and `spec:AST-082/FR17`: built-in names map onto
  system symbols by default, and an icon the app or theme defines replaces the
  default. The drawn glyph that stands in where no system symbol exists is OQ1.

## Verification

| Contract | Verification                                                                                                                                                          | Representative states                                                                                                                      | Mutation or failure expectation                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Unit tests through the `./testing` doubles; Simulator and emulator frame captures                                                                                     | bundled, disk, `data:`, and remote masks; a mask shown before; a scale change; the view absent                                             | A local mask missing from the first frame, two downloads for one URI, or no `Image` fallback where the view is absent                         |
| FR2      | Unit tests through `mockIcons()` in its absent, older, and current shapes                                                                                             | no module; no `prefetch`; `isSupported` false; all, some, and no masks loaded; an empty list                                               | A rejection, a reason outside the set, or a call for an empty list                                                                            |
| FR3      | iOS Simulator frame captures per iOS major; unit tests of the absent view                                                                                             | each weight; mirrored; each effect kind; a trigger change; a trigger at mount; repeat; an unknown name; Android                            | An effect that plays at mount, plays on an iOS without it, or runs JavaScript per frame; no `no-native-view` report where absent              |
| FR4      | Library unit tests of name resolution and the icon source                                                                                                             | a theme `assetName` and `systemName` entry; an app image; a theme glyph; each icon source; a symbol above the running iOS; an unknown name | A built-in symbol drawn over an icon the app or theme defines, a symbol under `theme`, or an unknown name that draws in development           |
| FR5      | Library unit tests of mirroring, Bold Text, Reduce Motion, colors, and labels                                                                                         | RTL; Bold Text; Reduce Motion; a scheme change; a `PlatformColor`; a label                                                                 | A mirrored vertical arrow, an effect under Reduce Motion, a stale color after a scheme change, or an unlabeled icon exposed to screen readers |
| FR6      | The shared conformance cases run by each reader; unit tests of the writer                                                                                             | each path command, paint, and transform; version 2 groups; unknown nodes; non-finite numbers; a bad viewBox; deep JSON                     | A reader that crashes, draws an ignored node, or reports a reason other than the case's                                                       |
| FR7      | Unit tests through `installPlainVectorViewForTesting`; accessibility-hierarchy checks on the Simulator and emulator; UI-thread frame checks (no JavaScript per frame) | a new scene object; the same object again; a label; no label; the view absent                                                              | A resend for the same object, a touch taken, an unlabeled drawing exposed to screen readers, or a fallback that changes the layout            |
| FR8      | Unit tests through `mockVectorInfo()`                                                                                                                                 | no module; version 2; a view without a report                                                                                              | A version 2 scene sent to a binary that does not read it, or a silent blank drawing                                                           |
| FR9      | iOS Simulator accessibility checks at an accessibility text size                                                                                                      | a marked glyph; a glyph change; RTL; unmount; two marked glyphs                                                                            | No image in the viewer, a stale image after a glyph change, an image left after unmount, or a change outside the surface                      |
| FR10     | The platform's spec rules check                                                                                                                                       | each contract on iOS and Android                                                                                                           | A contract above revision 1 or with a named feature this record does not list                                                                 |
| FR11     | Unit tests of every probe, call, and view in the absent shape; `isPlatformEnabled={false}` library tests                                                              | Jest with no natives; the platform off                                                                                                     | A throw, a rejection, or an `Icon` that shows nothing with the platform off                                                                   |
| FR12     | Review of the native sources' imports and calls                                                                                                                       | each view and module on iOS and Android                                                                                                    | A call to an API outside the platform's public SDKs                                                                                           |

## Decision log

### DEC-1 — One data-only scene format on one native view

**Reference:** `spec:AST-127/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A drawing is one versioned scene in one prop, read by every renderer against
shared conformance cases, so iOS and Android draw the same picture, a binary
reports what it cannot read, and drawing costs no JavaScript.

Rejected: a tree of native elements per drawing, because every renderer would
keep each element's props in step.

### DEC-2 — Image icons appear in their first frame

**Reference:** `spec:AST-127/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A menu or list shows its icons with its rows. The icon view shows a local or
already-downloaded mask as soon as it mounts, and the provider prefetches a
theme's remote masks.

Rejected: React Native's `Image` for every icon, because it loads each source
asynchronously.

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
viewer. When the glyph changes, the image changes too, and JavaScript never
handles image data.

Rejected: an image or icon-name prop on the press, because a second native view
would render the glyph again and the two could differ.

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
    Android and follows the theme's stroke weight. Costs: departs from
    `spec:AST-082/FR17` and `spec:AST-112/FR9`, and icons do not match the
    system's own.
- **OQ2 — Does `AstryxVectorInfo` fold into the platform info's named
  features?** (`human-api`) Its reported scene version is a counter, and
  `spec:AST-140/FR5` gives contracts named features instead. Options: keep
  `AstryxVectorInfo` and its reported scene version; or list each scene version
  after 1 as a named feature of `AstryxVectorView` and retire
  `AstryxVectorInfo`.
- **OQ3 — Is `cacheInfo` part of the `AstryxIcons` API?** (`checkable`) Options:
  expose it on `AstryxIcons` for an app's status page; or keep it a native
  diagnostic that only tests read.
