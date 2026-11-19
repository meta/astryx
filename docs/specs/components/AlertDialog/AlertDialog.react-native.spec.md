---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/AlertDialog
platform_of: component:AlertDialog
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layering, motion, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# AlertDialog (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `AlertDialog` under its core name with core's props and meanings, and adds `onDismissed`, called once the alert has left the screen. `width` stays in the web contract (DEC-1).                                                                                                                                                                    |
| Behavior                | A modal question drawn from theme tokens in a window above the whole app, over-full-screen through the presentation host on iOS and in React Native's modal window elsewhere. A tap on the scrim does nothing; Android back, the VoiceOver escape gesture and Cancel call `onOpenChange(false)`; the action calls `onAction` only. Screen-reader focus lands on Cancel. |
| End-user impact         | A person meets an alert that covers the app, keeps its place until they answer, reads in the platform's glass on iOS 26, and can always back out without running the destructive action.                                                                                                                                                                                |
| Builder impact          | A builder presents the next surface from `onDismissed`, not from `onOpenChange(false)`, so the two windows never overlap.                                                                                                                                                                                                                                               |
| Compatibility/readiness | Not yet released; additive. Draft. Where the alert differs from this record or `component:AlertDialog`, a gap line under Current-state impact says so.                                                                                                                                                                                                                  |
| Review checks           | Reject a scrim tap that dismisses, an action that closes the alert itself, initial focus anywhere but Cancel, an alert drawn inside the page rather than its own window, a visual value not from the theme, or a next presentation started before `onDismissed`.                                                                                                        |
| Governing rules         | `component:AlertDialog` FR1–FR6, FR8–FR10 and AR1; `family:overlay-dismissal`; `spec:AST-128` FR5, FR11; `spec:AST-123` FR7, FR9; `spec:AST-082` FR3, FR4, FR7, FR11; `spec:AST-093` FR2–FR4; DEC-1, DEC-2 below.                                                                                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

An alert asks a person to confirm or cancel one consequential action before it
happens. AlertDialog on React Native keeps core's fixed anatomy and its rule
that the action never closes the alert by itself, and presents it in a window
above the whole app, as a platform alert sits. This record states only what
React Native adds to `component:AlertDialog` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled, as on the web: `isOpen` with
  `onOpenChange`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: React Native exports no `useImperativeAlertDialog`.
- FR3 gap: on a phone the alert spans the window, less the `space.s4`
  gutters, up to 400 dp, not 320 dp.
- FR3 gap: the title draws in level 4's heading type, not level 2's; screen
  readers still hear a level-2 heading.
- FR4 gap: the window cross-fades in and out; the alert does not scale in
  from 1.2.
- FR4 gap: a press that slides from one action to the other runs neither.
- AR1 gap: the alert surface carries no name or description of its own;
  screen readers reach the title and the description as the surface's parts.

## Ownership boundary

**Owns**

- AlertDialog's React Native props and `onDismissed` (FR1, FR6).
- The window the alert opens in, its dismissal paths and its motion (FR2,
  FR4, FR5).
- The alert's surface, layout and paint on React Native (FR3).
- How the alert reads to VoiceOver and TalkBack (AR1–AR4).

**Does not own / non-goals**

- The anatomy, the action rule and the inline form — owned by
  `component:AlertDialog`.
- Overlay dismissal rules — owned by `family:overlay-dismissal`.
- The presentation host and the modal host — owned by `spec:AST-128`.
- The overlay material — owned by `spec:AST-123`.
- Button variants and the loading state — owned by `Button`.

## Public concepts

