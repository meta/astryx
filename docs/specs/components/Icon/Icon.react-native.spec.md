---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Icon
platform_of: component:Icon
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-size-cascade,
    architecture:icon-resolution-and-component-slots,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Icon (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Icon` with core's `icon`, `color`, `size` and `label`, and the shared base props `id` and `isHidden`. `icon` takes a built-in name or a namespaced `<library>:<name>`; `color` takes core's semantic values and `inherit`. React Native adds one prop, `scalesWithText` (DEC-2).                                                                                                                                                                                                     |
| Behavior                | Icon draws the icon the theme or the app defines for its name, else, for a built-in name, the platform's own symbol (an SF Symbol on iOS, a Material icon on Android), or Astryx's drawn glyph where the theme or the app chooses drawn glyphs (`spec:AST-127` FR4). It draws in a square box at core's size, grown with the system text size, in core's icon colour token or in the foreground of the Astryx component around it. Directional names mirror in right-to-left layouts. |
| End-user impact         | A person sees each icon sharp, in the same frame as the row or button around it, at a size that follows their text size and in the colours of the current light or dark mode. VoiceOver and TalkBack read only icons that carry a label. On iOS, the glyph of a control that keeps its size shows enlarged in the Large Content Viewer.                                                                                                                                               |
| Builder impact          | Web code that passes a built-in name, a colour role, a size and a label ports unchanged. An app registers its own images for namespaced names, and its theme replaces any icon. An SVG component, `variant`, the palette colours and the web styling props have no React Native form (DEC-1).                                                                                                                                                                                         |
| Compatibility/readiness | Not yet released; additive. Draft. Current-state impact lists where the library differs from this record.                                                                                                                                                                                                                                                                                                                                                                             |
| Review checks           | Reject a substitute drawing for an unknown name, a visual prop on Icon (a stroke weight included), a web prop accepted and ignored, an unlabeled icon that a screen reader reads, an owner's size or frame winning over an explicit `size`, a local glyph or mask missing from the view's first frame, or a third-party icon, SVG or image library that Icon needs.                                                                                                                   |
| Governing rules         | `component:Icon` FR1, FR3, FR5, ORD1 and AR1–AR3; `spec:AST-082` FR3–FR5, FR7, FR11, FR17, DEC-2 and DEC-10; `spec:AST-093` FR2–FR4; `spec:AST-112` FR5, FR16 and FR19; `spec:AST-127` FR1–FR5, FR7, FR9 and FR11; DEC-1 to DEC-3 below.                                                                                                                                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

Icon on React Native draws Astryx's shared icon names on iOS and Android. A
glyph beside the platform's own controls is sharp, follows the person's text
size and takes the current mode's colours, while its names, sizes, colours and
accessibility follow the core `Icon` contract. This record states only what
React Native adds to `component:Icon` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The library differs from this record in these places:

- FR1 gap: the library's built-in names also include everyday names that core
  does not define (`plus`, `reply`, `play` and others), without a namespace
  (OQ1).
- FR1 gap: Icon also takes a `weight` prop for the drawn glyph's stroke
  (`regular`, `medium`, `bold`), and the library's theme takes an `iconWeight`
  default for it.
- FR3 gap: on Android, a built-in name that the theme and the app do not
  define draws its drawn glyph, not a Material icon.
- FR3 gap: the library's default icon source is `theme`, so a built-in name
  draws its drawn glyph unless the theme's own `iconSource` or the app's
  `iconSource` preference is `platform`; the library's iOS theme sets it.
- FR3 gap: the library reads its own table of SF Symbol names, each with the
  iOS version that introduced it, in place of `@astryxdesign/native`'s icon
  defaults.
- FR3 gap: under the `platform` icon source, a built-in name's SF Symbol
  draws in place of a theme entry or an app image for that name.
- FR3 gap: a theme entry that names a platform symbol (`systemName`) is not
  read; the name resolves as if the entry were absent.
- FR3 gap: a namespaced name that nothing registers draws nothing in a
  development build too, with no message.
- FR5 gap: inside an owner's fixed icon frame, an explicit `size` draws no
  larger than the frame's side.

## Ownership boundary

**Owns**

- Which props React Native's `Icon` offers, and `scalesWithText` (FR1, FR2).
- How Icon draws the image its name resolves to on each platform (FR3, FR4).
- The box: its side, its growth with the text size, the fixed side and the
  owner's frame (FR5).
- The colour each `color` value draws, and what `inherit` takes (FR6).
- What Icon draws when a native piece is absent or the platform is off (FR7).
- The icon's VoiceOver and TalkBack exposure and its Large Content Viewer
  image (AR1–AR4).

**Does not own / non-goals**

- The meaning of `icon`, `color`, `size` and `label`, the built-in names and
  the size scale — owned by `component:Icon` and `spec:AST-082` FR17.
- The platform symbol each built-in name maps to — owned by
  `@astryxdesign/native`'s icon defaults and `spec:AST-082` FR17.
- Name resolution, the icon source, the drawn glyphs and their scene format,
  the native views, and the list of names that mirror — owned by
  `spec:AST-127`.
- Which size an owner gives the icons in its icon slot, and an owner's fixed
  icon frame — owned by each owning component and
  `architecture:component-size-cascade`.
- The foreground an owner gives `inherit` — owned by each owning component.

## Public concepts

| Concept      | Closed values or states                                                                                           | Meaning                                                                                                                  | Availability by variant/orientation/state | Default                          | Owner                         | Stability    | Invalid-value behavior                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------------- | ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| icon name    | core's built-in names; a namespaced `<library>:<name>`                                                            | the glyph to draw                                                                                                        | always                                    | required                         | `component:Icon`              | experimental | an unknown name stops a development build and draws nothing in a release build (FR3); an SVG component is a type error |
| icon source  | `platform`; `theme`                                                                                               | whether a built-in name that the theme and the app do not define draws the platform's own symbol or Astryx's drawn glyph | always                                    | `platform`                       | `spec:AST-127`                | experimental | none                                                                                                                   |
| size         | `xsm`, `sm`, `md`, `lg`; unset                                                                                    | 12, 16, 20 and 24 points or dp at the default text size, grown with the text size                                        | always                                    | the owner's icon size, else `md` | `component:Icon`              | experimental | unset takes the owner's size, then `md`                                                                                |
| color        | `primary`, `secondary`, `tertiary`, `disabled`, `accent`, `info`, `success`, `error`, `warning`, `inherit`; unset | core's icon colour tokens; `inherit` takes the foreground of the Astryx component around the icon                        | always                                    | `inherit`                        | `component:Icon`              | experimental | a palette value is a type error                                                                                        |
| text scaling | `scalesWithText` true; false                                                                                      | whether the box grows with the text size                                                                                 | always                                    | true                             | `component:react-native/Icon` | experimental | none                                                                                                                   |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                                       | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | The React Native `Icon` MUST take core's `icon`, `color`, `size` and `label` with core's names, types, defaults and meaning, and the shared base props: `id` becomes the view's test and native identifier, and `isHidden` removes the icon from layout and from screen readers while it stays mounted. `icon` takes a built-in name or a namespaced `<library>:<name>`, not an SVG component; `color` takes the semantic values and `inherit`, not the palette values. `variant`, `xstyle`, `className`, `style` and `ref` are not offered. Icon MUST NOT offer a prop it does not fully honor, and takes no visual prop (DEC-1).                                          | `spec:AST-082` FR3, FR4, FR5, FR7, DEC-2; `spec:AST-112` FR5, FR16; DEC-1                   | settled            |
| FR2 | React Native adds `scalesWithText` (default true). With `false`, the box keeps its size's nominal side (12, 16, 20 or 24) at every text size, for a glyph in a control that does not grow with the text size; that control offers the Large Content Viewer on iOS (AR3). Unset, it changes nothing.                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-082` FR5, FR11; DEC-2                                                             | settled            |
| FR3 | Icon MUST draw the image for its name in this order: a theme entry that names an image the app ships (`assetName`) or a platform symbol (`systemName`); an image the app registers for the name; for a built-in name, the platform's own symbol for it under the `platform` icon source (an SF Symbol on iOS, where the running iOS has it, and a Material icon on Android), or Astryx's drawn glyph under the `theme` icon source. An unknown name, built-in or namespaced, and a theme entry that names an image the app does not ship, MUST stop a development build with a message that names it and draw nothing in a release build, never a substitute or a web icon. | `spec:AST-082` FR4, FR17, DEC-10; `spec:AST-127` FR4                                        | verify             |
| FR4 | A drawn glyph MUST draw as a vector scene on the platform's vector view, sharp at every size, in the view's first frame and on the UI thread. An image icon draws through the icon view as a mask whose opaque pixels take the icon's colour, and a bundled, on-disk or already-shown mask appears in the view's first frame. A platform symbol draws in the same box and colour. In a right-to-left layout, a name that `spec:AST-127` FR5 lists as directional draws mirrored, whichever view draws it. Icon needs no icon font, SVG library or image library.                                                                                                            | `spec:AST-127` FR1, FR3, FR5, FR7; `spec:AST-093` FR2                                       | verify             |
| FR5 | The box MUST be a square whose side is core's size (12, 16, 20 and 24 for `xsm`, `sm`, `md` and `lg`) at the default text size, multiplied by the system text size (Dynamic Type on iOS, the font scale on Android). Icon MUST use its own `size`, else the size its owning component gives icons in its documented icon slot, else `md`. With `scalesWithText` false the side is the size's nominal side. Inside an owner's fixed icon frame, such as a tab bar's tab, an icon without its own `size` draws at the frame's side; an explicit `size` still wins.                                                                                                            | `component:Icon` FR3, FR5, ORD1; `architecture:component-size-cascade`; `spec:AST-082` FR11 | verify             |
| FR6 | Icon MUST draw in core's token for its `color` in the current mode: the primary and secondary icon tokens, the secondary icon token for `tertiary`, the disabled icon token, the accent colour, and the `info`, `success`, `error` and `warning` status icon tokens. For `inherit`, the default, it MUST draw in the foreground the Astryx component around it gives, such as a button's label colour, and outside any such component in the primary icon token (DEC-3). A mode change redraws the icon in the new mode's colour. A colour with no concrete value leaves the box empty, with a development warning that names it.                                           | core `Icon` colour map; `spec:AST-093` FR4; `spec:AST-127` FR5; DEC-3                       | verify             |
| FR7 | Where the vector view is absent, a drawn glyph MUST draw nothing and warn once in development that names the missing view, never a raster substitute. With the platform turned off in a subtree (`isPlatformEnabled={false}`), Icon still draws drawn glyphs on the vector view; a symbol takes the drawn glyph, and an image icon draws through React Native's `Image` with the same mask, fit, colour and mirroring, with no fade.                                                                                                                                                                                                                                        | `spec:AST-127` FR1, FR7, FR11                                                               | verify             |

### Allowed variation

- **AV1 — Glyph shape.** The shape is the platform's symbol, the drawn glyph
  or the app's image, as FR3 resolves it; a theme may replace any name
  (`spec:AST-082` FR17).
- **AV2 — Symbol rendering.** A platform symbol's shape and line weight are the
  system's and may change with each OS release.

### Representative states

| State                               | Required invariant                                                                      | Allowed variation           |
| ----------------------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| every size                          | box side 12, 16, 20, 24 at the default text size                                        | glyph proportions per image |
| largest text size                   | the box grows with the text size; with `scalesWithText` false it keeps its nominal side | none                        |
| inside a tab bar's tab              | the frame's side without an explicit size; the explicit size with one                   | none                        |
| inside an owner's icon slot         | the owner's size unless the icon sets its own                                           | none                        |
| every colour, light and dark        | the colour's token in the current mode                                                  | none                        |
| `inherit` inside a button and alone | the button's foreground; the primary icon token                                         | none                        |
| right-to-left                       | directional names mirror; vertical arrows, `check` and `close` do not                   | none                        |
| unknown name                        | a development build stops with the name; a release build draws nothing                  | none                        |
| labeled and unlabeled               | screen readers read only the labeled icon                                               | none                        |
| vector view absent                  | nothing drawn; one development warning                                                  | none                        |

### Transformation and precedence order

- **ORD1 — Image.** A theme entry, then an image the app registers, then, for
  a built-in name, the platform's own symbol under the `platform` icon source
  or the drawn glyph under the `theme` icon source, then nothing (FR3,
  `spec:AST-127` FR4).
- **ORD2 — Size.** Explicit `size`, then an owner's fixed icon frame, then the
  owner's icon size, then `md`. A size from `size`, the owner's icon size or
  `md` is multiplied by the text size unless `scalesWithText` is false; a
  frame's side is the owner's.
- **ORD3 — Colour.** An explicit `color` token; for `inherit`, the foreground
  of the Astryx component around the icon, then the primary icon token.

### Performance and resources

- **PR1 — One native view and no work of its own.** An icon is one native
  view. It holds no listeners, timers or layout measurement, and its scene is
  built once for each glyph and colour, so a re-render with the same inputs
  sends nothing to the native side (`spec:AST-127` FR7).
- **PR2 — Built-in icons read nothing.** A drawn glyph or a platform symbol
  reads nothing from disk or the network. The provider fetches a theme's remote
  image icons once per set, so a menu's icons appear with its rows
  (`spec:AST-127` FR2).

## Accessibility contract

- **AR1 — Decorative unless labeled.** With no `label`, or an empty one, the
  icon is hidden from VoiceOver and TalkBack. With a label, it is one image
  element named by the label (`component:Icon` AR1, AR2; `spec:AST-082` FR17;
  `spec:AST-112` FR19).
- **AR2 — No interaction of its own.** Touches pass through the icon to the
  control around it. Icon adds no focus stop and no action, and the control
  names itself (`component:Icon` AR3).
- **AR3 — Text size and the Large Content Viewer.** The box grows with the
  system text size (`spec:AST-082` FR11). A glyph that keeps its size
  (`scalesWithText` false, or an owner's fixed frame) sits in a control that
  offers the iOS Large Content Viewer. A drawn glyph that the library marks as
  its control's viewer image is that viewer's image (`spec:AST-127` FR9); for
  a platform symbol or an image icon, the viewer shows the control's title.
  Android has no Large Content Viewer.
- **AR4 — Bold Text.** Under iOS Bold Text, a platform symbol draws one weight
  heavier (`spec:AST-127` FR5).

## Design relationships

| Anatomy or state | Design requirement                                                                                                                                     | Representation authority                    | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | -------------- | ------------------ |
| Glyph            | the platform's own symbol (SF Symbols, Material icons); the theme's or the app's own image; Astryx's drawn glyph where the theme or the app chooses it | prescribed by the platform, or by the theme | supporting     | FR3, FR4, FR5      |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): SF Symbols on iOS and Material icons on
Android, the platforms' own icon sets (`spec:AST-082` FR17); on iOS the
symbol view draws them. Neither platform has a view that draws Astryx's drawn
glyphs, so a drawn glyph draws on Astryx's vector view (Core Graphics on iOS,
Canvas on Android), and an image icon draws on Astryx's icon view, which shows
a local mask in its first frame. Guideline pages: SF Symbols, Right to left
and Accessibility (Large Content Viewer, Bold Text) in the Apple Human
Interface Guidelines; Icons and Accessibility in Material 3 (`spec:AST-093`
FR3).

