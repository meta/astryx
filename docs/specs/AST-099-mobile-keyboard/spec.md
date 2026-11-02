---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-099
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:react-component-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs:
  [
    packages/cli/assets/docs/browser-support.doc.mjs,
    packages/core/src/BottomSheet/BottomSheet.doc.mjs,
  ]
---

# On-screen keyboard system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/BottomSheet/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person typing on a phone sees the field they are typing in, and the surface
around it, above the on-screen keyboard, and the page does not lurch when a
field takes focus. Every surface that responds to the keyboard measures it the
same way and keeps the page still, so the keyboard behaves the same in a sheet,
a chat composer, or a search field.

## Non-goals

- Layer geometry: how Popover and other anchor-mode layers stay above the
  keyboard belongs to `spec:AST-059`.
- Hardware keyboard access and focus order, owned by `spec:AST-025`,
  `spec:AST-020`, and component records.
- The curve or timing of an animation that moves a surface with the keyboard,
  beyond FR3's sync and FR8's limits; under reduced motion it follows
  `design:reduced-motion`.
- The app's viewport `<meta>` element, which the app owns.
- `@astryxdesign/native`, where the platform's own keyboard avoidance applies
  (`spec:AST-082` FR11).
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — One keyboard height for every component.** Every Core and Lab
  component that positions, sizes, or dismisses relative to the on-screen
  keyboard responds to the same keyboard height (FR2) at the same moment,
  including
  BottomSheet, the chat composer, a search field placed at the bottom, tab bar
  search, drag to dismiss, and any keyboard layout guide, so no two components disagree about where the
  keyboard is. `architecture:react-component-runtime` INV11 owns the single
  source of that height and how a component outside Core conforms.
- **FR2 — The height a pan or a zoom cannot corrupt.** The keyboard height is
  the layout viewport height minus the visual viewport height multiplied by the
  visual viewport's scale, in CSS pixels. It is 0 when no keyboard is shown,
  including while the page is pinch-zoomed. A page pan or a visual-viewport
  offset is a pan to put back (FR4), never a smaller keyboard.
- **FR3 — The keyboard height stays internal and keeps layout correct.** No
  public CSS custom property, export, or prop exposes the keyboard height.
  Each component applies it on its own element, such as a bottom offset, a
  padding, or a maximum height, so layout is correct with no animation running:
  the chat composer, a search field placed at the bottom, and tab bar search
  position from it, and a fully expanded sheet extends its own scroll range by
  it. How the value reaches styles is
  `architecture:react-component-runtime` INV11. Riding the keyboard's motion
  layers on top of that layout, so layout never depends on it; FR8 requires it
  where it applies. When surfaces ride it, such as
  a composer, a scroll view, and a header, they all move in sync along the same
  motion to the resting value with no per-frame layout work, and each commits
  the resting value once to layout, as an offset, a padding, or a spacer, so
  nothing is hidden or unscrollable. How the motion is shared is
  `architecture:react-component-runtime` INV11; no public API or CSS custom
  property exposes it.
- **FR4 — Focus never pans the page.** Every route into a text-entry control
  inside a keyboard-aware surface, including a tap, the keyboard's
  previous and next buttons, Tab, and programmatic focus, delivers focus
  without the browser scrolling the document, and the surface brings the
  control into view with its own scroller. When the keyboard's Done button
  ends entry, focus moves to the surface so the next tap is handled the same
  way. A document scroll that still happens while the page is scroll-locked,
  such as on returning to the app, is put back in the same frame.
- **FR5 — Moving a surface dismisses the keyboard.** When a surface that holds
  the focused control starts to move, such as a sheet dragged between heights,
  a drag to dismiss, or a close, the control is blurred so the keyboard
  dismisses, and the surface keeps its keyboard layout until the visual
  viewport has recovered, so content does not jump on the first frame of the
  move.