| Concept       | Closed values or states               | Meaning                                                                            | Availability by variant/orientation/state | Default         | Owner                                | Stability    | Invalid-value behavior |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | --------------- | ------------------------------------ | ------------ | ---------------------- |
| presentation  | closed, entering, open, leaving, gone | where the alert is between `isOpen` and its window leaving the screen              | modal                                     | closed          | `component:react-native/AlertDialog` | experimental | none                   |
| action layout | stacked, row                          | the action above Cancel, both filling, or Cancel then the action at the inline end | modal and inline                          | by window width | `component:AlertDialog`              | experimental | none                   |
| paint         | native glass, opaque                  | system glass under the content, or the theme's surface                             | modal                                     | FR3             | `spec:AST-123`                       | experimental | none                   |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                               | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `AlertDialog` (`spec:AST-082` FR3) with core's `isOpen`, `onOpenChange`, `title`, `description`, `actionLabel`, `onAction`, `cancelLabel` (default "Cancel"), `actionVariant` (`Button`'s `primary`, `secondary`, `ghost` or `destructive`; default `destructive`), `isActionLoading` and `isInline`, with core's meanings, and the base props `id` and `isHidden` on the container (`spec:AST-082` FR7). `width` belongs to the web contract (DEC-1). It also exports `useImperativeAlertDialog`, which returns `show`, `hide` and the element to render and owns `isOpen` and `onOpenChange` for its caller (`component:AlertDialog` FR5). React Native adds `onDismissed` (FR6, DEC-2).                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:AlertDialog`; `spec:AST-082` FR3, FR4, FR7                               | verify             |
| FR2 | A modal AlertDialog MUST open in a window above the whole app, both bars included: on iOS, the presentation host's over-full-screen presentation, stacked with the library's sheets through the host's one queue, so an alert opened from a sheet comes on top (`spec:AST-128` FR5, FR8); elsewhere, and where the host cannot present, React Native's modal window, drawn under the status and navigation bars (`spec:AST-128` FR11). A scrim dims the app behind and takes its touches; a tap on it does nothing (`component:AlertDialog` FR1). The surface is centred and keeps clear of the bars and the safe area. With `isHidden` the alert opens no window and stays mounted, hidden, in place.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:AlertDialog` FR1; `spec:AST-128` FR5, FR8, FR11; OQ1                     | verify             |
| FR3 | The alert's surface MUST be `Dialog`'s: `color.backgroundSurface` (on iOS in dark mode the theme's first elevated level), `radius.container` and the theme's high shadow, at most three quarters of the window tall, its content scrolling past that. On a phone, a compact window, the alert is 320 dp wide, as iOS's is; elsewhere it is as wide as the window less `space.s4` gutters, up to 400 dp (`component:AlertDialog` FR9). On iOS 26 and later, where the material view is present and neither Reduce Transparency nor a theme that sets an opaque material applies, it paints system glass under the content with a clear fill; otherwise it paints the surface opaque (`spec:AST-123` FR7, FR9). Inside, `space.s4` padding holds the title in level 2's heading type, the description in the body type and the secondary colour, `space.s2` below it, and the actions a further `space.s3` below (`component:AlertDialog` FR10). At a window width of 640 dp and below the action sits above Cancel and both fill the width; wider, Cancel then the action sit in a row at the inline end, `space.s2` apart (`component:AlertDialog` FR3). | `component:AlertDialog` FR3, FR9, FR10; `spec:AST-123` FR7, FR9; `spec:AST-093` FR4 | verify             |
| FR4 | The alert MUST present by scaling from 1.2 to 1 while its opacity and the scrim's dimming rise from 0, on the theme's entrance duration and easing, and dismiss by a fade on the theme's exit duration and easing; under Reduce Motion both are the shared cross-fade (`component:AlertDialog` FR6). Its actions are an action group: a press that slides across them runs the action it lifts on, and a lift outside them runs nothing (`component:AlertDialog` FR8). The alert closes through `onOpenChange(false)` on Cancel, on Android back, and on the VoiceOver escape gesture; the action calls `onAction` and leaves closing to the caller; `isActionLoading` shows the action's loading state while Cancel stays available (`component:AlertDialog` FR2, FR3).                                                                                                                                                                                                                                                                                                                                                                                 | `component:AlertDialog` FR2, FR3; `family:overlay-dismissal`                        | verify             |
| FR5 | With `isInline`, the alert MUST draw its anatomy in place, with no window and no modality, as a group: never wider than its parent, filling it up to 400 dp; its body scrolls only when its content overflows, so a page swipe passes through it (`component:AlertDialog` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:AlertDialog` FR4                                                         | verify             |
| FR6 | `onDismissed` MUST run once the alert's window has left the screen, whatever closed it: the action's caller, Cancel, back, the escape gesture, or `isOpen` set to false. It does not run when the alert unmounts or while it is hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DEC-2                                                                               | verify             |

### Allowed variation

- **AV1 — The window.** The presentation host and the modal window may
  start and end a transition a frame apart between iOS and Android.
- **AV2 — Glass.** Where system glass paints, its look is the system's and may
  change with each OS release.

### Representative states

| State                          | Required invariant                                          | Allowed variation |
| ------------------------------ | ----------------------------------------------------------- | ----------------- |
| open on a phone                | stacked actions, the action above Cancel; focus on Cancel   | AV2               |
| open on a wide window          | Cancel then the action in a row                             | AV2               |
| opened from a sheet on iOS     | the alert above the sheet                                   | none              |
| scrim tapped                   | nothing happens                                             | none              |
| Android back, VoiceOver escape | `onOpenChange(false)`                                       | none              |
| action pressed                 | `onAction` only; the alert stays until the caller closes it | none              |
| action loading                 | the action busy; Cancel available                           | none              |
| closed, then the next sheet    | the sheet opens from `onDismissed`                          | none              |
| Reduce Transparency            | an opaque surface                                           | none              |
| inline form                    | in place, a group, no window                                | none              |
| short window                   | the content scrolls inside the surface                      | none              |

### Transformation and precedence order

- **ORD1 — Dismissal.** Cancel, back or the escape gesture call
  `onOpenChange(false)`; a scrim tap does nothing; the action calls
  `onAction` only.
- **ORD2 — Window.** The presentation host's over-full-screen presentation
  where it can present, then React Native's modal window.
- **ORD3 — Paint.** Reduce Transparency or a theme's opaque material
  (opaque), then system glass where it can paint, then opaque.

### Performance and resources

- **PR1 — One window while open.** The alert opens one window when `isOpen`
  turns true and holds it until its exit has played; a hidden alert holds
  none.

## Accessibility contract

- **AR1 — An alert dialog.** The surface has the alert dialog role, is named
  by the title and described by the description, and is modal to screen
  readers: VoiceOver and TalkBack stay inside it while it is open. The title
  is a level-2 heading. The inline form is a group, not an alert
  dialog (`component:AlertDialog` AR1).
- **AR2 — Focus on Cancel.** When the alert opens, screen-reader focus moves
  to Cancel, the least destructive action; when it closes, the window returns
  focus to where it was.
- **AR3 — Ways out.** The VoiceOver escape gesture and Android back cancel;
  the scrim is not an element of its own.
- **AR4 — Text size.** The title, the description and the buttons scale with
  Dynamic Type and Android's font scale, and the content scrolls inside the
  surface when it no longer fits.

## Design relationships

| Anatomy or state   | Design requirement                        | Representation authority   | Hierarchy role | Component contract |
| ------------------ | ----------------------------------------- | -------------------------- | -------------- | ------------------ |
| Surface            | an alert above the whole app              | prescribed by core         | prominent      | FR2, FR3           |
| Title, description | the question and its consequence          | prescribed by core         | prominent      | FR3                |
| Actions            | Cancel and one action, stacked on a phone | prescribed by core         | prominent      | FR3                |
| Glass              | the platform's overlay material on iOS 26 | prescribed by the platform | supporting     | FR3                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): the system alerts, UIAlertController on
iOS and Material's alert dialog on Android, close on any button and take no
theme, loading action or action variant, while core's action leaves closing to
the caller, so AlertDialog draws its own alert in a modal window (OQ1).
Guideline pages (`spec:AST-093` FR3): Alerts and Accessibility in the Apple
Human Interface Guidelines; Dialogs in Material 3.

Theme values read (`spec:AST-093` FR4): `color.backgroundSurface`, the dark
elevated level, `radius.container`, the high shadow, `space.s2`, `space.s3`,
`space.s4`, the heading and body type, the secondary text colour, the scrim
colour, `Button`'s variant tokens, and the theme's surface material.

### Native pieces

| Native piece             | Record                       | What this record uses it for                                    |
| ------------------------ | ---------------------------- | --------------------------------------------------------------- |
| `AstryxPresentationHost` | `spec:AST-128` FR5, FR8      | the over-full-screen window on iOS (FR2)                        |
| `AstryxModalHost`        | `spec:AST-128` FR11          | React Native's modal window where the host cannot present (FR2) |
| `AstryxMaterialView`     | `spec:AST-123` FR2, FR7, FR9 | system glass under the alert on iOS 26 (FR3)                    |

## Family and system relationships

- `component:AlertDialog` owns the anatomy, the action rule and the inline
  form; this record states how React Native presents them.
- `Dialog` shares the alert's surface and modal window.
- `family:overlay-dismissal` owns which ways out an overlay offers.
- `spec:AST-128` owns the windows and how presentations stack.

## Verification map

| Contract | Verification                                                                                                                                            | Representative states                                                                                                                                              | Mutation or failure expectation                                                                                                | Audit section                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| FR1      | Type tests of AlertDialog's props and `useImperativeAlertDialog` against the core contract; a contract drift test                                       | each core prop; `width`; `show` and `hide`                                                                                                                         | a renamed prop, an offered `width`, a missing hook, or an accepted and ignored prop fails                                      | `audit:react-native/AlertDialog/api`    |
| FR2, FR4 | Unit tests of the window, the motion and the dismissal paths through the package's testing doubles (`spec:AST-112` FR15); Simulator and emulator checks | open and close; the scale-in and the fade-out; Reduce Motion; a slide across the actions; a scrim tap; back; the escape gesture; an alert over a sheet; `isHidden` | a scrim tap that closes, an action that closes, a missing scale-in, a slide that runs nothing, or an alert under a sheet fails | `audit:react-native/AlertDialog/window` |
| FR3      | Unit tests of the surface, width and layout with two themes, light and dark; captures on a phone, at 640 dp and wider, with Reduce Transparency         | 320 dp on a phone; stacked and row; the title's type; glass and opaque; a short window                                                                             | a wrong token or width, the action below Cancel on a phone, a title in another type, or glass under Reduce Transparency fails  | `audit:react-native/AlertDialog/look`   |
| FR5      | Unit tests of the inline form                                                                                                                           | open and closed; a narrow parent                                                                                                                                   | a window or a modal role inline fails                                                                                          | `audit:react-native/AlertDialog/inline` |
| FR6      | Unit tests through the testing doubles                                                                                                                  | each way of closing; an unmount; `isHidden`                                                                                                                        | a call before the window leaves, a second call, or a call on unmount fails                                                     | `audit:react-native/AlertDialog/window` |
| AR1–AR4  | VoiceOver and TalkBack checks; unit tests of the role, the heading and the focus request                                                                | open; close; the largest text size                                                                                                                                 | focus anywhere but Cancel, a reachable view behind the alert, or a clipped description fails                                   | `audit:react-native/AlertDialog/a11y`   |

## Decision log

### DEC-1 — The alert's width is the alert's own

**Reference:** `component:react-native/AlertDialog/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

Core's `width` takes a number or a CSS length, a mix of kinds the portable
contract has no form for (`spec:AST-082` FR4), and a phone alert has the
platform's own width. React Native's AlertDialog takes no `width`; the
alert's width follows the window (FR3).

### DEC-2 — The next presentation waits for `onDismissed`

**Reference:** `component:react-native/AlertDialog/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

An alert's window is still on the screen while it fades out after
`onOpenChange(false)`, and the platform presents a second window only once the
first has gone. `onDismissed` reports that moment, so a picker or a sheet that
follows the alert opens without waiting on a guess.

## Open questions

- **OQ1 — Does AlertDialog present the system alert?** (`human-api`) The
  native-first rule (`spec:AST-082` FR11) and `spec:AST-128` FR5 point to the
  system alert, which closes on any button and takes no theme, loading state
  or action variant. Options: present the system alert where the alert's
  shape fits it (no loading action, the action closing the alert as it runs),
  through a request shape `spec:AST-128` OQ2 settles, and draw the alert
  elsewhere; or keep the drawn alert everywhere, which keeps core's action
  rule and the theme and stays `spec:AST-128`'s FR5 gap.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