Theme values read (`spec:AST-093` FR4): `color.iconPrimary`,
`color.iconSecondary`, `color.iconDisabled`, `color.accent`, `color.iconInfo`,
`color.iconSuccess`, `color.iconError`, `color.iconWarning`, the theme's icon
entries, and the system text size.

### Native pieces

| Native piece       | Record                       | What this record uses it for                                       |
| ------------------ | ---------------------------- | ------------------------------------------------------------------ |
| `AstryxVectorView` | `spec:AST-127` FR6, FR7, FR9 | the drawn glyph and its Large Content Viewer image (FR4, FR7, AR3) |
| `AstryxSymbolView` | `spec:AST-127` FR3           | the SF Symbol on iOS under the `platform` icon source (FR4)        |
| `AstryxIconView`   | `spec:AST-127` FR1           | image icons in their first frame (FR4)                             |
| `AstryxIcons`      | `spec:AST-127` FR2           | the provider's fetch of the theme's remote image icons (PR2)       |

## Family and system relationships

- `component:Icon` owns the props, the built-in names, the size scale, the
  colour map and the accessibility rules; this record states only how React
  Native draws them. Core's theming-target data (FR2), its styling escape
  hatches (FR4), `variant` (FR6) and `ref` (FR8) belong to the web contract.
