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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `Switch` props with web's names and meaning: `label`, `value`, `onChange`, `isLoading`, `isLabelHidden`, `description`, `isDisabled`, `disabledMessage`, `isOptional`, `isRequired`, `status`, `labelIcon` and `labelTooltip`, and the shared base props `id` and `isHidden`. `labelPosition` and `labelSpacing` are in the Android contract; the iOS row follows the system's layout. `size` is not offered, because the platform's switch has one size (DEC-1). `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` and `width` stay on the web. |
| Behavior                | Switch is the platform's switch (UISwitch on iOS, Material's switch on Android), tinted by the theme. Where the platform's switch is absent, Switch draws core's switch from the theme, and its thumb follows a finger along the track. A tap anywhere on the row toggles the switch, and every change calls `onChange` once with the new value. At large text sizes the label takes the row and the switch sits under it.                                                                                                                                  |
| End-user impact         | A person gets the platform's own switch in settings rows: the label leading and the switch trailing on iOS, the theme's colours, the platform's toggle feedback, and a switch that VoiceOver and TalkBack read as one element with its label, state and hint.                                                                                                                                                                                                                                                                                               |
| Builder impact          | Web code that drives a Switch from app state ports with two exceptions: `size` is not offered, and on iOS `labelPosition` and `labelSpacing` are type errors. A form posts the value from app state, since React Native has no HTML form.                                                                                                                                                                                                                                                                                                                   |
| Compatibility/readiness | Not yet released; additive. Draft. Current-state impact lists where the library differs from this record.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Review checks           | Reject a drawn switch where the platform's switch is present, a visual prop on Switch, a web prop accepted and ignored, a `labelPosition` or `labelSpacing` on iOS, a change reported twice or per movement, a drag as the only way to toggle, a disabled switch that does not report its disabled state or reason, or a third-party native library that Switch needs.                                                                                                                                                                                      |
| Governing rules         | `component:Switch` FR3–FR7, FR10, FR13–FR16 and AR1–AR3; `spec:AST-082` FR3–FR5, FR7, FR11 and DEC-2; `spec:AST-085` FR1, FR2 and FR5; `spec:AST-093` FR2–FR4; `spec:AST-112` FR5, FR16 and FR19; `spec:AST-124` FR3; `spec:AST-130` FR6; DEC-1 and DEC-2 below.                                                                                                                                                                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Switch on React Native is web's labelled setting that takes effect at once,
shown as each platform's own switch, so a settings row looks and responds the
way the rest of the phone does while its API, its words and its accessibility
follow the core `Switch` contract. This record states only what React Native
adds to `component:Switch` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The library differs from this record in these places:

- FR2 gap: the library's default is the drawn switch; the platform's switch
  draws only where the theme or the app asks for native presentation
  (`presentation`).
- FR2 gap: under a theme whose full radius does not draw a pill at the
  track's height, the library draws core's switch where the platform's switch
  is present.
- FR1 gap: Switch also takes `size`, which sizes the drawn switch's track
  (32 × 20 for `sm`, 40 × 24 for `md`) and leaves the platform's switch at its
  own size.
- FR1 gap: Switch also takes `isBackSwipeAllowed`, which gives the drawn
  track's horizontal drags back to the back gestures.
- FR3 gap: under the library's iOS theme, UISwitch keeps the system's own
  colours instead of the theme's accent.
- FR4 gap: under a theme whose full radius is 0, the drawn thumb is square,
  not a circle.
- FR4 gap: a disabled drawn switch paints the theme's muted track colours
  instead of core's half-opacity track.
- FR5 gap: a busy drawn switch shows its spinner beside the switch, not inside
  the thumb.
- FR6 gap: under a finger, the drawn thumb does not lift and is not banded
  past either end; a drag commits past the track's midpoint or on a flick
  toward an end, and the thumb settles on the theme's fast duration, not on
  core's travel spring.
- AR1 gap: the start of a busy period is not announced; the switch reports
  busy in its state only.
- AR1 gap: under a form whose default is required, a switch that is not
  marked optional reads as required.
- AR3 gap: a disabled switch with a reason reports itself as enabled.

## Ownership boundary

**Owns**

- Which props React Native's `Switch` offers on iOS and on Android (FR1,
  DEC-1).
- When Switch is the platform's switch and when it draws core's switch (FR2).
- How the platform's switch takes the theme, and how the drawn switch looks
  (FR3, FR4).
- The row: its layout on each platform and at large text sizes, and its touch
  target (FR5).