- **FR6 — Capability detection.** Keyboard handling acts where the visual viewport
  shrinks for the keyboard while the layout viewport keeps its height. It
  detects that from the platform's viewport and keyboard capabilities, never
  from the user agent (`spec:AST-013` FR6). Where the browser also reports
  the on-screen keyboard's geometry, as Chrome on Android does, the height
  comes from FR2 there too and FR8 governs how surfaces ride the keyboard, on any
  device that shows an on-screen keyboard; a browser that offers the report but
  shows no on-screen keyboard reads 0. A page that is not a secure context gets
  no such report, so FR8 does not apply there.
- **FR7 — Top-level documents only.** Inside an iframe the frame's visual
  viewport does not change when the keyboard opens, so the keyboard height is
  0 there and nothing changes. Behavior and evidence for this record come
  from a top-level document.
- **FR8 — Browsers that report the keyboard ride it smoothly.** In a browser
  that reports the on-screen keyboard's geometry itself, such as Chrome on
  Android, the keyboard height comes from FR2's visual-viewport
  measurement there too (DEC-4), and Core's
  keyboard-aware surfaces ride the keyboard on show and on hide: they move with
  the keyboard's slide, within one frame of it on the measured keyboards, with
  no one-step jump and no surface left under the keyboard, no JavaScript per
  frame, and one layout commit at rest (FR3). Under reduced motion nothing
  travels with the keyboard, and the change follows `design:reduced-motion`
  DR2, a cross-fade on a touch screen. A Lab surface commits the resting value without riding
  (`architecture:react-component-runtime` INV11). Astryx never overrides
  the app's own viewport setting. Where the app sets
  `interactive-widget=resizes-content`, which Astryx documents and does not
  set, Chrome on Android shrinks the layout viewport with the keyboard, so
  FR2 reads 0: a keyboard-aware field's keyboard height is 0 there and it
  does not ride, since the browser has already made the room. Everywhere
  else, keyboard-aware surfaces ride the visual-viewport height (DEC-4).
  An Android browser without a keyboard geometry API
  that shrinks only its visual viewport, such as Firefox for Android, gets
  FR2–FR5 under FR6.

### Platform support

- Supported feature/engine floor: the package's supported browsers
  (`spec:AST-013` FR3). FR2–FR5 apply to Safari on iOS, in the browser and as a
  home-screen app, and to Firefox for Android; FR8's ride applies wherever the
  browser reports the keyboard itself, such as Chrome on Android.
- Unsupported behavior: with no on-screen keyboard, or no visual-viewport
  support, the keyboard height is 0 and nothing changes. During server render it
  renders nothing and reads no viewport.
- Browser evidence: Safari on iOS, in the iOS Simulator or on a device and in a
  top-level document, proves the iOS claims of FR2–FR5, and Chrome on Android, in an emulator or on a device, proves FR8, with
  Firefox for Android proving FR2–FR5 there
  (`spec:AST-013` FR10); DOM and visual-viewport tests prove the rest of
  FR1–FR7. Simulator and emulator evidence in a top-level document gates
  merge, with Gboard on the Android emulator; a pass on a physical iPhone and a
  physical Android phone, including Samsung Keyboard and the phone's real
  refresh timing, is required before the keyboard module ships in a release
  (DEC-3).

## Current-state impact

- BottomSheet's internal keyboard hook implements FR2, FR4, and FR5 for a
  fully expanded Tall sheet on iOS, detects iOS from the user agent, and writes
  a private inset on the sheet body as the custom property
  `--_sheet-keyboard-inset`, which retires: the sheet applies the height
  through a functional style on its own element. It moves into Core's
  keyboard module, `packages/core/src/keyboard/`, the single source
  `architecture:react-component-runtime` INV11 names: FR6 replaces the
  user-agent check, FR3 keeps the height internal, and BottomSheet consumes the
  shared source (`component:BottomSheet`).
- No other component on `main` measures the keyboard. A component that later
  responds to the keyboard uses the same height (FR1).
