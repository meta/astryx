---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Thumbnail
platform_of: component:Thumbnail
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: [design:reduced-motion]
architecture:
  [architecture:internationalization, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-086, spec:AST-093, spec:AST-112]
---

# Thumbnail (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Thumbnail` under core's name. It takes core's `src`, `alt`, `label`, `onRemove`, `onClick`, `isLoading`, `isDisabled` and `showRemoveOn` with core's meaning and defaults, and none of the web contract's props (`xstyle`, `className`, `style`, `data-testid`). Its React Native contract adds `fileName`: with no image, the file-type art for that name fills the preview (DEC-3). |
| Behavior                | A 64 dp square preview: the image, a pulsing skeleton, the image under an upload scrim, the file-type art, or a placeholder. The preview is one named element, a button with `onClick`, and Remove is its sibling, so a screen reader reaches both (DEC-1). Remove shows at rest, since a touch screen has no hover.                                                                                        |
| End-user impact         | A person attaching files on a phone sees each one as an image or as its file kind, can open it or remove it with a full touch target, and hears its file name and description.                                                                                                                                                                                                                              |
| Builder impact          | An app passes core's props; a composer that attaches documents passes `fileName` too.                                                                                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                              |
| Review checks           | Reject a web contract prop offered on React Native, a named container that hides Remove from screen readers, a remove press that opens the preview, a hidden Remove on a touch screen, a remove target below the platform's touch target, an open press that runs while loading or disabled, an unnamed open action, a skeleton that moves under Reduce Motion, or a colour that is not a theme token.      |
| Governing rules         | `component:Thumbnail` FR1–FR6 and AR2–AR6; `spec:AST-082` FR3, FR5, FR7 and FR11; `spec:AST-085` FR1; `spec:AST-086` FR8; `spec:AST-093` FR2–FR4; `spec:AST-127` FR4; DEC-1–DEC-3 below.                                                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Thumbnail on React Native is core's preview of an attachment, drawn with React
Native's `Image` and `Pressable`, so a person on a phone opens and removes
attachments with the platform's touch targets and screen readers. It keeps
core's states and words, arranges its parts the way React Native's
accessibility tree needs, and adds the file-type art for an attachment that is
not an image. This record states only what React Native adds to
`component:Thumbnail` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: the package also takes `onPress`, a second input for the press that
  `onClick` owns; with both set, `onClick` does not run.
- FR4 gap: a `src` that fails to load leaves the plate empty instead of
  showing the placeholder.
- FR5 gap: the open action is named by the name alone, without core's "Open";
  with neither `label` nor `alt` it has no name.
- FR6 gap: while loading, a press on the preview still runs `onClick`.
- FR8 gap: a disabled thumbnail draws its preview at full strength; only the
  remove glyph takes the disabled colour.
- FR10 gap: the start of loading is not announced; the busy state is set on
  the preview only.

## Ownership boundary

**Owns**

- Thumbnail's React Native contract and `fileName` (FR1, FR2).
- The frame and the visual states on React Native (FR3, FR4).
- How the preview and Remove sit in React Native's accessibility tree, and
  their names (FR5).
- The open and remove actions, disabled, the label tooltip and the busy state
  on React Native (FR6–FR10).

**Does not own / non-goals**

- The meaning of Thumbnail's props, its states and its words — owned by
  `component:Thumbnail`.
- The file-type art's kinds, glyphs and tones — owned by the file-type art
  component.
- Focusable disabled controls — owned by `spec:AST-085`; busy announcements —
  owned by `spec:AST-086`.
- Icon resolution and drawn glyphs — owned by `spec:AST-127`.
- What `onClick` opens and how attachments upload — owned by the product
  callsite.

## Public concepts

