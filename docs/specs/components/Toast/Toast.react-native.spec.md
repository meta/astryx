---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Toast
platform_of: component:Toast
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
families: [family:action-groups]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-086, spec:AST-093, spec:AST-112]
---

# Toast (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `useToast`, whose show function takes core's options (`body`, `type`, `isAutoHide`, `autoHideDuration`, `endContent`, `renderContent`, `uniqueID`, `collisionBehavior`, `onHide`), and web's `Toast` (`body`, `type`, `isAutoHide`, `autoHideDuration`, `endContent`, `renderContent`, `onDismiss`), with the shared base props on the card; the stack is a `LayerProvider`'s toast region, set by its `toast` setting (`position`, `maxVisible`, `inset`). React Native adds `backGesture` to `Toast` and to the show options (DEC-2). |
| Behavior                | A toast is a card drawn from the theme in the toast region of the front window, at the edge `position` names, newest nearest that edge, clear of the safe area and the app's bars, so it floats over an open dialog (DEC-1). It auto-hides after `autoHideDuration` (info yes, error no), pausing while it is touched or read, and dismisses by its button, a swipe toward its edge, or code. It is announced once when it shows and never takes focus.                                                                                       |
| End-user impact         | A person gets brief notices that never block the screen, hears each one once with VoiceOver or TalkBack, swipes one away toward its edge, or presses its dismiss button.                                                                                                                                                                                                                                                                                                                                                                      |
| Builder impact          | Web code that raises toasts with `useToast` or renders `Toast` ports unchanged; a `LayerProvider` at the app's root holds the region. An app with a tab bar or a floating bar gets its toasts above it.                                                                                                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Not yet released; additive. Draft. Requirement gaps: FR1 (`useToast`, `renderContent`), FR2 (`isBackSwipeAllowed`), FR3 (centred positions, nearest region), FR4 (paint, width), FR5 (timer, `onHide`), FR6 (swipe rule), FR7 (entrance and collapse), AR1 (type word, overwrite).                                                                                                                                                                                                                                                            |
| Review checks           | Reject a toast announced more than once per show or not announced again when replaced, a toast that takes screen-reader focus, an auto-hide that runs while the card is touched or read, a swipe as the only way to dismiss, a toast drawn under an open dialog, a back swipe that takes a drag toward the toast's edge that `backGesture` keeps, or a third-party native library Toast needs.                                                                                                                                                |
| Governing rules         | `component:Toast` FR1–FR9, FR12 and AR1, AR3, AR4; `family:action-groups`; `spec:AST-082` FR3–FR5, FR7, FR11 and DEC-2; `spec:AST-086` FR1 and FR7; `spec:AST-093` FR2–FR4; `spec:AST-112` FR5, FR16 and FR19; `spec:AST-124` FR3 and FR5; `spec:AST-123` FR7; DEC-1 to DEC-3 below.                                                                                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

Toast on React Native is web's brief, non-modal notification: a card that
reports an event, offers an action, and leaves on its own or when the person
sends it away, above whatever window is in front, while its API, its timing
and its announcement follow the core `Toast` contract. This record states only
what React Native adds to `component:Toast` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: a toast shows when it is raised and leaves through its own dismissal, as on the web
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which props React Native's `Toast` and `useToast` offer, and `backGesture`
  (FR1, FR2).
- Where a toast shows: the front window's region, and the region's placement
  (FR3, DEC-1).
- The card's look and paint (FR4, DEC-3).
- The timer, the dismissal paths and the swipe on a phone (FR5, FR6), and
  the card's motion (FR7).
- Toast's VoiceOver and TalkBack exposure (AR1–AR3).

**Does not own / non-goals**

- The meaning of Toast's props, its timing, deduplication and announcement
  rules — owned by `component:Toast`.
- The layer itself, its other surfaces and its insets — owned by
  `LayerProvider` and `architecture:layer-runtime`.