- Layer caps do not account for the keyboard: `spec:AST-059` owns layer
  geometry, and keeping Popover and other anchor-mode layers above the keyboard
  is an amendment to that record that consumes this height.
- Today's hook omits FR2's zoom term, so a pinch-zoomed page reads as a
  keyboard; FR2 corrects that.
- Today's hook gates only its focus claim on an iOS user agent. Under FR8, a
  fully expanded Tall sheet in
  Chrome on Android keeps the keyboard accommodation `BottomSheet.doc.mjs`
  documents and moves with the keyboard, so no consumer loses behavior and no
  breaking change applies; `BottomSheet.doc.mjs` states each platform's
  behavior. Firefox for Android gets FR2–FR5.
- No public API exposes the keyboard height, and FR3 keeps it that way.
- The consumer documentation gains the Android viewport setting (FR8).

## Verification

| Contract     | Verification                                                                                           | Representative states                                                                                                                                                                                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1          | Source boundary check over Core and Lab plus a shared test that drives one keyboard change             | each listed consumer; a new keyboard-aware component                                                                                                                                                                                                                                                                            | Two components reading different heights for one keyboard, or a component measuring by a rule other than FR2                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR2          | Module tests driving visual-viewport resize and scroll events                                          | keyboard shown; hidden; page panned with the keyboard shown; offset without a keyboard; page pinch-zoomed with and without the keyboard                                                                                                                                                                                         | A pan that lowers the reported height, or a height when no keyboard is shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR3          | Consumer tests of computed layout, plus a public-surface check                                         | keyboard shown and hidden; composer, bottom search field, tab bar search, Tall sheet; no animation running; a ride animation running with the composer, a scroll view, and a header together                                                                                                                                    | A consumer whose layout ignores the height, layout that is only correct after an animation, riding surfaces out of sync on one keyboard change, per-frame layout work during a ride, content hidden or unscrollable at the resting value, or a public CSS custom property, export, or prop for the height                                                                                                                                                                                                                                           |
| FR4          | Focus-route tests with document scroll spies                                                           | tap, previous and next buttons, Tab, programmatic focus, Done then tap, app resume while scroll-locked                                                                                                                                                                                                                          | A route that scrolls the document, or a slipped scroll left in place                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR5          | Surface move tests                                                                                     | sheet drag between heights, drag to dismiss, close, with a focused field                                                                                                                                                                                                                                                        | The field stays focused after a move starts, or content jumps on the first frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR6          | Capability tests with the user agent varied                                                            | visual viewport shrinking with a fixed layout viewport; Chrome on Android reporting keyboard geometry; a desktop browser with the API and no on-screen keyboard; a page that is not a secure context; neither                                                                                                                   | Behavior that changes with the user agent alone, or a height taken from the browser's keyboard geometry report instead of FR2's measurement                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR7          | Tests in an iframe and in a top-level document                                                         | the same keyboard event sequence in both                                                                                                                                                                                                                                                                                        | A non-zero value or a claimed focus inside an iframe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR8          | Chrome on Android in the emulator with Gboard, top-level document, plus a consumer documentation check | keyboard show and hide with the composer and a Tall sheet; a Lab bottom search field; reduced motion on; focus inside a keyboard-aware field, which rides by the visual-viewport height; an app with `interactive-widget=resizes-content`, focus inside and outside keyboard-aware fields, where a field's keyboard height is 0 | A Core surface jumping after the keyboard settles, lagging the keyboard by more than a frame, left under the keyboard, moved by JavaScript per frame, or committing layout more than once; a Lab surface riding instead of committing at rest; anything travelling with the keyboard under reduced motion instead of DR2's cross-fade; the app's viewport setting overridden; a keyboard-aware field not riding by the visual-viewport height, or adding an offset under `interactive-widget=resizes-content`; or the setting missing from the docs |
| FR8          | Firefox for Android, emulator or device, top-level document                                            | focus routes, keyboard shown and hidden, page panned and pinch-zoomed, a sheet moved                                                                                                                                                                                                                                            | The page lurches, the field ends under the keyboard, or the height is wrong after a pan or zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR2–FR5      | Safari on iOS in the iOS Simulator or on a device, top-level document                                  | focus routes, keyboard shown and hidden, page panned and pinch-zoomed, a sheet moved, in Safari and as a home-screen app                                                                                                                                                                                                        | The page lurches, the field ends under the keyboard, or the height is wrong after a pan or zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR2–FR5, FR8 | Release gate: physical devices in a top-level document (DEC-3)                                         | iPhone Safari with the toolbar expanded and collapsed; iPhone home-screen app; Firefox for Android (FR2–FR5); Android Chrome with Gboard and Samsung Keyboard at the phone's refresh rate                                                                                                                                       | The page lurches, the field ends under the keyboard, or the surface does not follow the keyboard                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Decision log

