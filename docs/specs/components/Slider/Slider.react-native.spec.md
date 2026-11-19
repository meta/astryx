---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Slider
platform_of: component:Slider
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, interaction, motion, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Slider (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Slider` under its core name with core's single-value props and meanings (`value` is a number), and adds `valueText` (the value's words), `accessibilityStep` (a screen reader's step), `backGesture`, and `render` (`auto`, `system`, `drawn`; default `auto`), which picks the system or the drawn slider. The range form, `formatValue` and the web's styling and form props stay in the web contract (DEC-1, DEC-2). |
| Behavior                | Shows UISlider on iOS where the system slider applies (`spec:AST-126` FR2) and draws Astryx's slider elsewhere and on Android. The drawn thumb follows core's drag: past 10 dp of travel the value moves by the finger's further travel; a tap on the track sets the value on lift. A drag along the track is the slider's, at the screen edge too.                                                                                           |
| End-user impact         | A person drags the thumb without it jumping, feels the ends and the detents, keeps a slider at the screen edge draggable, and adjusts it with VoiceOver or TalkBack by a step that suits the value, hearing its words rather than a bare number.                                                                                                                                                                                              |
| Builder impact          | A builder passes the value's words with `valueText` instead of a formatter, and a coarser screen-reader step with `accessibilityStep` where one step per swipe is too fine. A range slider has no React Native form.                                                                                                                                                                                                                          |
| Compatibility/readiness | Not yet released; additive. Draft. Where the slider differs from this record or `component:Slider`, a gap line under Current-state impact says so.                                                                                                                                                                                                                                                                                            |
| Review checks           | Reject a thumb that jumps to the finger, a value change on a press that never moved, a swipe across the track that does not reach the scroller, a visual value not from the theme, opacity for the disabled look, a screen-reader step that ignores `accessibilityStep`, words read in place of `valueText`, or a prop the slider accepts and ignores.                                                                                        |
| Governing rules         | `component:Slider` FR1, FR4, FR5, FR7 and AR1; `spec:AST-126` FR2, FR4, FR9, FR11–FR14; `spec:AST-112` FR15, FR21; `spec:AST-124` FR3; `spec:AST-130` FR6; `spec:AST-082` FR3, FR4, FR7, FR11; `spec:AST-093` FR2–FR4; DEC-1–DEC-4 below.                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

A slider picks a number in a range by dragging a thumb: a volume, a price, a
playback position. Slider on React Native keeps core's control and its drag,
shows the system slider where the platform has one that fits, and states what a
phone adds: a screen reader's own step, the value's words, and a drag that
holds its own against the back gesture. This record states only what React
Native adds to `component:Slider` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled, as on the web: the app owns
  `value` and renders what `onChange` reports
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: Slider takes no `render`. The system slider shows where the theme's
  `native.presentation` or the app's `nativePresentation` entry for Slider asks
  for it, so under a theme and an app that ask for neither, iOS shows the drawn
  slider.
- FR5 gap: `onChangeEnd` carries the last value the slider emitted, not the
  value the owner renders after its response to `onChange`
  (`component:Slider` FR5).
- FR5 gap: the drawn thumb neither lifts nor drops back while held, and does
  not coast after a release; `onChangeEnd` fires at the release
  (`component:Slider` FR7).
- FR5 gap: each move of the drawn thumb renders the owner and the slider,
  where core writes each move to the thumb with no component render
  (`component:Slider` FR7).
- FR6 gap: the slider also takes `isBackSwipeAllowed`, a second prop for
  `backGesture="always"`, which it ignores when `backGesture` is set.
- AR6 gap: the drawn slider handles no key presses of its own (arrows, Page,
  Home, End); a hardware keyboard reaches it only through the platform's
  accessibility adjustments (`component:Slider` AR1).

## Ownership boundary

**Owns**

- Slider's React Native props and the props React Native adds (FR1).
- Which control shows the slider, and the drawn slider's anatomy, value
  display, drag, drag ownership and haptics (FR2–FR7).
- How the native slider's events and accessibility map onto Slider's props
  (FR8).
- How the slider reads to VoiceOver and TalkBack (AR1–AR6).

**Does not own / non-goals**

- The meaning of core's props, the range form and the drag model — owned by
  `component:Slider`.
- The label, description, status and their announcement — owned by
  `component:Field` and `component:FieldStatus`.
- The native slider, its `render` mapping and its accessibility — owned by
  `spec:AST-126`.
- The gesture owner view — owned by `spec:AST-124`.
- Haptic kinds — owned by `spec:AST-130`.
- A playback position's scrubber — owned by `MediaScrubber`.

## Public concepts

| Concept            | Closed values or states                   | Meaning                                                                                                                            | Availability by variant/orientation/state | Default                           | Owner                           | Stability    | Invalid-value behavior                |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------- | ------------------------------- | ------------ | ------------------------------------- |
| value display      | `tooltip`, `text`, `none`                 | the value in a bubble over the thumb while it is dragged, as words beside the label, or not shown                                  | always                                    | `tooltip`                         | `component:Slider`              | experimental | an unknown value is a type error      |
| value words        | `valueText`, else the number              | what the value display shows and a screen reader reads                                                                             | always                                    | the number in the locale's digits | `component:react-native/Slider` | experimental | an empty `valueText` reads the number |
| screen-reader step | `accessibilityStep`, else `step`          | how far one VoiceOver or TalkBack adjustment moves the value                                                                       | always                                    | `step`                            | `component:react-native/Slider` | experimental | zero or less uses `step`              |
| back gesture       | unset, `always`, `atLeadingEdge`, `never` | when a back gesture may begin on a drag that starts on a horizontal slider                                                         | horizontal                                | unset                             | `component:react-native/Slider` | experimental | an unknown value is a type error      |
| render             | `auto`, `system`, `drawn`                 | who draws the slider: UISlider (`system`), Astryx's drawn slider (`drawn`), or the system slider where it exists and fits (`auto`) | `system`: iOS, the shapes of FR2          | `auto`                            | `spec:AST-126`                  | experimental | an unknown value is a type error      |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                             | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Slider` (`spec:AST-082` FR3) with core's `label`, `value`, `onChange`, `onChangeEnd`, `min`, `max`, `step`, `orientation`, `valueDisplay`, `marks`, `isDisabled`, `disabledMessage`, `isOptional`, `isRequired`, `isLabelHidden`, `description`, `status` and `labelTooltip`, with core's meanings and defaults (`min` 0, `max` 100, `step` 1, `horizontal`, `tooltip`), and the base props `id` (the control's test id and native id) and `isHidden` (the whole field), on the control (`spec:AST-082` FR7). `value` is a number and the callbacks receive one (DEC-1). The range form (`value` as a pair, `minStepsBetweenThumbs`), `formatValue` (DEC-2), `htmlName`, `width` and the container and control styling props belong to the web contract (`spec:AST-082` FR3, FR4). React Native adds `valueText`, `accessibilityStep`, `backGesture`, and `render` (`auto`, `system`, `drawn`; default `auto`; `spec:AST-112` FR21), which FR2 resolves.                                                                                                                                                                                                                                                                                                                                                                                                              | `spec:AST-082` FR3, FR4, FR7; DEC-1, DEC-2        | verify             |
| FR2 | The control MUST follow `spec:AST-126` FR2: `render` `system` shows UISlider where the native slider exists, `drawn` shows Astryx's drawn slider, and `auto`, the default, shows the system slider where it exists, unless the theme's `render.default` says otherwise. The native slider exists on iOS only, so Android shows the drawn slider (OQ1). The drawn slider shows whatever `render` says for a shape UISlider cannot show: vertical, with marks, with a disabled reason, or with the tooltip value under a theme whose `render.default` is not `system`. Where the native slider is absent, the drawn slider shows (`spec:AST-126` FR14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-126` FR2, FR14                          | verify             |
| FR3 | The drawn slider MUST draw core's parts from theme tokens (`component:Slider` FR1): a 4 dp track in `color.track` with `radius.full`; a fill in `color.accent` from the minimum to the thumb; a round 20 dp thumb in `color.accent` with no border or shadow; and tick marks 2 dp along and 8 dp across the track, in `color.accent` inside the filled range and `color.track` outside it. Mark labels sit under a horizontal track on one line in the supporting type and `color.textSecondary`, each centred on its tick and kept within the track's ends, and the slider keeps room for them. A horizontal slider is at least the touch minimum (44 points on iOS, 48 dp on Android) tall; a vertical one is 160 dp tall, at least the touch minimum wide, and runs from the bottom up. Under right-to-left a horizontal slider runs from the right. A disabled slider draws its fill and filled marks in `color.iconDisabled`, its thumb in `color.backgroundMuted` and its text value in `color.textDisabled`, never with opacity.                                                                                                                                                                                                                                                                                                                                                                          | `component:Slider` FR1; `spec:AST-093` FR4        | verify             |
| FR4 | With `valueDisplay="tooltip"`, the drawn slider MUST show the value words in a bubble over the thumb while the thumb is dragged: one line in the supporting type with tabular figures, light words on `color.backgroundInverted` in light mode and dark words in dark mode, with `radius.inner` and the theme's medium shadow. With `text`, the value words sit beside the label in the label type and `color.textPrimary`. With `none`, nothing shows. The value words are `valueText`, else the value in the locale's digits with every digit its step needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Slider` FR4; DEC-2                     | verify             |
| FR5 | The drawn slider MUST track a thumb as `component:Slider` FR7 states. A touch within half the touch minimum of the thumb's centre grabs the thumb and changes no value. Once the touch has travelled 10 dp, the value moves by its further travel along the track over the track's length, from wherever the thumb was grabbed, snapped to the step grid from `min` and clamped to the range. While held, the thumb lifts and drops back on core's `springs.sliderLift` and `springs.sliderDrop`. After a release, the thumb coasts toward 0.4 of the release's momentum projection and settles on core's `springs.sliderRelease`, each spring shaped by the theme's motion knobs (`tempo`, `character`; `spec:AST-108` FR1, FR3); under Reduce Motion it does not lift and the coast continues. `onChange` reports each new value during the drag and through the coast, and once the thumb has stopped, after a release or a cancel, `onChangeEnd` reports the value the owner renders after its response to those `onChange` calls. A tap on the track or a mark sets the value when the finger lifts, and reports it to both. A touch that starts off the thumb and moves is no tap: moving along the track it stays the slider's and changes nothing (FR6), and moving across the track it goes to a scrolling parent. A disabled slider changes nothing, and a hold of 500 ms shows its `disabledMessage`. | `component:Slider` FR5, FR7                       | verify             |
| FR6 | A drag along the drawn slider's track MUST be the slider's, wherever on the slider it starts, in both directions and at the screen edge too, so a thumb at the screen edge stays draggable: iOS's back swipes, Android's back gesture, enclosing scroll views and navigators leave it alone (`spec:AST-124` FR3; DEC-3). `backGesture` decides the back direction on a horizontal slider: unset and `never` keep it, the edge included; `always` and `atLeadingEdge` give a drag toward the back direction, and the edge, to the back gesture, while the other direction still moves the thumb. A vertical slider is unaffected, and a disabled slider owns no drag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-124` FR3; DEC-3                         | verify             |
| FR7 | A drag on the drawn slider that brings the value to `min` or `max` MUST play the `edge` haptic once per arrival. A drag that lands on or passes a detent plays `select`: a mark inside the range, or every step of a slider with at most ten steps (DEC-4). A tap on the track or a mark and a screen-reader adjustment play none (`spec:AST-130` FR6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:Slider` FR7; `spec:AST-130` FR6; DEC-4 | verify             |
| FR8 | Where UISlider shows, the slider MUST map onto the native slider as `spec:AST-126` FR4, FR9, FR11 and FR12 state: the thumb runs on the UI thread; `onChange` hears the value at most once per 100 ms while the thumb moves and the last value before the commit; `onChangeEnd` hears the commit at the release, at a cancelled touch, and after each screen-reader adjustment; the caller's `value` stays the truth. The fill takes `color.accent`, except under a theme whose `render.default` is `system`, where it keeps the platform's tint, and the slider takes the theme's mode and the layout direction. The native slider's accessibility label, hint, value words and step come from AR1 and AR2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-126` FR4, FR9, FR11, FR12               | verify             |
| FR9 | The label, description, status, optional and required marks, and the label's info icon MUST come from the field around the slider, as `component:Field` and `component:FieldStatus` draw them: the label is always present for screen readers, `isLabelHidden` hides it from sight only, and the status sits below the slider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:Slider` FR4                            | verify             |

### Allowed variation

- **AV1 — The system slider.** Where UISlider shows, its track, thumb, motion
  and feedback are the system's own and may change with each OS release.
- **AV2 — Line metrics.** A line's height comes from the theme's leading over
  the platform's own text metrics, so a face can differ by a point.

### Representative states

| State                                                             | Required invariant                                | Allowed variation |
| ----------------------------------------------------------------- | ------------------------------------------------- | ----------------- |
| iOS, horizontal, no marks, `text` or `none` value display         | UISlider under `system` and `auto` (FR2 gap)      | AV1               |
| marks with labels                                                 | ticks and labels on the same geometry; room below | mark count        |
| vertical                                                          | runs from the bottom up; drawn                    | none              |
| dragging with the tooltip value                                   | the bubble over the thumb on one line             | value words       |
| tap on the track                                                  | the value set on lift; no drag                    | none              |
| swipe across the track in a scroller                              | the scroller scrolls; no value change             | none              |
| drag along the track from off the thumb, in a horizontal scroller | the slider keeps it; no value change, no scroll   | none              |
| thumb at the screen edge                                          | still draggable; `backGesture` hands it over      | none              |
| disabled with a reason                                            | no change; the reason on a hold and in the hint   | none              |
| right-to-left                                                     | runs from the right                               | none              |
| light and dark, two themes                                        | each theme's colours                              | none              |

### Transformation and precedence order

- **ORD1 — Value.** A value from a drag, a tap or an adjustment snaps to the
  step grid from `min`, then clamps to the range.
- **ORD2 — Words.** `valueText` when it is not empty, then the number.
- **ORD3 — Screen-reader step.** `accessibilityStep` when above zero, then
  `step`.
- **ORD4 — Control.** A shape the system slider cannot show (drawn), then
  `render`, then the theme's `render.default`, then `auto` (FR2).

### Performance and resources

- **PR1 — The system slider's thumb.** Where UISlider shows, no JavaScript
  runs per frame while the thumb moves; JavaScript hears at most one value per
  100 ms and the commit (`spec:AST-126` FR13).

## Accessibility contract

- **AR1 — One adjustable element.** The slider is one adjustable element. Its
  name is the label, the required word, and for an error the message and the
  invalid word; its hint is the description, a warning or success message, and
  the disabled reason; its value is the minimum, the maximum, the current value
  and the value words (FR4).
- **AR2 — Adjustments.** A VoiceOver swipe up or down, or TalkBack's
  adjustment, moves the value by the screen-reader step (ORD3), snapped and
  clamped as ORD1 says, and reports it to `onChange` and `onChangeEnd`. At an
  end the value does not move and nothing reports.
- **AR3 — Disabled.** A disabled slider stays in the reading order, reads as
  disabled, offers no adjustment, and its hint carries the reason.
- **AR4 — Quiet parts.** The text value, the bubble and the mark labels are
  hidden from screen readers; the element's value already says them.
- **AR5 — Touch and text.** The touch area meets the touch minimum across the
  track (FR3), and the label, the value and the mark labels scale with Dynamic
  Type and Android's font scale.
- **AR6 — Keyboard.** With a hardware keyboard, the arrows step the drawn
  slider by `step`, following the track's direction under right-to-left,
  Page Up and Page Down step by ten steps, and Home and End go to `min` and
  `max` (`component:Slider` AR1).

## Design relationships

| Anatomy or state          | Design requirement                                 | Representation authority   | Hierarchy role | Component contract |
| ------------------------- | -------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Track, fill, thumb, marks | core's slider parts                                | prescribed by core         | prominent      | FR3                |
| Value                     | a bubble while dragging, or words beside the label | prescribed by core         | supporting     | FR4                |
| System slider             | UISlider on iOS                                    | prescribed by the platform | prominent      | FR2, FR8           |
| Detents                   | a tick at each mark or step                        | prescribed by the platform | supporting     | FR7                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): UISlider on iOS, through the native
slider of `spec:AST-126`. On Android, Material 3's slider is the platform's
control; the native slider has no Android host, so Android shows Astryx's
drawn slider instead, a departure from `spec:AST-082` FR11 that OQ1 carries
(`spec:AST-126` OQ2). The shapes UISlider cannot show use the drawn slider on
iOS too. Guideline pages (`spec:AST-093` FR3): Sliders and
Accessibility in the Apple Human Interface Guidelines; Sliders in Material 3.

Theme values read (`spec:AST-093` FR4): `color.track`, `color.accent`,
`color.iconDisabled`, `color.backgroundMuted`, `color.backgroundInverted`,
`color.textPrimary`, `color.textSecondary`, `color.textDisabled`, the light and
dark ink on the inverted surface, `radius.full`, `radius.inner`, `space.s0_5`,
`space.s1`, `space.s1_5`, the medium shadow, the label and supporting type,
the theme's mode, `render.default`, the motion knobs (`tempo`, `character`, `reducedMotion`) that shape the lift, drop and release springs, and the haptic tokens.

### Native pieces

| Native piece             | Record                                    | What this record uses it for                              |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| `AstryxNativeSlider`     | `spec:AST-126` FR4, FR9, FR11, FR12, FR14 | UISlider on iOS (FR2, FR8)                                |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3                        | the drawn slider's drag ownership and `backGesture` (FR6) |
| `AstryxHaptics`          | `spec:AST-130` FR6                        | the edge and detent feedback (FR7)                        |

## Family and system relationships

- `component:Slider` owns the props, the drag model and the parts; this record
  states how React Native shows and runs them.
- `component:Field` and `component:FieldStatus` own the label, the description
  and the status around the slider.
- `spec:AST-126` owns the native slider and how `render` resolves for it.
- `MediaScrubber` renders a Slider for a playback position and asks for the
  system slider wherever it exists; it passes `valueText` and
  `accessibilityStep`.

## Verification map

| Contract | Verification                                                                                                                                              | Representative states                                                                                                                                  | Mutation or failure expectation                                                                                                                                                                   | Audit section                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1      | Type tests of Slider's props against the core contract; a contract drift test                                                                             | each core prop; the range form; each web-only prop                                                                                                     | a renamed prop, an offered web-only prop, or an accepted and ignored prop fails                                                                                                                   | `audit:react-native/Slider/api`      |
| FR2, FR8 | Unit tests of the control choice through the package's testing doubles (`spec:AST-112` FR15); Simulator checks of UISlider                                | each shape; each `render`; no native slider; a kept value after a commit                                                                               | the drawn slider for an eligible shape under `system`, UISlider for a vertical or marked slider, or a value the caller did not keep, fails                                                        | `audit:react-native/Slider/render`   |
| FR3, FR4 | Unit tests of the parts, colours and value display with two themes, light and dark; captures                                                              | marks with labels; vertical; disabled; each value display; a two- and three-digit value                                                                | a wrong token, opacity on a disabled slider, or a bubble that wraps fails                                                                                                                         | `audit:react-native/Slider/look`     |
| FR5      | Unit tests of the drag, the lift, the coast, the tap and the value math; Simulator and emulator checks of a fling                                         | a drag from the thumb; a fling and a slow release; a tap on the track; a swipe from the track; an owner that clamps the value; Reduce Motion; disabled | a thumb that jumps, a value change on an unmoved press, a swipe that changes the value, an `onChangeEnd` before the coast stops, or an `onChangeEnd` value the owner did not render fails         | `audit:react-native/Slider/drag`     |
| FR6      | Simulator and emulator checks of back gestures and scrollers against the slider                                                                           | a thumb at the screen edge; each `backGesture`; a vertical slider; a drag along the track from off the thumb inside a horizontal scroller              | a back gesture that takes an owned drag, an owned drag that blocks a back gesture `backGesture` gave away, or an off-thumb drag along the track that scrolls the parent or moves the value, fails | `audit:react-native/Slider/drag`     |
| FR7      | Unit tests of the haptic moments                                                                                                                          | reaching each end; passing a mark; a ten-step slider; a tap                                                                                            | a missing or repeated haptic, or a haptic on a tap or an adjustment, fails                                                                                                                        | `audit:react-native/Slider/feedback` |
| FR9      | Unit tests of the field around the slider                                                                                                                 | a hidden label; a status; required                                                                                                                     | a label missing for screen readers fails                                                                                                                                                          | `audit:react-native/Slider/field`    |
| AR1–AR6  | VoiceOver and TalkBack checks; unit tests of the element's name, hint, value and adjustments; captures at the largest text size; hardware keyboard checks | `valueText`; `accessibilityStep`; an end; disabled with a reason; the largest text size; arrows, Page, Home and End                                    | a second element, a value read without `valueText`, an adjustment by the wrong step, clipped text at the largest size, or a key that does not step fails                                          | `audit:react-native/Slider/a11y`     |

## Decision log

### DEC-1 — React Native's Slider holds one value

**Reference:** `component:react-native/Slider/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Core's `value` is a number or a pair, a mix of kinds the portable contract has
no form for. A single number is the value every platform supports
(`spec:AST-082` FR4), so React Native's Slider holds one value, and the pair
and its `minStepsBetweenThumbs` stay in the web contract.

### DEC-2 — The caller passes the value's words and a screen-reader step

**Reference:** `component:react-native/Slider/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

Core turns the value into words with `formatValue`, a callback that returns
them, which the portable contract has no form for. The caller passes the
current value's words as `valueText` instead, and the slider shows and reads
them. A playback position that moves one second per screen-reader swipe is
unusable, so `accessibilityStep` names a coarser step for those adjustments,
and the result still snaps to `step`.

### DEC-3 — A drag along the track is the slider's, at the screen edge too

**Reference:** `component:react-native/Slider/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

On a phone, back gestures start from the screen edge and, on iOS 26, anywhere
on the content, so a full-width slider would lose its thumb to them. The
slider owns the drags along its track, the edge included, and `backGesture`
hands the back direction to the back gesture where an app wants it there. A
drag along the track that starts off the thumb stays the slider's and changes
nothing, so it neither scrolls a parent nor moves the value; a drag across the
track goes to a scrolling parent.

### DEC-4 — Detents tick

**Reference:** `component:react-native/Slider/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

A thumb that lands on or passes a mark, or a step of a slider with at most ten
steps, plays the selection tick a picker plays, so a person feels the value's
stops. A finer slider ticks only at its marks, so a drag never buzzes on every
value.

## Open questions

- **OQ1 — Does Android show Material 3's slider?** (`human-design`)
  `spec:AST-082` FR11 asks for the platform's control where one exists, and
  the native slider has no Android host (`spec:AST-126` OQ2). Options: give
  the native slider an Android host on Material 3's slider, for the shapes it
  can show; or keep the drawn slider on Android.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
