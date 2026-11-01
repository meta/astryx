---
schema_version: 3
template_version: 7
kind: component
id: component:swift/Avatar
platform_of: component:Avatar
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/native/apple/Tests/AstryxTests/AvatarTests.swift,
    packages/native/apple/Tests/AstryxTests/AvatarStatusDotTests.swift,
    packages/native/src/contract/contracts.test.ts,
    packages/native/src/contract/parseDocType.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Avatar (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Avatar(_ name: String? = nil, src:, fallbackSrc:, alt:, size: AvatarSize?, shape: AvatarShape?, tooltip: AvatarTooltip?, href:, status:, onClick:)` and `Avatar(_ props: AvatarProps, status:)`, a SwiftUI `View` in module `Astryx`. `size` is the named sizes `xsm` to `xl`. |
| Behavior                | Draws the image at `src`, else `fallbackSrc`, else initials from `name` on the theme's neutral plate, else a person symbol, clipped to its shape. With `href` it is a SwiftUI `Link`; with only `onClick` it is a button; it draws the same either way.                         |
| End-user impact         | A person sees the same picture, initials, and shape as on the web, and VoiceOver reads the avatar's name, or skips a decorative one.                                                                                                                                            |
| Builder impact          | An app passes a name and an image URL, and optionally tooltip words and an `AvatarStatusDot`. Pixel sizes, `target`, and `rel` have no Swift form; an `href` must be an absolute URL.                                                                                           |
| Compatibility/readiness | Additive: a new view and generated `AvatarProps`. Draft; built and tested on macOS and the iOS Simulator; device captures are attached to the change.                                                                                                                           |
| Review checks           | Reject a size or shape beyond the contract, a disabled state, a link or button that draws differently from the static avatar, a layout that grows for the touch target, or a static avatar VoiceOver reads without a name.                                                      |
| Governing rules         | `spec:AST-082` FR3, FR4, FR7; `spec:AST-093` FR1–FR5; the Swift component API (A1–A9), theme environment, and accessibility records under `packages/native/specs/swift/library/`.                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

Avatar on Apple platforms shows a person's or an entity's picture with core's
fallback order, sizes, shapes, and naming, drawn with SwiftUI's own image
loading and link and button controls.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Loading `src`, then `fallbackSrc`, with SwiftUI `AsyncImage`.
- Initials, the person symbol, the plate color, and the shape clip.
- Switching to a SwiftUI `Link` or `Button` for `href` or `onClick` without
  changing the drawing.
- The avatar's VoiceOver name and its touch target.

**Does not own / non-goals**

- The meaning of the props, the initials rule, and the size scale — owned by
  `component:Avatar`.
- Avatar groups, which have no Swift view.

## Public concepts

| Concept | Closed values or states                        | Meaning                                             | Availability by variant/orientation/state | Default  | Owner                    | Stability    | Invalid-value behavior                                                     |
| ------- | ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | -------- | ------------------------ | ------------ | -------------------------------------------------------------------------- |
| size    | `xsm`, `sm`, `md`, `lg`, `xl`                  | 20, 24, 36, 48, 128 points at the default text size | always                                    | `md`     | `component:Avatar`       | experimental | core's pixel sizes have no Swift form                                      |
| shape   | `circle`, `rounded`, `square`                  | full round, the theme's element radius, no radius   | always                                    | `circle` | `component:Avatar`       | experimental | none                                                                       |
| picture | image, fallback image, initials, person symbol | the first that is available, in that order          | always                                    | —        | `component:Avatar`       | experimental | an empty or unloadable URL moves to the next                               |
| control | static, link (`href`), button (`onClick`)      | how a tap behaves; the drawing is the same          | always                                    | static   | `component:swift/Avatar` | experimental | an `href` that is not an absolute URL leaves the avatar static or a button |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                       | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| FR1 | The view MUST show the image at `src`; when it is absent or fails, the image at `fallbackSrc`; then initials from a `name` that is not blank; then a person symbol. The fallback image loads only after `src` fails or when there is no `src`; while an image loads, the initials or the person symbol show.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | core `Avatar` fallback order; `spec:AST-093` FR2            | verify             |
| FR2 | Initials MUST follow core's rule: the first letter, digit, or emoji of the first and last words that have one, uppercased, skipping leading punctuation, keeping a whole emoji, flag, or joined emoji sequence. A name with none shows the person symbol and still names the avatar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | core `Avatar` initials                                      | verify             |
| FR3 | The avatar MUST be a square of 20, 24, 36, 48, or 128 points for `xsm` to `xl` at the default text size, grown with Dynamic Type up to 1.6 times and never shrunk, so it and its initials grow with the name beside them without swallowing a row (`spec:AST-082` FR11). It is clipped to a circle, to the theme's `radius.element`, or to a square.                                                                                                                                                                                                                                                                                                                                                                                                                             | core `Avatar` sizes and shapes                              | verify             |
| FR4 | Initials and the person symbol MUST draw in `color.textSecondary` on `color.neutral`; initials use the theme's body family at medium weight and 40% of the side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | core `Avatar` fallback styles; `spec:AST-093` FR4           | verify             |
| FR5 | With an `href` that is an absolute URL (it has a scheme), the avatar MUST be a SwiftUI `Link`; with `onClick` too, `onClick` runs as it opens and the URL then goes to the app's own URL handler, or the system's. An `href` that is not an absolute URL, such as a web path, MUST stop a development build with a message naming it; a release build draws the avatar without a link, as a button with `onClick` or static. With only `onClick`, a SwiftUI `Button`. Either draws exactly as the static avatar, and the avatar has no disabled state.                                                                                                                                                                                                                           | Swift component API A4                                      | verify             |
| FR6 | Both initializers MUST build the same `AvatarProps`; `name` is the unlabeled first parameter, a single trailing closure is the status, and `onClick` comes last. Base props come through `AvatarProps`: with `isHidden` the view draws nothing; `id` becomes the accessibility identifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Swift component API A2–A4, A7; `spec:AST-082` FR7           | verify             |
| FR7 | The `status` slot MUST draw its content, usually one `AvatarStatusDot`, outside the avatar's clip, placed from the content's own size, in the same layout pass, as core places any status: on a circle centered on the circle's edge at the bottom trailing 45° point, on a rounded or square avatar overhanging the bottom trailing corner by a quarter of its size, mirrored in right-to-left layouts. It MUST NOT change the avatar's size or layout, gives a dot the avatar's side for its size tier, and lets other content grow with Dynamic Type no faster than the avatar, up to the text size at its 1.6 times growth: the content still grows with Dynamic Type (`spec:AST-082` FR11), up to its owner's growth, since the owner sizes what it holds (Swift slots S4). | core `Avatar` status position; Swift slots S4               | verify             |
| FR8 | `tooltip` MUST resolve, as core does, to the name for `nil` or `true`, the given words for a string, and nothing for `false` or blank words, and MUST show through the Astryx tooltip (`architecture:native-swift-library-tooltip`), with the focus and touch the Tooltip by input table below states: a static avatar is a tab stop and opens on a tap; a link or button keeps its focus and its tap. Given words are the VoiceOver hint. On the wire it is the web value, a string or a Bool.                                                                                                                                                                                                                                                                                  | core `Avatar` `tooltip`; core `Tooltip`; `spec:AST-082` FR3 | verify             |

**Tooltip by input (FR8).** The Astryx tooltip's rules apply; this table
states Avatar's choices.

| Input          | Default name                                                                                                                                                                                                                               | Given words                                                  | Off (`false` or blank)                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| Pointer        | the bubble shows the name above the avatar after 200 ms, stays while the pointer is on it, and a press hides it                                                                                                                            | the same, with the words                                     | nothing                                    |
| Keyboard focus | the bubble shows the name at once and Escape hides it; a static avatar is a tab stop                                                                                                                                                       | the same, with the words                                     | nothing; a static avatar is not a tab stop |
| Touch tap      | a direct tap on a static avatar opens the bubble with the name; another tap on it, or a tap anywhere else, closes it, and that tap still reaches what it lands on; the tap is shared with an enclosing row; a link or button keeps its tap | the same, with the words                                     | nothing                                    |
| VoiceOver      | the name is read once, as the avatar's own; the bubble is hidden and the tap is left alone                                                                                                                                                 | the words are the hint, as core puts them in the description | nothing                                    |

### Allowed variation

- **AV1 — Loading.** While an image loads, the initials or the person symbol
  show instead of an empty plate.
- **AV2 — Glyph.** The person symbol is the SF Symbol `person.fill`, not core's
  SVG.

- **AV3 — Tooltip surface.** The tooltip is the Astryx tooltip's bubble in
  core's tooltip colors on every input. SwiftUI's `.help` does not fit: it is
  also the VoiceOver hint, so it would read the name twice, and it shows with
  the system's look and delay, never on keyboard focus or a tap.

### Representative states

| State                          | Required invariant                     | Allowed variation |
| ------------------------------ | -------------------------------------- | ----------------- |
| image                          | the image fills the shape              | image content     |
| failed image with a fallback   | the fallback image                     | none              |
| initials, every size and shape | initials centered on the neutral plate | glyph metrics     |
| no name                        | the person symbol at 60% of the side   | none              |
| link and button                | the same drawing as static             | none              |
| light and dark, two themes     | each theme's plate and text color      | none              |

### Transformation and precedence order

- **ORD1 — Picture.** `src` → `fallbackSrc` → initials → person symbol.
- **ORD2 — Name.** `alt` → `name`, where a blank string is none; then
  compose with the status label (AR6), a dot's label before another
  element's.
- **ORD3 — Control.** `href` (link) → `onClick` (button) → static.

### Performance and resources

- **PR1 — System loading.** Images load through `AsyncImage` and the system
  URL cache; the view keeps no image cache of its own.

## Accessibility contract

- **AR1 — Named or decorative.** A static avatar with a name is one image
  element named by `alt`, else `name`, composed with its status label (AR6);
  without a name and without a status label it is hidden from VoiceOver.
  A link or button avatar is one element with the link or button trait and the
  same name; the initials are never an element of their own (Swift
  accessibility X1, X5).
- **AR2 — Touch target.** A link or button avatar, and a static avatar whose
  tap opens its tooltip, answers taps across at least 44 by 44 points without
  changing its drawn size or layout (X7).
- **AR3 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree and the hit region are not measured until an
  app-hosted target exists.
- **AR4 — Unnamed taps are flagged.** A link or button avatar without `alt`
  or `name` logs a development warning, as core warns.
- **AR5 — Initials contrast.** The initials draw in core's tokens,
  `color.textSecondary` on `color.neutral`, as core's Avatar does. In the
  default and neutral themes' dark appearance that pair is below 4.5:1, in
  core as well; the fix belongs to the theme tokens.
- **AR6 — Status in the name.** The status label joins the avatar's name as
  core's message composes it ("Ada Lovelace, Online"); a status label alone
  names an otherwise unnamed avatar. The label comes from an `AvatarStatusDot` or a labeled `Icon` in the slot, at any depth, as core reads the `label` of the element passed as `status`, and a dot's label wins, as core's reported dot label does; SwiftUI cannot read a label from other
  views, so theirs does not join.

## Design relationships

| Anatomy or state | Design requirement                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------- | ------------------------ | -------------- | ------------------ |
| Photo, initials  | Apple Human Interface Guidelines, Images | prescribed by core       | prominent      | FR1–FR4            |

The component implements design requirements without copying their rationale.

Platform controls: SwiftUI `AsyncImage` for the images, SwiftUI `Link` for
`href`, and SwiftUI `Button` for `onClick` (`spec:AST-093` FR2). SwiftUI has no
avatar control, so the plate, initials, and clip are drawn here. Guideline
pages: Images, Buttons, and Accessibility in the Apple Human Interface
Guidelines.

Theme values read: `color.neutral`, `color.textSecondary`, `radius.element`,
`font.family.body`, `font.weight.medium`, and Bold Text; for the tooltip bubble,
`color.textPrimary`, `color.backgroundSurface`, `space.s1`, `space.s2`,
`radius.container`, and the body text size and weight.

## Family and system relationships

- `component:Avatar` owns the props, the sizes, the initials rule, and the
  fallback order; this record states only how Swift draws them.
- An owner that holds an Avatar in a slot leaves an unsized Avatar at `md`
  (Swift slots S4).

## Verification map

| Contract      | Verification                                                                                                                                                                                                                                                                | Representative states                                                                 | Mutation or failure expectation                                                                                                                              | Audit section                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| FR1, FR2      | `AvatarTests.swift` initials and fallback tests                                                                                                                                                                                                                             | core's initials cases; blank and symbol names                                         | a wrong initial or a missing person symbol fails                                                                                                             | `audit:swift/Avatar/picture` |
| FR3, FR4      | `AvatarTests.swift` size, text-size growth, shape, and two-theme renders                                                                                                                                                                                                    | each size; xx-large and the largest text size; circle and square; light, dark, butter | a wrong side, no growth or growth past 1.6 times, an unclipped corner, or a color of its own fails                                                           | `audit:swift/Avatar/look`    |
| FR5, AR2, AR4 | `AvatarTests.swift` link and button renders; tap, trait, tap-area, warning, `linkURL`, and web-path tests                                                                                                                                                                   | static, link, button; malformed, relative, and empty `href`                           | a link or button that draws differently, a malformed `href` made a link, a web path not flagged, or an unflagged unnamed tap fails                           | `audit:swift/Avatar/control` |
| FR8           | `AvatarTests.swift` tooltip words, focus and touch, VoiceOver hint, and wire tests; `TooltipPresenterTests.swift` for each input; `contracts.test.ts`; `parseDocType.test.ts`                                                                                               | name, `true`, words, `false`, blank, no name; static, link, button                    | a wrong tooltip, a static avatar that is not a tab stop or does not open on a tap, a control that loses its tap, or a wire value that is not the web's fails | `audit:swift/Avatar/tooltip` |
| FR6           | `AvatarTests.swift` initializer and hidden tests; `contracts.test.ts`                                                                                                                                                                                                       | both initializers; `isHidden`; named sizes                                            | differing props, a drawn hidden avatar, or a pixel size in Swift fails                                                                                       | `audit:swift/Avatar/api`     |
| FR7, AR6      | `AvatarStatusDotTests.swift` placement renders of a dot and of other content at its measured place, size, an icon's growth at the largest text size, dot-label-wins, and name tests; the label preference that carries a label into the rendered name is not measured (AR3) | circle and square at `lg`; name with and without a status                             | a dot that changes the avatar's size, sits off the edge, or leaves the name without its label fails                                                          | `audit:swift/Avatar/status`  |
| AR1           | `AvatarTests.swift` naming and trait tests                                                                                                                                                                                                                                  | `alt`, `name`, blank, none                                                            | a wrong name or a named decorative avatar fails                                                                                                              | `audit:swift/Avatar/a11y`    |
| AR5           | `AvatarTests.swift` two-theme renders draw the initials in core's tokens                                                                                                                                                                                                    | default and neutral, light and dark                                                   | initials in tokens other than core's fail                                                                                                                    | `audit:swift/Avatar/look`    |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
