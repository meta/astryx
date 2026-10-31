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
same actions.

## Compatibility and migration

- Released default preserved: `no`. Under a coarse primary pointer the touch
  presentation (FR5–FR10) and the touch exit (FR16) are the default
  (`spec:AST-094` FR13). Under a fine pointer a mouse or pen drag pages and
  closes the viewer, a ctrl-wheel or trackpad pinch over the photo zooms the
  photo instead of the page, a wheel pans a zoomed photo, and a double-click
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

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The shipped Lightbox does not yet meet every requirement below. Each gap names
the requirement it misses and the person it affects.

- **Touch presentation (FR5–FR10, FR12).** On a touch screen a pinch zooms the
  page instead of the photo, a double tap zooms 2× about the centre, and there
  is no swipe paging, drag or pinch to close, tap to hide the controls, or
  thumbnail transition.
- **Tab containment (FR4).** Tab from the viewer's last control can move focus
  to the browser's own interface.
- **Single-pointer pan (AR2, FR11).** A double-click zooms 2× about the centre,
  not about the clicked point, so a single-pointer user can reach a zoomed
  photo's edge only by dragging.
- **Zoom reset key (AR3).** `0` does not return a zoomed photo to its fitted
  size.
- **Zoom announcement (AR4).** A zoom change announces "zoomed in" or "zoomed
  out" without the zoom level.
- **Announcements outside the open viewer (AR4).** Position and zoom messages
  are sent from above the modal Lightbox renders, so they reach the page body
  and a screen-reader user does not hear them while the viewer is open
  (`spec:AST-086` FR14).
- **Lightbox-owned pan listeners (FR14).** The pan drag registers Lightbox's
  own `window` pointer listeners instead of using the shared touch modules.
- **Fine-pointer gestures (FR11).** A mouse drag on a fitted photo does
  nothing, a ctrl-wheel zooms the page, and a wheel does not pan a zoomed photo.
- **Touch exit (FR16).** On a touch screen the viewer disappears at once when
  it closes.

## Ownership boundary

**Owns**

- The Viewer overlay and its current `lightbox` target.
- Media presentation, optional Caption and Counter placement, gallery
  navigation, image zoom and pan, the touch presentation (FR5–FR12), and the
  touch exit (FR16).
- The accessible alternative for every gesture it presents (AR1–AR8).

**Does not own / non-goals**

- The Close, Previous, and Next button surfaces — delegated to
  `component:Button` through IconButton.
- Caller-provided Caption content.
- New targets for Media, Caption, or Counter; none exist.
- Shared layer hosting or dismissal policy — owned by
  `architecture:layer-runtime` and `family:overlay-dismissal`.
- Touch physics, measured values, and motion roles' values — owned by
  `spec:AST-094` and its measured motion table.

## Public concepts

