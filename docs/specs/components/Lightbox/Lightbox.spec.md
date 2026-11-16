---
schema_version: 3
template_version: 3
kind: component
id: component:Lightbox
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, interaction, theming, accessibility]
verified_by:
  [
    packages/core/src/Lightbox/Lightbox.test.tsx,
    packages/core/src/Lightbox/LightboxKeyboard.a11y.browser.spec.ts,
    packages/core/src/Lightbox/LightboxViewport.a11y.browser.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-020, spec:AST-086, spec:AST-094]
---

# Lightbox component contract

## Intent

Lightbox presents one active image or video in a full-viewport viewer and may
add gallery navigation, a caption, and a position counter. On a touch screen it
behaves like a native photo viewer: a person pinches and double-taps to zoom,
swipes between items, drags a photo down or pinches it in to close, and taps to
hide the controls. Every gesture has a button, key, or single-pointer
alternative, so keyboard, screen-reader, and single-pointer users reach the
same actions. A gallery may also hold the caller's own content as items. Each
item may bring a title and actions to the viewer's top bar, and a footer holds
a filmstrip or a zoom control that a page adds through its own import.

## Compatibility and migration

- Released default preserved: `no`. Under a coarse primary pointer the touch
  presentation (FR5–FR10) and the touch exit (FR16) are the default
  (`spec:AST-094` FR13). Under a fine pointer a mouse or pen drag pages and
  closes the viewer, a ctrl-wheel or trackpad pinch over the photo zooms the
  photo instead of the page, a trackpad's scroll pans a zoomed photo, and a
  double-click
  zooms 2× about the clicked point instead of the centre (FR11). Preserved: a
  click on the photo keeps the controls, the viewer opens at once under every
  pointer and closes at once under a fine pointer, keyboard zoom stays 2× about
  the centre, and video playback and controls are unchanged; a drag on a video
  item's frame pages (FR7)
- Compatibility class: additive behavior, released in three kinds under
  `spec:AST-017`. `[fix]` under FR53, as accessibility conformance: Tab
  containment (FR4), the double-click about the clicked point (AR2), the `0`
  key (AR3), and position and zoom announcements delivered inside the open
  viewer with the zoom level (AR4). `[feat]`: the touch presentation and touch
  exit (FR5–FR10, FR16) and the fine-pointer gestures (FR11), which are named
  cross-device consistency under FR59 and need fine-pointer evidence before and
  after. `[experimental]`: the thumbnail transition and `experimental.sourceFor`
  (FR12, FR21)
- Controlled/uncontrolled behavior: unchanged; a swipe reports through
  `onIndexChange`, and a controlled `index` the caller refuses springs back
- Migration decision: none required. `hasZoom={false}` turns off FR6, FR9, and
  FR10 (FR13)
- Item model and chrome (FR20–FR31): additive `[feat]`. `media` takes
  `LightboxItem`, a photo, a video or a custom item; every existing value keeps
  its meaning. Two observable changes reach existing callers. A consumer
  `onKeyDown` that prevents the default of a gallery or zoom key skips that
  shortcut. An arrow key with a modifier, during IME composition, or on a
  field, a select, a video, or an audio element does not page (AR3)
- Failed image (FR26): `[fix]`. An image that fails shows a line that it could
  not load instead of the browser's broken image

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The shipped Lightbox does not yet meet every requirement below. Each gap names
the requirement it misses and the person it affects.

- **Touch presentation (FR9, FR10, FR12).** On a touch screen there is no
  pinch to close, tap to hide the controls, or thumbnail transition.
- **Drag to close (FR8).** Implementation gap: the close is reported when the
  photo has left the screen, about 0.3–0.5 s after the lift, until the shared
  exit hold lets the viewer stay up after a reported close.
- **Paging motion roles (FR5).** The page settle plays the pager's own UIKit
  values, which the motion role table does not list as roles.
- **Video controls (FR7).** A video's native controls are taken as a 48 px
  band at its bottom edge, since browsers expose no control geometry; a
  browser that places controls elsewhere pages from them.
- **Zoom announcement (AR4).** A zoom change announces "zoomed in" or "zoomed
  out" without the zoom level.
- **Fine-pointer gestures (FR11).** FR11's drag paging (FR7) and drag to
  close (FR8) are not built for a mouse, a pen or a trackpad: a drag on a
  fitted photo does nothing.
  On a desktop, a click in the viewer outside the photo and a band holding a caption closes it.
  With zoom, a double-click on a caption zooms the photo, and a mouse does not select the caption's text, for one photo or a gallery.
- **Double-click listener (FR14).** A mouse's or a pen's double-click reaches
  the zoom through the stage's own `dblclick` listener, since only the browser
  knows the system's double-click speed.
- **Press tracker (FR14).** The viewer's own `pointerdown` handler records
  each press's pointer type and point, which the browser's `dblclick` and
  `click` do not carry, and clears the flag a drag leaves for its click.
- **Touch exit (FR16).** On a touch screen the viewer disappears at once when
  it closes.
- **Items, chrome and opt-ins (FR20–FR31, ORD4, AR3, AR4, AR10, PR3).**
  Implementation gap: Lightbox takes photos and videos only. It has no Title,
  actions or Footer, no gallery or zoom values, no failed-image line, no
  loader or drag-out, no per-item boundary, and no `finalFocusRef`. An arrow
  key pages from a field, a video or an audio element and with a modifier
  held.
- **Backdrop press (`family:overlay-dismissal` FR10).** A press that starts on
  the photo and ends beside it closes the viewer.

## Ownership boundary

**Owns**

- The Viewer overlay and its current `lightbox` target.
- Media presentation, optional Caption and Counter placement, gallery
  navigation, image zoom and pan, the touch presentation (FR5–FR12), and the
  touch exit (FR16).
- The accessible alternative for every gesture it presents (AR1–AR8).
- The custom item's frame and the boundary between its content's input and the
  viewer's gestures and keys (FR20, FR21, ORD4, AR3); the Title, the action
  controls and the Footer's place (FR22–FR24); the failed-image line and the
  per-item boundary (FR26, FR30).

**Does not own / non-goals**

- The Close, Previous, and Next button surfaces — delegated to
  `component:Button` through IconButton.
- Caller-provided Caption content.
- A custom item's content and its own input, an action's effect, the Footer's
  content, a loader's URLs, and the file a drag carries.