- The drawn thumb's drag and the drawn track's ownership of its drags (FR6,
  DEC-2).
- How a change is reported (FR7), and Switch's VoiceOver and TalkBack exposure
  (AR1–AR4).

**Does not own / non-goals**

- The meaning of Switch's props, its busy and disabled rules, and its words —
  owned by `component:Switch` and `spec:AST-085`.
- The native piece that draws the platform's switch — owned by
  `spec:AST-126` (OQ1).
- The drag frames and back-swipe arbitration — owned by `spec:AST-124`.
- The haptic moments and the platform's feedback kinds — owned by
  `spec:AST-130`.
- The label, description and status presentation — owned by FieldLabel and
  `component:FieldStatus`.

## Public concepts

| Concept      | Closed values or states                                                                                                  | Meaning                                | Availability by variant/orientation/state                   | Default               | Owner                           | Stability    | Invalid-value behavior                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------- | --------------------- | ------------------------------- | ------------ | -------------------------------------------------------- |
| switch       | the platform's switch; core's drawn switch                                                                               | what draws the switch                  | the drawn switch only where the platform's switch is absent | the platform's switch | `component:react-native/Switch` | experimental | none                                                     |
| label layout | iOS: label leading, switch trailing, spread; Android: `labelPosition` `start` or `end`, `labelSpacing` `hug` or `spread` | where the label sits beside the switch | `labelPosition` and `labelSpacing` on Android only          | Android: `end`, `hug` | `component:react-native/Switch` | experimental | `labelPosition` or `labelSpacing` on iOS is a type error |
| busy         | idle; busy                                                                                                               | a change is loading or being saved     | `isLoading`                                                 | idle                  | `component:Switch`              | experimental | none                                                     |
| disabled     | off; on; on with reason                                                                                                  | blocks changes                         | a reason applies only with `isDisabled`                     | off                   | `component:Switch`              | experimental | a reason without `isDisabled` shows nothing              |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                              | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| FR1 | The React Native `Switch` MUST take web's `label`, `value`, `onChange`, `isLoading`, `isLabelHidden`, `description`, `isDisabled`, `disabledMessage`, `isOptional`, `isRequired`, `status`, `labelIcon` and `labelTooltip` with web's names, types, defaults and meaning, and the shared base props on its root (`spec:AST-082` FR7). `onChange` receives the new value. `labelPosition` and `labelSpacing` are in the Android contract and are type errors on iOS. `size` is not offered on iOS or Android (DEC-1). `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` and `width` are not offered, and Switch takes no visual prop. | `component:Switch`; `spec:AST-082` FR3–FR5, FR7, DEC-2; `spec:AST-112` FR16; DEC-1 | settled            |
| FR2 | Switch MUST be the platform's switch, UISwitch on iOS and Material's switch on Android. Only where the platform's switch is absent (a binary without it, or the platform turned off in the subtree) does Switch draw core's switch from the theme.                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-082` FR11; `spec:AST-093` FR2                                            | verify             |
| FR3 | The theme MUST reach the platform's switch: the on track takes the accent and the off track the theme's off-track colour; on Android the thumb takes the surface colour, and on iOS the thumb stays the system's. Where the system's thumb would not stand apart from the accent, the on track is the system's own on colour. The platform's switch keeps its own size, motion and disabled dimming.                                                                                                                                                                                                                                      | `spec:AST-093` FR4; `spec:AST-082` FR11                                            | verify             |
| FR4 | Core's drawn switch MUST draw core's `md` track (40 × 24), the accent when on and the off-track colour when off, and a round surface-coloured thumb that grows from its off size to its on size and travels toward the inline end when on, mirrored right to left. The thumb slides on the theme's motion and settles at once under Reduce Motion. A disabled switch paints core's disabled state.                                                                                                                                                                                                                                        | `component:Switch` FR7, FR10, FR16; `spec:AST-093` FR4                             | verify             |
| FR5 | The row MUST hold the label block and the switch. On iOS the label leads and the switch trails across the row; on Android `labelPosition` and `labelSpacing` place them as core does. The row is at least the platform's minimum touch target tall, and a tap anywhere on it toggles the switch. At large text sizes the label takes the row's whole width and the switch sits under it, so the label breaks between words. A busy switch shows a spinner inside the drawn thumb, and beside the platform's switch, whose thumb holds no content. The status message sits below the row (`component:FieldStatus`).                        | `component:Switch` FR3, FR4; `spec:AST-082` FR11; DEC-1                            | verify             |
| FR6 | The drawn thumb MUST follow a finger that drags along the track and commit the side the drag ends on, as core's switch does under a finger; nothing is reported per movement. A vertical drag that starts on the switch scrolls its list. The drawn track owns the horizontal drags that start on it, so the content-wide back swipe and a navigator's horizontal gestures leave them alone, while the screen-edge back swipe always wins (DEC-2). The platform's switch tracks the touch itself. Disabled or busy, the switch takes no drag.                                                                                             | `component:Switch` FR13–FR15; `spec:AST-124` FR3; DEC-2                            | verify             |
| FR7 | A change from a tap or a drag MUST call `onChange` once with the new value and play the theme's `toggle` haptic once, where the platform's switch does not play its own. A screen reader's activation calls `onChange` and plays nothing. While disabled or busy, no change is made. Switch needs no third-party native library.                                                                                                                                                                                                                                                                                                          | `component:Switch` FR5, FR6; `spec:AST-130` FR6; `spec:AST-085` FR2                | verify             |

### Allowed variation

- **AV1 — The platform's switch.** The switch's size, thumb, motion and haptic
  are the platform's own and may change with each OS release.

### Representative states

| State                                                | Required invariant                                                       | Allowed variation   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| iOS and Android, platform present                    | the platform's switch, tinted by the theme                               | the platform's look |
| platform switch absent or the platform off           | core's drawn switch                                                      | none                |
| iOS row                                              | label leading, switch trailing, across the row                           | none                |
| Android row, each `labelPosition` and `labelSpacing` | core's placement                                                         | none                |
| largest text size                                    | the label across the row, the switch under it                            | none                |
| drag on the drawn track inside a stack               | the thumb follows; the back swipe does not start                         | none                |
| busy                                                 | no change; the spinner shows; the state reads busy                       | none                |
| disabled with a reason                               | reachable, reported disabled, the reason in its hint and on a long press | none                |
| right-to-left, drawn                                 | the thumb travels toward the inline end                                  | none                |

### Transformation and precedence order

- **ORD1 — Switch.** The platform's switch where it is present; otherwise
  core's drawn switch.
- **ORD2 — Drag on the drawn switch.** The screen-edge back swipe; then the
  drawn track for a horizontal drag; then the list for a vertical drag.

### Performance and resources

- **PR1 — No JavaScript per frame.** The drawn thumb's slide runs on the native
  driver, and a toggle changes no layout. During a drag, JavaScript moves the
  thumb from touch events only, and the release reports one change.

## Accessibility contract

- **AR1 — One switch element.** The switch is the one accessibility element:
  the switch role, its on or off state and its busy state; its name is the
  label, with the required and error words where they apply; its hint is the
  description, any other status and the disabled reason (`component:Switch`
  FR4; `spec:AST-112` FR19). The platform's switch is that element when it
  draws.
- **AR2 — Activation.** A screen reader's activation toggles the switch, and
  the drag is never the only way to change it.
- **AR3 — Disabled with a reason.** With `disabledMessage`, a disabled switch
  stays reachable and reports its disabled state, the reason is in its hint,
  changes stay blocked, and a long press on the row shows the reason
  (`spec:AST-085` FR1, FR5; `component:Switch` AR1).
- **AR4 — Text size and motion.** The label follows the text size, and at large
  text sizes it takes the row (FR5). Under Reduce Motion the drawn thumb
  settles at once and still follows a dragging finger.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Switch           | UISwitch on iOS; Material 3's switch on Android         | prescribed by the platform | primary        | FR2, FR3           |
| Drawn switch     | core's track and thumb                                  | prescribed by the theme    | primary        | FR4, FR6           |
| Row              | the iOS settings row; core's label placement on Android | prescribed by the platform | supporting     | FR5                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UISwitch on iOS and Material's switch on
Android. Guideline pages: Toggles, Lists and tables, and Accessibility in the
Apple Human Interface Guidelines; Switch, Lists and Accessibility in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.accent`, the off-track colour
(`color.backgroundGray`, mixed toward 3:1 against the surface in dark mode),
`color.backgroundSurface` for the thumb, the muted pair for a disabled drawn
switch, `space.s2`, the theme's motion, and the theme's `toggle` haptic.

