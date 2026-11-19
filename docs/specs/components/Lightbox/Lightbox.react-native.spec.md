---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Lightbox
platform_of: component:Lightbox
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, interaction, motion, accessibility, platform]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# Lightbox (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Lightbox` under its core name with core's `isOpen`, `onOpenChange`, `media`, `index`, `onIndexChange`, `defaultIndex`, `hasZoom` and `hasAutoPlay`. `media` takes an array, and one item is a single view; each item is `src`, `alt`, an optional `caption` and an optional `type` (`image` or `video`). `xstyle` stays web.                                                                                                                   |
| Behavior                | The viewer opens in a full-screen window over the app, on the dark media surface, with a counter, Close, the active item, its caption and, in a gallery, Previous and Next. On a phone it keeps core's touch model: with `hasZoom` a pinch or a double tap zooms, a horizontal drag pages, a drag down or a pinch in closes, and a tap hides the controls; the native zoom pager runs every frame on the UI thread. A video item plays in the platform's video view. |
| End-user impact         | A person views photos full screen and moves through them the way the platform's photo viewer works; Close, Android back and the VoiceOver escape always close it, and each photo is read by its alt text.                                                                                                                                                                                                                                                            |
| Builder impact          | The same Lightbox code runs on the web, iOS and Android; an app passes one item as an array of one.                                                                                                                                                                                                                                                                                                                                                                  |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                       |
| Review checks           | Reject a single-object `media` accepted on React Native, a gesture without its button alternative, a gesture frame run in JavaScript, a video item that does not play, a close that does not reach `onOpenChange(false)`, or a visual prop on the viewer.                                                                                                                                                                                                            |
| Governing rules         | `component:Lightbox`; `family:overlay-dismissal`; `spec:AST-082` FR3, FR4, FR7 and FR11; `spec:AST-093` FR1–FR5.                                                                                                                                                                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Lightbox on React Native is core's full-screen media viewer on a phone: a
photo or a gallery shown edge to edge, zoomed and paged with the fingers, and
closed with a drag down or a button. In this record, "core" is
`component:Lightbox`, and the record states only what React Native adds or
does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component)
- Controlled/uncontrolled behavior: unchanged; `isOpen` is controlled, and the
  index is controlled by `index` or starts from `defaultIndex`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR4 gap: on iOS, `hasZoom` zooms with React Native's scroll view, not the
  zoom pager (`spec:AST-124` FR8): a pinch zooms, but a double tap does not,
  and a horizontal drag does not page.
- FR4 gap: on Android, where the binary lacks the zoom pager, `hasZoom` does
  not zoom.
- FR4 gap: on both platforms, a drag down and a pinch in do not close the
  viewer, a tap on the photo does not hide the controls, and a tap beside the
  photo does not close it (core FR8–FR10).
- FR5 gap: a video item shows a play mark and its alt text in a frame and does
  not play, and `hasAutoPlay` starts nothing.
- FR2 gap: on iOS in light mode, the status bar keeps dark content over the
  dark backdrop.

## Ownership boundary

**Owns**

- Which props React Native offers, and the form of `media` (FR1).
- The viewer's window, parts and index on React Native (FR2, FR3).
- The touch model on a phone, video playback and dismissal (FR4–FR6).
- Base props (FR7) and how VoiceOver and TalkBack read the viewer (AR1–AR4).

**Does not own / non-goals**

- The meaning of Lightbox's props, its parts and its touch model — owned by
  `component:Lightbox`.
- Which closes each surface allows — owned by `family:overlay-dismissal`.
- The zoom pager's native contract — owned by `spec:AST-124` (FR8).
- The video view and its player — owned by `spec:AST-132` (FR7).

## Public concepts