No new stable public concept is introduced. `experimental.sourceFor` is an
experimental option inside the `experimental` prop object (`spec:AST-017`
FR21). Consumer props and usage remain documented in `Lightbox.doc.mjs`.

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                        | Draft review state          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| FR1  | The viewer contains one active Media item and a Close button; galleries additionally contain Previous and Next buttons plus a Counter, and Caption renders only when supplied.                                                                                                                                                                                                                                                                                                                                                                                                      | Current source, docs, and tests              | settled                     |
| FR2  | Viewer overlay carries the current `lightbox` target. Media, Caption, and Counter carry no Lightbox public target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and public docs               | settled                     |
| FR3  | Close, Previous, and Next button surfaces use Button's `button` target through IconButton rather than Lightbox-owned button targets.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and target docs               | settled                     |
| FR4  | The open viewer is a focus region through Core's shared focus-region module (`component:Dialog/DEC-2`): Tab from its last control moves focus to its first and Shift+Tab from its first moves focus to its last, so focus never leaves the viewer for the browser's own interface.                                                                                                                                                                                                                                                                                                  | `component:Dialog/DEC-2`                     | settled; implementation gap |
| FR5  | Under a coarse primary pointer, after hydration, Lightbox presents FR6–FR10 with no opt-in. Every spring, duration, and curve they play is a named motion role (zoom settle, page settle, dismiss, pinch close, controls fade, zoom transition) read through the motion role table, never a literal. Under reduced motion they follow AR6.                                                                                                                                                                                                                                          | `spec:AST-094` FR4, FR13                     | settled; implementation gap |
| FR6  | With `hasZoom`, on an image, a pinch zooms about the fingers and pans while it zooms; past the minimum or maximum the photo resists and eases back without overshoot. A double tap zooms to the larger of filling the viewer and 2×, about the tapped point; a second double tap returns to the fitted size. A zoomed photo pans with momentum and rubber-band edges. A pinch on the controls or the caption still zooms the page.                                                                                                                                                  | `spec:AST-094` FR3, FR10                     | settled; implementation gap |
| FR7  | In a gallery, a horizontal drag moves the row of items, which sit apart by the measured gap. The release lands on at most one neighbouring item by the projection rule. Paging applies over a video item's frame as over a photo; a drag that starts on the video's own controls, such as its scrubber or volume, stays the video's. A zoomed photo pans to its edge before a new drag pages. A pinch never pages. Previous, Next, and the arrow keys keep paging. A controlled `index` the caller refuses springs back. `onIndexChange` reports a swipe.                           | `spec:AST-094` FR14, FR36–FR39               | settled; implementation gap |
| FR8  | On a fitted image, a downward drag moves the photo with the finger, shrinks it, and fades the backdrop. The release decides once: a projected travel past the commit point closes the viewer and reports `onOpenChange(false)` at the lift; a release moving back springs back. Video is unchanged.                                                                                                                                                                                                                                                                                 | `spec:AST-094` FR36–FR40                     | settled; implementation gap |
| FR9  | With `hasZoom`, a pinch in from the fitted size is a release decision: below the measured fraction of the fitted size the release closes the viewer; opening the fingers again by the measured amount before the lift is moving back and cancels. A pinch that starts zoomed in never closes the viewer.                                                                                                                                                                                                                                                                            | `spec:AST-094` FR36, FR37                    | settled; implementation gap |
| FR10 | With `hasZoom`, under a coarse pointer only, a tap on the photo fades the controls and caption and darkens the backdrop. While they are hidden, the next tap on the photo, a tap beside the photo, or a cancelled drag brings them back, and that tap beside the photo does not close the viewer (ORD3). AR5 governs keyboard and assistive-technology access while they are hidden.                                                                                                                                                                                                | `architecture:public-component-api` INV16    | settled; implementation gap |
| FR11 | A mouse, a pen, and a trackpad also use FR7's drag paging, FR8's drag to close, a ctrl-wheel or trackpad pinch over the photo for FR6's zoom and FR9's close, and a wheel to pan a zoomed photo; over the photo these replace the browser's page zoom and scroll. A double-click zooms 2× about the clicked point. A click on the photo keeps the controls, and the viewer opens and closes at once.                                                                                                                                                                                | `spec:AST-094` FR43; `spec:AST-017` FR59     | settled; implementation gap |
| FR12 | Inside `experimental` only, under a coarse pointer, the photo grows out of its source when the viewer opens and returns into it when it closes: the element `experimental.sourceFor(index)` returns, else the opener when it shows a picture. A close reports `onOpenChange(false)` at the request; the viewer stays only until the photo lands. Pointer input during the entrance is held; keys and assistive technology stay live. Without `experimental`, opening is unchanged and closing plays FR16.                                                                           | `spec:AST-017` FR21; `spec:AST-094` FR35     | settled; implementation gap |
| FR13 | `hasZoom={false}` turns off FR6, FR9, and FR10. FR7 and FR8 add to the buttons, keys, and Escape and remove none of them, so Lightbox takes no `presentation` prop.                                                                                                                                                                                                                                                                                                                                                                                                                 | `architecture:public-component-api` INV16    | settled                     |
| FR14 | Gestures, paging, motion, and reduced motion run through Core's one shared set of internal touch modules; Lightbox bundles no copy of a module's primitive and adds no gesture listener outside them.                                                                                                                                                                                                                                                                                                                                                                               | `architecture:react-component-runtime` INV13 | settled; implementation gap |
| FR15 | Lightbox supports a Picture-in-Picture window as its only second document; there it ranks Escape and platform close among that window's members.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `family:overlay-dismissal` FR8               | settled                     |
| FR16 | Under a coarse primary pointer, a close that is not a drag down (FR8), a pinch in (FR9), or a return into a source (FR12) plays the touch exit: Close, Escape, a platform close, and a tap beside the photo while the controls are shown (ORD3). The photo shrinks a little and fades out in place with the backdrop and controls, as the native viewer's zoom transition does without a source, on its named motion role. `onOpenChange(false)` reports at the request, and the viewer takes no input while the exit plays. Under a fine pointer the viewer closes at once (FR11). | `spec:AST-094` FR7                           | settled; implementation gap |

### Allowed variation

- **AV1 — Media mode.** Media may be an image or video; zoom, pan, drag down to
  close, pinch to close, and the tap that hides the controls are available only
  on images. Paging applies to both (FR7).