| Concept       | Closed values or states                                                   | Meaning                                                                      | Availability by variant/orientation/state                    | Default     | Owner                              | Stability    | Invalid-value behavior          |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------- | ---------------------------------- | ------------ | ------------------------------- |
| visual state  | skeleton; image under the upload scrim; image; file-type art; placeholder | what the preview shows (FR4, ORD1)                                           | resolved from `src`, `isLoading`, `fileName` and load errors | placeholder | `component:react-native/Thumbnail` | experimental | none                            |
| preview role  | button; image; decorative                                                 | the preview with `onClick`; with a name and no `onClick`; with neither (FR5) | always                                                       | decorative  | `component:react-native/Thumbnail` | experimental | none                            |
| remove reveal | `hover`; `always`                                                         | both show Remove at rest on a touch screen (FR7)                             | with `onRemove`                                              | `hover`     | `component:Thumbnail`              | experimental | any other value is a type error |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                                | Draft review state |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| FR1  | React Native MUST export the component as `Thumbnail`, the name it has on every platform (`spec:AST-082` FR3), and take core's `src`, `alt`, `label`, `onRemove`, `onClick`, `isLoading`, `isDisabled` and `showRemoveOn` with core's names, meaning and defaults, with the base props `id` and `isHidden` on the root (`spec:AST-082` FR7). `id` sets the root's test id and native id. The web contract's props (`xstyle`, `className`, `style`, `data-testid`) are not offered, and using one is a type error. No second input is offered for a concept a core prop owns: `onClick` owns the press (`spec:AST-082` FR7). | `component:Thumbnail`; `spec:AST-082` FR3, FR5, FR7                                  | verify             |
| FR2  | Thumbnail's React Native contract MUST add `fileName`, on iOS and Android alike. With no `src` and not loading, a `fileName` draws the file-type art for that name (its kind's glyph, tone and extension) filling the preview, in place of the placeholder; the art is decorative, and the thumbnail's name says the file. With a `src`, the image wins.                                                                                                                                                                                                                                                                    | DEC-3; `spec:AST-082` FR3, FR5                                                       | verify             |
| FR3  | The preview MUST be core's 64 dp square, fixed at every text size, which no row shrinks: clipped to `radius.element` on `color.neutral`, with an edge at `size.borderWidth` in the border colour. The image covers the square.                                                                                                                                                                                                                                                                                                                                                                                              | `component:Thumbnail` FR1                                                            | verify             |
| FR4  | The preview MUST show, in ORD1's order: with `isLoading` and no `src`, a skeleton in `color.skeleton` that pulses between full and just over half strength once per `motion.slow`, and holds still under Reduce Motion; with `isLoading` and a `src`, the image under a `color.overlay` scrim with a small on-media spinner at its centre; with a `src`, the image; with no `src`, FR2's art for a `fileName`, else the placeholder, a framed picture in `color.iconSecondary`. A `src` that fails to load shows the placeholder, and a changed `src` is tried again (`component:Thumbnail` FR2).                           | `component:Thumbnail` FR2; `design:reduced-motion`                                   | verify             |
| FR5  | The root MUST be a plain container, not an accessibility element, that holds the preview and Remove as siblings (DEC-1). The preview is one element named by `label`, else `alt`, with `alt` as its hint when both are set and differ. With `onClick` it is a button named with core's "Open" message and the name, and core's "Thumbnail" word stands in for a missing name (`component:Thumbnail` FR3, FR4). Without `onClick` it is an image when it has a name, and decorative, hidden from screen readers, when it has none.                                                                                           | DEC-1; `component:Thumbnail` FR3, FR4, AR1, AR2; `architecture:internationalization` | verify             |
| FR6  | With `onClick`, a press on the preview MUST run `onClick`, with the platform's press feedback: the pressed overlay on iOS and the ripple on Android. Keyboard focus draws the theme's focus ring on the preview, its only indicator. While loading or disabled, the preview stays mounted and inert: a press runs nothing, so focus stays on it, and it reads as busy or disabled (`component:Thumbnail` FR4, `spec:AST-085` FR1).                                                                                                                                                                                          | `component:Thumbnail` FR4; `spec:AST-085` FR1                                        | verify             |
| FR7  | With `onRemove`, a 20 dp circle MUST sit `space.s0_5` from the top and end edges, on `color.overlay`, with the `close` icon at `xsm` in `color.onDark` (`spec:AST-127` FR4), named with core's "Remove" message and the name. It is the preview's sibling, so a press on it runs `onRemove` and never opens the preview. Its touch target reaches the platform's (44 pt on iOS, 48 dp on Android) by hit slop around the circle (`spec:AST-082` FR11). Both `showRemoveOn` values show it at rest: a touch screen has no hover, the case core's coarse-pointer rule covers (`component:Thumbnail` FR5).                     | `component:Thumbnail` FR5, AR4, AR6; `spec:AST-082` FR11                             | verify             |
| FR8  | `isDisabled` MUST dim the thumbnail as core does, draw the remove glyph in `color.iconDisabled`, and keep the preview's action and Remove mounted, inert and read as disabled (`component:Thumbnail` FR6, `spec:AST-085` FR1).                                                                                                                                                                                                                                                                                                                                                                                              | `component:Thumbnail` FR6; `spec:AST-085` FR1                                        | verify             |
| FR9  | A `label` MUST be the thumbnail's tooltip: a long press on the preview shows it while the preview has no open action that can act (no `onClick`, or disabled), and lifting the finger hides it. On an openable preview a hold opens it on release, and the label reaches screen readers as the name (DEC-2).                                                                                                                                                                                                                                                                                                                | DEC-2; `spec:AST-082` FR3                                                            | verify             |
| FR10 | `isLoading` MUST mark the preview busy and announce core's "Loading" message once per busy start; the spinner is hidden from screen readers (`spec:AST-086` FR8, `component:Thumbnail` AR3).                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:Thumbnail` AR3; `spec:AST-086` FR8                                        | verify             |