- An editing stage inside the viewer: an app's editor opens as its own layer.
- A page-width mode for tall images: DEC-1's photo viewer fits every image.
- New targets for Media, Caption, or Counter; none exist.
- Shared layer hosting or dismissal policy — owned by
  `architecture:layer-runtime` and `family:overlay-dismissal`.
- Touch physics, measured values, and motion roles' values — owned by
  `spec:AST-094` and its measured motion table.

## Public concepts

`experimental.sourceFor` is an experimental option inside the `experimental`
prop object (`spec:AST-017` FR21). The stable concepts below are new; consumer
props and usage are documented in `Lightbox.doc.mjs`.

- `LightboxItem`: what `media` takes, a `LightboxMedia` or a
  `LightboxCustomItem` (`{type: 'custom', content, label}`), each with optional
  `caption`, `title`, `subtitle`, `thumbnail` and `actions` (FR20, FR22–FR25).
  An image also takes `initialZoom` (FR27).
- `LightboxAction`: an action's config, a `label` and an `icon` with an
  optional `href`, `download`, and `onActivate` (FR23).
- `footer`: the Footer part's content (FR24).
- `useLightboxGallery()` and `useLightboxZoom()`: values and methods for the
  Footer's content, from `@astryxdesign/core/Lightbox` (FR24).
- `LightboxFilmstrip` and `LightboxZoomControl`, each from its own import
  (FR25).
- `loader={createLightboxLoader(…)}` and `dragOut={createLightboxDragOut(…)}`,
  each from its own import (FR28, FR29).
