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
  keyboard. BottomSheet's obstruction reads it too.
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
- **The tap route (FR4):** a first tap moves focus from nothing, so no
  `blur` claims it. `claimTapFocus(region, {claim, deliver})` takes a
  one-finger tap the browser would turn into focus, cancels the tap's
  default, lets the click guard (utils/clickGuard.ts) take the mouse events
  Safari may still send, and lets `deliver` focus the field.
  `focusAtPoint(field, x, y)` focuses it with `preventScroll` and puts the
  caret under the finger. `deliverTap` (`keyboardTarget.ts`) does that and
  raises the tap's click once, since the cancelled tap raises none; the
  module's targets and ChatLayout's composer deliver with it.
  `followsKeyboard(win)` (`keyboardTarget.ts`) is the gate for all of it: a
  top-level document whose visual viewport shrinks for the keyboard, under
  a coarse primary pointer. A touch past
  10 px is the browser's to scroll.
- **The browser's own reveal pan (FR4):** `watchRevealPan(window, {owns})`
  is the one building block every keyboard-aware surface uses for a browser
  that pans the visual viewport to a focused field after the keyboard's
  report. The surface calls `report()` on each report that changes the
  height; on a later report, `isRevealPan(height)` says the visual viewport
  has moved down with no touch, document scroll or zoom since, while a text
  field the surface owns has focus, and `putBack()` pans it back without
  scrolling the document, by scrolling into view a probe fixed where the
  visual viewport sat at the report (or the element given, such as a
  full-viewport dialog). `panVisualViewportTo(window, top)` makes that pan to
  any top, the one way Core moves the visual viewport itself. Every watch in a
  document shares one passive subscription to `touchstart`, `touchend` and
  `touchcancel` on the window's input stream, which lives only while a surface
  watches. A report while a finger is on the screen (`isFingerOnScreen`, from
  the stream's count), as when Firefox's toolbar hides in a drag, leaves that
  drag's pan to the person. A finger down at the keyboard's last hide counts no
  more until a touch starts. BottomSheet's hook watches while its sheet is presented
  under a coarse primary pointer; under a fine one it registers no touch
  listener. `watchPans(win, owns)` (`keyboardTarget.ts`) runs that loop on
  each height the module reports: the keyboard targets and ChatLayout's
  composer watch with it. Its `expectPan(top)` makes a pan the caller makes
  itself the new rest.
- **Keyboard targets (`keyboardTarget.ts`):** a target keeps the focused field
  inside it above the keyboard, and registers so a field inside moves nothing
  itself (`registerKeyboardTarget`, `isInsideKeyboardTarget`).
  `followKeyboard(target, {move, offset})` is a target that moves no inset:
  `'ride'` moves the target with the keyboard, on the guide's slide where one is
  published and at each report elsewhere; `'reveal'` scrolls the field into
  place in the target, a scroller. A reveal comes when the keyboard's height
  changes or focus moves, so a pan or a scroll leaves the field where the person
  put it. `keepFieldAboveKeyboard(field)` is a field's own path. When the field
  gains focus it decides where it is from its nearest
  fixed-position ancestor (`fixedContainerOf`). Docked at the viewport's bottom
  edge by its layout, without any transform, that container moves up by the part
  of it the keyboard still covers; one taller than the room above the keyboard,
  such as a full-height drawer, never rides its whole overlap: its scroller
  there reveals the field instead, and with none it rides only as far as the
  focused field needs to clear the keyboard, so a field near its top stays on
  screen. In a fixed container that fills the viewport, the field's scroller
  there reveals it. In scrolling content, the field's nearest scroller, the
  document included, brings it into view on both edges (`distanceIntoBand`,
  shared with the Tall sheet's reveal), `FIELD_OFFSET` (10 px) above the
  keyboard while one shows. Nothing else moves. A scroller does not gain the
  missing scroll range at its end yet (`spec:AST-099` Gap 11). Until it does,
  a page with nothing to scroll keeps the browser's own reveal. Once the
  keyboard shows, the document reveals a field that its area cannot place, in
  the page or, where a document scroll moves a fixed container (as in Safari
  while its keyboard shows), in that container. Where the document cannot
  scroll far enough, as at a short page's end in Chrome,
  `panVisualViewportTo` pans the visual viewport for the rest in the same frame
  (`panIntoView`), so Chrome's own pan finds the field clear. The reveal-pan
  watch takes that pan as the new rest once the viewport reports it. In Safari,
  a document scroll reaches into the room the keyboard takes. On iOS, a reveal
  that places the field rises on the browser's smooth scroll, beside the
  keyboard's slide (`risesSmoothly`); the scroll back records where it is
  headed. Chrome checks the field in the resize's own commit, so there, and
  where motion is reduced (`reducesMotion`), the reveal moves at once. Each
  reveal's scroll is recorded (`noteKeyboardScroll`). Once the keyboard reports
  it has gone, `keyboardScrollBack.ts` scrolls each scroller back to where it
  was, on the browser's smooth scroll, unless the person scrolled it meanwhile.
  Firefox for Android can carry the reveal as a visual-viewport offset and show
  the document where it was before the reveal at that report. The scroll back
  then waits up to a second for the browser's own document scroll that turns the
  offset back, and follows it; a touch, a new keyboard or the field's page going
  ends the wait.
  In a fixed
  container the app positions (one that
  fills the viewport, floats above the bottom edge, or sets its own `translate`,
  which the ride would replace), a scroller between the field and the container
  reveals the field. Inside a keyboard target, or in such a container with no
  scroller around the field, the path does nothing and the browser's own reveal
  stays. A ride places its target on the frame after each report, slide or focus
  move, once every listener of that event has run. On the guide's show, a ride
  first sets the focused field `FIELD_CLEARANCE_AT_REPORT` (4 px) above the
  keyboard's top at once, so Chrome's own pan finds it clear, and only the rest
  rides (`spec:AST-099` DEC-6). Every viewport report feeds the reveal-pan
  watch, so a pan the browser still makes is put back. A pan made at one
  keyboard height goes back at the next height's report. In Chrome, the ride's
  watch also scrolls the document back (`documentScrollIsReveal`): under Remove
  animations, Gboard first reports a keyboard 48 px tall, and Chrome may then
  reveal the bar's field itself, scrolling the page behind the bar before it
  pans. Only a scroll and a pan that centre the field as Chrome's reveal does
  count, so the app's own scroll to another element stays. The ride measures
  what the keyboard still covers after any move the app makes itself: a bar the
  app already moves with the keyboard is not moved, one the app lifts part of
  the way moves the rest, and one the app is moving itself at that moment (a
  running CSS transition or animation on its position) is left to the app; a
  script
  animation is not seen, so an app that moves its bar from script keeps it clear
  with its own `translate`. The ride writes the CSS `translate`, which adds to
  an app's `transform`, writes nothing on an element it never moved, and on an
  app's element only while that element stays docked. A Core host's ride moves
  its own element and keeps its focused field `offset` above the keyboard. A
  target lifts only while a field inside it has focus, and rides back down once
  focus leaves; one ride moves a target at a time. Where the path places the
  field, focus moves and first taps arrive without the browser's reveal; a
  claimed tap raises the tap's click on the field afterwards, a synthetic touch
  `PointerEvent` (a `MouseEvent` where none exists), so a caller's `onClick`
  still runs once. A pan the browser makes on its own after a report, as after a
  script's `focus()` that no claim saw, is put back (`watchRevealPan`).
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
  back and the translate clears in one commit. A busy page reads Chrome's
  report of the keyboard gone after the slide. Until then the content box
  stays where the slide leaves it, and that report commits. Under a fine
  pointer nothing of
  the ride attaches: no guide subscription, and the inset follows the
  reports. A browser without the VirtualKeyboard API (iOS Safari, Firefox for
  Android) publishes no slide: iOS Safari reports the keyboard gone about half
  a second after a blur, once it is down. There, under a coarse pointer, a
  blur that takes the keyboard down rides the content box to where the body's
  scroll rests, on UIKit's keyboard spring (`KEYBOARD_SPRING`) from the blur,
  while the inset stays. The report then drops the inset and puts the scroll
  back in one commit with the translate, so nothing moves. A report of the
  keyboard gone with no ride under way, as after a downward dismissal, glides
  the content to its place on the same spring. A field focused before the
  keyboard is down rides it back up. Focus moving to a select starts no ride:
  iOS puts the select's picker where the keyboard was. Nor does focus moving
  to a field inside an open shadow root, or into a frame or a custom element
  whose field the page cannot see. A plain control inside an open shadow root
  rides as any control does. Firefox for Android takes the same path, but
  reports the hide once, at its end, and the content moves at that report
  (AST-099 Gap 12). Safari's and Firefox's reveals are unchanged.
- **When the keyboard goes:** the body's scroll goes back to where it was
  when the keyboard came up, within the range left once the inset drops. A
  field that keeps focus, as after iOS's downward keyboard dismissal, is then
  brought into the body's view. Where that dismissal leaves the accessory bar
  up, the visual viewport grows short of full height: the scroll goes back as
  soon as it grows, and a low field is still kept clear of the bar.

## Riding the keyboard

Layout follows the height (FR3), through a functional style on your own
element, so it is right with no animation running; for an element docked at
the bottom, `lift = height > 0 ? max(0, restingBottom − (innerHeight − height)) : 0`.
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
  starts the hide at the blur and takes the `resize` as its confirmation. A
  busy page reads that `resize` after the slide. Until the report of the
  keyboard gone, a report of it partway down, or still up, starts nothing.
  Focus that comes back still turns the hide around. Focus in a frame, an
  open shadow host or a custom element, whose field the guide cannot see,
  leaves the viewport to decide. A hide nothing predicted (Back, which keeps
  the focus) rides from its report,
  dated back `hideReportLagMs`, the lag measured on blurs. Chrome can report
  Back later in the slide, so on Back the content starts down after the
  keyboard does.
- Under Remove animations (`prefers-reduced-motion: reduce`), Chrome reports
  a hide in steps: lower keyboards that are still up, then none. There, the
  keyboard module holds such a step and keeps reporting the shown height. The
  report of none, a report back up, or 300 ms without a new height ends the
  hold, and it lasts 1 s at most. A pan reports the same height and leaves it
  as it is. So every reader lays out once, after the keyboard has gone, and its
  Reduce Motion cross-fade plays once.
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
| `keyboardTarget.ts`      | The targets: their registry, a docked or scrolling target, and a field's own path.                                    |
| `revealBand.ts`          | `distanceIntoBand`: the scroll that brings a box inside a band, shared by the field's and the sheet's reveals.        |
| `keyboardScrollBack.ts`  | Records each scroll a reveal makes and scrolls it back when the keyboard goes.                                        |
| `keyboardModel.ts`       | The clock-free core of the guide: transitions from keyboard reports and focus changes.                                |
| `keyboardLayoutGuide.ts` | One guide per window, fed by the keyboard module: the verification timer, the focus handoff.                          |
| `rideKeyboard.ts`        | Moves an element with the keyboard on the curve its transition publishes, or at once (tests: `rideKeyboard.test.ts`). |
| `index.ts`               | Entry point.                                                                                                          |

The timing constants live in `../motion/android/keyboard.ts` (Chrome with
Gboard).