- The drag frames, back-swipe arbitration and the native drag — owned by
  `spec:AST-124`.
- The floating-surface paint — owned by `spec:AST-123`.
- Polite and assertive announcements — owned by `spec:AST-086`.

## Public concepts

| Concept       | Closed values or states                          | Meaning                                                                 | Availability by variant/orientation/state | Default                                             | Owner                          | Stability    | Invalid-value behavior           |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------------ | ------------ | -------------------------------- |
| region        | the front window's region; in place              | where the card shows                                                    | in place only without a `LayerProvider`   | the front window's region                           | `component:react-native/Toast` | experimental | none                             |
| `position`    | `topEnd`; `topStart`; `bottomEnd`; `bottomStart` | the edge and the side the stack sits at                                 | the `toast` setting of `LayerProvider`    | `bottomEnd`                                         | `component:Toast`              | experimental | an unknown value is a type error |
| `type`        | `info`; `error`                                  | the card's colour, its announcement's urgency and its default auto-hide | always                                    | `info`                                              | `component:Toast`              | experimental | an unknown value is a type error |
| `backGesture` | unset; `always`; `atLeadingEdge`; `never`        | when a back gesture may begin on a drag that starts on the card         | always                                    | unset: the card keeps drags toward its dismiss edge | `component:react-native/Toast` | experimental | an unknown value is a type error |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                      | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST offer web's `useToast`, whose show function takes core's options (`body`, `type`, `isAutoHide`, `autoHideDuration`, `endContent`, `renderContent`, `uniqueID`, `collisionBehavior` and `onHide`) and returns a dismiss function, and web's `Toast`, which takes `body`, `type`, `isAutoHide`, `autoHideDuration`, `endContent`, `renderContent` and `onDismiss`, each with web's names, types, defaults and meaning. `onHide` and `onDismiss` receive the reason (`auto` or `manual`), and the shared base props attach to the card (`spec:AST-082` FR7). `body`, `endContent` and `renderContent` take React Native content. Toast takes no visual prop.                                                                                                                                                                                                                                                                                                                            | `component:Toast`; `spec:AST-082` FR3–FR5, FR7, DEC-2; `spec:AST-112` FR16 | settled            |
| FR2 | React Native adds `backGesture` to `Toast` and to the show options, with `spec:AST-124` FR3's values: unset (that record's `auto`, which declares nothing), the card keeps the drags toward the edge it dismisses to, and the content-wide back swipe yields; `always` or `atLeadingEdge` give a drag toward the back direction to the back gesture; `never` keeps that direction too. Under every value the leading screen-edge strip still goes back on iOS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-124` FR3; DEC-2                                                  | settled            |
| FR3 | A toast MUST show in the toast region of the front window: the topmost open modal window's `LayerProvider` while one is open, else the app root's. A toast raised by the screen behind an open dialog therefore floats over that dialog, and a toast still showing when that dialog closes moves to the region beneath it, keeping its timer. The region stacks toasts at the edge and side the `toast` setting's `position` names, newest nearest that edge, `space.s2` apart, `space.s4` inside the safe area and clear of the app's bars over that edge (a tab bar, a bottom accessory); a set `toast.inset` edge replaces the provider's inset and that bar clearance on its edge, as `component:Toast` FR6 states; `maxVisible` caps how many show, the oldest waiting (`component:Toast` FR6, FR7). Same-`uniqueID` toasts follow `collisionBehavior` (`component:Toast` FR8). The region is non-modal: the rest of the screen stays usable. Without a `LayerProvider`, the card draws in place. | `component:Toast` FR6–FR8, FR12; DEC-1                                     | verify             |
| FR4 | The card MUST draw core's layout: `body`, then on its first line `endContent` and the dismiss button named by core's dismiss message; long body text wraps below. It draws the theme's inverted surface (`color.backgroundInverted` for `info`, `color.backgroundErrorInverted` for `error`) with the on-colour that reads on it, the container radius, the medium shadow and `space.s4` padding, at most core's card width (400 points or dp) and never wider than the region, and paints as `spec:AST-123` FR7 chooses for a floating surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:Toast` FR1, FR13; `spec:AST-123` FR7; `spec:AST-093` FR4; DEC-3 | verify             |
| FR5 | A toast MUST show when it is raised. With auto-hide on (the default for `info`, off for `error`), it dismisses with reason `auto` after `autoHideDuration`; the timer pauses while a finger is on the card or screen-reader focus is inside it, and while the app is in the background, and resumes with the time left, at least one second. The dismiss button, a swipe, a call to the returned dismiss function or code dismiss with reason `manual`. At the dismissal, `onDismiss` is called and `onHide` fires, once, even when the toast is dismissed again during its exit; a toast replaced through `uniqueID` reports no `onHide`.                                                                                                                                                                                                                                                                                                                                                             | `component:Toast` FR2, FR3                                                 | verify             |
| FR6 | A drag toward the region's edge MUST decide once, at release, as core's swipe does: projected travel past the commit point dismisses, a release moving back toward the start cancels, and a short drag springs back; horizontal intent, a second touch, or a drag that starts on a control inside the card does not dismiss. A control inside the card keeps its press until the drag passes the touch slop. Where the native drag is present, the card's motion runs on the UI thread (`spec:AST-124` FR5). The card owns the drags toward its dismiss edge, as FR2 states.                                                                                                                                                                                                                                                                                                                                                                                                                           | `component:Toast` FR4; `spec:AST-124` FR3, FR5                             | verify             |
| FR7 | A new card MUST slide in from its edge and fade in, and a dismissed card collapses its row and fades before it leaves, sliding only along the block axis; a swipe's commit and spring-back start at the release velocity. Under Reduce Motion the entrance and dismissal are a short fade, and nothing slides or springs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:Toast` FR5; `spec:AST-112` FR19                                 | verify             |