- `spec:AST-082` FR17 and DEC-10 make the platform's own symbol the default
  for a built-in name; `@astryxdesign/native`'s icon defaults map each name.
- `spec:AST-127` owns name resolution, the icon source, the drawn glyphs and
  their scene format, the native views and the display rules (mirroring, Bold
  Text, colours with no concrete value, the Large Content Viewer image).
- `architecture:component-size-cascade` owns when an owner's icon size
  applies; owners set it, and a fixed icon frame, through internal context
  that Icon reads.
- Each component that draws a foreground, such as Button, IconButton, Badge
  and Item, gives it to the icons inside it for `inherit` (DEC-3).
- `component:swift/Icon` draws the same names in SwiftUI; both follow
  `spec:AST-082` FR17.

## Verification map

| Contract      | Verification                                                                                          | Representative states                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                            | Audit section                        |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, FR2      | Type tests of the export against core's contract; a contract drift test                               | each prop; an SVG component, `variant`, a palette colour and each web styling prop refused; `scalesWithText` unset                                                                                            | a missing core prop, a different default, or an accepted web prop fails                                                                                                    | `audit:react-native/Icon/api`        |
| FR3           | Unit tests of name resolution through the package's testing doubles; Simulator and emulator captures  | a theme `assetName` and `systemName` entry; an app image; each icon source on iOS and Android; a symbol newer than the running iOS; an unknown built-in and namespaced name in development and release builds | a symbol over a defined icon, a drawn glyph where a platform symbol is due, a substitute drawing, or an unknown name that draws or does not stop a development build fails | `audit:react-native/Icon/resolution` |
| FR4, PR1, PR2 | Simulator and emulator first-frame captures; unit tests of scene reuse and mirroring                  | a drawn glyph; a bundled and a remote mask; a symbol; right-to-left; a re-render with the same inputs                                                                                                         | a local glyph or mask missing from the first frame, a mirrored vertical arrow, a resend for the same scene, or a third-party native dependency fails                       | `audit:react-native/Icon/drawing`    |
| FR5           | Unit tests of the box side; Simulator and emulator captures at the default and the largest text sizes | each size; an owner's size; an explicit size; `scalesWithText` false; a tab bar's frame with and without an explicit size                                                                                     | a wrong side, an owner's size or frame beating an explicit size, or growth with `scalesWithText` false fails                                                               | `audit:react-native/Icon/size`       |
| FR6           | Unit tests of the colour map; captures in two themes, light and dark                                  | every colour; `inherit` inside a button and alone; a colour with no concrete value                                                                                                                            | a wrong token, a stale colour after a mode change, or `inherit` ignoring its owner fails                                                                                   | `audit:react-native/Icon/color`      |
| FR7           | Unit tests with the native views absent and with the platform off                                     | no native views; `isPlatformEnabled={false}`                                                                                                                                                                  | a throw, a raster substitute, no warning for an absent vector view, or no glyph with the platform off fails                                                                | `audit:react-native/Icon/platform`   |
| AR1–AR4       | VoiceOver and TalkBack checks on devices; the largest text sizes; Bold Text                           | labeled; unlabeled; empty label; inside a button; a marked fixed glyph                                                                                                                                        | an unlabeled icon read, a labeled one skipped, a focus stop of its own, or no viewer image for a marked drawn glyph fails                                                  | `audit:react-native/Icon/a11y`       |