- `finalFocusRef`: where focus returns on close, as BottomSheet's prop of the
  same name (FR31).

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                        | Draft review state          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| FR1  | The viewer contains one active Media item and a Close button; galleries additionally contain Previous and Next buttons plus a Counter, and Caption renders only when supplied. In a gallery with any caption, every page keeps a band two caption lines tall under its Media, with the caption's backing only where the page has a caption. A longer caption's second line ends in a "more" action that opens it in full over the bottom of the Media, on a scrim. The full caption is always the viewer's accessible description. The caption band uses Astryx parts: the caption text is `Text` with the body type, not a hand-styled element. The caption's more/less toggle is an inline link-styled action that flows with the caption text (component:Link's button form), with aria-expanded and aria-controls. | Current source, docs, and tests              | settled                     |
| FR1b | A single captioned item, a photo or a video, and a gallery present the caption the same way: the same plate, width, text treatment, inline "more", spacing and photo position, and no plate when there is no caption. (Owner direction, Nov 6 2026 (Cindy): the single-photo caption behaved differently from the gallery's, and "they really should be consistent".) Exceptions: a single photo has no Previous or Next button, no Counter and no paging, since there is no other item; and a drag past a zoomed single photo's edge rubber-bands and returns (FR6), where a gallery's touch pager takes it (FR7).                                                                                                                                                                                                    | Owner direction, Nov 6 2026                  | settled                     |
| FR2  | Viewer overlay carries the current `lightbox` target. Media, Caption, and Counter carry no Lightbox public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and public docs               | settled                     |
| FR3  | Close, Previous, and Next button surfaces use Button's `button` target through IconButton rather than Lightbox-owned button targets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and target docs               | settled                     |
| FR4  | The open viewer is a focus region through Core's shared focus-region module (`component:Dialog/DEC-2`): Tab from its last control moves focus to its first and Shift+Tab from its first moves focus to its last, so focus never leaves the viewer for the browser's own interface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:Dialog/DEC-2`                     | settled; implementation gap |
| FR5  | Under a coarse primary pointer, after hydration, Lightbox presents FR6–FR10 with no opt-in. Lightbox's main interaction is a gesture, so every move in them (the zoom settle, a double tap's zoom, the page settle, the dismissal, a cancelled drag's return and the pinch close) is a spring on a named motion role read through the motion role table, never a literal, and a release starts at the gesture's velocity; the controls fade is companion motion on the pace of the main spring (`spec:AST-094` FR45). The dismissal plays Photos' measured springs, on the roles the Motion section lists (`spec:AST-094` FR4). Under reduced motion they follow AR6.                                                                                                                                                  | `spec:AST-094` FR4, FR13                     | settled; implementation gap |
| FR6  | With `hasZoom`, on an image, a pinch zooms about the fingers and pans while it zooms; past the minimum or maximum the photo resists and eases back without overshoot. A double tap zooms to the larger of filling the viewer and 2×, about the tapped point; a second double tap returns to the fitted size. A zoomed photo pans with momentum and rubber-band edges. A pinch on the controls or the caption still zooms the page.                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-094` FR3, FR10                     | settled; implementation gap |
| FR7  | In a gallery, a horizontal drag moves the row of items, which sit apart by the measured gap. The release lands on at most one neighbouring item by `spec:AST-094` FR3's paging rule (DEC-25). Paging applies over a video item's frame as over a photo; a drag that starts on the video's own controls, such as its scrubber or volume, stays the video's. A zoomed photo pans to its edge before a new drag pages. A pinch never pages. Previous, Next, and the arrow keys keep paging. A controlled `index` the caller refuses springs back. `onIndexChange` reports a swipe.                                                                                                                                                                                                                                        | `spec:AST-094` FR3, FR14, FR36–FR39, DEC-25  | settled; implementation gap |
| FR8  | On a fitted image, a downward drag moves the photo with the finger, shrinks it, and fades the backdrop. The release decides once: a projected travel past the commit point closes the viewer and reports `onOpenChange(false)` at the lift; a release moving back springs back. Video is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-094` FR4, FR36–FR40, FR45          | settled; implementation gap |
| FR9  | With `hasZoom`, a pinch in from the fitted size is a release decision: below the measured fraction of the fitted size the release closes the viewer; opening the fingers again by the measured amount before the lift is moving back and cancels. A pinch that starts zoomed in never closes the viewer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-094` FR36, FR37                    | settled; implementation gap |
| FR10 | With `hasZoom`, under a coarse pointer only, a tap on the photo fades the controls and caption and darkens the backdrop. While they are hidden, the next tap on the photo, a tap beside the photo, or a cancelled drag brings them back, and that tap beside the photo does not close the viewer (ORD3). AR5 governs keyboard and assistive-technology access while they are hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `architecture:public-component-api` INV16    | settled; implementation gap |
| FR11 | A mouse, a pen, and a trackpad also use FR7's drag paging, FR8's drag to close, a ctrl-wheel or trackpad pinch over the photo for FR6's zoom and FR9's close, and a trackpad's scroll to pan a zoomed photo; a mouse wheel's notches leave it in place (`spec:AST-094` FR43); over the photo these replace the browser's page zoom and scroll. A double-click zooms 2× about the clicked point. A click on the photo keeps the controls, and the viewer opens and closes at once.                                                                                                                                                                                                                                                                                                                                      | `spec:AST-094` FR43; `spec:AST-017` FR59     | settled; implementation gap |
| FR12 | Inside `experimental` only, under a coarse pointer, the photo grows out of its source when the viewer opens, and returns into it when it closes, on springs, `springs.settle` unless the motion table names another role, since Lightbox's main interaction is a gesture (`spec:AST-094` FR7, FR45): the element `experimental.sourceFor(index)` returns, else the opener when it shows a picture. A close reports `onOpenChange(false)` at the request; the viewer stays only until the photo lands. Pointer input during the entrance is held; keys and assistive technology stay live. Without `experimental`, opening is unchanged and closing plays FR16.                                                                                                                                                         | `spec:AST-017` FR21; `spec:AST-094` FR35     | settled; implementation gap |
| FR13 | `hasZoom={false}` turns off FR6, FR9, and FR10. FR7 and FR8 add to the buttons, keys, and Escape and remove none of them, so Lightbox takes no `presentation` prop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:public-component-api` INV16    | settled                     |
| FR14 | Gestures, paging, motion, and reduced motion run through Core's one shared set of internal touch modules; Lightbox bundles no copy of a module's primitive and adds no gesture listener outside them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `architecture:react-component-runtime` INV13 | settled; implementation gap |
| FR15 | Lightbox supports a Picture-in-Picture window as its only second document; there it ranks Escape and platform close among that window's members.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `family:overlay-dismissal` FR8               | settled                     |
| FR16 | Under a coarse primary pointer, a close that is not a drag down (FR8), a pinch in (FR9), or a return into a source (FR12) plays the touch exit: Close, Escape, a platform close, and a tap beside the photo while the controls are shown (ORD3). The photo shrinks a little and fades out in place with the backdrop and controls, as the native viewer's zoom transition does without a source, on a spring from rest, `springs.settle` unless the motion table names another role, with the backdrop and controls fading on its pace (`spec:AST-094` FR7, FR45). `onOpenChange(false)` reports at the request, and the viewer takes no input while the exit plays. Under a fine pointer the viewer closes at once (FR11).                                                                                            | `spec:AST-094` FR7                           | settled; implementation gap |
| FR17 | For any `index`, controlled or default, the viewer opens on the nearest valid item: below 0 the first, past the last the last. A fraction rounds to the nearest item, and NaN opens the first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests                     | settled                     |
| FR18 | In a gallery, a video on a neighbouring page stays mounted and paused while another item shows. Paging back to it shows it where it stopped, as the platform photo viewer does: paused, or playing on from there with `hasAutoPlay`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                     | settled                     |
| FR19 | The viewer is a media surface: it renders inside `MediaTheme` (dark), so its controls and caption take the theme's dark surface tokens and the active theme's component rules (`architecture:theme-application` INV8), with no Lightbox-owned colors beyond AR9's backing, the caption's backing and the on-dark color.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Specs decision, Nov 5 2026                   | settled                     |
| FR20 | `media` also takes custom items, `{type: 'custom', content, label}`, mixed with photos and videos in any order. They share one gallery index, the Counter, Previous and Next, a controlled `index`, dismissal and scroll lock. A custom item renders its `content` in the media's place inside `MediaTheme` (FR19), and its `caption` renders like any other. It has no zoom, pan, pinch close, or tap that hides the controls (FR6, FR9, FR10). `useLightbox` takes the same items.                                                                                                                                                                                                                                                                                                                                   | DEC-6                                        | proposed                    |
| FR21 | Paging (FR7) and drag to close (FR8) apply over a custom item's frame as over a fitted photo, for every pointer FR11 names. A drag that starts on the content's own controls stays the content's, as a drag on a video's controls does (FR7). Such controls include a field, editable text, a slider, a button, and a link. A drag that starts in content that scrolls along the drag's axis scrolls that content to its edge. Only a new drag from the edge pages or closes (ORD4). Before the shared touch modules load, a custom item pages and closes as a photo does then. Previous, Next, the keys, Close, Escape, and the backdrop work, and a drag neither pages nor closes. Its content's own controls work from the first render.                                                                            | DEC-7                                        | proposed                    |
| FR22 | An item's `title` shows in the Title part at the top of the viewer, with its `subtitle` after it in a quieter ink, on the controls' backing (AR9). While the item is active, `title` names the dialog (AR4). An item with no `title` shows no Title part. The Title part fades and returns with the controls (FR10). When the top bar is narrow, the subtitle hides first, and then the title ends in an ellipsis. Close and the actions keep their size and order.                                                                                                                                                                                                                                                                                                                                                    | DEC-8                                        | proposed                    |
| FR23 | An item's `actions` are config entries, `{label, icon, href?, download?, onActivate?}`, which Lightbox renders in order as its own controls in the Actions part beside Close: a button that calls `onActivate`, or with `href` a link that also calls it. A link with `download` downloads; one without opens in a new tab with no referrer. Each control is Close's size, delegates to Button through IconButton (FR3) and fades with the controls (FR10). An item shows at most three actions: Lightbox renders the first three and warns in development about the rest.                                                                                                                                                                                                                                             | DEC-8                                        | proposed                    |
| FR24 | The Footer part renders the caller's `footer` at the foot of the viewer, under the caption band, inside `MediaTheme`. The fitted media leaves room for it, and it fades and returns with the controls (FR10). Its content reads the gallery through `useLightboxGallery()`: the items, the active index, and `setIndex`, which moves as Previous and Next do. It reads the zoom through `useLightboxZoom()`: the settled scale, whether it can zoom in or out, and `zoomIn`, `zoomOut` and `reset`, which act as `+`, `-` and `0` do (AR3). Both hooks return values and methods only (`spec:AST-107` DEC-1).                                                                                                                                                                                                          | DEC-9                                        | proposed                    |
| FR25 | `LightboxFilmstrip`, from its own import, shows each item's `thumbnail`, or an image's `src`, as a tile in the Footer; a pick moves to that item. `LightboxZoomControl`, from its own import, shows zoom out, the zoom level, zoom in and back to fit, each disabled where `useLightboxZoom()` says it cannot act, as for a video or a custom item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-9                                        | proposed                    |
| FR26 | An image item whose source fails to load shows, in the media's place, a localized line from the i18n catalog saying it could not load, while its Title and actions stay. It does not zoom. Showing the item again, by paging back or reopening the viewer, loads its source again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DEC-11                                       | proposed                    |
| FR27 | An image item with `initialZoom: 'width'` opens zoomed to the viewer's width at its top, as if zoomed there by hand, up to the maximum zoom: it pans vertically (ORD1), a double tap, a double-click or `0` returns it to the fitted size (FR6, AR3), and it closes by a drag only from that size (ORD2). Without `hasZoom` it opens fitted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DEC-12                                       | proposed                    |
| FR28 | With `loader={createLightboxLoader({resolve, subscribe, onLoad, onError})}`, from its own import, Lightbox loads each image from the URL `resolve(item)` returns, which may resolve later. It resolves again whenever `subscribe` reports a change, `onLoad(item, image)` reports the loaded image element, and `onError(item)` reports a failure. After a failure Lightbox resolves once more: a different URL loads, and the same URL shows FR26's line.                                                                                                                                                                                                                                                                                                                                                             | DEC-10                                       | proposed                    |
| FR29 | With `dragOut={createLightboxDragOut(fileFor)}`, from its own import, a mouse or pen drag that starts on the Title part carries the active item's file, as `fileFor(item)` names it (a URL, a name and a type), to the desktop as far as the browser's drag supports. A drag on the photo never starts it (DEC-2) and a finger never does. An item with a file also offers a download action (AR2).                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-10                                       | proposed                    |
| FR30 | When a custom item's content throws while it renders, the item shows FR26's line in its place; the Title, the actions, Close and paging stay. Showing the item again renders its content anew. The boundary is Lightbox's own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-11                                       | proposed                    |
| FR31 | With `finalFocusRef`, as BottomSheet takes it, the viewer returns focus on close to that ref's element, read at the close, when it is connected and can receive focus; otherwise focus returns as AR3 says. It suits an opener that can remount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `family:overlay-dismissal` AV1               | proposed                    |

### Motion

A drag down that closes the viewer plays Photos' measured dismissal springs.
Each is a motion role, so the exit plays at the theme's tempo, as every other
move in the viewer does. At tempo 1 it plays the values below exactly (FR5,
`spec:AST-094` FR4). Every other spring a gesture drives, a cancelled drag's
return included, plays `springs.settle`.

| Spring                                    | Value                                   | Platform source                                                                                                                  |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `zoomMedia.dismiss.dismissPositionSpring` | Mass 1, stiffness 918.09, damping 60.60 | Photos, iOS 26.2 simulator, iPhone 17 Pro: a committed drag to dismiss, the zoom view's position animation (`CASpringAnimation`) |
| `zoomMedia.dismiss.dismissSizeSpring`     | Mass 1, stiffness 947.14, damping 61.55 | Photos, iOS 26.2 simulator, iPhone 17 Pro: the same dismissal's bounds and opacity animations (`CASpringAnimation`)              |

### Allowed variation

- **AV1 — Media mode.** Media may be an image, a video, or a custom item; zoom,
  pan, pinch to close, and the tap that hides the controls are available only
  on images, and drag down to close on images and custom items (FR21). Paging
  applies to all three (FR7, FR21).
- **AV2 — Gallery mode.** Previous, Next, and Counter are absent for a single
  item. Navigation button disabled state follows the current gallery boundary.
- **AV3 — Caption content.** Caller-provided Caption content may vary without
  becoming a Lightbox-owned target.
- **AV4 — Measured values.** Thresholds, gaps, commit points, and timings may
  change with the measured motion table without changing this record.
- **AV5 — Chrome content.** An item's title, subtitle and actions, and the
  Footer's content, vary with the caller without becoming Lightbox-owned
  targets.

### Representative states

| State            | Required invariant                                                                      | Allowed variation                             |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Single image     | Viewer overlay, Media, and Close button render.                                         | Caption and zoom may be absent or present.    |
| Gallery boundary | Both navigation buttons and Counter remain rendered.                                    | Previous or Next is disabled at its boundary. |
| Video            | Media renders native video controls without image zoom interaction.                     | Autoplay follows the existing consumer prop.  |
| Captioned media  | Caption shows in the band under the active Media's page, for one item or a gallery.     | Caption content remains caller-provided.      |
| Zoomed image     | A double tap or double-click, `-`, or `0` returns to the fitted size.                   | The zoom level and pan position.              |
| Controls hidden  | Controls stay focusable and in the accessibility tree; focus or a key brings them back. | Backdrop shade while hidden.                  |
| Custom item      | Its content shows in the media's place; it pages and closes by drag (FR21).             | Content, label and caption.                   |
| Failed image     | FR26's line shows in the image's place; the Title and actions stay.                     | The line's wording per locale.                |

### Transformation and precedence order

- **ORD1 — Zoom before paging.** A drag on a zoomed photo pans it until the
  photo's edge; only a new drag from that edge pages (FR7).
- **ORD2 — Fitted size before closing.** A drag down or a pinch in closes the
  viewer only from the fitted size (FR8, FR9).
- **ORD3 — Hidden controls before closing.** While the controls are hidden, the
  first tap beside the photo only brings them back; only while they are shown
  does a tap beside the photo close the viewer (FR10, FR16).
- **ORD4 — Content before paging and closing.** A drag that starts on a custom
  item's own controls stays the content's. One that starts in content that
  scrolls along its axis scrolls it to its edge; only a new drag from the
  edge pages or closes (FR21).

### Performance and resources

- **PR1 — Settles survive a busy page.** Zoom, page, dismiss, and transition
  settles keep moving while the main thread is busy (`spec:AST-094`).
- **PR2 — The caption's measurement is Lightbox's own.** The open caption's
  line count and the toggle's inline place are Lightbox's own measurement:
  `useTruncation` reports only whether a clamped block overflows, and no
  shared engine counts an unclamped block's laid-out lines or places an
  inline float beside its last line, so `architecture:react-component-runtime`
  INV19's shared engines do not fit.
- **PR3 — Opt-ins cost nothing where unused.** `LightboxFilmstrip`,
  `LightboxZoomControl`, the loader and drag-out reach Lightbox only through
  their own imports (`architecture:component-import-boundaries` INV7). A page
  that renders Lightbox without one of them carries at most 0.3 KB gzip of its
  wiring (INV10).

## Accessibility contract

Every expectation below cites its WCAG 2.2 Level A or AA success criterion
under `spec:AST-020` FR1; reduced motion cites `design:reduced-motion`.

- **AR1 — Every multipoint or path gesture has a single-pointer alternative
  (WCAG 2.2 2.5.1).** Pinch zoom has the double tap or double-click (FR6,
  FR11); swipe paging has the Previous and Next buttons (FR7); drag down and
  pinch in to close have the Close button (FR8, FR9).
- **AR2 — Every drag has a non-drag alternative (WCAG 2.2 2.5.7).** Drag to
  close has the Close button; drag paging has the Previous and Next buttons; a
  zoomed photo's pan has the double tap or double-click, which returns to the
  fitted size, and a double tap or double-click on a point, which zooms in about
  that point (FR6, FR11).
- **AR3 — Keyboard operation (WCAG 2.2 2.1.1, 2.1.2, 2.4.3).** Escape closes
  the viewer. ArrowLeft and ArrowRight page in the logical direction, so in a
  right-to-left page ArrowLeft moves to the next item. With `hasZoom`, `+` zooms
  in, `-` zooms out, and `0` returns to the fitted size; while zoomed, the arrow
  keys pan the photo. A key whose target is inside a custom item's content, a
  field, a select, editable text, or a video or audio element belongs to that
  element: Lightbox does not page, zoom, pan, or prevent its default. The arrow
  and zoom keys do nothing with Ctrl, Alt, or Meta held or during IME
  composition. A consumer `onKeyDown` runs before these shortcuts, and when it
  prevents the default, Lightbox skips its shortcut
  (`architecture:public-component-api` INV7). Focus stays inside the viewer
  (FR4), and on close returns to `finalFocusRef`'s element when the caller sets
  it (FR31), else
  to the element that opened the viewer when that element is still connected and
  can receive focus (`family:overlay-dismissal` AV1). Paging away from a
  focused "more" or "less" moves focus to the new page's photo, or to Close
  when the photo has no zoom.
- **AR4 — Screen-reader semantics and announcements (WCAG 2.2 1.1.1, 4.1.2,
  4.1.3).** The viewer is a modal dialog named by the active item's `title`,
  else its `alt` or a custom item's `label`, or a localized "Media viewer" when
  it has none. Every photo and video requires `alt`, which reaches the image's
  alternative text or the video's accessible name; a custom item requires
  `label`, which takes the place of `alt` in announcements. Moving to
  another item in an open viewer, by button, key, or swipe, announces the item
  and its position ("<alt>, 3 of 12") once, through the `spec:AST-086` FR14
  route. Every zoom change, by any input, announces the new zoom level once when
  it settles, or that the photo is back at its fitted size.
- **AR5 — Hidden controls stay reachable (WCAG 2.2 2.1.1, 2.4.11, 4.1.2).**
  FR10 hides the controls visually only: they stay focusable and in the
  accessibility tree. Focus reaching a control, from the keyboard or from
  assistive technology, and any key press inside the viewer bring them back. A
  zoom from the keyboard never hides them.
- **AR6 — Reduced motion (`design:reduced-motion` DR1–DR3).** Under reduced
  motion, the thumbnail transition, the touch exit, the page settle, the dismiss
  and pinch-close settles, and the controls fade change opacity only and finish
  within 200 ms when the primary pointer is coarse or when the release of a
  touch drag starts them (DR2), including a mouse, pen, or trackpad release
  where the primary pointer is coarse (`spec:AST-094` FR43). Otherwise they
  complete at once (DR3). The momentum coast of a thrown zoomed photo is direct
  movement and continues (DR2). These motions read the named motion roles (FR5), which carry the
  reduced-motion path.
- **AR7 — Focus visible and not obscured (WCAG 2.2 2.4.7, 2.4.11).** Every
  focusable control and the zoom target show the shared focus indicator. A
  focused control is never hidden by FR10 (AR5), and the caption or counter
  never covers it.
- **AR8 — The page keeps its own zoom (WCAG 2.2 1.4.4).** A pinch on the
  controls or the caption zooms the page, so their text stays resizable (FR6).
- **AR9 — The controls keep their contrast over a zoomed photo (WCAG 2.2
  1.4.3, 1.4.11).** With `hasZoom`, a photo can lie under Close, Previous,
  Next, and the Counter, so each sits on a translucent backing: the buttons
  keep 3:1 and the Counter's text 4.5:1 over any photo content beneath them.
  In a zoomable Lightbox, Close, Previous, Next and the Counter sit on
  Lightbox's own backing, and their icons and text use the on-dark colour, so
  a theme's restyling of these controls can't remove their contrast over a
  photo. Without `hasZoom`, the controls have no backing.
- **AR10 — The chrome's controls are named and reachable (WCAG 2.2 1.1.1,
  2.1.1, 4.1.2).** Each action's `label` is its accessible name and its
  tooltip, and an action with `href` is a link. The actions and the Footer's
  controls are in the viewer's focus region (FR4) and stay reachable while
  hidden (AR5). In `LightboxFilmstrip` each tile is a button named by its
  item's `title`, `alt`, or `label`, and the active tile is marked current.
  `LightboxZoomControl`'s buttons name their action, and its zoom changes
  announce once, as AR4 says. FR26's line is text in the item's place.

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority       | Hierarchy role    | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Viewer overlay   | Presents the full-viewport dialog and surrounding overlay treatment. | Current source and public docs | Supporting        | FR1, FR2           |
| Media            | Presents the active image, video, or custom item's content.          | Current source and public docs | Prominent         | FR1, FR2, FR20     |
| Close button     | Provides the persistent viewer dismissal action.                     | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Previous button  | Moves gallery presentation to the preceding item.                    | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Next button      | Moves gallery presentation to the following item.                    | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Caption          | Presents caller-provided context below the active Media.             | Current source and public docs | Context-dependent | FR1, FR2           |
| Counter          | Presents current gallery position and total.                         | Current source and tests       | Supporting        | FR1, FR2           |
| Title            | Presents the active item's title and subtitle in the top bar.        | DEC-8                          | Supporting        | FR22, AR4          |
| Action buttons   | Present the active item's actions beside Close.                      | `component:Button`             | Supporting        | FR23, AR10         |
| Footer           | Holds the caller's filmstrip or zoom control at the viewer's foot.   | DEC-9                          | Supporting        | FR24, FR25         |
| Reduced motion   | `design:reduced-motion/DR1`–`DR3`                                    | prescribed                     | Supporting        | AR6                |

Media, Caption, and Counter are stable visible parts, but no current public
target reaches them. Their `none` dispositions record factual reachability, not
a decision that they must remain unthemeable. The theming map lists the parts
that the component's consumer docs name.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Viewer overlay": {"target": "lightbox"},
  "Media": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the active image or video"
    }
  },
  "Close button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Previous button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Next button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Caption": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the caption container"
    }
  },
  "Counter": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the gallery counter"
    }
  }
}
```

## Family and system relationships

- `spec:AST-094` owns touch physics, release decisions, measured values, and
  motion roles; this record names which gestures Lightbox presents and when.
- `spec:AST-017` owns experimental isolation (FR21) and fine-pointer
  preservation (FR59); FR11 and FR12 apply them.
- `spec:AST-020` owns the WCAG 2.2 A and AA baseline AR1–AR5, AR7, and AR8 cite.
- `spec:AST-086` owns how position and zoom announcements are delivered inside
  an open modal (FR14).
- `design:reduced-motion` owns the reduced-motion representation AR6 applies.
- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:layer-runtime` owns the current native-dialog host and shared
  layer plumbing; Lightbox retains its media and local backdrop behavior.
- `architecture:react-component-runtime` owns the shared internal touch modules
  FR14 uses (INV13).
- `architecture:public-component-api` owns the caller's way back from touch
  defaults (INV16); FR13 applies it. It also owns config entries over slots
  (INV18), plug-ins for costly features (INV19), and one API per job (INV21),
  which FR23–FR25, FR28, and FR29 apply.
- `architecture:component-import-boundaries` owns opt-in imports (INV7) and
  their cost where unused (INV10); PR3 applies them.
- `spec:AST-107` owns the public hook layer (DEC-1): FR24's hooks return values
  and methods, and the recognizers and the animator stay internal.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering,
  including per-document ranking (FR8), and the backdrop press that starts and
  ends beside the media (FR10), and records Lightbox as an adopter.
- `architecture:interaction-modality` owns shared modality boundaries; this
  record changes none.

## Verification map

| Contract            | Verification                                                                                                                                                            | Representative states                                                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                                       | Audit section                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1                 | `Lightbox.test.tsx` render, gallery, caption, media, and zoom suites; the `LightboxViewport` caption band cases                                                         | Single image, gallery edges, caption, video                                                                                                             | Removing a documented part fails existing role, content, media, or navigation assertions.                                                                                                                                                             | `audit:Lightbox/anatomy`       |
| FR1b                | `Lightbox.test.tsx` single photo cases; `LightboxSingleCaption` interaction specs, Chromium and WebKit, on a phone and a desktop                                        | A single photo with a caption, with zoom, with a long caption and with none, against a gallery page                                                     | A single photo whose band, caption text or photo box differs from a gallery page's, a long single caption without "more", a band without a caption, or a Previous, Next or Counter on a single photo fails.                                           | `audit:Lightbox/anatomy`       |
| FR2                 | Source inspection and `themingTargets.test.ts`                                                                                                                          | Viewer overlay, Media, Caption, and Counter                                                                                                             | Removing the root target or documenting an unshipped child target fails evidence or inventory.                                                                                                                                                        | `audit:Lightbox/theming`       |
| FR3                 | Source inspection plus Button and IconButton public composition                                                                                                         | Close and gallery navigation controls                                                                                                                   | Re-owning a control surface requires the delegated owner and this map to change.                                                                                                                                                                      | `audit:Lightbox/theming`       |
| FR4, AR3            | Browser keyboard test: Tab and Shift+Tab at both ends, Escape, arrows in LTR and RTL, `+`, `-`, `0`, close focus                                                        | Single image, gallery, zoomed image, removed opener                                                                                                     | Focus leaving the viewer, a key without its action, or focus not returning to a connected opener fails.                                                                                                                                               | `audit:Lightbox/accessibility` |
| AR3                 | `Lightbox.test.tsx` "Lightbox unmounting while open" suite                                                                                                              | Viewer rendered only while open and removed by the page, with the opener still on the page; a page control that removes it keeps its focus; StrictMode  | Focus left on the page body after an open viewer unmounts fails.                                                                                                                                                                                      | `audit:Lightbox/accessibility` |
| FR5–FR10            | Interaction tests on synthetic touch streams with explicit timestamps; Reduce Motion; a busy main thread                                                                | Below and past each commit point; a release moving back; a drag on a video's frame and on its scrubber; a tap beside the photo with the controls hidden | A literal timing, a second decision during a settle, a gesture that pages while pinching, a drag on a video's frame that does not page, a drag on its controls that pages, or a tap beside the photo that closes while the controls are hidden fails. | `audit:Lightbox/touch`         |
| Motion              | `zoomStage.test.ts` case listing the dismissal's springs in this record; `selfRegistration.test.ts` zoom case; interaction case at tempo 2                              | The dismissal's position spring, and its size and opacity spring, at tempo 1 and tempo 2                                                                | A spring the dismissal plays that the Motion section does not list with its value fails. An exit that takes as long at tempo 2 as at tempo 1 fails.                                                                                                   | `audit:Lightbox/touch`         |
| FR11                | Fine-pointer browser tests                                                                                                                                              | Double-click, click on the photo, drag, ctrl-wheel, trackpad scroll, mouse wheel notch                                                                  | A double-click that does not zoom 2× about the point, a click that hides the controls, a fine-pointer close that animates, or a mouse wheel's notch that pans a zoomed photo fails.                                                                   | `audit:Lightbox/touch`         |
| FR6, AR1            | Touch test double-tapping a photo shaped like the screen and a landscape photo                                                                                          | 9:16 photo on a phone viewport, 3:2 photo                                                                                                               | A double tap that zooms less than 2×, or not about the tapped point, fails.                                                                                                                                                                           | `audit:Lightbox/touch`         |
| FR16                | Touch tests closing by Close, Escape, platform close, and a tap beside the photo with the controls shown; Reduce Motion                                                 | With and without `experimental`; controls shown and hidden                                                                                              | A touch close without the exit, a literal timing, input reaching the viewer during the exit, or a tap beside the photo that closes while the controls are hidden fails.                                                                               | `audit:Lightbox/touch`         |
| FR17                | `Lightbox.test.tsx` index cases                                                                                                                                         | An index below 0 and past the end, NaN, and an in-range fraction (1.5, 0.4, 1.2), controlled and default                                                | An index that opens an empty viewer, or any item but the nearest, fails.                                                                                                                                                                              | `audit:Lightbox/anatomy`       |
| FR18                | `Lightbox.test.tsx` video paging cases (pause, keep, autoplay)                                                                                                          | A playing video paged away from and back to                                                                                                             | A neighbouring video that unmounts, keeps playing, or starts again from its beginning fails.                                                                                                                                                          | `audit:Lightbox/anatomy`       |
| FR19                | Unit: `Lightbox.test.tsx` media surface cases; browser: `LightboxPaging` and `LightboxZoom` interaction specs, Chromium and WebKit                                      | Gallery with captions, with and without zoom; a single photo's caption; over a white, a mid-grey and a black photo (body 14.7:1 over white)             | A viewer outside `MediaTheme`, a Lightbox-set text color, a caption or counter that is not `Text`, a toggle that is not Link's button form, two start edges, or a caption under 4.5:1 fails.                                                          | `audit:Lightbox/theming`       |
| FR12                | Opener and `sourceFor` tests, with and without `experimental`                                                                                                           | Image opener, text-button opener, mid-entrance close                                                                                                    | Any change to opening or closing without `experimental` fails.                                                                                                                                                                                        | `audit:Lightbox/touch`         |
| FR13                | `hasZoom={false}` tests under a coarse pointer                                                                                                                          | Gallery, single image                                                                                                                                   | A zoom, a pinch close, or a tap that hides the controls with `hasZoom={false}` fails.                                                                                                                                                                 | `audit:Lightbox/touch`         |
| FR14                | Source boundary check and bundle analysis                                                                                                                               | A page with Lightbox and another touch component                                                                                                        | A second copy of a touch module or a Lightbox-owned gesture listener fails.                                                                                                                                                                           | `audit:Lightbox/touch`         |
| AR1, AR2            | Browser tests that complete every gesture's action with one pointer and no drag                                                                                         | Zoom, page, close, reach a zoomed photo's edge                                                                                                          | An action reachable only by a multipoint, path, or drag gesture fails.                                                                                                                                                                                | `audit:Lightbox/accessibility` |
| AR4                 | Accessibility-tree and announcement tests                                                                                                                               | Open, page by button, key, and swipe, zoom by every input                                                                                               | A missing dialog name or `alt`, a repeated or missing position announcement, a message not exposed inside the open viewer, or a zoom without its level fails.                                                                                         | `audit:Lightbox/accessibility` |
| AR5, AR7            | Browser tests with the controls hidden                                                                                                                                  | Tab, assistive-technology focus, a key press, keyboard zoom                                                                                             | A hidden control that is unfocusable, absent from the tree, or still hidden when focused fails.                                                                                                                                                       | `audit:Lightbox/accessibility` |
| AR6                 | Reduced-motion tests under a coarse and a fine pointer                                                                                                                  | Transition, page settle, dismiss, pinch close, controls fade                                                                                            | Travel, scaling, or a cross-fade over 200 ms under reduced motion fails.                                                                                                                                                                              | `audit:Lightbox/accessibility` |
| AR8                 | Touch test pinching on the controls and on the caption                                                                                                                  | Single image, gallery                                                                                                                                   | A pinch on the controls or caption that does not zoom the page fails.                                                                                                                                                                                 | `audit:Lightbox/accessibility` |
| AR9                 | Touch test zooming a white photo under the controls and measuring their contrast in every shipped theme, butter's recoloured buttons and gothic's hovered Next included | Gallery with zoom: Close, Previous, Next, and the Counter, in each shipped theme                                                                        | A control under 3:1, or the Counter's text under 4.5:1, over the zoomed light photo fails.                                                                                                                                                            | `audit:Lightbox/accessibility` |
| FR20, FR21, ORD4    | Unit and touch tests of a gallery mixing photos, a video, and custom items holding a field, a slider, and a scroller                                                    | A custom item at each end, with scrollable and interactive content, before and after the touch modules load                                             | A custom item that does not page or close by drag, a drag on its controls that pages, a scroller that pages before its edge, or a zoom on it fails.                                                                                                   | `audit:Lightbox/touch`         |
| FR22, FR23, AR10    | Unit tests of the Title and actions; a browser test at a 320 px viewer                                                                                                  | A title and subtitle, three and four actions, links with and without `download`, a narrow viewer                                                        | A dialog not named by `title`, an action without its label, a link that leaves the page, a fourth action shown, or Close shrunk at 320 px fails.                                                                                                      | `audit:Lightbox/anatomy`       |
| FR24, FR25          | Unit tests of both hooks, `LightboxFilmstrip`, and `LightboxZoomControl` in the Footer                                                                                  | A filmstrip and a zoom control, with a photo, a video, and a custom item active                                                                         | A hook that returns a recognizer or the animator, a pick that does not page, or a zoom control enabled where zoom cannot act fails.                                                                                                                   | `audit:Lightbox/anatomy`       |
| FR26, FR30          | Unit tests with an image that fails and custom content that throws                                                                                                      | A failed image, throwing content, paging back to each                                                                                                   | A broken image, a crash that removes the chrome, or a revisit that does not load again fails.                                                                                                                                                         | `audit:Lightbox/anatomy`       |
| FR27                | Touch and fine-pointer tests of `initialZoom: 'width'`                                                                                                                  | A 1:6 image on a phone and on a desktop                                                                                                                 | A tall image that opens fitted, or that cannot pan or return to its fitted size, fails.                                                                                                                                                               | `audit:Lightbox/touch`         |
| FR28                | Unit tests of `createLightboxLoader`                                                                                                                                    | A late URL, a store change, a failure resolved to a new URL and to the same URL                                                                         | An image that skips `resolve`, a change that does not resolve again, or a second retry fails.                                                                                                                                                         | `audit:Lightbox/anatomy`       |
| FR29                | Browser drag tests of `createLightboxDragOut`                                                                                                                           | A mouse drag from the Title part and from the photo; a finger                                                                                           | A drag-out from the photo or by a finger, or a Title drag without the file, fails.                                                                                                                                                                    | `audit:Lightbox/touch`         |
| AR3 keys            | Browser keyboard tests                                                                                                                                                  | Arrows from a field, a select, a video, custom content, with a modifier, in IME composition, after a consumer `preventDefault`                          | An arrow that pages from any of them fails.                                                                                                                                                                                                           | `audit:Lightbox/accessibility` |
| PR3                 | Bundle measurement of a Lightbox page with and without each opt-in                                                                                                      | Each opt-in alone                                                                                                                                       | An opt-in that adds over 0.3 KB gzip to a Lightbox page that does not use it fails.                                                                                                                                                                   | `audit:Lightbox/touch`         |
| FR21 pre-load       | Unit tests with the touch modules held unloaded                                                                                                                         | A custom item holding a field and a scroller, before the load                                                                                           | A drag that pages or closes before the load, a button, key, Close, Escape, or backdrop that does nothing, or a content control that does not respond fails.                                                                                           | `audit:Lightbox/touch`         |
| FR31, AR3 focus     | Unit tests of the close with `finalFocusRef`                                                                                                                            | A ref set, a ref whose element was replaced, a ref left empty                                                                                           | Focus that does not land on the ref's element read at the close, or that skips AR3's opener when the ref is empty, fails.                                                                                                                             | `audit:Lightbox/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                           | Canonical anatomy and current target                                                                                                                    | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.                                                                                                                                                            | `audit:Lightbox/theming`       |

## Decision log

### DEC-1 — The touch presentation is the native photo viewer

**Reference:** `component:Lightbox/DEC-1`
**Decider:** cixzhang, 2026-10-31

On a touch screen people compare Lightbox with the photo viewer on their own
phone, so Lightbox presents its gestures by default (FR5–FR10), each close or
page decided once at the release.

### DEC-2 — Fine pointers get the gestures and keep the desktop look

**Reference:** `component:Lightbox/DEC-2`
**Decider:** cixzhang, 2026-10-31

Mouse, pen, and trackpad get the gestures `spec:AST-094` FR43 gives every
pointer, while a double-click zooms 2× about the clicked point, a click keeps
the controls, and the viewer opens and closes at once (FR11), so the viewer
keeps its desktop look.

Rejected: filling the viewer on a double-click, which barely zooms a landscape
photo in a wide window.

### DEC-3 — The thumbnail transition is experimental

**Reference:** `component:Lightbox/DEC-3`
**Decider:** cixzhang, 2026-10-31

The thumbnail transition, `experimental.sourceFor`, and the close that waits for
the landing stay inside `experimental` (FR12), so their API can still change.

### DEC-4 — `hasZoom` is the way back

**Reference:** `component:Lightbox/DEC-4`
**Decider:** cixzhang, 2026-10-31

`hasZoom={false}` turns off the zoom-related touch behaviors, and the other
gestures only add to existing controls, so Lightbox needs no `presentation`
prop (FR13).

### DEC-6 — Custom content is a third item kind inside `media`

**Reference:** `component:Lightbox/DEC-6`
**Decider:** pending

A gallery that mixes photos with the caller's content keeps one index, one
Counter, and one dismissal, so a custom item is a kind of `media` item,
`{type: 'custom', content, label}` (FR20). Its `label` is required, since a
screen reader has no other name for it, and keys inside its content belong to
the content (AR3), so a field, a slider, or an editor inside it works.

Rejected: a separate `content` prop, which adds a second index; renaming `media` to `items`; an optional `label`.

### DEC-7 — A custom item pages and closes like a photo

**Reference:** `component:Lightbox/DEC-7`
**Decider:** pending

Under DEC-1 a gallery is one photo viewer, so a custom item pages and closes by
drag as a fitted photo does (FR21). Its content keeps the drags that start on
its controls or that scroll it, as a video keeps its scrubber (ORD4).

Rejected: custom items that page only by their buttons, which makes one gallery behave two ways.

### DEC-8 — The title and the actions are item data that Lightbox renders

**Reference:** `component:Lightbox/DEC-8`
**Decider:** pending

The top bar is the viewer's own: its size, its order, and its contrast over a
photo (AR9) stay Lightbox's. So an item brings its `title`, `subtitle`, and
`actions` as data, and Lightbox renders them (FR22, FR23;
`architecture:public-component-api` INV18). The title names the dialog, and at
most three actions keep the bar usable at a phone's width.

Rejected: header and actions slots, which hand the bar's layout and contrast to each caller.

### DEC-9 — One Footer, filled from its own imports and read through values

**Reference:** `component:Lightbox/DEC-9`
**Decider:** pending

A filmstrip and a zoom control are a page's choice, so they come from their own
imports into one Footer part (FR24, FR25), and a page without them carries only
the part's wiring (PR3). `useLightboxGallery()` and `useLightboxZoom()` return
values and methods, never the recognizers or the zoom stage (`spec:AST-107`
DEC-1).

Rejected: a filmstrip and a zoom control built into every Lightbox; exporting the zoom stage.

### DEC-10 — Loading and dragging out plug in

**Reference:** `component:Lightbox/DEC-10`
**Decider:** pending

A caller that resolves its image URLs, or that lets a person drag an item's
file out, plugs that in (`architecture:public-component-api` INV19). The loader
resolves each image's URL and hears its load and failure (FR28). A drag-out
starts only from the Title part, since a drag on the photo pages and closes
(FR29, DEC-2).

Rejected: a caller's own image element, which replaces the element zoom and paging measure; a drag-out from the photo.

### DEC-11 — An item's failure stays inside the item

**Reference:** `component:Lightbox/DEC-11`
**Decider:** pending

A failed image shows a line in its place (FR26), and a custom item whose
content throws shows the same line (FR30), so one bad item never takes the
chrome or the gallery with it. Lightbox derives both from the item, so no
caller prop chooses them (`spec:AST-002` DEC-1).

Rejected: a per-item error slot.

### DEC-12 — A caller may start an image at the viewer's width

**Reference:** `component:Lightbox/DEC-12`
**Decider:** pending

An image the caller knows to be a page, such as a tall screenshot, can open
zoomed to the viewer's width (FR27). It is a zoom start inside DEC-1's photo
viewer, not another presentation: every zoom gesture and key acts on it as on
any zoomed photo, and the fitted size is a double tap away. Only the caller
knows that the image is a page (`spec:AST-002` DEC-1).

Rejected: a page-width mode chosen by the image's shape, which DEC-1's photo viewer does not have.

## Open questions

None. Media, Caption, Counter, Title, and Footer keep no public target; adding
one is a change to this record.

## Content boundary

This file does not duplicate consumer prop tables/examples, measured values,
media algorithms, shared layer rules, current audit results, or implementation
steps. It links to their owners.
