---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Switch
platform_of: component:Switch
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
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093, spec:AST-112]
---

# Switch (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `Switch` props with web's names and meaning: `label`, `value`, `onChange`, `isLoading`, `isLabelHidden`, `description`, `isDisabled`, `disabledMessage`, `size`, `isOptional`, `isRequired`, `status`, `labelIcon` and `labelTooltip`, and the shared base props `id` and `isHidden`. `labelPosition` and `labelSpacing` are in the Android contract; the iOS row follows the system's layout (DEC-1). React Native adds `render` (`auto`, `system`, `drawn`; FR3) and `isBackSwipeAllowed` (DEC-2). `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` and `width` stay on the web. |
| Behavior                | `render` says who draws the switch: `system`, the platform's switch (UISwitch on iOS, Material's switch on Android); `drawn`, core's track and thumb drawn from the theme; `auto` (the default), the platform's switch wherever it can show the switch's shape, unless the theme's `render.default` overrides it. The drawn thumb follows a finger along the track. A tap anywhere on the row toggles the switch, and every change calls `onChange` once with the new value. At large text sizes the label takes the row and the switch sits under it.                                         |
| End-user impact         | A person gets the platform's own switch in settings rows: the label leading and the switch trailing on iOS, the theme's colours, the platform's toggle haptic, and a switch that VoiceOver and TalkBack read as one element with its label, state and hint.                                                                                                                                                                                                                                                                                                                                    |
| Builder impact          | Web code that drives a Switch from app state ports unchanged on Android; on iOS, `labelPosition` and `labelSpacing` are type errors. A form posts the value from app state, since React Native has no HTML form.                                                                                                                                                                                                                                                                                                                                                                               |
| Compatibility/readiness | Not yet released; additive. Draft. Current-state impact lists where the library differs from this record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Review checks           | Reject a visual prop on Switch, a web prop accepted and ignored, a `labelPosition` or `labelSpacing` on iOS, a change reported twice or per movement, a drag as the only way to toggle, a disabled switch with a reason that a screen reader cannot reach, a drawn switch's drag that a back swipe takes, or a third-party native library that Switch needs.                                                                                                                                                                                                                                   |
| Governing rules         | `component:Switch` FR3–FR7, FR10, FR13–FR15 and AR1–AR3; `spec:AST-082` FR3–FR5, FR7, FR11 and DEC-2; `spec:AST-085` FR1, FR2 and FR5; `spec:AST-093` FR2–FR4; `spec:AST-112` FR5, FR16, FR19 and FR21; `spec:AST-124` FR3; `spec:AST-126` FR2, FR11 and FR12; `spec:AST-130` FR6; DEC-1 to DEC-3 below.                                                                                                                                                                                                                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

Switch on React Native is web's labelled setting that takes effect at once,
shown as each platform's own switch or as core's switch drawn from the theme,
so a settings row looks and responds the way the rest of the phone does while
its API, its words and its accessibility follow the core `Switch` contract.
This record states only what React Native adds to `component:Switch` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The library differs from this record in these places:

- FR3 gap: Switch takes no `render` prop, and its default is the drawn
  switch; the platform's switch draws only where the theme or the app asks for
  native presentation (`presentation`), as `spec:AST-112` FR21 states for
  components.
- FR4 gap: under `system`, the library's iOS theme leaves UISwitch the
  system's own colours instead of the theme's accent.
- FR5 gap: under a theme whose full radius is 0, the drawn thumb is square,
  not a circle.
- FR5 gap: a disabled drawn switch paints the theme's muted track colours
  instead of core's half-opacity track.
- FR6 gap: a busy drawn switch shows its spinner beside the switch, not inside
  the thumb.
- FR7 gap: under a finger, the drawn thumb does not lift and is not banded
  past either end; a drag commits past the track's midpoint or on a flick
  toward an end, and the thumb settles on the theme's fast duration, not on
  core's travel spring.
- AR1 gap: the start of a busy period is not announced; the switch reports
  busy in its state only.