- **AV2 — Gallery mode.** Previous, Next, and Counter are absent for a single
  item. Navigation button disabled state follows the current gallery boundary.
- **AV3 — Caption content.** Caller-provided Caption content may vary without
  becoming a Lightbox-owned target.
- **AV4 — Measured values.** Thresholds, gaps, commit points, and timings may
  change with the measured motion table without changing this record.

### Representative states

| State            | Required invariant                                                                      | Allowed variation                             |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Single image     | Viewer overlay, Media, and Close button render.                                         | Caption and zoom may be absent or present.    |
| Gallery boundary | Both navigation buttons and Counter remain rendered.                                    | Previous or Next is disabled at its boundary. |
| Video            | Media renders native video controls without image zoom interaction.                     | Autoplay follows the existing consumer prop.  |
| Captioned media  | Caption follows the active Media inside the centered media group.                       | Caption content remains caller-provided.      |
| Zoomed image     | A double tap or double-click, `-`, or `0` returns to the fitted size.                   | The zoom level and pan position.              |
| Controls hidden  | Controls stay focusable and in the accessibility tree; focus or a key brings them back. | Backdrop shade while hidden.                  |

### Transformation and precedence order

- **ORD1 — Zoom before paging.** A drag on a zoomed photo pans it until the
  photo's edge; only a new drag from that edge pages (FR7).
- **ORD2 — Fitted size before closing.** A drag down or a pinch in closes the
  viewer only from the fitted size (FR8, FR9).
- **ORD3 — Hidden controls before closing.** While the controls are hidden, the
  first tap beside the photo only brings them back; only while they are shown
  does a tap beside the photo close the viewer (FR10, FR16).

### Performance and resources

- **PR1 — Settles survive a busy page.** Zoom, page, dismiss, and transition
  settles keep moving while the main thread is busy (`spec:AST-094`).

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
  keys pan the photo. Focus stays inside the viewer (FR4), and on close returns
  to the element that opened the viewer when that element is still connected and
  can receive focus (`family:overlay-dismissal` AV1).
- **AR4 — Screen-reader semantics and announcements (WCAG 2.2 1.1.1, 4.1.2,
  4.1.3).** The viewer is a modal dialog named by the active item's `alt`, or a
  localized "Media viewer" when it has none. Every item requires `alt`, which
  reaches the image's alternative text or the video's accessible name. Moving to
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

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority       | Hierarchy role    | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Viewer overlay   | Presents the full-viewport dialog and surrounding overlay treatment. | Current source and public docs | Supporting        | FR1, FR2           |
| Media            | Presents the active image or video.                                  | Current source and public docs | Prominent         | FR1, FR2           |
| Close button     | Provides the persistent viewer dismissal action.                     | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Previous button  | Moves gallery presentation to the preceding item.                    | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Next button      | Moves gallery presentation to the following item.                    | `component:Button`             | Supporting        | FR1, FR3, AR1      |
| Caption          | Presents caller-provided context below the active Media.             | Current source and public docs | Context-dependent | FR1, FR2           |
| Counter          | Presents current gallery position and total.                         | Current source and tests       | Supporting        | FR1, FR2           |
| Reduced motion   | `design:reduced-motion/DR1`–`DR3`                                    | prescribed                     | Supporting        | AR6                |

Media, Caption, and Counter are stable visible parts, but no current public
target reaches them. Their `none` dispositions record factual reachability, not
a decision that they must remain unthemeable.

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
  defaults (INV16); FR13 applies it.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering,
  including per-document ranking (FR8), and records Lightbox as an adopter.
- `architecture:interaction-modality` owns shared modality boundaries; this
  record changes none.

## Verification map