### Native pieces

| Native piece             | Record               | What this record uses it for                          |
| ------------------------ | -------------------- | ----------------------------------------------------- |
| The platform's switch    | `spec:AST-126` (OQ1) | the switch (FR2, FR3, AR1)                            |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3   | the drawn track's ownership of horizontal drags (FR6) |
| `AstryxHaptics`          | `spec:AST-130` FR6   | the `toggle` haptic (FR7)                             |

## Family and system relationships

- `component:Switch` owns the props, the busy and disabled rules, the touch
  behaviour of the thumb and the words; this record states only what React
  Native adds or does differently. Core's DOM-facing claims (FR1, FR2, FR8,
  FR9, FR11, FR12) belong to the web contract.
- The Swift Switch also takes no `labelPosition`, `labelSpacing` or iOS
  `size`; both follow the platform's switch row.
- `spec:AST-126` owns the platform control group; which native piece draws the
  platform's switch is its OQ6 (OQ1 here).
- `spec:AST-124` owns drag frames and back-swipe arbitration; `spec:AST-130`
  owns haptics; `spec:AST-085` owns the disabled-reason rules this record
  applies.

## Verification map

| Contract | Verification                                                                                                                    | Representative states                                                                                  | Mutation or failure expectation                                                                                                         | Audit section                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1      | Type tests of the iOS and Android exports against core's contract; a contract drift test                                        | each prop; `labelPosition` and `labelSpacing` on each platform; `size` and each web-only prop refused  | a missing core prop, a different default, an accepted web-only prop or `size`, or a layout prop accepted on iOS fails                   | `audit:react-native/Switch/api`      |
| FR2, FR3 | Unit tests of the switch choice through the package's testing doubles; Simulator and emulator captures                          | platform present; platform absent; the platform off; light and dark; an accent near the thumb's colour | a drawn switch where the platform's is present, a platform switch where it is absent, or an untinted platform switch fails              | `audit:react-native/Switch/platform` |
| FR4, PR1 | Simulator and emulator captures with the platform switch absent; frame checks of the slide                                      | on and off; disabled; right-to-left; Reduce Motion                                                     | a wrong box, a square thumb, a layout change on toggle, or JavaScript work per animation frame fails                                    | `audit:react-native/Switch/drawn`    |
| FR5      | Simulator and emulator captures at the default and the largest text sizes                                                       | the iOS row; each Android placement; busy; a status message                                            | a layout prop honoured on iOS, a label broken inside a word, or a row shorter than the touch minimum fails                              | `audit:react-native/Switch/row`      |
| FR6      | Touch checks on the Simulator, the emulator and devices; unit tests of the release rule                                         | a drag that commits; one that returns; a vertical drag in a list; a drag in a stack; an edge swipe     | a change per movement, a back swipe taking a drag on the drawn track, a list that does not scroll, or a drag taken while disabled fails | `audit:react-native/Switch/drag`     |
| FR7      | Unit tests of change reporting and haptics                                                                                      | a tap on the row; a drag; a screen reader's activation; disabled; busy                                 | two `onChange` calls for one change, a haptic for a screen reader's activation, or a change while disabled or busy fails                | `audit:react-native/Switch/change`   |
| AR1–AR4  | VoiceOver and TalkBack checks on devices with the platform's switch and the drawn switch; the largest text sizes; Reduce Motion | on; off; busy; required; an error; disabled with and without a reason                                  | a missing role, state, name part or hint, a drag-only change, or a disabled switch that does not report its state or reason fails       | `audit:react-native/Switch/a11y`     |

