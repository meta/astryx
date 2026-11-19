---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Item
platform_of: component:Item
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    interaction,
    motion,
    theming,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-057, spec:AST-082, spec:AST-093, spec:AST-112]
---

# Item (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | React Native exports `Item` under its core name with core's props and meanings, and adds what a phone row has: `onLongPress`, `stateLabel`, `endValue`, `variant`, `labelEndContent`, the `table` density, and the `ItemGlyph` part. Its swipe actions are `swipeActions`, `swipeBehavior`, `isFullSwipeAllowed` and `backGesture` (OQ1).                                                                    |
| Behavior                | Draws core's row from theme tokens: marker, start content, the label over or beside its description, end content. A press runs the row's action, then opens its `href`. A list row or a bare row with swipe actions swipes in any container, on the UI thread where the native swipe row is present. At accessibility text sizes, words in the end slot move under the label.                                |
| End-user impact         | A person gets rows that press, hold and swipe like the platform's list rows wherever they sit, hears each List row as one screen-reader stop, and reaches every swipe verb as an accessibility action. Large text wraps a row's words instead of cutting them.                                                                                                                                               |
| Builder impact          | Slots take React nodes. The web base props, `target`, `rel` and core's `swipe` value are not offered (OQ1). A row's look comes only from the theme.                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Not yet released; additive. Draft. Where the row differs from `component:Item` or `spec:AST-057`, a gap line under Current-state impact says so.                                                                                                                                                                                                                                                             |
| Review checks           | Reject a visual value not from the theme, opacity for the disabled look, a static List row read as several stops, a swipe verb with no accessibility action, a swipe on an option, menu or radio row, a swipe that takes a vertical drag, a press that activates after its touch became a drag, a link opened for a refused destination, end words cut at large text, or a prop the row accepts and ignores. |
| Governing rules         | `component:Item` FR1–FR6, FR9; `spec:AST-057` FR3–FR8, AR1, DEC-3, DEC-9; `family:navigation-destinations` FR4; `spec:AST-082` FR3, FR4, FR7, FR17; `spec:AST-093` FR2–FR4; `spec:AST-124` FR3, FR6, FR11–FR13, DEC-7; `spec:AST-130` FR5, FR6, FR8; `spec:AST-128` FR4; DEC-1–DEC-4 below.                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Item is the row behind every list, menu, picker and settings screen. On a
phone, a row is also where a person presses, holds and swipes, and where large
text matters most. Item on React Native keeps core's row and its vocabulary,
and behaves like the platform's own list rows in any container. This record
states only what React Native adds to `component:Item` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable; a swipe row's open state
  is its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: the row also takes `onPress`, a second name for `onClick`; when
  both are set, `onPress` runs and `onClick` does not.
- FR4 gap: under `center`, a `StatusDot` or `Badge` in the start or end slot
  moves itself onto the label's first line, where core's `center` centres it
  on the words and `first-line` is the value that places it there.
- FR5 gap: a row that is both selected and highlighted paints the highlight
  fill; core's selected fill wins.
- FR11 gap: the prop is named `tone`, not `variant`.
- FR12 gap: the row takes `labelWeight` (`normal`, `medium`, `semibold`,
  `bold`), a visual prop that sets the label's weight.
- FR13 gap: `ItemGlyph`'s colour prop is named `tone`, not `variant`.
- FR14 gap: a release is decided by its position alone. A fast release (0.6
  dp/ms after 44 dp of travel) fires the outermost entry instead of opening or
  closing the row by its direction, and on a side with two or more entries a
  full swipe that starts on the row's content fires too (`spec:AST-057` FR5,
  DEC-9).
- FR14 gap: past the confirm point the row follows the finger at 0.35 of its
  travel instead of running ahead toward its far edge (`spec:AST-057` FR5).
- FR14 gap: under Reduce Motion a settle jumps to its resting place with no
  cross-fade (`spec:AST-057` FR5).