The gap lines below describe `@astryxdesign/react-native`, the package that
implements this record.

- FR1 gap: the package has no `useToast`; an app renders `Toast` where it
  raises it, and `Toast` itself takes `uniqueID`, `collisionBehavior` and
  `onHide`.
- FR1 gap: `Toast` takes no `renderContent`; the card always has core's
  layout.
- FR2 gap: `Toast` also takes `isBackSwipeAllowed`, the same choice as
  `backGesture` `'always'`.
- FR3 gap: the `toast` setting's `position` also takes `top` and `bottom`, a
  stack centred on that edge.
- FR3 gap: a toast shows in the nearest `LayerProvider`'s region, so one
  raised by the screen behind an open dialog draws under that dialog.
- FR4 gap: the card takes its paint from the app's `surfaceMaterial`
  preference, not from the theme's `material` member.
- FR4 gap: the card is at most six `space.s12` steps wide, not 400.
- FR5 gap: the timer pauses only while a finger is on the card, not while
  screen-reader focus is inside it or the app is in the background, and it
  resumes with the time left even when that is under a second.
- FR5 gap: `onHide` fires once the card has left the region, after its exit.
- FR6 gap: a swipe dismisses on its travel past 0.4 of the card's size (at
  least 48 points or dp) or on a flick, even after the finger moves back, and
  a sideways swipe either way dismisses too.
- FR7 gap: a new card appears without sliding in or fading in, and a
  dismissed card fades without its row collapsing.