### DEC-1 — One keyboard height for every component, measured so a pan cannot corrupt it

**Reference:** `spec:AST-099/DEC-1`
**Decider:** `cixzhang`, `2026-10-24`

BottomSheet's keyboard hook already keeps a fixed surface still on every focus
route and measures the keyboard so a page pan cannot shrink it, which are the
two failures that leave a field under the keyboard. Making it the one source
Core components use, and the definition a component outside Core measures by,
keeps components from drifting into different measurements. Applying the
hook's height through StyleX functional styles keeps layout correct with no
animation and keeps the shared API constrained: the height stays internal, and
an app that later needs it gets a deliberate public-API decision rather than a
variable it came to rely on.
Animation layers on top of correct layout and never makes layout correct.

Rejected: each component measuring the keyboard by its own rule and predicting its motion, which pans with any unclaimed focus route and diverges; a public CSS custom property for the height, which a hook-derived value does not need.

### DEC-2 — Chrome on Android rides the keyboard smoothly

**Reference:** `spec:AST-099/DEC-2`
**Decider:** `cixzhang`, `2026-10-24`

People on Android should see the same smooth keyboard motion as on iPhone: a
surface that jumps once the keyboard has finished, or sits under it while it
moves, feels broken. So keyboard-aware surfaces ride the keyboard's slide on
show and hide in Chrome on Android too, by the visual-viewport height
(DEC-4), and the app's own viewport setting stays in charge: where the app
sets `interactive-widget=resizes-content`, the browser already makes the room
and those surfaces have nothing to ride. The mechanism is left to the
implementation; this record states only the motion and its limits.

Rejected: a one-step relayout that jumps after the keyboard settles; and overriding the app's viewport setting.

### DEC-3 — Simulators gate merge; physical phones gate release

**Reference:** `spec:AST-099/DEC-3`
**Decider:** `cixzhang`, `2026-10-24`

Simulator and emulator evidence in a top-level document, with Gboard on the
Android emulator, is enough to merge keyboard work, so it is not blocked on
hardware, while a pass on a physical iPhone and a physical Android phone,
including Samsung Keyboard and the phone's real refresh timing, is required
before the keyboard module ships in a release, because keyboard timing and viewport behavior differ on
real devices.

Rejected: physical devices as a merge gate, which blocks work on hardware; and physical devices as optional follow-up, which can ship untested keyboard behavior.

### DEC-4 — The keyboard height comes from the visual viewport in every browser

**Reference:** `spec:AST-099/DEC-4`
**Decider:** `cixzhang`, `2026-10-25`

In Chrome on Android the visual viewport shrinks for the keyboard as the
keyboard starts to slide, so FR2's measurement reaches the page in time for
surfaces to join the slide within a frame, and reading it changes nothing on
the page. The browser's own keyboard geometry report needs the page to overlay
the keyboard, arrives later and less steadily, and in Chromium hides the
bottom toolbar on the keyboard's frame, which moves the layout. One
measurement in every browser also keeps FR1's single height.

Rejected: the browser's keyboard geometry report as the height, which arrives later and less steadily and shifts the layout.

## Open questions

None.