- FR14 gap: `swipeBehavior="commit"` with two or more entries on a side gives
  no development warning (`spec:AST-057` FR3).
- FR15 gap: an open row does not close on Escape from a hardware keyboard
  (`spec:AST-057` FR7).
- FR15 gap: the row also takes `isBackSwipeAllowed`, a second prop for
  `backGesture="always"`, which it ignores when `backGesture` is set.
- FR16 gap: where the native swipe row is absent, or a `backGesture` row's
  native swipe row has no per-side drag rules, the row draws the swipe in
  JavaScript.
- AR4 gap: a row resting open under `reveal` hides its entries from screen
  readers, where `spec:AST-057` AR1 makes each a focusable button named by its
  `label`; the entries stay reachable as the row's accessibility actions.

## Ownership boundary

**Owns**

- Item's React Native props, the `ItemGlyph` part, and the props React Native
  adds (FR1, FR9–FR13).
- The row's layout, words, alignment, states and press on React Native
  (FR2–FR8).
- The swipe on any row: its gesture, its arbitration with scrollers and back
  gestures, and the native path it runs on (FR14–FR16).
- How the row reads to VoiceOver and TalkBack, in and outside a List row
  (AR1–AR9).

**Does not own / non-goals**

- The meaning of core's props and the `first-line` geometry — owned by
  `component:Item`.
- Swipe-action semantics — owned by `spec:AST-057`.
- Which destinations a link may open — owned by
  `family:navigation-destinations`.
- The native swipe row and the gesture owner view — owned by `spec:AST-124`.
- Haptic kinds, the accessibility settings snapshot and the binary's named
  features — owned by `spec:AST-130`.
- The action sheet — owned by `spec:AST-128`.
- List markers, dividers, separators and grouping — owned by `List` and
  `ListItem`.
- What a slot draws — owned by the component in it.

## Public concepts