- AR1 gap: the announcement and the card's message element lead with the
  type word (core's info or error word), and an overwrite with the same words
  is not announced again.

### Allowed variation

- **AV1 — Native drag.** Where the native drag is present, the card's drag and
  spring are the platform layer's (`spec:AST-124` FR5); elsewhere the library
  drives them with the same release rule.

### Representative states

| State                                                       | Required invariant                                              | Allowed variation |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| each `position`                                             | the stack at that edge and side, newest nearest the edge        | none              |
| a tab bar under a bottom stack                              | the stack above the bar                                         | none              |
| a toast raised behind an open dialog, and from inside it    | the toast over the dialog; moved beneath when the dialog closes | none              |
| more toasts than `maxVisible`                               | the newest show; the oldest wait                                | none              |
| `uniqueID` with `overwrite` and `ignore`                    | replaced in place and announced again; not shown                | none              |
| `info` and `error`                                          | auto-hides; stays until dismissed                               | none              |
| a finger resting on the card; screen-reader focus inside it | the timer paused; it resumes with the time left                 | none              |
| a swipe toward the edge, a short drag, a drag back          | dismissed; springs back; cancelled                              | none              |
| a drag toward the back direction, each `backGesture`        | the card or the back gesture takes it, as FR2 states            | none              |
| Reduce Motion                                               | a fade; no slide or spring                                      | none              |

### Transformation and precedence order

- **ORD1 — Region.** The topmost open modal window's region, else the app
  root's; without a `LayerProvider`, in place.
- **ORD2 — Dismissal.** The first dismissal wins: the timer, the button, a
  swipe or code; `onDismiss` and `onHide` fire at that dismissal, and the
  exit follows.
- **ORD3 — Drag.** The leading screen-edge back swipe on iOS; then
  `backGesture` for a drag toward the back direction; then the card for a drag
  toward its edge.

### Performance and resources

- **PR1 — No JavaScript per frame.** The card's drag, spring and fade run on
  the native driver or the native drag; JavaScript hears touch events and the
  release only. A shown toast holds one timer.

## Accessibility contract

- **AR1 — One announcement.** A toast is announced once when it shows, with
  its text, politely for `info` and assertively for `error`, and again each
  time an `overwrite` replaces it; the announced words are the words the card
  shows (`component:Toast` FR8, FR9; `spec:AST-086` FR1, FR7). It never takes
  screen-reader focus.
- **AR2 — A non-gesture way to dismiss.** In the default layout the dismiss
  button stays as the alternative to the swipe (`component:Toast` AR4), and the
  card's controls are reachable with VoiceOver and TalkBack.
- **AR3 — Timing.** The auto-hide pauses while the person touches or reads the
  card (FR5; `component:Toast` AR3).

## Design relationships

| Anatomy or state | Design requirement                                | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Card             | core's toast card on the theme's inverted surface | prescribed by the theme  | primary        | FR4                |
| Region           | core's viewport stack in the front window         | prescribed by the theme  | supporting     | FR3                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): none satisfies the card (DEC-3), so
Toast is drawn; the drag ownership and the native drag are the platform
layer's (`spec:AST-124`). Guideline pages: Accessibility in the Apple Human
Interface Guidelines; Snackbars and Accessibility in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.backgroundInverted`,
`color.backgroundErrorInverted`, the on-colours, `radius.container`,
`shadow.med`, `space.s1` to `space.s4`, the theme's `material` member, and the
theme's motion.

### Native pieces

| Native piece             | Record                  | What this record uses it for                                             |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------ |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3      | the card's ownership of its drags and `backGesture` (FR2, FR6)           |
| `AstryxDragSnap`         | `spec:AST-124` FR5      | the card's drag on the UI thread (FR6)                                   |
| `AstryxMaterialView`     | `spec:AST-123` FR2, FR7 | the floating surface's system material where the theme asks for it (FR4) |

## Family and system relationships

- `component:Toast` owns the props, the timing, deduplication and the
  announcement; this record states only what React Native adds or does
  differently. Core's F6 focus move (FR10) and region landmark (FR11) are
  browser conventions and belong to the web contract. Core's move of the
  viewport into the latest modal (FR12) is the front-window region of FR3
  here. The card picks its text side from the theme's inverted surface, as
  core does before it measures (FR13); core's measurement of the painted card
  (FR14) belongs to the web.
- `family:action-groups` owns the card's end content as an action group.
- `spec:AST-124` owns drag frames, back-swipe arbitration and the native drag;
  `spec:AST-123` owns the floating-surface paint; `spec:AST-086` owns
  announcements.

## Verification map

| Contract | Verification                                                                            | Representative states                                                                                                                                 | Mutation or failure expectation                                                                                                                                                           | Audit section                     |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, FR2 | Type tests of the exports against core's contract; a contract drift test                | each prop; `useToast` and its dismiss function; each `backGesture` value                                                                              | a missing core prop or export, a different default, or an accepted web-only prop fails                                                                                                    | `audit:react-native/Toast/api`    |
| FR3      | Unit tests of the region choice and store; Simulator and emulator captures              | each `position`; a tab bar; a toast raised behind and inside a dialog; the dialog closing; `maxVisible`; `overwrite` and `ignore`; no `LayerProvider` | a stack at the wrong edge, under a bar or under an open dialog, a toast lost or restarted when its dialog closes, more cards than `maxVisible`, or a duplicate shown under `ignore` fails | `audit:react-native/Toast/region` |
| FR4      | Simulator and emulator captures in two themes, light and dark                           | `info` and `error`; long body; end content; a narrow phone                                                                                            | a card off the inverted surface, unreadable text, a card wider than 400 or than the region, or a dismiss button off the first line fails                                                  | `audit:react-native/Toast/card`   |
| FR5      | Unit tests of the timer and callbacks through the package's testing doubles             | auto-hide on and off; a finger on the card; screen-reader focus inside; the app backgrounded; a second dismissal during the exit; a replacement       | a dismissal while paused, a timer that restarts from zero, two `onHide` calls, an `onHide` later than the dismissal, or an `onHide` for a replaced toast fails                            | `audit:react-native/Toast/timing` |
| FR6, PR1 | Touch checks on the Simulator, the emulator and devices; unit tests of the release rule | a swipe; a short drag; a drag back before release; a drag from a control inside; two fingers                                                          | a dismissal on a drag back, a press lost to a short drag, or JavaScript work per frame fails                                                                                              | `audit:react-native/Toast/swipe`  |
| FR7      | Simulator and emulator captures of entrance and exit                                    | entrance; button dismissal; swipe dismissal; Reduce Motion                                                                                            | a card that appears without its entrance, a slide under Reduce Motion, or an exit without the row collapsing fails                                                                        | `audit:react-native/Toast/motion` |
| AR1–AR3  | VoiceOver and TalkBack checks on devices                                                | `info`; `error`; an `overwrite` with the same and with new words; a toast with an action                                                              | two announcements for one show, a replacement not announced, announced words the card does not show, a toast that takes focus, or no button alternative to the swipe fails                | `audit:react-native/Toast/a11y`   |

## Decision log

### DEC-1 — Toasts show in the front window's region

**Reference:** `component:react-native/Toast/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

A modal surface on a phone is a separate window above the app, and nothing in
the app's own layer can draw over it. The app's root and every modal window
therefore hold a `LayerProvider` with its own toast region, and a toast shows
in the region of the front window, so it is never hidden under an open dialog,
whichever screen raised it. When that window closes, its toasts move to the
region beneath. The region's placement is core's `toast` setting.

### DEC-2 — `backGesture` says when a back gesture may take a drag on the card

**Reference:** `component:react-native/Toast/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A phone's back swipe can start anywhere on the screen, and a toast near the
leading edge sits where that swipe begins. The card keeps the drags toward its
own dismiss edge, and `backGesture` lets an app give the back direction to the
back gesture where going back matters more. A browser has no such gesture, so
the prop is React Native's.

### DEC-3 — Toast is drawn

**Reference:** `component:react-native/Toast/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

iOS has no toast. Android's toast carries text only, and its snackbar one
action and no dismiss button, so neither holds core's card: a body, end
content and a dismiss button. Toast therefore draws core's card from the
theme, as `spec:AST-082` FR11 allows where the platform has no control that
satisfies the contract.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
