---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Dialog
platform_of: component:Dialog
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, motion, theming, accessibility, platform]
verified_by: []
modules: [module:Dialog/DialogHeader]
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Dialog (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `Dialog` (`isOpen`, `onOpenChange`, `children`, `variant`, `purpose`, `isInline`, `padding`) with the shared base props on its container, and web's `DialogHeader` (`title`, `subtitle`, `onOpenChange`, `startContent`, `endContent`, `endContentEdgeCompensation`, `hasDivider`). `width`, `maxHeight` and `position` stay on the web (DEC-2). React Native adds `onDismissed` (DEC-3).                                                                                                                                                                        |
| Behavior                | An open Dialog presents above the app, over the theme's dim. On iOS it is a centred panel in the platform's over-full-screen window, at the window's width less a gutter, up to core's default width and three quarters of the window's height, or with `fullscreen` the whole window; the window stacks with sheets and other dialogs in the order they were asked for. On Android it presents as Material's dialog. `purpose` decides which of a tap on the dim, Android back and the VoiceOver escape close it. `isInline` draws the panel in place with no window. |
| End-user impact         | A person sees a dialog come up on top of whatever is open, a sheet included, in system glass where glass can paint, and closes it the platform's way where its purpose allows. VoiceOver and TalkBack move into the dialog when it opens.                                                                                                                                                                                                                                                                                                                              |
| Builder impact          | Web code that drives a Dialog from app state ports unchanged, apart from the web's `width`, `maxHeight` and `position` props. An app opens the next surface (a picker, another dialog) from `onDismissed`, once the dialog's window has gone.                                                                                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Not yet released; additive. Draft. Current-state impact lists where the library differs from this record.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Review checks           | Reject a dialog that opens under a sheet, an empty window that takes touches, a dim tap that closes a `required` or `form` dialog, Android back or the VoiceOver escape that closes a `required` dialog, a `width`, `maxHeight` or `position` prop on Dialog, a scrim that a screen reader reads, `onDismissed` before the window has gone or twice for one close, or a third-party native library Dialog needs.                                                                                                                                                       |
| Governing rules         | `component:Dialog` FR1, FR4, FR5, FR9, FR10, AR1 and AR2; `module:Dialog/DialogHeader`; `family:overlay-dismissal`; `component:Drawer` FR15; `spec:AST-082` FR3–FR5, FR7, FR11 and DEC-2; `spec:AST-093` FR2–FR4; `spec:AST-112` FR5, FR16 and FR19; `spec:AST-128` FR5, FR8, FR11 and FR12; `spec:AST-123` FR7; DEC-1 to DEC-3 below.                                                                                                                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

Dialog on React Native is web's modal task above the current screen, presented
in a platform window so it comes up over everything the app has open, blocks
the screen behind it, and closes the platform's way, while its API, its
dismissal rules and its accessibility follow the core `Dialog` contract. This
record states only what React Native adds to `component:Dialog` and
`module:Dialog/DialogHeader` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled only, as on the web: the app owns `isOpen`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

The library differs from this record in these places:

- FR3 gap: on Android, Dialog draws its panel in React Native's modal window
  rather than presenting as Material's dialog (`spec:AST-128` OQ5).
- FR1 gap: Dialog takes no `padding`; the theme's container inset always pads
  the panel.
- FR4 gap: the standard panel takes its paint from the app's
  `surfaceMaterial` preference, not from the theme's `material` member.
- FR6 gap: a tap on the dim closes a `form` dialog until an input inside has
  reported an edit since the dialog opened.
- FR8 gap: the close button is the small ghost icon button.
- AR1 gap: a `required` dialog has the plain dialog role.
- AR1 gap: when the dialog closes, the window returns screen-reader focus to
  the element that had it before the dialog opened, whatever happened to focus
  while it was open.
- FR4 gap: on iOS a `fullscreen` panel pads its content by the safe area plus
  the container inset, not by the larger of the two.

## Ownership boundary

**Owns**

- Which props React Native's `Dialog` and `DialogHeader` offer, and
  `onDismissed` (FR1, FR2).
- The window an open Dialog presents in on each platform, and what `isHidden`
  does to it (FR3).
- The panel: its size, paint, scrim and padding, standard and full-screen
  (FR4), and its motion (FR5).
- Which platform paths close a Dialog for each `purpose` (FR6).
- The inline panel on React Native (FR7).
- How DialogHeader draws its title and close button (FR8).
- Dialog's VoiceOver and TalkBack exposure (AR1–AR3).

**Does not own / non-goals**

- The meaning of Dialog's and DialogHeader's props and Dialog's focus
  lifecycle — owned by `component:Dialog` and `module:Dialog/DialogHeader`.
- Escape, back and dim-tap rules across nested surfaces — owned by
  `family:overlay-dismissal`.
- The presentation host, the modal host and the stacking of presented windows —
  owned by `spec:AST-128`.
- The overlay paint and the system material — owned by `spec:AST-123`.

## Public concepts

| Concept      | Closed values or states    | Meaning                                                            | Availability by variant/orientation/state | Default        | Owner                           | Stability    | Invalid-value behavior           |
| ------------ | -------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | -------------- | ------------------------------- | ------------ | -------------------------------- |
| presentation | modal window; inline panel | a platform window that blocks the app, or the panel drawn in place | `isInline` for the inline panel           | modal window   | `component:Dialog`              | experimental | none                             |
| `variant`    | `standard`; `fullscreen`   | a centred panel over the dim, or the whole window                  | the modal window                          | `standard`     | `component:Dialog`              | experimental | an unknown value is a type error |
| `purpose`    | `required`; `form`; `info` | which platform paths close the dialog                              | the modal window                          | `info`         | `component:Dialog`              | experimental | an unknown value is a type error |
| dismissed    | presented; leaving; gone   | where the window is after a close; `onDismissed` reports gone      | the modal window                          | not applicable | `component:react-native/Dialog` | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                                                            | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | The React Native `Dialog` MUST take web's `isOpen`, `onOpenChange`, `children`, `variant`, `purpose`, `isInline` and `padding` with web's names, types, defaults and meaning, and the shared base props on its container (`spec:AST-082` FR7). `onOpenChange` receives the new open state, and `padding` takes core's spacing steps. `width`, `maxHeight` and `position` are not offered (DEC-2). `DialogHeader` MUST take core's `title`, `subtitle`, `onOpenChange`, `startContent`, `endContent`, `endContentEdgeCompensation` and `hasDivider` with core's meaning. Neither takes a visual prop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:Dialog`; `module:Dialog/DialogHeader`; `spec:AST-082` FR3–FR5, FR7, DEC-2; `spec:AST-112` FR16; DEC-2 | settled            |
| FR2 | React Native adds `onDismissed`, called once each time the dialog's window has fully left the screen, whatever closed it: its own controls, the dim, back or the escape, or `isOpen` set to false. It is not called when the Dialog unmounts or while it is hidden. Unset, it changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | DEC-3                                                                                                            | settled            |
| FR3 | An open, modal Dialog MUST present in a platform window above the app. On iOS it is the presentation host's over-full-screen presentation, which covers the status bar and the home indicator, keeps the standard panel clear of them by the safe area, and comes up over every surface already presented, sheets included, in the order the surfaces were asked for; where that host is absent, it is React Native's modal window. On Android, Dialog presents as Material's dialog (`spec:AST-082` FR11). With `isHidden`, the Dialog opens no window and draws nothing, so no empty window takes touches from the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-128` FR5, FR8, FR11; `spec:AST-082` FR11; `spec:AST-093` FR2; DEC-1                                    | verify             |
| FR4 | On iOS, the standard panel MUST be centred over the theme's overlay dim with no blur, as wide as the window less a `space.s4` gutter on each side and at most core's default width (400 points or dp), and at most three quarters of the window's height; its body scrolls when its content is taller. It draws the theme's surface colour, container radius and high shadow, pads its content by `padding`, else by the theme's container inset (`space.s4`), and paints as `spec:AST-123` FR7 chooses for an overlay: system glass behind the content where glass can paint, otherwise the opaque surface. A `fullscreen` panel fills the window with the opaque surface, square, with no dim, and pads its content by `padding`, else on each edge by the larger of the theme's container inset and the safe area, so with `padding` unset its title never sits under the status bar or the home indicator, as core's full-screen Dialog does. On Android, Material's dialog draws the container: its dim, its surface, shape and elevation, its width and its position, with the theme's surface colour and container radius reaching it; a `fullscreen` Dialog is Material's full-screen dialog. On both platforms the dialog's content is padded by `padding`, else by the theme's container inset, or on an iOS `fullscreen` panel by the larger of that inset and the safe area, and scrolls when it is taller than the container, and text in it that sets no colour takes the primary text colour. | `component:Dialog` FR9, FR10; `spec:AST-123` FR7; `spec:AST-093` FR4; DEC-1, DEC-2                               | verify             |
| FR5 | On iOS, a standard Dialog MUST fade in and out, and a `fullscreen` Dialog slides up on open and down on close and fades under Reduce Motion. On Android, the motion is Material's dialog's own. The window leaves the screen only after its closing motion ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-128` FR5; `spec:AST-112` FR19                                                                          | verify             |
| FR6 | The platform paths MUST follow `purpose`, and each path that closes calls `onOpenChange(false)`. `info`: a tap on the dim, Android back and the VoiceOver escape close the dialog. `form`: Android back and the escape close it, and a tap on the dim does not. `required`: none of these closes it; only the dialog's own controls do. Back and the escape reach the topmost window only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `family:overlay-dismissal`; `component:Drawer` FR15; `spec:AST-128` FR11, FR12                                   | verify             |
| FR7 | With `isInline`, an open Dialog MUST draw its panel in place with no window, dim or modal behaviour: the panel is never wider than its parent and at most core's default width, and its body scrolls only when its content overflows, so a swipe on the page passes through. On both platforms the inline panel draws the theme's surface colour and container radius and pads its content by `padding`, else by the theme's container inset (`space.s4`). A closed inline Dialog draws nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `component:Dialog` FR5                                                                                           | verify             |
| FR8 | `DialogHeader` MUST draw its row as core's: start content, the title block, then the end content and the close button. A string `title` is a heading at level 2, and a string `subtitle` is secondary text below it. The close button, shown only with `onOpenChange`, is the default (medium) ghost icon button with the `close` icon, named by the localized word for close, and it calls `onOpenChange(false)`. The end slot's edge compensation and the title's centring follow core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `module:Dialog/DialogHeader`; `component:Dialog` FR2                                                             | verify             |

### Allowed variation

- **AV1 — The window's transition.** The fade and the slide are the
  platform's window transitions and may change with each OS release.
- **AV2 — Glass.** Where glass can paint, the system glass behind a standard
  panel is the system's own and follows its settings (`spec:AST-123` FR7).

### Representative states

| State                                                 | Required invariant                                                                                                                                                                              | Allowed variation       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| a dialog opened from a sheet, iOS                     | the dialog over the sheet                                                                                                                                                                       | the system's transition |
| two dialogs asked for in one update                   | each presents, the second over the first                                                                                                                                                        | none                    |
| `isHidden` while open                                 | no window; the app takes touches                                                                                                                                                                | none                    |
| iOS phone portrait and landscape; a tablet            | the panel at the window's width less the gutter, up to 400                                                                                                                                      | none                    |
| iOS: content taller than three quarters of the window | the body scrolls inside the panel                                                                                                                                                               | none                    |
| iOS: `fullscreen`                                     | the whole window, opaque, no dim; with `padding` unset, content clear of the status bar and home indicator by the larger of the inset and the safe area; a slide, or a fade under Reduce Motion | none                    |
| Android: content taller than Material's dialog        | the content scrolls inside it                                                                                                                                                                   | none                    |
| Android: `fullscreen`                                 | Material's full-screen dialog and its own motion                                                                                                                                                | none                    |
| `info`, `form`, `required`                            | the paths of FR6                                                                                                                                                                                | none                    |
| iOS, Reduce Transparency on and off                   | the opaque surface with the setting on; with it off, glass where glass can paint, otherwise the opaque surface                                                                                  | the system glass        |
| inline in a scrolling page                            | no window; a vertical swipe scrolls the page                                                                                                                                                    | none                    |

### Transformation and precedence order

- **ORD1 — Window.** `isInline` draws in place; `isHidden` opens no window;
  otherwise, on iOS, the presentation host's over-full-screen presentation
  where it is present, else React Native's modal window; on Android, Material's
  dialog.
- **ORD2 — Dismissal.** The topmost window takes back and the escape; its
  `purpose` decides whether they close it (FR6); a nested surface inside it
  closes before it, as `family:overlay-dismissal` states.
- **ORD3 — Paint.** `spec:AST-123` FR7's order for overlays: accessibility
  settings, then the theme's `material`, then glass where it can paint.

### Performance and resources

- **PR1 — The window exists only while the dialog does.** A closed or hidden
  Dialog holds no window. Presentation and the window's transitions run on the
  UI thread; JavaScript hears an open, a close request and the dismissal only
  (`spec:AST-128` FR13).

## Accessibility contract

- **AR1 — Modal focus.** The panel has the dialog role, and a `required`
  dialog keeps core's alert-dialog role, which VoiceOver and TalkBack read as
  an alert (`component:Drawer` FR15). The panel is modal for VoiceOver, so
  nothing behind it is reachable. The window moves screen-reader
  focus into the dialog when it opens (`component:Dialog` FR1, AR1;
  `spec:AST-128` FR12). When the dialog closes, focus returns as
  `component:Dialog` FR4 and AR2 state.
- **AR2 — Closing without a gesture.** Android back and the VoiceOver escape
  are the screen-reader paths that close a dialog its `purpose` allows to
  close; the dim is not an accessibility element. A `required` dialog closes
  through its own controls only.
- **AR3 — The header is read in order.** The title is read as a heading at
  level 2, then the subtitle, then the header's controls; the close button is
  a button named by the localized word for close (`module:Dialog/DialogHeader`;
  `spec:AST-112` FR19).

## Design relationships

| Anatomy or state | Design requirement                                                                                                                                                | Representation authority                                                                                                     | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| Window           | the platform's over-full-screen presentation on iOS; Material's dialog on Android                                                                                 | prescribed by the platform                                                                                                   | primary        | FR3, FR5           |
| Panel            | core's centred dialog panel on iOS, in system glass where glass can paint; Material's dialog container on Android (FR4); the theme's panel in place on both (FR7) | prescribed by the theme on iOS, glass by the platform; by the platform on Android (FR4); by the theme in place on both (FR7) | primary        | FR4, FR7           |
| Header           | core's DialogHeader row                                                                                                                                           | prescribed by the theme                                                                                                      | supporting     | FR8                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): on iOS the window, its stacking, its
modal focus and its escape are the platform's, and the panel is drawn (DEC-1);
on Android, Material's dialog. Guideline pages: Modality, Sheets and
Accessibility in the Apple Human Interface Guidelines; Dialogs and
Accessibility in Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.overlay` for the dim,
`color.backgroundSurface`, `radius.container`, `shadow.high`, `space.s4` for
the gutter and the default container inset, the spacing scale for `padding`,
`color.textPrimary` and `color.textSecondary`, the theme's `material` member,
and the theme's motion.

### Native pieces

| Native piece                | Record                        | What this record uses it for                                       |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `AstryxPresentationHost`    | `spec:AST-128` FR5, FR8, FR12 | the over-full-screen window on iOS, stacked with sheets (FR3, AR1) |
| React Native's modal window | `spec:AST-128` FR11           | the window on iOS where the presentation host is absent (FR3)      |
| `AstryxMaterialView`        | `spec:AST-123` FR2, FR7       | the standard panel's glass where glass can paint (FR4)             |

## Family and system relationships

- `component:Dialog` and `module:Dialog/DialogHeader` own the props, the focus
  lifecycle and the header anatomy; this record states only what React Native
  adds or does differently. Core's server-rendering (FR8) and keyboard focus
  region (FR7) claims belong to the web contract; on React Native the window
  is the focus boundary.
- `family:overlay-dismissal` owns how back, the escape and a dim tap rank
  across nested surfaces; FR6 applies its rules to `purpose`, whose `form`
  value means what `component:Drawer` FR15 states for Dialog's prop.
- `spec:AST-128` owns the presentation host, the modal host and the stacking
  order, and asks in its OQ5 whether Android presents dialogs through system
  hosts; `spec:AST-123` owns the overlay paint.

## Verification map

| Contract | Verification                                                                                                          | Representative states                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                  | Audit section                         |
| -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| FR1, FR2 | Type tests of the exports against core's contracts; unit tests of `onDismissed` through the package's testing doubles | each prop; each web-only prop refused; each `padding` step; a close by each path; an unmount while open; `isHidden`                                             | a missing core prop, an accepted web-only prop, `onDismissed` before the window has gone, twice for one close, or on unmount fails                                                                                                                                                                                                                                                               | `audit:react-native/Dialog/api`       |
| FR3, PR1 | Simulator and emulator checks of stacking; unit tests of the window choice                                            | a dialog over a sheet; two dialogs in one update; the host absent; Android; `isHidden` while open                                                               | a dialog under a sheet, a refused presentation, a drawn window where Material's dialog is due, or a window while hidden fails                                                                                                                                                                                                                                                                    | `audit:react-native/Dialog/window`    |
| FR4      | Simulator and emulator captures in light and dark, portrait and landscape; iOS with and without Reduce Transparency   | standard and `fullscreen`; short and tall content; a phone and a tablet; `padding` set and unset; a `fullscreen` panel on a phone with a notch and in landscape | on iOS a panel wider than 400 or than the window less the gutter or taller than three quarters of the window, on Android a container other than Material's dialog, padding other than FR4's, glass with Reduce Transparency on, or a dim under `fullscreen` fails; with `padding` unset, a `fullscreen` title under the status bar, or content padded by both the inset and the safe area, fails | `audit:react-native/Dialog/panel`     |
| FR5      | Simulator and emulator captures of open and close                                                                     | standard; `fullscreen`; Reduce Motion                                                                                                                           | a slide for a standard dialog, a slide under Reduce Motion, or a window that leaves before its motion ends fails                                                                                                                                                                                                                                                                                 | `audit:react-native/Dialog/motion`    |
| FR6      | Unit tests of each path for each purpose; emulator back checks; VoiceOver escape checks                               | `info`; `form`; `required`; a dialog over a dialog                                                                                                              | a path that closes where FR6 says it does not, a dim tap that closes a `form` dialog, or a back press that closes a lower window fails                                                                                                                                                                                                                                                           | `audit:react-native/Dialog/dismissal` |
| FR7      | Unit tests and captures of the inline panel in a scrolling page                                                       | short and overflowing content; a narrow parent; closed; `padding` set and unset; each platform                                                                  | a window, a dim, a panel wider than its parent, or a body that takes a page swipe when it does not overflow fails; a panel without the theme's surface colour, container radius or padding fails                                                                                                                                                                                                 | `audit:react-native/Dialog/inline`    |
| FR8, AR3 | Unit tests of DialogHeader; VoiceOver and TalkBack checks                                                             | a string and an element title; a subtitle; with and without `onOpenChange`; each `endContentEdgeCompensation`                                                   | a title that is not a level-2 heading, a close button without `onOpenChange`, a close button other than the default size, or an unnamed close button fails                                                                                                                                                                                                                                       | `audit:react-native/Dialog/header`    |
| AR1, AR2 | VoiceOver and TalkBack checks on devices                                                                              | open; close by each path; a required dialog; focus moved while open                                                                                             | focus left behind the dialog, focus returned against `component:Dialog` FR4, a `required` dialog read as a plain dialog, or a readable dim fails                                                                                                                                                                                                                                                 | `audit:react-native/Dialog/a11y`      |

## Decision log

### DEC-1 — On iOS, Dialog draws its panel in a platform window

**Reference:** `component:react-native/Dialog/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

A dialog is a centred panel over a dimmed screen. On iPhone, UIKit shows a form
sheet as a page sheet, which is BottomSheet's surface, so on iOS Dialog draws
core's panel and takes everything else from the platform: the window above the
app, its place in the stack of presented surfaces, modal focus for screen
readers, and the escape. The panel takes the system glass where the platform's
own overlays do.

### DEC-2 — The window sizes the panel

**Reference:** `component:react-native/Dialog/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A phone's window decides how wide a dialog can be, and it changes with every
rotation and window size. On iOS, the panel therefore takes the window less
the gutter, up to core's default width and three quarters of the window's
height; on Android, Material's dialog sizes and places the container.
`width`, `maxHeight` and `position` place and size a panel on a web page, so
they stay on the web; `padding` keeps core's spacing steps.

### DEC-3 — `onDismissed` reports that the window has gone

**Reference:** `component:react-native/Dialog/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A surface presented while another window is still leaving can be refused or
appear under it. `onOpenChange(false)` reports the request to close, at the
start of the closing motion; `onDismissed` reports the end, once the window has
left the screen, so an app opens the next surface from it. A browser draws a
dialog in the page and has no such window, so the callback is React Native's.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
