---
schema_version: 3
template_version: 7
kind: component
id: component:swift/Thumbnail
platform_of: component:Thumbnail
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/ThumbnailTests.swift,
    packages/native/src/contract/contracts.test.ts,
    packages/native/src/theme/swiftIOSStrings.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Thumbnail (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `Thumbnail(src:, alt:, label:, isLoading:, isDisabled:, showRemoveOn:, onClick:, onRemove:)` and `Thumbnail(_ props: ThumbnailProps)`, a SwiftUI `View` in module `Astryx`.                                                                      |
| Behavior                | A 64-point square on the theme's neutral plate showing the image, else a placeholder silhouette; a skeleton while loading with no image and an upload look over one; a remove button in the top trailing corner; a tap that opens the thumbnail. |
| End-user impact         | A person attaching images on iPhone sees the same previews as on the web, can open or remove each one, and VoiceOver reads each by its file name and description and announces once when an upload starts.                                       |
| Builder impact          | An app passes the image URL, a label such as a file name, and the actions it supports. A single trailing closure is `onClick`.                                                                                                                   |
| Compatibility/readiness | Additive: a new view, generated `ThumbnailProps`, and four of core's messages in the Swift string catalogs. Draft; built and tested on macOS and the iOS Simulator; device captures are attached to the change.                                  |
| Review checks           | Reject a hidden remove button on a touch device, a tap or remove that works while disabled, a tap that works while loading, an unnamed thumbnail, an upload announced on every render, or a color that is not a theme token.                     |
| Governing rules         | `spec:AST-082` FR3, FR7; `spec:AST-086` FR8; `spec:AST-093` FR1–FR5; the Swift component API, theme environment, and accessibility (X1, X3, X4, X6, X7) records under `packages/native/specs/swift/library/`.                                    |

This table is a review projection; the body below is authoritative.

## Intent

Thumbnail on Apple platforms is core's preview of an image attachment, drawn
with SwiftUI's own image loading, progress view, and buttons.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The 64-point tile, its image, placeholder, skeleton, and upload look.
- The remove button, its visibility, and the open tap.
- The thumbnail's names and its upload announcement.

**Does not own / non-goals**

- The meaning of the props and the words — owned by `component:Thumbnail` and
  core's message catalogs.
- Laying out several thumbnails, which belongs to the screen that holds them.

## Public concepts

| Concept      | Closed values or states              | Meaning                                                                    | Availability by variant/orientation/state | Default  | Owner                 | Stability    | Invalid-value behavior               |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------- | -------- | --------------------- | ------------ | ------------------------------------ |
| picture      | image, placeholder, skeleton, upload | what the tile shows                                                        | always                                    | —        | `component:Thumbnail` | experimental | a failed image shows the placeholder |
| showRemoveOn | `hover`, `always`                    | `hover` shows remove under a pointer and always on touch; `always` at rest | with `onRemove`                           | `hover`  | `component:Thumbnail` | experimental | none                                 |
| name         | label and alt, label, alt, fallback  | what VoiceOver reads for the thumbnail                                     | always                                    | fallback | `component:Thumbnail` | experimental | blank strings count as absent        |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                        | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| FR1 | The tile MUST be 64 by 64 points, clipped to `radius.element`, on `color.neutral`. It MUST show the image at `src` cropped to fill the tile, with a 1-point `color.border` inset edge on all four sides of the tile; with no `src`, or when the image fails, a 24-point image silhouette in `color.iconSecondary`.                                                                                                                                                                                                                                               | core `Thumbnail` styles                                      | verify             |
| FR2 | `isLoading` with no `src` MUST show a skeleton in `color.skeleton` at 25% opacity; after 1 second it climbs to 92.5% in ten equal held steps over core's default 550 ms medium duration and back, repeating, as core's does, and it rests at 25% under Reduce Motion; under Increase Contrast its color moves 30% toward `color.textPrimary`, as core's does under `prefers-contrast: more`. `isLoading` with a `src` MUST draw `color.overlay` over the image with the platform's small progress view in `color.onDark`, which keeps its size at any text size. | core `Thumbnail`; Swift accessibility X6                     | verify             |
| FR3 | With `onRemove`, a 20-point remove button MUST sit `space.s1` from the top trailing corner on `color.overlay` with the shared `close` `Icon` at `xsm` in `color.onDark`, which the theme can remap and which keeps its size at any text size. It is visible at rest with `always` and on touch devices; with `hover` under a pointer, it appears while the pointer is over an enabled thumbnail or while its open or remove button has keyboard focus; a pointer reveals nothing on a disabled thumbnail, as core turns pointer events off there.                | core `Thumbnail` `showRemoveOn`; `spec:AST-082` FR3          | verify             |
| FR4 | With `onClick`, not disabled, and not loading, the tile MUST be a SwiftUI `Button` that paints `color.overlayPressed` while pressed. `isDisabled` MUST draw the thumbnail at half opacity and turn off its tap and remove button. The open button while loading or disabled, and the remove button while disabled, MUST stay mounted but inert, so focus on them stays put and VoiceOver reads them dimmed (`spec:AST-085`; Swift accessibility X2); during an upload the remove button stays active, as core's does.                                            | core `Thumbnail`                                             | verify             |
| FR5 | With a `label`, the thumbnail MUST show it through the Astryx tooltip (`architecture:native-swift-library-tooltip`), as core's tooltip wraps the whole thumbnail: not a tab stop itself, keyboard focus on its open or remove button shows the label, and a direct tap opens it while an open action still runs, as the Tooltip by input table below states. A disabled thumbnail shows none, and the label is not a hint, since it is in the thumbnail's name.                                                                                                  | core `Thumbnail` `label`; core `Tooltip`; `spec:AST-082` FR3 | verify             |
| FR6 | Both initializers MUST build the same `ThumbnailProps`; a single trailing closure is `onClick`. Base props come through `ThumbnailProps`: with `isHidden` the view draws nothing; `id` becomes the accessibility identifier.                                                                                                                                                                                                                                                                                                                                     | Swift component API A2–A4, A7; `spec:AST-082` FR7            | verify             |

**Tooltip by input (FR5).** The Astryx tooltip's rules apply; this table
states Thumbnail's choices.

| Input          | With a `label`                                                                                                                                                                                       | Disabled, or no `label` |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Pointer        | the bubble shows the label above the tile after 200 ms, stays while the pointer is on it, and a press hides it                                                                                       | nothing                 |
| Keyboard focus | the label at once when keyboard focus is on the open or remove button, as focus within core's tooltip wrapper shows it; the thumbnail itself is not a tab stop                                       | nothing                 |
| Touch tap      | a direct tap opens the bubble with the label, while an open action and an enclosing row still run; another tap on it, or a tap anywhere else, closes it, and that tap still reaches what it lands on | nothing                 |
| VoiceOver      | the label is read once, in the thumbnail's name; the bubble is hidden and the tap is left alone                                                                                                      | nothing                 |

### Allowed variation

- **AV1 — Glyphs and spinner.** The placeholder is the SF Symbol `photo.fill`
  and the spinner the platform's progress view.

### Representative states

| State                          | Required invariant                            | Allowed variation |
| ------------------------------ | --------------------------------------------- | ----------------- |
| image                          | the image fills the tile with an inset edge   | image content     |
| no image, failed image         | the placeholder silhouette                    | AV1               |
| loading without and with image | skeleton; upload overlay with a progress view | AV1               |
| remove, hover and always       | visible on touch; at rest with `always`       | none              |
| tappable, disabled             | a button; dimmed with no tap or remove        | none              |
| light and dark, two themes     | each theme's colors                           | none              |

### Transformation and precedence order

- **ORD1 — Picture.** Skeleton (loading, no `src`) → image → placeholder.
- **ORD2 — Name.** `label — alt` → `label` → `alt` → core's fallback word.

### Performance and resources

- **PR1 — System loading.** Images load through `AsyncImage` and the system
  URL cache.

## Accessibility contract

- **AR1 — Named group.** The thumbnail is a container named by ORD2. The image
  reads as its `alt` and is hidden without one (X4). With `onClick` the open
  button covers the image and its name, "Open" with the thumbnail's name,
  stands for it, so VoiceOver does not read the image on its own, as core's
  open button wraps the image and a button's content is presentational.
- **AR2 — Named actions.** The open button reads "Open" with the name and the
  remove button "Remove" with the name, from core's message catalogs in the
  person's language (X1).
- **AR3 — Upload announced once.** Each upload start, including one already
  in progress when the thumbnail appears, announces core's "Loading" once, as
  core does; the spinner is hidden (`spec:AST-086` FR8; X3).
- **AR4 — Targets.** The remove button answers taps across 44 by 44 points
  without moving its drawing (X7).
- **AR5 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree, the hit region, and the announcement are not
  measured until an app-hosted target exists.

## Design relationships

| Anatomy or state | Design requirement                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------- | ------------------------ | -------------- | ------------------ |
| Image, overlays  | Apple Human Interface Guidelines, Images | prescribed by core       | supporting     | FR1–FR4            |

The component implements design requirements without copying their rationale.

Platform controls: SwiftUI `AsyncImage` for the image, `ProgressView` for the
upload spinner, and `Button` for the open tap and remove action
(`spec:AST-093` FR2). SwiftUI has no thumbnail control, so the tile and its
overlays are drawn here. Guideline pages: Images, Progress indicators, Buttons,
and Accessibility in the Apple Human Interface Guidelines.

Theme values read: `color.neutral`, `color.border`, `color.iconSecondary`,
`color.overlay`, `color.onDark`, `color.overlayPressed`, `radius.element`,
`space.s1`, `color.skeleton`, `color.textPrimary`, the theme's `close` icon, Reduce Motion, and Increase Contrast; and, for the Astryx tooltip's bubble, `color.textPrimary`, `color.backgroundSurface`, `space.s1`, `space.s2`, `radius.container`, and the body text size and weight.

## Family and system relationships

- `component:Thumbnail` owns the props, the words, and the look; this record
  states only how Swift draws them.

## Verification map

| Contract | Verification                                                                                                                                                 | Representative states                                                    | Mutation or failure expectation                                                                                                                                                                                                                                       | Audit section                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1      | `ThumbnailTests.swift` size, plate, and two-theme renders                                                                                                    | no image; default, neutral, butter; the largest text size                | a wrong size or a color of its own fails                                                                                                                                                                                                                              | `audit:swift/Thumbnail/tile`    |
| FR2      | `ThumbnailTests.swift` loading states, skeleton color, contrast mix, and largest-text render                                                                 | loading with and without `src`; Increase Contrast; the largest text size | a skeleton over an image, no upload look, a wrong skeleton color, or a tile that grows fails                                                                                                                                                                          | `audit:swift/Thumbnail/loading` |
| FR3, FR4 | `ThumbnailTests.swift` remove, tap, disabled, and mounted-while-inert tests and render                                                                       | `always`, `hover`; disabled; loading                                     | a hidden remove on touch or under keyboard focus, a hard-coded remove glyph, or a tap while disabled or loading fails; an open or remove button that unmounts while loading or disabled fails; a pointer that reveals the remove button on a disabled thumbnail fails | `audit:swift/Thumbnail/actions` |
| FR5      | `TooltipPresenterTests.swift` for each input; `ThumbnailTests.swift` name and focus-within tests                                                             | enabled and disabled; blank label                                        | a tooltip on a disabled thumbnail, or none for keyboard focus on its open or remove button, fails; that the tile keeps one structure across a disabled toggle or an upload ending is not measured, since a test cannot see a rebuild                                  | `audit:swift/Thumbnail/tooltip` |
| FR6      | `ThumbnailTests.swift` initializer, trailing-closure, and hidden tests; `contracts.test.ts`                                                                  | both initializers; `isHidden`                                            | differing props or a drawn hidden thumbnail fails                                                                                                                                                                                                                     | `audit:swift/Thumbnail/api`     |
| AR1, AR2 | `ThumbnailTests.swift` name and open-button tests (`hasOpenButton` decides the image's hiding); `swiftIOSStrings.test.ts`; the rendered tree is not measured | label and alt, each alone, neither; with and without `onClick`           | a wrong name or a missing catalog message fails                                                                                                                                                                                                                       | `audit:swift/Thumbnail/a11y`    |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