### Allowed variation

- **AV1 — Skeleton motion.** The skeleton pulses its strength on the theme's
  slow motion, where the web's steps; both hold still under reduced motion.
- **AV2 — Platform press feedback.** The ripple on Android and the pressed
  overlay on iOS are the platform's.
- **AV3 — Image content.** Image dimensions vary; the image always covers the
  square.

### Representative states

| State                      | Required invariant                                                                  | Allowed variation   |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| image, named, openable     | one button named "Open" and the label, `alt` as its hint; Remove a separate element | the press feedback  |
| image, no `alt` or `label` | decorative, hidden from screen readers; an open action is named "Open Thumbnail"    | none                |
| no `src`, `fileName` set   | the file-type art fills the preview; decorative                                     | the kind's art      |
| loading, no `src`          | a pulsing skeleton; still under Reduce Motion; an open action inert; busy           | the pulse           |
| uploading                  | the image under the scrim with a hidden spinner; busy announced once                | the spinner         |
| failed `src`               | the placeholder; a new `src` is tried                                               | none                |
| removable, `hover`         | Remove shown at rest; a press removes and never opens                               | none                |
| disabled                   | dimmed; the open action and Remove mounted, inert, read as disabled                 | none                |
| labelled, not openable     | a long press shows the label                                                        | the tooltip's place |

### Transformation and precedence order

- **ORD1 — Visual state.** Loading without `src` (skeleton), then loading with
  `src` (the image under the scrim), then `src` (the image, or the placeholder
  if it failed), then `fileName` (the file-type art), then the placeholder.
- **ORD2 — Name.** `label`, then `alt`, then core's "Thumbnail" for an open
  action; `alt` is the hint when `label` names the preview and differs from it.
- **ORD3 — Press.** A blocked preview (loading or disabled) does nothing;
  otherwise `onClick` runs. Remove runs `onRemove` only.

### Performance and resources

- **PR1 — One animation, only while needed.** The skeleton's pulse runs on the
  native driver, only while the skeleton shows and Reduce Motion is off;
  Thumbnail holds no other timer or listener.

## Accessibility contract

- **AR1 — Reachable parts.** The preview and Remove are separate elements
  inside a container that is not one, so VoiceOver and TalkBack reach both
  (DEC-1).
- **AR2 — Names.** The preview reads its name, `alt` as its hint when both are
  set, and its role; Remove reads "Remove" and the name (FR5, FR7).
- **AR3 — Busy.** Loading is announced once per busy start and set as the
  preview's busy state; the spinner is hidden (FR10).
- **AR4 — Touch targets.** Remove's target reaches 44 pt on iOS and 48 dp on
  Android, though its circle is 20 dp (FR7).
- **AR5 — Disabled and loading.** Both actions stay mounted and focused when
  either state starts, and read as disabled or busy (FR6, FR8).