| Concept    | Closed values or states                      | Meaning                                                                            | Availability by variant/orientation/state | Default | Owner                             | Stability    | Invalid-value behavior          |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------------------- | ------------ | ------------------------------- |
| media list | an array of items; one item is a single view | what the viewer shows (FR1)                                                        | always                                    | —       | `component:react-native/Lightbox` | experimental | a single object is a type error |
| item type  | `image`; `video`                             | how an item shows: a zoomable photo, or a video in the platform's video view (FR5) | each item                                 | `image` | `component:Lightbox`              | experimental | another value is a type error   |
| controls   | shown; hidden                                | whether the top bar, caption and arrows show over the photo (FR4)                  | with `hasZoom`                            | shown   | `component:Lightbox`              | experimental | none                            |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                  | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Lightbox`, its name on every platform, and keep core's props, meanings and defaults (`spec:AST-082` FR3). `media` takes an array of items, and an array of one is a single view: a value that is either one record or an array of records is not one of the portable forms (`spec:AST-082` FR4), so core's single-object form stays web. Each item is `src`, `alt`, an optional `caption`, which is content as on the web since React Native runs React (`spec:AST-082` FR4), and an optional `type`. `xstyle` stays web.                                                                                                                                             | `component:Lightbox`; `spec:AST-082` FR3, FR4                          | settled            |
| FR2 | The open viewer MUST fill the screen in a modal window over the app, under the system bars, with Android back as its close request. It is a media surface: its controls and caption take the theme's dark media surface values over an opaque dark backdrop (core FR19), and the status bar shows light content over it.                                                                                                                                                                                                                                                                                                                                                                                         | `component:Lightbox` FR19; `spec:AST-093` FR3                          | verify             |
| FR3 | The viewer MUST show a top bar with the counter (in a gallery) and Close, the active item fitted to the screen, its caption, and in a gallery Previous and Next, which stop at the first and last item (core FR1). The index is controlled by `index` with `onIndexChange`, or starts from `defaultIndex`, and opens on the nearest valid item (core FR17).                                                                                                                                                                                                                                                                                                                                                      | `component:Lightbox` FR1, FR17                                         | verify             |
| FR4 | On a phone, the viewer MUST keep core's touch model (core FR5–FR10): with `hasZoom`, a pinch zooms an image about the fingers, a double tap zooms to the tapped point and back, and a zoomed image pans within its edges with momentum; in a gallery, a horizontal drag pages, and a pan pushed far past a zoomed image's edge turns the page; a drag down on a fitted image, and a pinch in below the fitted size, close the viewer; and a tap on the photo hides and shows the controls, which stay reachable by screen readers. The zoom pager (`spec:AST-124` FR8) drives these on iOS and Android, every frame on the UI thread, and JavaScript hears only the settled page, a zoom, a tap and a dismissal. | `component:Lightbox` FR5–FR10; `spec:AST-124` FR8; `spec:AST-082` FR11 | verify             |
| FR5 | A `video` item MUST play in the platform's video view (`spec:AST-132` FR7) with its native controls, and does not zoom. With `hasAutoPlay`, it starts when it shows; a video paged away from stays paused where it stopped, and shows from there when paged back to (core FR18).                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:Lightbox` FR18; `spec:AST-132` FR7                          | verify             |
| FR6 | Close, Android back, the VoiceOver escape, and the closes FR4 lists MUST call `onOpenChange(false)` (`family:overlay-dismissal`); the viewer leaves when `isOpen` turns false.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:Lightbox`; `family:overlay-dismissal`                       | verify             |
| FR7 | The shared base props MUST attach to the viewer's container (`spec:AST-082` FR7): `id` is its test and native identifier, and `isHidden` removes it from the screen and the accessibility tree. The viewer takes no visual prop; its look comes from the theme's media surface (FR2).                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-082` FR7, DEC-2                                              | verify             |

### Allowed variation

- **AV1 — The platform's video controls.** The video view's own controls and
  their look are the platform's and may change with each OS release.
- **AV2 — Theme paint.** Themes may restyle the controls and caption through
  the media surface without changing behavior.

### Representative states

| State                       | Required invariant                                          | Allowed variation       |
| --------------------------- | ----------------------------------------------------------- | ----------------------- |
| a single image              | no counter, no Previous or Next; Close                      | none                    |
| a gallery at its first item | Previous unavailable; Next pages                            | none                    |
| `hasZoom`, a double tap     | zooms to the tapped point; a second double tap returns      | the zoom's spring       |
| a fitted image dragged down | the viewer closes; `onOpenChange(false)`                    | the exit's motion       |
| a video with `hasAutoPlay`  | it plays when shown; paged away, it pauses where it stopped | the platform's controls |
| Android back                | `onOpenChange(false)`                                       | none                    |

### Transformation and precedence order

- **ORD1 — Index.** `index`, else the current uncontrolled index from
  `defaultIndex`; either clamps to the nearest valid item.
- **ORD2 — Gestures.** On a zoomed image a drag pans; at the fitted size a
  horizontal drag pages and a downward drag closes (core FR6–FR8).

### Performance and resources