- AR1 gap: under a form whose default is required, a switch that is not
  marked optional reads as required.

## Ownership boundary

**Owns**

- Which props React Native's `Switch` offers on iOS and on Android, and its
  additions (FR1, FR2, DEC-1, DEC-2).
- Which rendering draws the switch, its default and the shapes the platform's
  switch cannot show (FR3).
- How each rendering draws the switch and takes the theme (FR4, FR5).
- The row: its layout on each platform and at large text sizes, and its touch
  target (FR6).
- The drawn thumb's drag and the drag's ownership against back swipes (FR7).
- Switch's VoiceOver and TalkBack exposure (AR1–AR4).

**Does not own / non-goals**

- The meaning of Switch's props, its busy and disabled rules, and its words —
  owned by `component:Switch` and `spec:AST-085`.
- `render`'s values and the theme's `render.default` — owned by `spec:AST-112`
  FR21.
- The platform control group and how the theme reaches a platform control —
  owned by `spec:AST-126`.
- The drag frames and back-swipe arbitration — owned by `spec:AST-124`.
- The haptic moments and the platform's feedback kinds — owned by
  `spec:AST-130`.
- The label, description and status presentation — owned by FieldLabel and
  `component:FieldStatus`.

## Public concepts

| Concept        | Closed values or states                                                                                                  | Meaning                                                                                                                                    | Availability by variant/orientation/state                                         | Default                                                                         | Owner                           | Stability    | Invalid-value behavior                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- | ------------ | -------------------------------------------------------- |
| `render`       | `auto`; `system`; `drawn`                                                                                                | who draws the switch: the platform's switch (`system`), core's switch drawn from the theme (`drawn`), or this component's default (`auto`) | always; a shape the platform's switch cannot show is drawn whatever `render` says | `auto`: the platform's switch, unless the theme's `render.default` overrides it | `component:react-native/Switch` | experimental | an unknown value is a type error                         |
| label layout   | iOS: label leading, switch trailing, spread; Android: `labelPosition` `start` or `end`, `labelSpacing` `hug` or `spread` | where the label sits beside the switch                                                                                                     | `labelPosition` and `labelSpacing` on Android only                                | Android: `end`, `hug`                                                           | `component:react-native/Switch` | experimental | `labelPosition` or `labelSpacing` on iOS is a type error |
| size           | `sm`; `md`                                                                                                               | the drawn switch's track: 32 × 20 or 40 × 24 points or dp                                                                                  | the drawn switch; the platform's switch keeps its own size (DEC-3)                | `md`                                                                            | `component:Switch`              | experimental | another value is a type error                            |
| drag ownership | `isBackSwipeAllowed` false; true                                                                                         | whether a horizontal drag that starts on the drawn track stays with the switch or goes to a back swipe                                     | the drawn switch                                                                  | false                                                                           | `component:react-native/Switch` | experimental | none                                                     |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                              | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| FR1 | The React Native `Switch` MUST take web's `label`, `value`, `onChange`, `isLoading`, `isLabelHidden`, `description`, `isDisabled`, `disabledMessage`, `size`, `isOptional`, `isRequired`, `status`, `labelIcon` and `labelTooltip` with web's names, types, defaults and meaning, and the shared base props on its root (`spec:AST-082` FR7). `onChange` receives the new value. `labelPosition` and `labelSpacing` are in the Android contract and are type errors on iOS (DEC-1). `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` and `width` are not offered, and Switch takes no visual prop.                                                                                                                      | `component:Switch`; `spec:AST-082` FR3–FR5, FR7, DEC-2; `spec:AST-112` FR16; DEC-1 | settled            |
| FR2 | React Native adds `render` (FR3) and `isBackSwipeAllowed` (default false; FR7, DEC-2). Unset, an addition changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-112` FR21; `spec:AST-124` FR3; DEC-2                                     | settled            |
| FR3 | `render` MUST say who draws the switch (`spec:AST-112` FR21): with `system`, the platform's switch, UISwitch on iOS and Material's switch on Android; with `drawn`, core's track and thumb drawn from the theme; with `auto`, the default, the platform's switch, unless the native theme's `render.default` overrides every `auto`. Whatever `render` says, Switch draws core's switch where the platform's switch cannot show its shape: under a theme whose full radius does not draw a pill at the track's height, and where the platform's switch is absent. Switching the rendering keeps the value.                                                                                                                    | `spec:AST-082` FR11; `spec:AST-112` FR21; `spec:AST-126` FR2, FR14                 | verify             |
| FR4 | Under `system`, the theme MUST reach the switch: the on track takes the accent and the off track the theme's off-track colour; on Android the thumb takes the surface colour, and on iOS the thumb stays the system's. Where the system's thumb would not stand apart from the accent, the on track is the system's own on colour. The platform's switch keeps its own size, motion and disabled dimming (DEC-3).                                                                                                                                                                                                                                                                                                             | `spec:AST-126` FR11; `spec:AST-093` FR4; DEC-3                                     | verify             |
| FR5 | Under `drawn`, Switch MUST draw core's switch from the theme: the track at core's size (32 × 20 for `sm`, 40 × 24 for `md`), the accent when on and the off-track colour when off, and a round surface-coloured thumb that grows from its off size to its on size and travels toward the inline end when on, mirrored right to left. The thumb slides on the theme's motion and settles at once under Reduce Motion. A disabled switch paints core's disabled state.                                                                                                                                                                                                                                                          | `component:Switch` FR5, FR7, FR10, FR16; `spec:AST-093` FR4                        | verify             |
| FR6 | The row MUST hold the label block and the switch. On iOS the label leads and the switch trails across the row; on Android `labelPosition` and `labelSpacing` place them as core does. The row is at least the platform's minimum touch target tall, and a tap anywhere on it toggles the switch. At large text sizes the label takes the row's whole width and the switch sits under it, so the label breaks between words. A busy switch shows its spinner inside the drawn thumb, and beside the platform's switch. The status message sits below the row (`component:FieldStatus`).                                                                                                                                        | `component:Switch` FR3, FR4; `spec:AST-082` FR11; DEC-1                            | verify             |
| FR7 | Under `drawn`, the thumb MUST follow a finger that drags along the track and commit the side the drag ends on, as core's switch does under a finger; a commit calls `onChange` once and plays the `toggle` haptic, and nothing is reported per movement. A vertical drag that starts on the switch scrolls its list. The drawn track owns the horizontal drags that start on it, so the content-wide back swipe and a navigator's horizontal gestures leave them alone; with `isBackSwipeAllowed`, those gestures win, and the thumb follows only a drag they do not take. The screen-edge back swipe always wins. Under `system`, the platform's switch tracks the touch itself. Disabled or busy, the switch takes no drag. | `component:Switch` FR13–FR15; `spec:AST-124` FR3; `spec:AST-130` FR6; DEC-2        | verify             |
| FR8 | A change from a tap or a commit MUST call `onChange` once with the new value and play the theme's `toggle` haptic once, where the platform's switch does not play its own. A screen reader's activation calls `onChange` and plays nothing. While disabled or busy, no change is made. Switch needs no third-party native library.                                                                                                                                                                                                                                                                                                                                                                                            | `component:Switch` FR5, FR6; `spec:AST-130` FR6; `spec:AST-085` FR2                | verify             |

### Allowed variation

- **AV1 — The platform's switch.** Under `system`, the switch's size, thumb,
  motion and haptic are the platform's own and may change with each OS
  release.

### Representative states

| State                                                | Required invariant                                                       | Allowed variation                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| `render` `auto`, iOS and Android                     | the platform's switch, unless the theme's `render.default` is `drawn`    | the platform's look                   |
| a theme with square corners                          | the drawn switch under every `render`                                    | none                                  |
| iOS row                                              | label leading, switch trailing, across the row                           | none                                  |
| Android row, each `labelPosition` and `labelSpacing` | core's placement                                                         | none                                  |
| largest text size                                    | the label across the row, the switch under it                            | none                                  |
| drag on the drawn track inside a stack               | the thumb follows; the back swipe does not start                         | none                                  |
| the same with `isBackSwipeAllowed`                   | the back swipe wins                                                      | none                                  |
| busy                                                 | no change; the spinner shows; the state reads busy                       | where the spinner sits under `system` |
| disabled with a reason                               | reachable by a screen reader; the reason in its hint and on a long press | none                                  |
| right-to-left, drawn                                 | the thumb travels toward the inline end                                  | none                                  |

### Transformation and precedence order

- **ORD1 — Rendering.** A shape the platform's switch cannot show, or an
  absent platform switch, draws core's switch; otherwise an explicit `render`
  of `system` or `drawn`; then, for `auto`, the theme's `render.default`; then
  the platform's switch.
- **ORD2 — Drag.** The screen-edge back swipe; then the drawn track, unless
  `isBackSwipeAllowed` gives its horizontal drags to the back gestures; then a
  vertical drag goes to the list.

### Performance and resources

- **PR1 — No JavaScript per frame.** The drawn thumb's slide runs on the native
  driver, and a toggle changes no layout. During a drag, JavaScript moves the
  thumb from touch events only, and the release reports one change.

## Accessibility contract

- **AR1 — One switch element.** The switch is the one accessibility element,
  under either rendering: the switch role, its on or off state and its busy
  state; its name is the label, with the required and error words where they
  apply; its hint is the description, any other status and the disabled
  reason (`component:Switch` FR4; `spec:AST-112` FR19). Under `system`, the
  platform's switch is that element (`spec:AST-126` FR12).
- **AR2 — Activation.** A screen reader's activation toggles the switch, and
  the drag is never the only way to change it.
- **AR3 — Disabled with a reason.** With `disabledMessage`, a disabled switch
  stays reachable and is not reported as disabled, changes stay blocked, the
  reason is in its hint, and a long press on the row shows it
  (`spec:AST-085` FR1, FR5; `component:Switch` AR1).
- **AR4 — Text size and motion.** The label follows the text size, and at large
  text sizes it takes the row (FR6). Under Reduce Motion the drawn thumb
  settles at once and still follows a dragging finger.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Switch, `system` | UISwitch on iOS; Material 3's switch on Android         | prescribed by the platform | primary        | FR3, FR4           |
| Switch, `drawn`  | core's track and thumb                                  | prescribed by the theme    | primary        | FR5, FR7           |
| Row              | the iOS settings row; core's label placement on Android | prescribed by the platform | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UISwitch on iOS and Material's switch on
Android, through React Native's own switch view (`spec:AST-126` FR2). Guideline
pages: Toggles, Lists and tables, and Accessibility in the Apple Human Interface
Guidelines; Switch, Lists and Accessibility in Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, the off-track colour
(`color.backgroundGray`, mixed toward 3:1 against the surface in dark mode),
`color.backgroundSurface` for the thumb, the muted pair for a disabled switch,
`radius.full`, `space.s2`, the theme's motion, the native theme's
`render.default`, and the theme's `toggle` haptic.

### Native pieces

| Native piece             | Record                         | What this record uses it for                          |
| ------------------------ | ------------------------------ | ----------------------------------------------------- |
| The platform's switch    | `spec:AST-126` FR2, FR11, FR12 | the `system` rendering (FR3, FR4, AR1)                |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3             | the drawn track's ownership of horizontal drags (FR7) |
| `AstryxHaptics`          | `spec:AST-130` FR6             | the `toggle` haptic (FR7, FR8)                        |

## Family and system relationships

- `component:Switch` owns the props, the busy and disabled rules, the touch
  behaviour of the thumb and the words; this record states only what React
  Native adds or does differently. Core's DOM-facing claims (FR1, FR2, FR8,
  FR9, FR11, FR12) belong to the web contract.
- `spec:AST-112` FR21 owns `render` and the theme's `render.default`;
  `spec:AST-126` owns the platform control group, including how the theme
  reaches a platform control and its accessibility.
- `spec:AST-124` owns drag frames and back-swipe arbitration; `spec:AST-130`
  owns haptics.
- `spec:AST-085` owns the disabled-reason rules this record applies.

## Verification map

| Contract | Verification                                                                                              | Representative states                                                                                                                             | Mutation or failure expectation                                                                                                                                 | Audit section                         |
| -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1, FR2 | Type tests of the iOS and Android exports against core's contract; a contract drift test                  | each prop; `labelPosition` and `labelSpacing` on each platform; each web-only prop refused                                                        | a missing core prop, a different default, an accepted web-only prop, or a layout prop accepted on iOS fails                                                     | `audit:react-native/Switch/api`       |
| FR3, FR4 | Unit tests of the rendering choice through the package's testing doubles; Simulator and emulator captures | `render` `auto`, `system` and `drawn`; `auto` under each theme `render.default`; a square theme; the platform's switch absent; light and dark     | a drawn switch where the platform's is due, a platform switch under a square theme, a lost value on a switch of rendering, or an untinted platform switch fails | `audit:react-native/Switch/rendering` |
| FR5, PR1 | Simulator and emulator captures; frame checks of the slide                                                | each size, on and off, disabled; right-to-left; Reduce Motion                                                                                     | a wrong box, a square thumb, a layout change on toggle, or JavaScript work per animation frame fails                                                            | `audit:react-native/Switch/drawn`     |
| FR6      | Simulator and emulator captures at the default and the largest text sizes                                 | the iOS row; each Android placement; busy; a status message                                                                                       | a layout prop honoured on iOS, a label broken inside a word, or a row shorter than the touch minimum fails                                                      | `audit:react-native/Switch/row`       |
| FR7      | Touch checks on the Simulator, the emulator and devices; unit tests of the release rule                   | a drag that commits; one that returns; a flick; a vertical drag in a list; a drag in a stack with and without `isBackSwipeAllowed`; an edge swipe | a change per movement, a back swipe taking an owned drag, a list that does not scroll, or a drag taken while disabled fails                                     | `audit:react-native/Switch/drag`      |
| FR8      | Unit tests of change reporting and haptics                                                                | a tap on the row; a commit; a screen reader's activation; disabled; busy                                                                          | two `onChange` calls for one change, a haptic for a screen reader's activation, or a change while disabled or busy fails                                        | `audit:react-native/Switch/change`    |
| AR1–AR4  | VoiceOver and TalkBack checks on devices under each rendering; the largest text sizes; Reduce Motion      | on; off; busy; required; an error; disabled with and without a reason                                                                             | a missing role, state, name part or hint, a drag-only change, or an unreachable disabled reason fails                                                           | `audit:react-native/Switch/a11y`      |

## Decision log

### DEC-1 — The iOS row follows the system's layout; Android keeps core's placement

**Reference:** `component:react-native/Switch/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

An iOS settings row puts the label at the leading edge and the switch at the
trailing edge, so on iOS the row always has that layout, and `labelPosition`
and `labelSpacing`, which it would not honour, are not offered there. Material
rows place a switch on either side, so Android keeps core's two props and
defaults. The web-only props stay on the web: `htmlName` and `changeAction`
belong to the web's forms and Actions, `onFocus` and `onBlur` carry DOM
events, `width` is a CSS length, and `ref` is a DOM element.

### DEC-2 — The drawn track owns its horizontal drags; `isBackSwipeAllowed` gives them back

**Reference:** `component:react-native/Switch/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A phone's back swipe starts anywhere on the screen, and a drag on a switch
that went back a screen would lose the person's place. The drawn track
therefore owns the horizontal drags that start on it, as the platforms'
switches do. A screen where going back matters more than dragging the thumb
sets `isBackSwipeAllowed`, and a tap still toggles the switch there. A
browser has no such gesture, so the prop is React Native's.

### DEC-3 — The platform's switch keeps the platform's size

**Reference:** `component:react-native/Switch/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

UISwitch and Material's switch each have one size, and a person knows them at
that size. Under `system` the switch keeps it, and `size` sizes the drawn
switch only.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