| Concept        | Closed values or states                                              | Meaning                                                                                                           | Availability by variant/orientation/state | Default    | Owner                         | Stability    | Invalid-value behavior                |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------- | ----------------------------- | ------------ | ------------------------------------- |
| density        | `compact`, `balanced`, `spacious`, `table`                           | core's three paddings, plus `table`: a table cell with its text at `space.s4` and at least the touch minimum tall | always                                    | `balanced` | `component:react-native/Item` | experimental | an unknown value is a type error      |
| control        | static, button (`onClick`, `onLongPress`), link (an accepted `href`) | what a press does; the drawing is the same                                                                        | always                                    | static     | `component:react-native/Item` | experimental | a refused `href` leaves the row inert |
| variant        | `default`, `destructive`                                             | the label and leading slots in the error colour, as a platform's destructive row                                  | always                                    | `default`  | `component:react-native/Item` | experimental | an unknown value is a type error      |
| swipe behavior | `reveal`, `commit`                                                   | `reveal`: the row can rest open; `commit`: a release fires or closes, nothing rests                               | with swipe entries                        | `reveal`   | `spec:AST-057`                | experimental | an unknown value is a type error      |
| back gesture   | unset, `always`, `atLeadingEdge`, `never`                            | when a back gesture may begin on a drag that starts on a swipe row                                                | with swipe entries                        | unset      | `component:react-native/Item` | experimental | an unknown value is a type error      |
| swipe state    | closed, dragging, settling, resting open, held out                   | where the row is in its swipe                                                                                     | with swipe entries                        | closed     | `component:react-native/Item` | experimental | none                                  |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                      | Draft review state |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native MUST export the component as `Item` (`spec:AST-082` FR3) with core's `label`, `description`, `marker`, `startContent`, `endContent`, `align`, `density`, `labelLines`, `descriptionLines`, `layout`, `onClick`, `href`, `isHighlighted`, `isSelected` and `isDisabled`, with core's meanings and defaults (an unset line limit is OQ2's, FR3), and the base props `id` (the root's test id and native id) and `isHidden` (`spec:AST-082` FR7). `label` is words; the slots take React nodes, and `description` takes words or a node, which draws under the label as given in the description's colour (`spec:AST-082` FR4). The web base props (`as`, `interactiveRef`, `ref`, `xstyle`, `className`, `style`, `data-testid`) and the link's `target` and `rel` belong to the web contract (`spec:AST-082` FR3, FR7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-082` FR3, FR4, FR7                                               | verify             |
| FR2  | The row MUST lay out marker, start content, the words and end content in that order, a gap of `space.s2` apart, the words taking the remaining width. Block and inline padding are `space.s1` and `s2` for `compact`, `s2` and `s2` for `balanced`, `s3` and `s3` for `spacious`, and `s2` and `s4` for `table`, whose row is at least the touch minimum tall (44 points on iOS, 48 dp on Android), grown with the text size. A row has the element radius, and is square inside a row group (a divided or bleed `List`, a grouped card) so its fills reach the group's edges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:Item` styles; DEC-4                                             | verify             |
| FR3  | The label MUST draw in the body type and `color.textPrimary`, the description in the supporting type and `color.textSecondary`, both scaled with the system text size. A `labelLines` or `descriptionLines` above zero limits its words to that many lines and ends them with an ellipsis; unset or zero, they wrap to every line (OQ2). With `inline` and a description, the label and description share one line each, `space.s1` apart on their baseline, and the description gives way first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:Item` styles                                                    | verify             |
| FR4  | `align` MUST place the start and end slots as core's alignment does (`component:Item` FR1–FR4): `center` on the words, `start` at their top, and `first-line` on the label's first line. Under `first-line` each slot sits in a box one label line tall, and a taller slot moves the words down by half the difference, so the row grows; React Native has no CSS, so the row reads its slots' heights from layout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:Item` FR1–FR4                                                   | verify             |
| FR5  | `isSelected` MUST paint `color.accentMuted` behind the row, or `color.overlayPressed` where the theme's `color.accentMuted` is the page or surface colour itself, so a selection never vanishes into its backdrop. `isHighlighted` paints `color.overlayHover`. A selected row's fill wins. `isDisabled` draws the label, the description, the end value and the row's foreground, which slot content that takes the surrounding colour reads, in `color.textDisabled`, never with opacity. An interactive row with keyboard focus draws the theme's focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:Item` styles; `spec:AST-093` FR4                                | verify             |
| FR6  | A row with `onClick`, `onLongPress` or an accepted `href` MUST be interactive. A press runs `onClick`, then opens the `href` through the app's `LinkProvider`, else the host's link service. A script URL or an HTML document in a `data:` URL is refused (`family:navigation-destinations` FR4): nothing opens, and a row whose only action it is stays static. A disabled row runs nothing. Its touch area reaches 44 points on iOS and 48 dp on Android without growing the drawn row. On iOS a press paints `color.overlayPressed` under the content after a 150 ms onset, shows a quick tap for at least 100 ms, and fades on release over the theme's medium duration, with no fade under Reduce Motion. On Android it draws a bounded ripple in `color.overlayPressed`. A touch that travels past the press slop, leaves the row, or is taken by a scroll or a gesture drops the paint and activates nothing. A press that starts on a control inside the row is that control's, and the row neither paints nor activates (`component:Item` FR9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:Item` FR9; `family:navigation-destinations` FR4; `spec:AST-130` | verify             |
| FR7  | `onLongPress` MUST run when the row is held for 500 ms. The hold consumes the touch: its release runs nothing else, and a touch that moves past the press slop first runs neither.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-4                                                                      | verify             |
| FR8  | At a text scale of 1.6 and above (iOS's accessibility sizes, AX1 up), end content that is words (a `Text`, a `Badge`, a `Timestamp`, plain words, a group of those, or a labelled `Button`) MUST move under the label and description, start-aligned, and the end value moves there too. A compact control or mark (a switch, a checkbox, an icon, a chevron, a status dot) stays at the end. On Android a label word too long for its line hyphenates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-3                                                                      | verify             |
| FR9  | `endValue` MUST draw in the label's type and `color.textSecondary` before the end content. Below AX1 it wraps rather than ending in an ellipsis, its slot shrinking with the label up to half the row's width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-4                                                                      | verify             |
| FR10 | `labelEndContent` MUST follow the label on its line, `space.s2` after it, and move to the next line when the label fills the line, so the label is never cut for it. It takes no first-line shift (FR4). With `inline` it sits on the label's line before the description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DEC-4                                                                      | verify             |
| FR11 | `variant="destructive"` MUST draw the label and the leading slots' ink in the theme's error colour, stepped to a contrast of 4.5:1 against the surface, the page and the pressed fill where the token falls short, as `DropdownMenuItem`'s destructive variant names the same concept. Trailing content keeps its own colour, and `isDisabled` wins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-4; `architecture:public-component-api`; `spec:AST-093` FR4             | verify             |
| FR12 | The label MUST draw in the theme's body weight. The row takes no visual prop of its own for the label (`spec:AST-082` DEC-2, `spec:AST-093` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-082` DEC-2; `spec:AST-093` FR4                                   | verify             |
| FR13 | `ItemGlyph` MUST draw a square tile with a `monogram` or an `icon`, `max(size.elementMd, the label line + space.s2)` on a side, so it grows with the text size. Its tile is `color.backgroundMuted` in `radius.inner`, with letters in the label type, semibold, in `color.textSecondary`, or an `Icon` in `color.iconSecondary` (`spec:AST-082` FR17). A `variant` (core's colour-variant names) draws the tile in `color.background<Variant>` with `color.text<Variant>` letters or a `color.icon<Variant>` icon. Item knows the tile's width without a layout pass, so a `List` whose separators start at the text places them from the first frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-4                                                                      | verify             |
| FR14 | A `ListItem` row or a bare `Item` with swipe entries that is neither disabled nor hidden MUST swipe in any container (DEC-1), as `spec:AST-057` FR3–FR5, FR7 and FR8 state. The option, menu and radio rows that `Selector`, `DropdownMenu`, `RadioList` and `CheckboxList` render with Item take no swipe entries (`spec:AST-057` DEC-3). `swipeActions` holds the `leading` and `trailing` entries, outermost last; each is `{id?, label, icon?, onActivate, isDisabled?, variant?, hasRemoval?, menu?}`. The axis is decided once, after `space.s2` of travel, and a mostly vertical drag stays the scroller's. Under `reveal` a release goes by its speed first, then opens the row past half the panel's width and closes it short of that; a flick never fires an entry. Dragged past the confirm point (the side's panel plus 48 dp, or half the row, whichever is more), the row runs ahead toward its far edge with the outermost entry covering its place, and a lift there fires the outermost entry once the row has slid out; on a side with two or more entries a full swipe confirms only as `spec:AST-057` DEC-9 says. Under `commit` only a lift past the confirm point fires, and nothing rests. After an entry fires, the row returns unless the entry has `hasRemoval`. Settles use the theme's `quick` spring from the release speed, and a slide-out passes the edge by 24 dp over 200 ms; under Reduce Motion the row reaches its resting place with no travel or spring and cross-fades (`spec:AST-057` FR5). With `isFullSwipeAllowed={false}` a long swipe only reveals and an entry fires on a tap, and `commit` with it warns in development and reveals. An entry with a `menu` opens an action sheet titled by the entry's label instead of firing (`spec:AST-128` FR4), with destructive choices in red. | `spec:AST-057` FR3–FR5, FR7, FR8, DEC-3, DEC-9; DEC-1                      | verify             |
| FR15 | An open row MUST close on a touch outside it, on a touch that starts another swipe row, on a vertical drag on it, on a tap on its content, on Escape from a hardware keyboard, and when an entry fires. A touch that closes a row does only that: a press it lands on does not activate. Screen-reader actions are not touches. A closed row owns a horizontal drag toward a side with entries, and an open or moving row owns both directions. Inside a vertical list that took the touch before the row's slop, the row still follows a horizontal drag; inside a horizontal scroller, the drags the row does not own stay the scroller's. Once the row holds a drag, it does not hand it over. `backGesture` decides the back direction for a closed row: unset, the row keeps a drag toward a side with entries, and the content-wide back swipe yields; `always` and `atLeadingEdge` give the back direction to the back gesture, alike on a row, which has no scroll edge; `never` keeps it even without entries on that side. An open row closes first under every value, and on iOS the screen-edge back swipe always goes back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-057` FR6, FR7; `spec:AST-124` FR3                                | verify             |
| FR16 | Where the native swipe row is present, the swipe MUST run on it (`spec:AST-124` FR6): the pan, the axis gate, the release choice with FR14's numbers, the spring, the slide-out, interruption at touch-down, Reduce Motion and right-to-left all run on the UI thread, and JavaScript hears only the swipe's begin, threshold, settle and commit. A row with `backGesture` runs on a native swipe row with per-side drag rules, a named feature (`spec:AST-130` FR8); on a native swipe row without them, the row keeps the rule for an unset `backGesture` and warns once in development. Where the native swipe row is absent (`spec:AST-124` FR11, DEC-7), the row takes no swipe drag: every enabled entry stays reachable as one of its accessibility actions (AR4), and the row warns once in development. A drag across the commit point plays the `threshold` haptic each way, and a full swipe that fires plays `commit` (`spec:AST-130` FR6); a tap on an entry and an accessibility action play none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-124` FR1, FR6, FR11, FR13, DEC-7; `spec:AST-130` FR6, FR8        | verify             |

### Allowed variation

- **AV1 — Touch area.** An interactive row's touch area may extend past its
  drawn edges to the platform's minimum.
- **AV2 — Press feedback.** iOS paints a fill and Android draws a ripple, each
  the platform's own row feedback.
- **AV3 — Line metrics.** A line's height comes from the theme's leading over
  the platform's own text metrics, so a face can differ by a point.

### Representative states

| State                                              | Required invariant                                                          | Allowed variation |
| -------------------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| each density                                       | FR2's padding; `table` at least the touch minimum tall                      | text size         |
| label and description, both layouts                | description under or beside the label                                       | none              |
| `first-line` with a tall slot                      | slot on the first line; the words move down                                 | slot size         |
| wrapped label with a status dot under `first-line` | the dot on the first line                                                   | text size         |
| selected, highlighted, disabled                    | each look from the theme; no opacity                                        | none              |
| static, button, link, refused link                 | the same drawing; only the first three press                                | AV1, AV2          |
| AX1 and up                                         | word end content and the end value under the label                          | none              |
| swipe rest open, commit, removal hold              | FR14's thresholds; one row open                                             | none              |
| native swipe row absent                            | no swipe drag; every entry an accessibility action; one development warning | none              |
| right-to-left                                      | slots and swipe sides mirrored                                              | none              |
| light and dark, two themes                         | each theme's colours                                                        | none              |

### Transformation and precedence order

- **ORD1 — Background.** Selected, then highlighted, then none.
- **ORD2 — Press.** `onClick` runs, then the `href` opens.
- **ORD3 — Control.** Disabled (nothing runs), then a row resting open (the
  press closes it), then the row's action.
- **ORD4 — Back gesture.** An open row closes first, then `backGesture`, then
  the row's entries.

### Performance and resources

- **PR1 — One measurement, when needed.** The row measures its slots only
  under `first-line` or when a `List` needs where its text starts; an
  `ItemGlyph`'s width comes from the theme.
- **PR2 — Swipe off the JavaScript thread.** On the native swipe row, no
  JavaScript runs per frame during a swipe or its settle (`spec:AST-124` FR1).

## Accessibility contract

- **AR1 — An interactive row is one element.** It is a link (an accepted
  `href`, enabled) or a button, named by the label, `labelEndContent`'s words,
  the description, the end value and the end content's words, in that order,
  with its selected and disabled state. `stateLabel` is its accessibility
  value. Soft hyphens are never spoken.
- **AR2 — A static row outside a List row reads its parts.** It is no element
  of its own; its parts read in slot order, and `stateLabel` is hidden words
  after its text.
- **AR3 — A static List row is one stop.** Inside a List row (`ListItem`, a
  List row frame), a static row is one element named by its words (DEC-2).
  When a slot holds a control, the words are one element and the control is
  its own stop after them; when the description or `labelEndContent` holds a
  control, every part reads on its own.
- **AR4 — Actions.** An interactive row offers activate. With `onLongPress` it
  offers the long-press action, labelled with the library's hold word. Every
  enabled swipe entry is an action labelled with its `label`, so no verb needs
  the gesture, and a static row with swipe entries becomes one element to
  carry them. Under `reveal`, while the row rests open, each entry is also a
  focusable button named by its `label`; while the row is closed, and always
  under `commit`, the panels are hidden from screen readers (`spec:AST-057`
  AR1).
- **AR5 — Disabled.** A disabled row stays in the reading order, reads as
  dimmed, and does nothing; a disabled row with an `href` reads as a button.
- **AR6 — Text size.** The words scale with Dynamic Type and Android's font
  scale, and FR8 keeps them whole at accessibility sizes.
- **AR7 — Touch area.** An interactive row's touch area is at least 44 points
  on iOS and 48 dp on Android (FR6).
- **AR8 — Focus return.** A pressable row is the view a sheet it opened or a
  screen it pushed returns screen-reader focus to.
- **AR9 — Quiet glyph.** `ItemGlyph` is hidden from screen readers; the row's
  words name what it shows.

## Design relationships

| Anatomy or state | Design requirement                                         | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Row              | a list row in any container                                | prescribed by core         | supporting     | FR2–FR5            |
| Press            | the platform's row feedback                                | prescribed by the platform | supporting     | FR6                |
| Large text       | secondary content under the primary at accessibility sizes | prescribed by the platform | supporting     | FR8                |
| Swipe            | uncovered actions behind the row                           | `spec:AST-057`             | supporting     | FR14–FR16          |
| Glyph            | a cell image or settings icon column                       | prescribed by the platform | supporting     | FR13               |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): a system list cell lives only inside its
system list, and Item is a row that sits in any container, so the row draws its
own layout from theme tokens and handles its own presses. Guideline pages (`spec:AST-093` FR3): Lists and tables, Buttons
and Accessibility in the Apple Human Interface Guidelines; Lists and
Accessibility in Material 3.

Theme values read (`spec:AST-093` FR4): `space.s1`, `space.s2`, `space.s3`,
`space.s4`, `space.s6`, `space.s12`, `size.elementMd`, `radius.element`,
`radius.inner`, `color.textPrimary`, `color.textSecondary`,
`color.textDisabled`, `color.accentMuted`, `color.overlayHover`,
`color.overlayPressed`, `color.backgroundMuted`, `color.backgroundSurface`,
`color.iconSecondary`, the error colour, the colour-variant tokens, the swipe
entry colours (`color.neutral`, `color.accent`, `color.onAccent`,
`color.onError`), the body, label and supporting type, the body weights, the
focus outline, the `quick` spring, the medium duration, and the haptic tokens.

### Native pieces

| Native piece                  | Record                         | What this record uses it for                                |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `AstryxSwipeRow`              | `spec:AST-124` FR6, FR12, FR13 | the swipe on the UI thread (FR16)                           |
| `AstryxGestureOwnerView`      | `spec:AST-124` FR3             | the swipe's drag ownership and `backGesture` (FR15)         |
| `AstryxHaptics`               | `spec:AST-130` FR6             | the swipe's threshold and commit feedback (FR16)            |
| `AstryxAccessibilitySettings` | `spec:AST-130` FR5             | Reduce Motion for the press fade and the swipe (FR6, FR14)  |
| `AstryxPlatformInfo`          | `spec:AST-130` FR8             | whether the native swipe row has per-side drag rules (FR16) |
| `AstryxActionSheet`           | `spec:AST-128` FR4             | a swipe entry's menu (FR14)                                 |
| React Native `Linking`        | `spec:AST-130`                 | the host's link service for `href` (FR6)                    |
| `Icon` resolution             | `spec:AST-127` FR4             | `ItemGlyph`'s icon (FR13)                                   |

## Family and system relationships

- `component:Item` owns the props and the row's look; this record states how
  React Native draws and runs them.
- `spec:AST-057` owns swipe-action semantics; FR14 states React Native's
  numbers and additions.
- `family:navigation-destinations` owns which destinations a link opens.
- `ListItem` renders its row with Item and passes its props, swipe included,
  through; `List`, `CheckboxList`, `RadioList`, `TreeList` and `Selector`
  render their rows with Item.
- Inside a `ContextMenu`, an interactive row also offers the menu's own
  accessibility action, which `ContextMenu` owns.

## Verification map

| Contract            | Verification                                                                                                                                                           | Representative states                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                                | Audit section                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| FR1                 | Type tests of Item's props against the core contract; a contract drift test                                                                                            | each core prop; each web-only prop                                                                                             | a renamed prop, an offered web-only prop, or an accepted and ignored prop fails                                                                                                                                                                                                | `audit:react-native/Item/api`        |
| FR2, FR3, FR9, FR10 | Unit tests of padding, gaps, line limits and wrapping through the package's testing doubles (`spec:AST-112` FR15); captures at the default and largest text sizes      | each density; one and three label lines; `inline`; a value and a label-end badge                                               | wrong padding or gap, a cut label, or a value wider than half the row fails                                                                                                                                                                                                    | `audit:react-native/Item/layout`     |
| FR4                 | Unit tests of the `first-line` offset and of the `center` and `start` slots at several text scales                                                                     | `first-line` with a tall slot; a wrapped label with a status dot and a chevron under `center`; a one-line row                  | a slot off the label's first line under `first-line`, or a `center` or `start` slot moved from core's place, fails                                                                                                                                                             | `audit:react-native/Item/align`      |
| FR5, FR11, FR12     | Unit tests with two themes, light and dark; a contrast check of the destructive colour                                                                                 | selected, highlighted, both; disabled; destructive; the theme's body weight                                                    | a wrong token, opacity on a disabled row, a destructive label under 4.5:1, or a label weight from anywhere but the theme fails                                                                                                                                                 | `audit:react-native/Item/states`     |
| FR6, FR7            | Unit tests of press order, the link opener, refused destinations and the hold; Simulator and emulator checks of press feedback                                         | onClick with href; disabled; a script URL; a quick tap; a drag; a hold                                                         | an activation after a drag, a refused link opened, or a hold that also presses fails                                                                                                                                                                                           | `audit:react-native/Item/press`      |
| FR8                 | Unit tests at AX1 and AX5                                                                                                                                              | words, a group of words, a Button, a switch, a chevron                                                                         | words left at the end at AX1, or a control moved under the label, fails                                                                                                                                                                                                        | `audit:react-native/Item/large-text` |
| FR13                | Unit tests of the tile size, colours and variants                                                                                                                      | each variant; monogram and icon; a large text scale                                                                            | a tile under the element size or a wrong token fails                                                                                                                                                                                                                           | `audit:react-native/Item/glyph`      |
| FR14, FR15          | Unit tests of the release rules, axis lock, close rules and arbitration through the testing doubles; Simulator and emulator checks in a list and a horizontal scroller | reveal, commit, removal hold, no full swipe, a menu entry; a vertical drag; a touch outside; each `backGesture`; right-to-left | a vertical drag claimed, a second open row, a press that activates on the closing touch, or a back gesture over an open row fails                                                                                                                                              | `audit:react-native/Item/swipe`      |
| FR16, PR2           | Unit tests with the native swipe row present, absent and without per-side drag rules; UI-thread frame checks                                                           | each path; a commit; Reduce Motion                                                                                             | JavaScript work per frame, a swipe drawn in JavaScript, a `backGesture` row on a native row without drag rules that changes the unset rule or gives no development warning, or an absent row that loses an entry's accessibility action or gives no development warning, fails | `audit:react-native/Item/swipe`      |
| AR1–AR9             | VoiceOver and TalkBack checks; unit tests of names, roles, states and actions                                                                                          | button, link, static, a List row, a control in a slot, swipe actions, a hold, disabled                                         | a List row read as several stops, a lost state, or a swipe verb with no action fails                                                                                                                                                                                           | `audit:react-native/Item/a11y`       |

## Decision log

### DEC-1 — A list row or a bare row swipes in any container

**Reference:** `component:react-native/Item/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

The platforms' own swipe actions belong to their system list views, while
Item is a row that sits in any container: a list, a card, a sheet. React
Native draws the row's swipe itself, on the native swipe row where it is
present, so a person gets the same swipe wherever a `ListItem` or a bare
`Item` is. Option, menu and radio rows stay out of scope, as `spec:AST-057`
DEC-3 rules.

### DEC-2 — A static List row is one screen-reader stop

**Reference:** `component:react-native/Item/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A UIKit cell and an Android list row read as one stop: "title, subtitle,
value". A static Item inside a List row reads the same way, and a control in
its slots stays a stop of its own. An Item outside a List row, or one an owner
already wraps in its own element (a checkbox or radio option, a tree row, a
selector option), keeps its parts.

### DEC-3 — At accessibility sizes, end words move under the label

**Reference:** `component:react-native/Item/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

UIKit's list cells put their secondary content under the primary at
accessibility text sizes. Item does the same with end content that is words
and with its end value, so the label wraps between words instead of breaking
inside one, while a switch or a chevron keeps its place at the end.

### DEC-4 — A phone row has the parts a platform cell has

**Reference:** `component:react-native/Item/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

React Native adds what platform list cells offer and core's row does not:

- the `table` density, a table cell's metrics;
- `endValue`, a value cell's trailing words;
- `variant="destructive"`, a destructive row such as Sign Out;
- `labelEndContent`, a title accessory such as a Beta badge, because the
  label is words here;
- `ItemGlyph`, a cell image or a settings icon;
- `stateLabel`, words for a state the row shows only as a glyph;
- `onLongPress`, the platform's hold.

## Open questions

- **OQ1 — Does React Native take core's `swipe` value?** (`human-api`) Core
  takes a row's swipe actions as `swipe`, the value `createSwipe` returns,
  whose handlers receive the entry's required id and the row's key
  (`spec:AST-057` FR1, DEC-10), and keeps `swipeActions` and `swipeBehavior`
  only as its deprecated path (`spec:AST-057` FR10). React Native takes them
  as `swipeActions` and `swipeBehavior`, whose entry ids are optional and
  whose handlers receive nothing. Options: offer `swipe` from `createSwipe`
  with core's handler arguments, beside FR14's own entry fields (`menu`,
  `isFullSwipeAllowed`, `backGesture`); or keep `swipeActions` and
  `swipeBehavior` as React Native's form, which leaves `swipe` in the web
  contract, a place `spec:AST-082` FR3 gives only to props a platform cannot
  honour.
- **OQ2 — What does an unset line limit mean?** (`human-api`) Core cuts an
  unset words label and an unset words description to one line; React Native
  wraps them to every line (FR3). Options: one line, as core, which keeps the
  prop's meaning the same on every platform (`spec:AST-082` FR3); or every
  line, which keeps a row's words whole at large text sizes and makes core's
  one-line default a web behaviour.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