## Decision log

### DEC-1 — Icon takes names and semantic colours; its look comes from the theme

**Reference:** `component:react-native/Icon/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Icon names its glyph, and each platform draws the image for that name, so the
same call works on the web, iOS and Android. An SVG component is web artwork,
and `variant` asks a web theme's registry for alternate artwork, so neither is
offered; a native theme replaces an icon by name instead. `color` takes the
semantic roles every platform's theme draws, and the palette hues stay in the
web contract. Every other visual, the drawn glyph's stroke included, comes
from the theme (`spec:AST-082` DEC-2), so Icon takes no visual prop.

### DEC-2 — `scalesWithText` keeps a fixed control's glyph at its size

**Reference:** `component:react-native/Icon/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A control that keeps its size at every text size, such as a floating map
control or a bar item, needs its glyph to keep its size too, or the glyph
outgrows the control. `scalesWithText={false}` draws the size's nominal side,
and the control offers the Large Content Viewer, which shows the glyph
enlarged. Every other icon grows with the text, so the default is true.

### DEC-3 — `inherit` takes the foreground of the Astryx component around the icon

**Reference:** `component:react-native/Icon/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

React Native views do not inherit a text colour from their parents, so an
Astryx component that draws a foreground gives it to the icons inside it, and
an icon takes that colour for `inherit`. A button's glyph then matches its
label in every state. An icon outside any such component draws in the primary
icon token.

## Open questions

- **OQ1 — Where do everyday icon names that core does not define live?**
  (`human-api`) The library draws everyday glyphs that core's built-in names do
  not cover, such as `plus`, `reply` and `play`. Options: add them to core's
  built-in names, so every platform shares them (`spec:AST-082` FR17); or give
  them a namespace (`<library>:<name>`), as FR17 states for every name core
  does not define.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