| Contract            | Verification                                                                                                            | Representative states                                                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                                       | Audit section                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1                 | `Lightbox.test.tsx` render, gallery, caption, media, and zoom suites                                                    | Single image, gallery edges, caption, video                                                                                                             | Removing a documented part fails existing role, content, media, or navigation assertions.                                                                                                                                                             | `audit:Lightbox/anatomy`       |
| FR2                 | Source inspection and `themingTargets.test.ts`                                                                          | Viewer overlay, Media, Caption, and Counter                                                                                                             | Removing the root target or documenting an unshipped child target fails evidence or inventory.                                                                                                                                                        | `audit:Lightbox/theming`       |
| FR3                 | Source inspection plus Button and IconButton public composition                                                         | Close and gallery navigation controls                                                                                                                   | Re-owning a control surface requires the delegated owner and this map to change.                                                                                                                                                                      | `audit:Lightbox/theming`       |
| FR4, AR3            | Browser keyboard test: Tab and Shift+Tab at both ends, Escape, arrows in LTR and RTL, `+`, `-`, `0`, close focus        | Single image, gallery, zoomed image, removed opener                                                                                                     | Focus leaving the viewer, a key without its action, or focus not returning to a connected opener fails.                                                                                                                                               | `audit:Lightbox/accessibility` |
| FR5–FR10            | Interaction tests on synthetic touch streams with explicit timestamps; Reduce Motion; a busy main thread                | Below and past each commit point; a release moving back; a drag on a video's frame and on its scrubber; a tap beside the photo with the controls hidden | A literal timing, a second decision during a settle, a gesture that pages while pinching, a drag on a video's frame that does not page, a drag on its controls that pages, or a tap beside the photo that closes while the controls are hidden fails. | `audit:Lightbox/touch`         |
| FR11                | Fine-pointer browser tests                                                                                              | Double-click, click on the photo, drag, ctrl-wheel, wheel                                                                                               | A double-click that does not zoom 2× about the point, a click that hides the controls, or a fine-pointer close that animates fails.                                                                                                                   | `audit:Lightbox/touch`         |
| FR6, AR1            | Touch test double-tapping a photo shaped like the screen and a landscape photo                                          | 9:16 photo on a phone viewport, 3:2 photo                                                                                                               | A double tap that zooms less than 2×, or not about the tapped point, fails.                                                                                                                                                                           | `audit:Lightbox/touch`         |
| FR16                | Touch tests closing by Close, Escape, platform close, and a tap beside the photo with the controls shown; Reduce Motion | With and without `experimental`; controls shown and hidden                                                                                              | A touch close without the exit, a literal timing, input reaching the viewer during the exit, or a tap beside the photo that closes while the controls are hidden fails.                                                                               | `audit:Lightbox/touch`         |
| FR12                | Opener and `sourceFor` tests, with and without `experimental`                                                           | Image opener, text-button opener, mid-entrance close                                                                                                    | Any change to opening or closing without `experimental` fails.                                                                                                                                                                                        | `audit:Lightbox/touch`         |
| FR13                | `hasZoom={false}` tests under a coarse pointer                                                                          | Gallery, single image                                                                                                                                   | A zoom, a pinch close, or a tap that hides the controls with `hasZoom={false}` fails.                                                                                                                                                                 | `audit:Lightbox/touch`         |
| FR14                | Source boundary check and bundle analysis                                                                               | A page with Lightbox and another touch component                                                                                                        | A second copy of a touch module or a Lightbox-owned gesture listener fails.                                                                                                                                                                           | `audit:Lightbox/touch`         |
| AR1, AR2            | Browser tests that complete every gesture's action with one pointer and no drag                                         | Zoom, page, close, reach a zoomed photo's edge                                                                                                          | An action reachable only by a multipoint, path, or drag gesture fails.                                                                                                                                                                                | `audit:Lightbox/accessibility` |
| AR4                 | Accessibility-tree and announcement tests                                                                               | Open, page by button, key, and swipe, zoom by every input                                                                                               | A missing dialog name or `alt`, a repeated or missing position announcement, a message not exposed inside the open viewer, or a zoom without its level fails.                                                                                         | `audit:Lightbox/accessibility` |
| AR5, AR7            | Browser tests with the controls hidden                                                                                  | Tab, assistive-technology focus, a key press, keyboard zoom                                                                                             | A hidden control that is unfocusable, absent from the tree, or still hidden when focused fails.                                                                                                                                                       | `audit:Lightbox/accessibility` |
| AR6                 | Reduced-motion tests under a coarse and a fine pointer                                                                  | Transition, page settle, dismiss, pinch close, controls fade                                                                                            | Travel, scaling, or a cross-fade over 200 ms under reduced motion fails.                                                                                                                                                                              | `audit:Lightbox/accessibility` |
| AR8                 | Touch test pinching on the controls and on the caption                                                                  | Single image, gallery                                                                                                                                   | A pinch on the controls or caption that does not zoom the page fails.                                                                                                                                                                                 | `audit:Lightbox/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                           | Canonical anatomy and current target                                                                                                                    | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.                                                                                                                                                            | `audit:Lightbox/theming`       |

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

## Open questions

None. Media, Caption, and Counter keep no public target; adding one is a change
to this record.

## Content boundary

This file does not duplicate consumer prop tables/examples, measured values,
media algorithms, shared layer rules, current audit results, or implementation
steps. It links to their owners.
