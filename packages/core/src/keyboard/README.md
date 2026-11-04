# On-screen keyboard

Core's one source for the on-screen keyboard (`spec:AST-099`,
`architecture:react-component-runtime` INV11), and the keyboard layout guide
that times motion with it. Everything here is internal to
`@astryxdesign/core`: components import it from its defining file, such as
`../keyboard/keyboardHeight`, and nothing is exported from the package entry.

## The keyboard module (`keyboardHeight.ts`)

- **The height (FR2):** `measureKeyboardHeight(window)` is the layout
  viewport's height minus the visual viewport's height times its scale, in CSS
  px. A page pan is not a smaller keyboard, and a pinch zoom is not a keyboard.
  The layout viewport's height is `layoutViewportHeight(window)`
  (`../utils/layoutViewport.ts`), in layout px in every engine: WebKit reports
  `innerHeight` and `innerWidth` in the zoomed visual viewport's px, which
  `innerWidth` matching the visual viewport's width tells apart. A classic
  horizontal scrollbar, which `innerHeight` counts and the visual viewport
  does not, is taken out, so a desktop page wider than its window reads no
  keyboard. While Safari pans the page to a focused field, it reports
  `innerHeight` as the visual viewport's height; the root's client height
  keeps the layout viewport's. At a scale of 1, where the two heights are
  equal and the root is as wide as the visual viewport, the function takes the
  larger. BottomSheet's obstruction reads it too.
- **Where it measures (FR6, FR7, DEC-4):** `isKeyboardMeasurable(window)` is
  true for a top-level document with a visual viewport, a browser with its own
  keyboard geometry API (`navigator.virtualKeyboard`, Chrome on Android)
  included, whose visual viewport shrinks for the keyboard as everywhere
  else. It is decided from capabilities, never from the user agent or the
  pointer. A desktop browser's visual viewport never shrinks for a keyboard,
  so it reads 0; inside an iframe the height is 0. Where the app sets
  `interactive-widget=resizes-content`, Chrome shrinks the layout viewport
  with the keyboard, so the height is 0 there too and nothing rides: the
  browser has made the inset (FR8).
- **One set of listeners (FR1, INV11):** `subscribeKeyboardHeight(window, fn)`
  delivers every report (the visual viewport's resize and scroll, the window's
  resize, and with `{focus: true}` focus moves, whose input-stream
  subscriptions exist only while such a subscriber does) from one set of listeners per window,
  however many components subscribe, and `getKeyboardHeight(window)` gives a reader the
  height that report measured. No other code in core listens to the visual
  viewport for the keyboard.