- **PR1 — Gestures off the JavaScript thread.** Paging, zoom and pan run in
  the zoom pager on the UI thread; JavaScript hears settled events only
  (`spec:AST-124` FR8).
- **PR2 — Neighbours only.** The pager holds the current item and its
  neighbours, not the whole gallery.

## Accessibility contract

- **AR1 — Media.** Each image is an image element named by its `alt`; a video
  is named by its `alt` and offers the video view's own controls.
- **AR2 — Controls.** Close, Previous and Next are buttons with their names;
  the counter reads the position; the caption is readable text. Hidden
  controls stay in the accessibility tree (core AR5).
- **AR3 — Modal and closing.** While the viewer is open, VoiceOver and TalkBack
  stay inside it; the VoiceOver escape and Android back close it (FR6).
- **AR4 — Alternatives and motion.** Every gesture has a button alternative:
  Previous and Next for paging, Close for the closing gestures (core AR1,
  AR2); under Reduce Motion, the viewer's own moves cross-fade or land at once
  (core AR6).

## Design relationships

| Anatomy or state  | Design requirement                              | Representation authority   | Hierarchy role | Component contract |
| ----------------- | ----------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Media             | the active photo or video, fitted to the screen | prescribed by the platform | prominent      | FR3–FR5            |
| Top bar           | counter and Close on the media surface          | current source             | supporting     | FR3                |
| Caption           | the item's caption under the media              | current source             | supporting     | FR3                |
| Previous and Next | gallery navigation that stops at the ends       | current source             | supporting     | FR3                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): the platform's photo viewer model,
drawn by the zoom pager, and the platform's video view for a video item.
Guideline pages: Images, Gestures and Accessibility in the Apple Human
Interface Guidelines (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the theme's dark media surface values
for the controls, the caption text and its backing, and the motion tokens of
the zoom and page settles.

### Native pieces

| Native piece      | Record             | What this record uses it for                    |
| ----------------- | ------------------ | ----------------------------------------------- |
| `AstryxZoomPager` | `spec:AST-124` FR8 | paging, zoom, pan and the drag-down close (FR4) |
| `AstryxVideoView` | `spec:AST-132` FR7 | a video item's playback (FR5)                   |

## Family and system relationships

- `component:Lightbox` owns the props, parts, touch model and accessibility;
  this record states only what React Native adds or does differently.
- `family:overlay-dismissal` owns which closes the viewer allows.
- `spec:AST-124` owns the zoom pager; `spec:AST-132` owns the video view.

## Verification map

| Contract           | Verification                                                                                        | Representative states                                                                                | Mutation or failure expectation                                                                                          | Audit section                           |
| ------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| FR1                | Type tests against the generated contract; a contract drift test                                    | an array of one and of several; a single object; `xstyle`                                            | a single object or `xstyle` accepted fails                                                                               | `audit:react-native/Lightbox/api`       |
| FR2, FR3, ORD1     | Unit tests through the package's testing doubles; Simulator and emulator captures in light and dark | a single image; a gallery at each end; an index out of range; a caption                              | a missing part, Previous or Next past the ends, a wrong opening item, or dark status bar content over the backdrop fails | `audit:react-native/Lightbox/viewer`    |
| FR4, ORD2, PR1     | Simulator, emulator and device gesture checks with UI-thread frame checks                           | pinch; double tap; pan with momentum; a horizontal drag; a drag down; a pinch in; a tap on the photo | a missing gesture, a JavaScript event per frame, or controls that leave the accessibility tree when hidden fails         | `audit:react-native/Lightbox/touch`     |
| FR5                | Simulator and emulator checks with the video view                                                   | a video with and without `hasAutoPlay`; paging away and back                                         | a video that does not play, a neighbour that keeps playing, or one that restarts from the beginning fails                | `audit:react-native/Lightbox/video`     |
| FR6, AR3           | Unit tests of each close; VoiceOver and TalkBack checks                                             | Close; Android back; the escape; a drag down                                                         | a close without `onOpenChange(false)`, or focus that leaves the open viewer, fails                                       | `audit:react-native/Lightbox/dismissal` |
| FR7, AR1, AR2, AR4 | Unit tests of base props; VoiceOver and TalkBack checks; Reduce Motion checks                       | `id`; `isHidden`; each control; hidden controls; Reduce Motion                                       | an image without its alt, a control without its name, or travel under Reduce Motion fails                                | `audit:react-native/Lightbox/a11y`      |

## Decision log

No component-local decision is recorded. FR1 states the reason for the form
of `media`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