## Decision log

### DEC-1 — The row and the size follow the platform's switch

**Reference:** `component:react-native/Switch/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

An iOS settings row puts the label at the leading edge and the switch at the
trailing edge, so on iOS the row always has that layout, and `labelPosition`
and `labelSpacing`, which it would not honour, are not offered there. Material
rows place a switch on either side, so Android keeps core's two props and
defaults. UISwitch and Material's switch each have one size, which a person
knows them by, so `size` is not offered on either platform. The web-only props
stay on the web: `htmlName` and `changeAction` belong to the web's forms and
Actions, `onFocus` and `onBlur` carry DOM events, `width` is a CSS length, and
`ref` is a DOM element.

### DEC-2 — The drawn track owns its horizontal drags

**Reference:** `component:react-native/Switch/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A phone's back swipe can start anywhere on the screen, and a drag on a switch
that went back a screen would lose the person's place. Where Switch draws
core's switch, its track therefore owns the horizontal drags that start on it,
as the platforms' switches do, and the screen-edge back swipe still wins.

## Open questions

- **OQ1 — Which native piece draws the platform's switch?** (`human-design`)
  This is `spec:AST-126` OQ6. Options: an Astryx switch contract over UISwitch
  and Material 3's switch, with that group's appearance mapping and named
  features; or React Native's own switch, tinted by the library.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