- **Focus (FR4):** `refuseFocusReveal(document, {claim, park, isActive})`
  delivers every focus move a surface claims with `preventScroll`, on the
  capture-phase `blur` before the browser's own focus step, so the browser
  never reveals a field by scrolling the document. Focus that leaves for
  nothing (the keyboard's Done) can be parked so the next tap is a transition
  again. Every caller in a document shares one listener, which lives only
  while a caller does; BottomSheet's hook installs it only under a coarse
  primary pointer.
- **The browser's own reveal pan (FR4):** `watchRevealPan(window, {owns})`
  is the one building block every keyboard-aware surface uses for a browser
  that pans the visual viewport to a focused field after the keyboard's
  report. The surface calls `report()` on each report that changes the
  height; on a later report, `isRevealPan(height)` says the visual viewport
  has moved down with no touch, document scroll or zoom since, while a text
  field the surface owns has focus, and `putBack()` pans it back without
  scrolling the document, by scrolling into view a probe fixed where the
  visual viewport sat at the report (or the element given, such as a
  full-viewport dialog). Every watch in a document shares one passive
  `touchstart` subscription on the window's input stream, which lives only
  while a surface watches. BottomSheet's hook watches while its sheet is presented
  under a coarse primary pointer; under a fine one it registers no touch
  listener.
- **The surface hook (FR4, FR5):** `useMobileKeyboard(targetRef, options)`
  (`useMobileKeyboard.ts`) keeps a focused field in a target above the
  keyboard. BottomSheet passes its panel with `{move: 'ride', inset: true}`
  and its suggestion clearance as `offset`, and enables it for a presented
  Tall sheet. The inset goes at the end of the panel's scroll area, its body,
  which `useScrollableArea` marks. The hook gives a fully expanded sheet its
  keyboard scroll range, claims focus moves into it, and puts back a document
  scroll while the page is locked. It attaches through `useAttachment`. It
  returns the inset the keyboard takes at the end of the body's content, and
  `dismiss`, which BottomSheet calls from the drag that starts to move the sheet. The hook itself dismisses the keyboard as its target closes. The sheet lays the inset out after its
  content box's children through a functional style (FR3), committed before
  the reveal scrolls into it. Under a coarse primary pointer, where the
  guide publishes the keyboard's own slide (Gboard's, in Chrome on Android),
  the sheet rides it (FR8). A reveal during the show scrolls the body at once.
  In the same commit it sets the content box so the field sits 4 px above the
  keyboard's top, and the content box then rides the rest of the show's
  curve. Through the hide the inset stays and the content box rides down to
  where the body's scroll rests. At rest the inset drops, the scroll is put
  back and the translate clears in one commit. Under a fine pointer, and in a
  browser without the VirtualKeyboard API (iOS Safari, Firefox for Android),
  nothing of the ride attaches: no guide subscription, and the inset follows
  the reports. Safari's and Firefox's reveals are unchanged.
- **When the keyboard goes:** the body's scroll goes back to where it was
  when the keyboard came up, within the range left once the inset drops. A
  field that keeps focus, as after iOS's downward keyboard dismissal, is then
  brought into the body's view. Where that dismissal leaves the accessory bar
  up, the visual viewport grows short of full height: the scroll goes back as
  soon as it grows, and a low field is still kept clear of the bar.

## Riding the keyboard

Layout follows the height (FR3), through a functional style on your own
element, so it is right with no animation running; for an element docked at
the bottom, `lift = height > 0 ? max(0, restingBottom − (layoutViewportHeight(window) − height)) : 0`.
An animation that rides the keyboard is optional polish on top, timed by the
guide:

```ts
const guide = getKeyboardLayoutGuide(window);
const unsubscribe = guide.subscribe(t => {
  rideKeyboard(animator, {y: layoutLift - lift(t.to)}, t);
});
```