- **AR6 — Reduced motion.** The skeleton holds still under Reduce Motion
  (FR4).

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Image            | the preview image, cover-fitted in the square            | theme intent             | prominent      | FR3, FR4           |
| File-type art    | the file's kind, glyph and extension, filling the square | theme intent             | prominent      | FR2                |
| Placeholder      | a framed picture when there is no image                  | theme intent             | supporting     | FR4                |
| Skeleton         | a pulse while loading without an image                   | theme intent             | supporting     | FR4                |
| Upload overlay   | a scrim with a spinner while an image uploads            | theme intent             | supporting     | FR4, FR10          |
| Remove button    | a small close control on a scrim, legible over any image | theme intent             | supporting     | FR7                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): React Native's `Image` for the preview
and `Pressable` for the open and remove actions; neither platform has an
attachment preview control. Guideline pages: Image views, Buttons and
Accessibility (VoiceOver, Reduce Motion) in the Apple Human Interface
Guidelines; Image lists and Accessibility in Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.neutral`, `color.skeleton`,
`color.overlay`, `color.onDark`, `color.iconSecondary`, `color.iconDisabled`
and the border colour; `radius.element`; `size.borderWidth`; `space.s0_5`;
`motion.slow`; the focus ring's width, offset and colour; and the
file-type art's tones.

### Native pieces

| Native piece                  | Record             | What this record uses it for                                         |
| ----------------------------- | ------------------ | -------------------------------------------------------------------- |
| React Native `Image`          | React Native core  | loading and drawing the image at `src` (FR3, FR4)                    |
| `Icon` resolution             | `spec:AST-127` FR4 | the `close` glyph on Remove and the file-type art's glyph (FR2, FR7) |
| `AstryxAccessibilitySettings` | `spec:AST-130` FR5 | Reduce Motion for the skeleton (FR4)                                 |

## Family and system relationships

- `component:Thumbnail` owns the props, the states and the words; this record
  states how React Native draws them and arranges them for its screen readers.
- `spec:AST-085` owns focusable disabled controls and `spec:AST-086` owns busy
  announcements; FR6, FR8 and FR10 apply them.
- `architecture:internationalization` owns the catalog behind "Open",
  "Remove", "Thumbnail" and "Loading".
- The file-type art component owns the art `fileName` draws.

## Verification map

| Contract            | Verification                                                                                       | Representative states                                                       | Mutation or failure expectation                                                                              | Audit section                           |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| FR1                 | Type tests of accepted and rejected props; a contract drift test against core's Thumbnail contract | each core prop; each web contract prop; `testID`                            | an offered web prop, a renamed core prop, or a second press input fails                                      | `audit:react-native/Thumbnail/api`      |
| FR2, ORD1           | Unit tests through the package's testing doubles (`spec:AST-112` FR15)                             | `fileName` with and without `src`; loading                                  | a placeholder in place of the art, art over an image, or art that is read aloud fails                        | `audit:react-native/Thumbnail/states`   |
| FR3, FR4            | Unit tests of each state and the frame in two themes; a test with Reduce Motion on                 | skeleton; uploading; image; failed `src`; changed `src`; placeholder        | a wrong state, a moving skeleton under Reduce Motion, a failed image left blank, or a frame that grows fails | `audit:react-native/Thumbnail/states`   |
| FR5, AR1, AR2, ORD2 | VoiceOver and TalkBack checks; unit tests of names, roles and hints                                | label and alt; each alone; neither; with and without `onClick`; with Remove | a named container, an unnamed open action, a wrong word, or Remove hidden behind the preview fails           | `audit:react-native/Thumbnail/a11y`     |
| FR6, FR8, ORD3      | Unit tests of press, loading and disabled                                                          | openable; loading; disabled; focused                                        | a press that runs while loading or disabled, an action that unmounts, or a lost disabled or busy state fails | `audit:react-native/Thumbnail/behavior` |
| FR7, AR4            | Unit tests of Remove and the touch-target audit; Simulator and emulator captures                   | `hover`; `always`; disabled                                                 | a hidden Remove, a remove press that opens, or a target below the floor fails                                | `audit:react-native/Thumbnail/behavior` |
| FR9                 | Unit tests of the long press                                                                       | labelled, not openable; openable; disabled                                  | a tooltip that blocks an open press, or none on a preview that cannot open, fails                            | `audit:react-native/Thumbnail/a11y`     |
| FR10, AR3           | Announcement tests                                                                                 | a busy start; a second render while busy                                    | no announcement, or one per render, fails                                                                    | `audit:react-native/Thumbnail/a11y`     |
| PR1                 | Unit tests of the pulse's lifetime                                                                 | skeleton shown and gone; Reduce Motion                                      | an animation that runs without the skeleton or under Reduce Motion fails                                     | `audit:react-native/Thumbnail/behavior` |

## Decision log

### DEC-1 — The preview is the named element; Remove is its sibling

**Reference:** `component:react-native/Thumbnail/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

On iOS and Android an accessibility element hides the elements inside it, so a
named container would hide Remove from VoiceOver and TalkBack. The preview
therefore carries the thumbnail's name, and the container that holds it and
Remove is not an element; a screen reader reaches the preview, then Remove.
The file name names the preview, and the image's description follows as its
hint, the way both screen readers read a control's extra words.

### DEC-2 — A hold never competes with a tap

**Reference:** `component:react-native/Thumbnail/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A touch screen has no hover, so the label tooltip shows on a long press. Where
the preview opens, a hold opens it on release, as a tap does, so a press never
does two things; the label still reaches screen readers as the name.

### DEC-3 — An attachment that is not an image shows its file kind

**Reference:** `component:react-native/Thumbnail/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A composer attaches documents as well as photos. With `fileName` and no image,
the preview shows the file-type art for that file, so a PDF or a spreadsheet
reads as one at a glance instead of as an empty picture.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
