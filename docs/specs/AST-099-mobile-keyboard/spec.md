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
affects_families: [family:input-fields]
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
  "paths": [
    "packages/core/src/BottomSheet/**",
    "packages/core/src/TextInput/**",
    "packages/core/src/TextArea/**",
    "packages/core/src/NumberInput/**",
    "packages/core/src/DateInput/**",
    "packages/core/src/DateTimeInput/**",
    "packages/core/src/TimeInput/**",
    "packages/core/src/Typeahead/**",
    "packages/core/src/Tokenizer/**",
    "packages/core/src/Field/PanelSearchInput.tsx",
    "packages/core/src/Selector/**",
    "packages/core/src/MultiSelector/**",
    "packages/core/src/PowerSearch/**",
    "packages/core/src/CommandPalette/**",
    "packages/core/src/Chat/ChatComposer.tsx",
    "packages/core/src/Chat/ChatComposerInput.tsx",
    "packages/core/src/Chat/ChatLayout.tsx",
    "packages/core/src/keyboard/**",
    "packages/core/src/motion/android/**",
    "packages/core/src/utils/layoutViewport.ts",
    "packages/core/src/utils/layoutViewport.test.ts"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person typing on a phone sees the field they are typing in, and the surface
around it, above the on-screen keyboard, and the page does not lurch when a
field takes focus. Every surface that responds to the keyboard measures it the
same way and keeps the page still, so the keyboard behaves the same in a sheet,
a chat composer, or a search field. Core inputs work with the keyboard: every
Core field that brings up the keyboard keeps itself above it in the page, in a
Core host, and in an app's bar docked to the bottom edge, with nothing for the
app to turn on.

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
  public CSS custom property, export, or prop exposes the keyboard height. Each
  component applies it on its own element, such as a bottom offset, a padding,
  or a maximum height, so layout is correct with no animation running: the chat
  composer, a search field placed at the bottom, and tab bar search position
  from it, and a fully expanded sheet extends its own scroll range by it. FR9's
  docked ride is the one exception: Core moves an app's docked bar as FR9 sets
  out. How the value reaches styles is `architecture:react-component-runtime`
  INV11. Riding the keyboard's motion layers on top of that layout, so layout
  never depends on it; FR8 requires it where it applies. When surfaces ride it,
  such as a composer, a scroll view, and a header, they all move in sync along
  the same motion to the resting value with no per-frame layout work, and each
  commits the resting value once to layout, as an offset, a padding, or a
  spacer, so nothing is hidden or unscrollable. How the motion is shared is
  `architecture:react-component-runtime` INV11; no public API or CSS custom
  property exposes it. In Safari on iOS, which reports the keyboard only once
  it is down, a fully expanded sheet
  whose field loses focus to a control that brings up neither a keyboard nor a
  picker in the keyboard's place keeps its keyboard layout and moves its
  content to its resting scroll on the motion the keyboard's own hide plays
  (UIKit's keyboard spring), from the blur, as a translate with no JavaScript
  per frame. Once the visual viewport has recovered, the layout drops and the
  translate clears in one commit, so nothing moves. Under reduced motion
  nothing travels, and the change follows `design:reduced-motion` DR2.
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
  frame, and one layout commit at rest (FR3). Two exceptions apply (DEC-6). In
  Chrome on Android, at the keyboard's first report the content is placed in
  one frame so the focused field's bottom sits just above the keyboard's top,
  then rides the rest of the keyboard's slide. Chrome pans the page itself if
  the field is still below the keyboard about 100–170 ms after the report, so
  a slide cannot be relied on. In Chrome on Android, a hide nothing on the
  page predicts, such as Back, is reported partway through the keyboard's
  slide; the content rides down from that report. Under reduced motion nothing
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
- **FR9 — Every Core field that brings up the keyboard stays above it.** When
  the on-screen keyboard opens, a focused Core text-entry field stays visible
  above it, with nothing for the app to do, when it renders in the page's
  scrolling content, in a Core host such as a sheet or the chat composer's dock,
  or in an app's fixed bar docked to the viewport's bottom edge that sets no
  `translate` of its own. A field in scrolling content or in a Core host sits 10
  CSS px clear of the keyboard's top edge, the clearance `spec:AST-059` FR9
  keeps under a layer; a field in an app's docked bar rides with the bar, whose
  bottom meets the keyboard's top edge. Core does not move any other fixed
  container (one floating above the bottom edge, one that sets its own
  `translate`, or a full-viewport one); the app positions it. The keyboard's top
  is FR2's height. The page is never panned or translated for a field Core
  reveals or moves. Inside a fixed container FR9 leaves to the app, a field with
  a scroller between it and that container follows the scrolling-content rule:
  its nearest scroller reveals it and the page is not panned. Only a field with
  no scroller between it and that container keeps the browser's own focus
  reveal, which in Safari may pan the page.
  - **Scrolling content.** A field in scrolling content is scrolled into place
    by its nearest scroller, the document included, from the frame the
    keyboard's size is reported. A show's first report always places the field.
    A later report that comes while a finger is down, after a touch has begun
    since the field's last placement, moves nothing. On iOS, that report comes as the keyboard
    starts to slide, and the field rises on the browser's own smooth scroll
    beside the slide, settling within 0.15 s after the keyboard settles. Under Reduce
    Motion, in a theme that reduces motion for everyone, and in other browsers,
    it moves in that frame. Where a browser carries out the document's
    scroll by moving the visual viewport, that offset is this reveal, not a pan.
    When that scroller cannot scroll far enough, it gains the missing scroll
    range at its end while the keyboard shows and loses it when the keyboard
    hides. Nothing else moves. When the keyboard closes, each scroller that
    revealed the field scrolls back to where it was before the reveal, on the
    browser's own smooth scroll from the report that the keyboard has gone; a
    scroller the person scrolled while the keyboard showed keeps the person's
    scroll. At the hide report, Firefox for Android can still show the document
    where it was before the reveal. It turns the reveal back into a document
    scroll only after that report, and the scroll back follows that scroll.
  - **Docked containers.** A field docked at the bottom of the viewport, in a
    bottom bar, a fixed toolbar, or a sheet, rides the keyboard: its docked
    container moves up as the keyboard opens and back down as it closes, on
    FR8's ride (DEC-2) where that applies, and following the visual-viewport
    height (FR2) elsewhere, such as Safari on iOS. A Core host rides by applying
    the keyboard height on its own element (FR3), and the field inside it is not
    moved a second time.
  - **App-owned docked containers.** A container the app owns rides too when it
    is fixed-position, does not fill the viewport, and is docked: its layout
    box, before any transform, sits at the viewport's bottom edge. A docked
    container whose drawn box, once moved, would not fit in the room above the
    keyboard, such as a full-height side drawer or a pane below a fixed header,
    is handled by the field: if a scroller holds the field, the field is
    revealed through it and the container does not move; if no scroller holds
    it, the container moves only as far as the focused field needs to clear the
    keyboard, never more than the container's own overlap, so the field stays in
    view even if the container's top leaves the screen. A docked container that
    fits moves up by the distance from its bottom edge as drawn, after any lift
    the app applies itself, to the keyboard's top edge, measured after each
    keyboard report, including a keyboard that changes height while focus stays
    in the bar, and each focus move, once the page's own listeners have run. So
    a bar the app already lifts to the keyboard is not lifted again, a bar the
    app lifts part of the way moves the rest, and a bar that stays put moves by
    the full overlap. Core leaves a bar the app is moving with a CSS transition
    or animation (one running on its position when Core measures), so that bar
    is never lifted twice. Core cannot see a bar the app moves from script each
    frame; an app that lifts its bar from script positions it with its own
    `translate`, which Core never moves, to keep it clear. The move adds to any
    transform the app sets. A bar whose own computed `translate`, the value the
    app sets and not Core's move, is not `none`, such as one centred with
    `translate: -50% 0`, is not moved. The bar's resting state is that move, not
    a change to its layout, and the move is gone once the keyboard hides after
    the field loses focus, or once the field unmounts. Core changes nothing else
    on the app's elements. This is the one exception to FR3 (DEC-5).
  - **No API.** No prop, option, context, or other public API turns this on,
    turns it off, or tunes it, and for a field in the places above the app does
    nothing to get it. Every route by which a field gains focus (FR4) gets the
    same behavior.
  - **Covered fields:**
    - TextInput, TextArea, and NumberInput;
    - the typed fields of DateInput, DateTimeInput, and TimeInput, in every
      presentation that renders one;
    - the inputs of Typeahead and Tokenizer, which BaseTypeahead renders, and
      Tokenizer's sheet search field;
    - the search row of Selector and MultiSelector;
    - PowerSearch's query input, the text and number fields of its value
      editor, and the search and value fields of its sheet flow;
    - CommandPalette's search input;
    - ChatComposer's input.

  A Core field added later that brings up the keyboard is covered by the same
  rule. A field that brings up no keyboard is outside it: a read-only touch
  picker field with no input mode, a native date or time picker, DateRangeInput's
  trigger, FileInput, Slider, and a Selector or ComplexSelector trigger. Lab
  fields follow INV11's rule for components outside Core.

### Platform support

- Supported feature/engine floor: the package's supported browsers
  (`spec:AST-013` FR3). FR2–FR5 apply to Safari on iOS, in the browser and as a
  home-screen app, and to Firefox for Android; FR8's ride applies wherever the
  browser reports the keyboard itself, such as Chrome on Android.
- Unsupported behavior: with no on-screen keyboard, or no visual-viewport
  support, the keyboard height is 0 and nothing changes. During server render it
  renders nothing and reads no viewport.
- Browser evidence: Safari on iOS, in the iOS Simulator or on a device and in a
  top-level document, proves the iOS claims of FR2–FR5, and Chrome on Android
  in the Android emulator with Gboard proves FR8, with Firefox for Android in
  the emulator proving FR2–FR5 there
  (`spec:AST-013` FR10); DOM and visual-viewport tests prove the rest of
  FR1–FR7. Simulator and emulator evidence in a top-level document gates
  merge. Android evidence is emulator evidence at the exact head, with
  animations at normal scale and removed, plus a slow-device profile, and no
  human device check (`spec:AST-094` DEC-27). A pass on a physical iPhone,
  including the phone's real refresh timing, is required before the keyboard
  module ships in a release (DEC-3).

## Current-state impact

- BottomSheet's keyboard hook lives in Core's keyboard module,
  `packages/core/src/keyboard/`, the single source
  `architecture:react-component-runtime` INV11 names. It implements FR2, FR4,
  and FR5 for a fully expanded Tall sheet, decides by capability (FR6), and
  applies the height through a functional style on the sheet's own element
  (FR3). BottomSheet consumes it (`component:BottomSheet`).
- No other component on `main` measures the keyboard; BaseTypeahead reads the
  visual-viewport height only to size its list (Gap 4). A component that later
  responds to the keyboard uses the same height (FR1).
- Every field FR9 covers gains keyboard behavior it lacks on `main` (Gaps
  2–11); the input family cites FR9 (`family:input-fields` FR13).
- Apps with their own fixed bottom bar: a bar that stays put while the keyboard
  opens rides it under FR9. A bar the app already moves with the keyboard
  behaves as before in two cases: a bar the app is moving with a CSS transition
  or animation that is running when Core measures, which Core leaves to the app,
  and a bar the app moves from script with its own `translate`, which Core never
  moves. A bar the app has already lifted is measured as drawn, so Core moves it
  by nothing; a bar the app lifts only part of the way, with no CSS motion
  running, moves the rest, on top of the app's own transform. A CSS lift the app
  starts after Core has measured can be lifted twice, and so can a lift the app
  drives from script each frame on `transform`, which Core cannot see. No
  opt-out API is needed.
- Bars that position with `translate`, and fixed containers that float above the
  bottom edge, do not ride: Core leaves them where the app puts them. A field in
  one that a scroller holds is still revealed by that scroller; a field with no
  scroller between it and the container can stay under the keyboard. An app that
  wants the ride docks the bar to the bottom edge and positions it with
  `transform` or with no `translate` (Follow-up). A docked container too tall to
  fit above the keyboard, such as a full-height side drawer or a pane below a
  fixed header, does not move when a scroller holds the field, and otherwise
  moves only as far as the focused field needs.
- `architecture:react-component-runtime` INV11 admits FR9's docked ride: Core
  writes, and removes, a `translate` on an app's docked fixed container whose
  own `translate` is `none`, equal to the distance from its drawn bottom to the
  keyboard's top, and nothing else on app elements (DEC-5).
- Layer caps do not account for the keyboard: `spec:AST-059` owns layer
  geometry, and keeping Popover and other anchor-mode layers above the keyboard
  is an amendment to that record that consumes this height.
- The keyboard module's height includes FR2's zoom term, so a pinch-zoomed
  page does not read as a keyboard.
- The hook claims focus under a coarse pointer wherever the keyboard can be
  measured; no user-agent check gates it. Under FR8, a fully expanded Tall
  sheet in Chrome on Android keeps the keyboard accommodation
  `BottomSheet.doc.mjs` documents and moves with the keyboard, so no consumer
  loses behavior and no breaking change applies; `BottomSheet.doc.mjs` states
  each platform's behavior. Firefox for Android gets FR2–FR5.
- No public API exposes the keyboard height, and FR3 keeps it that way.
- The consumer documentation gains the Android viewport setting (FR8).

### Implementation gaps

TextInput, TextArea, and NumberInput meet FR9 apart from the missing scroll
range (Gap 11). Each other gap below is open.

- **Gap 1 — The keyboard module.** Partly met: the keyboard module
  (`packages/core/src/keyboard/`) measures the keyboard, keeps focus from
  panning the page, and keeps a focused field above the keyboard: it rides a
  docked container, scrolls a field's nearest scroller, and claims the first
  tap. BottomSheet's Tall sheet and ChatLayout's dock read it, and so do
  TextInput, TextArea, and NumberInput (Gap 2). The other covered fields do not
  yet (Gaps 3–8).
- **Gap 2 — TextInput, TextArea, and NumberInput.** Met: each passes its input
  to the keyboard module, which keeps the focused field above the keyboard as
  FR9 describes, apart from the missing scroll range (Gap 11) and the rise in
  Chrome on Android (Gap 13).
- **Gap 3 — The typed fields of DateInput, DateTimeInput, and TimeInput.** No
  keyboard handling. Their touch picker fields are read-only with no
  input mode and bring up no keyboard, so they are outside FR9.
- **Gap 4 — The inputs of Typeahead and Tokenizer.** BaseTypeahead's input has
  no keyboard handling. BaseTypeahead reads the visual viewport height
  itself to size its list, outside the keyboard module.
- **Gap 5 — Tokenizer's sheet search field.** Partly met: the field sits in a
  Tall sheet, so BottomSheet's hook covers it only when the sheet is fully
  expanded. A partly expanded sheet gets nothing.
- **Gap 6 — The search row of Selector and MultiSelector.** On a coarse
  pointer the row sits in a `hug` BottomSheet, which BottomSheet's hook does
  not cover, and it has no keyboard handling of its own.
- **Gap 7 — PowerSearch.** On a compact coarse-pointer screen its default
  presentation is its sheet flow (`component:PowerSearch` DEC-3): Tall bottom
  sheets, where BottomSheet's hook covers the search and value fields only
  while the sheet is fully expanded, as Gap 5 states for Tokenizer. Its query
  input (Gap 4) and the text and number fields of its popover value editor
  render there only with `presentation="popover"`, and everywhere else by
  default; they have no keyboard handling. Keeping the popover itself above the
  keyboard is `spec:AST-059`'s.
- **Gap 8 — CommandPalette's search input.** It sits in a Dialog and has no
  keyboard handling.
- **Gap 10 — Fields in a fixed host the app builds.** Partly met: TextInput,
  TextArea, and NumberInput ride the app's own fixed bottom bar or a fixed
  Toolbar (Gap 2). In a BottomSheet that is not a fully expanded Tall sheet, a
  scroller in the sheet reveals them when it can bring them above the keyboard.
  Otherwise the document reveals the field where its scroll moves the sheet, as
  in Safari while its keyboard shows; elsewhere Core undoes that scroll and pans
  the visual viewport to the field instead. A sticky bottom bar, and the other
  covered fields in any of these hosts, have no handling that keeps the field
  above the keyboard.
- **Gap 11 — The missing scroll range.** Partly met: for TextInput, TextArea,
  and NumberInput, the keyboard module moves an app's docked fixed container to
  the keyboard's top, and scrolls a field's nearest scroller to put it 10 CSS px
  above the keyboard in the frame the keyboard is reported
  (`packages/core/src/keyboard/keyboardTarget.ts`). No field adds the missing
  scroll range at its scroller's end. Until one does, an element that has
  nothing to scroll does not count as a scroller, and a field on a page with
  nothing to scroll keeps the browser's own reveal. Where a field's scroll area
  cannot place it, the document reveals it, in the page and in a fixed container
  where the document's scroll moves that container. Where the document cannot
  scroll far enough, as at a short page's end in Chrome, Core pans the visual
  viewport for the rest in the same frame. In Firefox for Android the pan moves
  nothing where the page has no scroll range, so a field in a low scroll area, a
  floating panel or a sheet of a set height stays under the keyboard. In Safari
  the document's scroll reaches into the room the keyboard takes. On Android
  Chrome with Remove animations on, Core undoes Chrome's centring pan only when
  it matches Chrome's own reveal (within 2 px); in that window an app that
  itself centres the focused field is undone too. BottomSheet's inset stays
  local to its own sheet.
- **Gap 12 — A fully expanded sheet's hide in Firefox for Android.** Firefox
  for Android reports no keyboard slide, so the sheet takes the same path as in
  Safari on iOS (`packages/core/src/keyboard/useMobileKeyboard.ts`). But
  Firefox reports the keyboard's hide once, at its end. The sheet's content
  moves at that report, in one frame, instead of riding from the blur (FR3).
- **Gap 13 — The rise in Chrome on Android.** When the keyboard opens, a field
  in scrolling content moves into place in one frame, with no rise beside
  Gboard's slide. Chrome checks the focused field in the resize's own commit
  and pans to a field it finds covered, so the reveal finishes in that frame.
  Firefox for Android takes the same path.

### Follow-up

Riding floating bars and composing with an app's own `translate` are open work
beyond FR9. FR9 leaves a fixed container that floats above the bottom edge, or
that sets its own `translate`, to the app.

## Verification

| Contract | Verification                                                                                                 | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Source boundary check over Core and Lab plus a shared test that drives one keyboard change                   | each listed consumer; a new keyboard-aware component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Two components reading different heights for one keyboard, or a component measuring by a rule other than FR2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR2      | Module tests driving visual-viewport resize and scroll events                                                | keyboard shown; hidden; page panned with the keyboard shown; offset without a keyboard; page pinch-zoomed with and without the keyboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A pan that lowers the reported height, or a height when no keyboard is shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR3      | Consumer tests of computed layout, plus a public-surface check                                               | keyboard shown and hidden; composer, bottom search field, tab bar search, Tall sheet; no animation running; a ride animation running with the composer, a scroll view, and a header together; a Tall sheet's field blurred in Safari on iOS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A consumer whose layout ignores the height, layout that is only correct after an animation, riding surfaces out of sync on one keyboard change, per-frame layout work during a ride, content hidden or unscrollable at the resting value, or a public CSS custom property, export, or prop for the height; a Tall sheet's content jumping at a late keyboard report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR4      | Focus-route tests with document scroll spies                                                                 | tap, previous and next buttons, Tab, programmatic focus, Done then tap, app resume while scroll-locked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A route where the browser scrolls the document to reveal the focused control, or a slipped scroll left in place; FR9's own reveal scroll by the field's nearest scroller is not a failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR5      | Surface move tests                                                                                           | sheet drag between heights, drag to dismiss, close, with a focused field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The field stays focused after a move starts, or content jumps on the first frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR6      | Capability tests with the user agent varied                                                                  | visual viewport shrinking with a fixed layout viewport; Chrome on Android reporting keyboard geometry; a desktop browser with the API and no on-screen keyboard; a page that is not a secure context; neither                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Behavior that changes with the user agent alone, or a height taken from the browser's keyboard geometry report instead of FR2's measurement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR7      | Tests in an iframe and in a top-level document                                                               | the same keyboard event sequence in both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A non-zero value or a claimed focus inside an iframe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR8      | Chrome on Android in the emulator with Gboard, top-level document, plus a consumer documentation check       | keyboard show and hide with the composer and a Tall sheet; a Lab bottom search field; reduced motion on; focus inside a keyboard-aware field, which rides by the visual-viewport height; an app with `interactive-widget=resizes-content`, focus inside and outside keyboard-aware fields, where a field's keyboard height is 0; Back: the ride starts at Chrome's hide report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A Core surface jumping after the keyboard settles, lagging the keyboard by more than a frame, left under the keyboard, moved by JavaScript per frame, or committing layout more than once; a Lab surface riding instead of committing at rest; anything travelling with the keyboard under reduced motion instead of DR2's cross-fade; the app's viewport setting overridden; a keyboard-aware field not riding by the visual-viewport height, or adding an offset under `interactive-widget=resizes-content`; or the setting missing from the docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR8      | Firefox for Android in the emulator, top-level document                                                      | focus routes, keyboard shown and hidden, page panned and pinch-zoomed, a sheet moved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The page lurches, the field ends under the keyboard, or the height is wrong after a pan or zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR2–FR5  | Safari on iOS in the iOS Simulator or on a device, top-level document                                        | focus routes, keyboard shown and hidden, page panned and pinch-zoomed, a sheet moved, ChatLayout's composer, in Safari and as a home-screen app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The page lurches, the field ends under the keyboard, or the height is wrong after a pan or zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR2–FR5  | Release gate: a physical iPhone in a top-level document (DEC-3)                                              | iPhone Safari with the toolbar expanded and collapsed; iPhone home-screen app; the phone's refresh rate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The page lurches, the field ends under the keyboard, or the surface does not follow the keyboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR3–FR4  | ChatLayout's keyboard tests in jsdom and its interaction proofs in Chromium and WebKit                       | the fixed and the sticky dock with the keyboard shown and hidden; the message area's end padding; a transcript at its newest message; a page pinch-zoomed with the keyboard up; focus by tap, Tab, `focus()` and Done, under a finger and under a mouse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The dock left under the keyboard or lifted with none; the newest message unable to scroll above the composer; a transcript at its newest message left behind; the page panned to the composer's text under a finger; focus left in the text after Done, or the composer group focusable outside Done's park                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR8      | ChatLayout's interaction proofs in Chromium with Chrome's keyboard report                                    | the dock riding Gboard's slide up from the report and down from the blur; reduced motion on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The dock lagging Gboard's slide, laying out or painting per frame, or jumping at the hand-back; the dock travelling under reduced motion instead of DR2's cross-fade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR9      | ChatLayout's keyboard tests in jsdom                                                                         | ChatComposer in the fixed and the sticky dock, above the keyboard after each focus route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ChatComposer ending under the keyboard, or moved a second time inside its dock, after any focus route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR9      | TBD (Gap 1–11): a focus test per covered field, driving one keyboard change                                  | each covered field in the page, a Tall and a `hug` BottomSheet, ChatLayout's fixed and sticky dock, an app's fixed bar docked to the bottom edge with no `translate` of its own, and a fixed Toolbar docked there; focus by tap, Tab, and `focus()`; a field in scrolling content in the page and in a nested scroller; a field near its scroller's end; a field in a scroller inside a full-viewport fixed container                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A focused page field or Core-host field left under the keyboard or less than 10 CSS px above it (a field with no scroller between it and a fixed container FR9 leaves to the app keeps the browser's own reveal and is not a failure; a field that a scroller holds inside such a container, left under the keyboard, is a failure), a field in an app's docked bar whose bar's bottom does not meet the keyboard's top, scroll range left at the scroller's end after the keyboard hides, a page pan or translate, a reveal later than the frame the keyboard is reported in (on iOS the rise starts in that frame and settles as FR9 states), or a second offset inside a host that already applies the height                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR9      | TBD (Gap 1): a source boundary check over the covered fields                                                 | every covered field's props type and source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A public prop, option, or context for the behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR9      | TBD (Gap 1–11): Safari on iOS in the iOS Simulator and Chrome on Android in the emulator, top-level document | TextInput in the page, ChatComposer in its dock, a Selector search row in its sheet, and a TextInput in a fixed Toolbar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The field ends under the keyboard, or the page lurches. A docked toolbar that rests under the keyboard while a field outside it has focus is not a failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR9      | Firefox for Android in the emulator, top-level document                                                      | TextInput in the page, revealed by the document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The visual viewport's offset differs from the reveal's computed distance (the field's bottom plus 10 CSS px, less the keyboard's top), or the field ends under the keyboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR9      | Firefox for Android in the emulator, top-level document                                                      | TextInput in the page: focus it, then close the keyboard with Back, at normal speed and on a slow profile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The page ends other than where it was before the reveal (to 0.5 CSS px)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR9      | Chrome on Android in the emulator with Gboard, top-level document                                            | TextInput in the page and in an app's docked toolbar, at normal speed, with animations removed, and on a slow profile; TextInput at a short page's end, in a scroll area under the keyboard, in a floating panel, and in a sheet of a set height                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Chrome adds a visual-viewport pan after Core places the field, or a field Core pans ends other than 10 CSS px above the keyboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR9      | TBD (Gap 11): a ride test per covered field, plus physical-device evidence under DEC-3                       | each covered field in a fixed bottom bar, a sheet, an app-owned bar whose layout box sits at the viewport's bottom edge; an app bar the app lifts to the keyboard's top on the same visual-viewport resize, with its listener running before and after Core's; an app bar the app lifts part of the way with its own transform; an app bar the app lifts behind a CSS transition or animation still running when Core measures; an app bar the app lifts from script with its own `translate`; a keyboard that changes height while focus stays in a docked bar; an app bar centred with its own `translate`; an app bar floating above the bottom edge; an app-owned fixed container that fills the viewport, with and without a scroller holding the field; a full-height side drawer with a scroller holding the field; a tall pane below a fixed header with no scroller and a field near its top; the same pane with a field near its bottom; keyboard show and hide; the field blurs; the field unmounts; reduced motion on | The docked container stays put, lags or jumps after the keyboard settles, a Core host or content field less than 10 CSS px above the keyboard, an app bar left under the keyboard or above its top edge once the keyboard settles, a move left on an app element after the keyboard hides once focus has left the field, or after the field unmounts, any other change on an app element, a bar the app lifts moved a second time, a bar the app is moving with CSS motion moved by Core, a bar with its own `translate` moved, a docked bar not updated when the keyboard changes height, a floating bar moved, the app's transform replaced, a bar with its own `translate` moved or its `translate` changed, the page is panned or translated, a fixed container that fills the viewport, or whose layout box is not at the bottom edge, moves, or a Core host that already rides is moved twice; a too-tall docked container moved when a scroller holds the field or when the field already clears the keyboard, moved more than the field needs to clear it, or a field near its bottom left under the keyboard; a field that a scroller holds inside a container FR9 leaves to the app, left under the keyboard. A container FR9 leaves to the app (floating above the bottom edge, with its own `translate`, or full-viewport) left under the keyboard, or a page pan from the browser's own reveal for a field with no scroller between it and that container, is not a failure |
| FR9      | Safari on iOS in the Simulator, top-level document                                                           | A TextInput in the middle of a page that scrolls the document: tap it and read every drawn frame until the keyboard settles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The field reaches its place in one frame with no position between, or settles more than 0.15 s after the keyboard settles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR9      | Safari on iOS in the Simulator, top-level document                                                           | A TextInput in the middle of a page that scrolls the document: focus it, then close the keyboard with Done; again after a scroll of the page while the keyboard shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The page ends other than where it was before the reveal (to 0.5 CSS px), or a scroll the person made while the keyboard showed is undone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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

### DEC-3 — Simulators gate merge; a physical iPhone gates release

**Reference:** `spec:AST-099/DEC-3`
**Decider:** `cixzhang`, `2026-10-24`

Simulator and emulator evidence in a top-level document, with Gboard on the
Android emulator, is enough to merge keyboard work, so it is not blocked on
hardware, while a pass on a physical iPhone, including the phone's real
refresh timing, is required before the keyboard module ships in a release,
because keyboard timing and viewport behavior differ on real devices. Android
claims rest on emulator evidence and need no human device check
(`spec:AST-094` DEC-27).

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

### DEC-5 — Core inputs work with the keyboard, with no prop, and docked fields ride it

**Reference:** `spec:AST-099/DEC-5`
**Decider:** `cixzhang`, `2026-11-03`

Core inputs work with the on-screen keyboard. On a touch device, keeping a
focused field above the keyboard is the expected default for every Core field
that brings up the keyboard, not an add-on. The behavior is internal to each
such field, so no app has to remember to turn it on and no public API grows for
it.

Riding the keyboard is possible for every Core field, also decided on
2026-11-03: a field docked at the bottom of the viewport moves its docked
container up and back with the keyboard, even when the app owns that container,
because a docked bar that jumps or hides under the keyboard feels broken. This
is the one exception to FR3's rule that a component moves only its own elements,
and `architecture:react-component-runtime` INV11 admits it.

The owner set the scope on 2026-11-03. An app-owned container moves only when it
is fixed and docked to the viewport's bottom edge; a fixed container that fills
the viewport never moves. Page content Core reveals or moves is never panned or
translated; inside a fixed container FR9 leaves to the app (one floating above
the bottom edge, one that sets its own `translate`, or a full-viewport one), a
field that a scroller holds is revealed by that scroller, and only a field with
no scroller between it and the container keeps the browser's own focus reveal,
which in Safari may pan the page. A field in scrolling content is scrolled into
place by its nearest scroller, the document included, 10 CSS px above the
keyboard, in the same frame the keyboard is reported. A field near its
scroller's end gets the missing room as scroll range at the scroller's end while
the keyboard shows. Only a docked container is translated. A container is docked
when its layout box, before any transform, sits at the viewport's bottom edge,
and it moves by the distance from its bottom as drawn, after the app's own lift,
to the keyboard's top, so a bar the app already lifts is not lifted twice and no
opt-out is needed. Core leaves a bar the app is moving with a CSS transition or
animation that is running when Core measures, and never moves a bar with its own
`translate`; a CSS lift the app starts after Core has measured can be lifted
twice, and an app that lifts its bar from script positions it with its own
`translate` to keep it clear. A bar that floats above the bottom edge, or
positions itself with its own `translate`, is left to the app. A docked
container too tall to fit above the keyboard once moved, such as a full-height
side drawer or a pane below a fixed header, does not move when a scroller holds
the field, which that scroller reveals; when no scroller holds it, the container
moves only as far as the focused field needs to clear the keyboard, never more
than its own overlap, so the field stays in view even if the container's top
leaves the screen.

Rejected: an opt-in prop or per-component keyboard handling; leaving an app's docked bar to the browser's reveal.

### DEC-6 — In Chrome on Android, the focused field is placed above the keyboard at its first report

**Reference:** `spec:AST-099/DEC-6`
**Decider:** `cixzhang`, `2026-11-03`

In Chrome on Android, at the keyboard's first report the content is placed
in one frame so the focused field's bottom sits just above the keyboard's
top, and the content then rides the rest of the keyboard's slide. Chrome
pans the page itself, by the keyboard's whole height, if the focused field is
still drawn below the keyboard about 100–170 ms after the report. The page
gets no frame until that pan ends, so a pan can only be put back as a snap.
Chrome blanks the area below the keyboard's top while the placement happens.
On the Android emulator with Gboard, the one-frame placement showed no pan in
12 shows, including at 4× CPU and with the ride slowed 5×. A slide that
reached the keyboard's top within 50 ms showed a pan in 1 of 8 shows, and in
1 of 4 at 4× CPU. The owner team's side-by-side recording showed a pan in 0
of 5 shows for the placement and in 7 of 8 for the slide.

In Chrome on Android, a hide nothing on the page predicts, such as Back, is
reported partway through the keyboard's slide; the content rides down from
that report.

Rejected: a fast slide, which Chrome's pan still overtakes when the page stalls; the VirtualKeyboard overlay setting, which changes DEC-4's measurement source and the page's layout.

## Open questions

None.