Each transition is
`{kind, from, to, start, velocity, animated, predicted, curve}`: heights in
CSS px, `start` on the document timeline (dated back to Gboard's start for a
slide Chrome reported, slightly ahead for a hide that starts after a blur),
and the curve the keyboard moves on: `curve`, Gboard's slide in Chrome on
Android, values and no motion role (architecture:react-component-runtime
INV11). `rideKeyboard` moves your element on the compositor from `start` on
that curve. It lands the element at once when the transition is not animated,
or when its slide has ended by the call. Hand the translate back to the layout
once the ride ends (BottomSheet's hook does, in one commit at rest). Under Reduce Motion
nothing travels with the keyboard
(design:reduced-motion): the animator's default cross-fades on a touch screen
and moves at once otherwise. `presentation(time)` gives the height presented
at any time, for something that appears while the keyboard moves.

## What the page sees

- Safari reveals a focused field by scrolling the whole page, so a layout that
  keeps its own content above the keyboard focuses its field with
  `preventScroll` (`refuseFocusReveal`).
- Firefox for Android reports the keyboard once it is up, and 54 to 143 ms
  later pans the visual viewport to a focused field the keyboard still
  covers. So BottomSheet reveals in the report's own event, and where a
  browser has panned to the field after a report (`watchRevealPan`), it
  lands the field with its own scroller, leaving a smooth reveal under way to
  land it, and only then scrolls the dialog's top back into view; a field it
  cannot bring up keeps the browser's reveal. Every later reveal lands at
  once in the report's frame. Until a browser pans once, the sheet keeps the
  smooth reveal.
- Chrome on Android (Gboard) animates its own pan to a focused field the
  keyboard still covers, by the keyboard's whole height. It starts about
  150 ms after the report in Chrome 124, and 100 to 170 ms after it in
  Chrome 133. The page gets no frame until that pan ends, so `watchRevealPan`
  puts it back then. A Tall BottomSheet sets its field 4 px above the
  keyboard's top in the report's own commit, so the field is never covered
  when Chrome checks. Chromium 158 pans the same way when the field stays
  covered, by 312 px with the sheet's reveal on the next frame.

## What the page sees (Chromium 158 with Gboard, Android 15)

Measured frame by frame on the emulator, with a marker the page paints on each
report and Gboard's top read from every recorded frame (`../motion/android/
keyboard.ts` has the numbers and their sources). The guide reads these reports
in a browser with the VirtualKeyboard API (`keyboardProfileOf`), and the
keyboard module measures them from the visual viewport, as in every browser
(`spec:AST-099` FR8, DEC-4).

- Show: Gboard slides up over the page in about 267 ms. Chrome's one `resize`
  of the visual viewport comes just after the slide starts: its first painted
  frame trails Gboard's first moved frame by 14 to 35 ms. The guide dates the
  show back by `androidKeyboard.showReportLagMs` and rides Gboard's show
  curve, joining the slide where it is, so content riding it stays on top of
  the keyboard instead of being covered until the report.
- Hide: Gboard starts down about `androidKeyboard.hideAfterBlurMs` after the
  blur and leaves in about 167 ms; the `resize` comes mid-slide. The guide
  starts the hide at the blur and takes the `resize` as its confirmation; a
  hide nothing predicted (Back, which keeps the focus) rides from its report,
  dated back `hideReportLagMs`, the lag measured on blurs. Chrome can report
  Back later in the slide, so on Back the content starts down after the
  keyboard does.
- When focus moves from one field to another through something that brings up
  no keyboard (a popover's container), Chrome reports the keyboard gone and
  back within about 50 ms. A hide reported while a field that gained focus less
  than 150 ms ago still has it waits for the move to settle.
- `navigator.virtualKeyboard` with `overlaysContent`, the keyboard's own
  geometry, was measured and not used: in 12 shows its `geometrychange` was
  painted 0 to 67 ms after Gboard started (against 14 to 35 ms for the
  visual viewport), it failed to show the keyboard in 4 of 12 shows when set
  on focus (1 of 24 when set as the touch lands), and it hides Chromium's bottom
  toolbar on the keyboard's frame (+56 px of layout).

## Consumers

- BottomSheet (`BottomSheet/BottomSheetPanel.tsx`): `useMobileKeyboard`, whose
  inset the content box's `keyboardInset` functional style lays out as the
  content's last box (after its own children, so it adds scroll range in
  Firefox too, which keeps the content box at the body's height); it reveals the
  focused field in the keyboard report's own event, and in Chrome rides the
  content box on Gboard's slides (`rideKeyboard`, from the guide's
  transitions).

## Files

| File                     | What it holds                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `keyboardHeight.ts`      | The keyboard module: the height, its listeners, the focus routes.                                                     |
| `useMobileKeyboard.ts`   | Keeps a focused field in a target above the keyboard: the inset, the reveal, the ride and the dismiss.                |
| `keyboardModel.ts`       | The clock-free core of the guide: transitions from keyboard reports and focus changes.                                |
| `keyboardLayoutGuide.ts` | One guide per window, fed by the keyboard module: the verification timer, the focus handoff.                          |
| `rideKeyboard.ts`        | Moves an element with the keyboard on the curve its transition publishes, or at once (tests: `rideKeyboard.test.ts`). |
| `index.ts`               | Entry point.                                                                                                          |

The timing constants live in `../motion/android/keyboard.ts` (Chrome with
Gboard).
