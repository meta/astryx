---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Popover
platform_of: component:Popover
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, layout, motion, accessibility, platform]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Popover (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Popover` under core's name, with core's `children` (the trigger), `content`, `placement`, `alignment`, `isOpen`, `onOpenChange`, `isEnabled`, `padding`, `label`, `isModal`, `hasCloseButton`, `closeButtonLabel`, `hasAutoFocus`, `hasLightDismiss`, `hasEscapeDismiss` and `presentation`. The web contract's props (`anchorRef`, `width`, `role`, `xstyle`) are not offered. Its React Native contract adds `triggerWidth` (`hug` or `fill`) and `sheetTitle` (DEC-3). |
| Behavior                | A still tap on the trigger toggles a dialog surface anchored to it, drawn in the app's layer, flipped and clamped inside the safe bounds and above the keyboard, its body scrolling when capped. A touch outside closes it and reaches nothing under it; Android back and the VoiceOver escape close it. `presentation` `bottom-sheet`, or `adaptive` on a compact screen, holds the content in a modal bottom sheet instead.                                                                   |
| End-user impact         | A person opens contextual content with a tap and closes it with a tap outside, back or the escape gesture. VoiceOver and TalkBack users reach the trigger as one expandable button, land on the popover's name and always have a close button.                                                                                                                                                                                                                                                  |
| Builder impact          | An app wraps its trigger in `Popover` as on the web; a row or card trigger sets `triggerWidth="fill"`, and a sheet form may show a title with Done. The app root provides the layer the surface draws in.                                                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review checks           | Reject a web contract prop offered on React Native, a trigger tap that also blocks the child's own press, a moving touch that toggles, an outside touch that closes the popover and also acts on what is under it, a surface hidden behind the keyboard, a container label that names nothing, a popover a screen reader cannot close, focus that does not return to the trigger, or a surface that moves under Reduce Motion.                                                                  |
| Governing rules         | `component:Popover` FR1, FR2, FR4, FR6, FR8, FR9 and DEC-6; `family:overlay-dismissal`; `spec:AST-082` FR3–FR5, FR7 and FR11; `spec:AST-093` FR2–FR4; `spec:AST-128` FR5 and FR12; DEC-1–DEC-3 below.                                                                                                                                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

Popover on React Native is core's contextual dialog anchored to a trigger. Its
trigger answers a tap without taking the child control's own press, its surface
floats in the app's layer above the screen, and it closes the ways a phone
closes a popover: a tap outside, back or the escape gesture. This record states
only what React Native adds to `component:Popover` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: as core: `isOpen` with `onOpenChange`, or
  uncontrolled; a controlled tap asks through `onOpenChange` and `isOpen`
  stays the truth
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR4 gap: the anchored surface appears at once under a finger, without
  growing from its trigger.
- FR6 gap: with no `label`, focus lands on the close button instead of the
  first element of the content.
- FR4 gap: on iPad the surface is drawn in place of the system popover
  (`spec:AST-128` FR5).

## Ownership boundary

**Owns**

- Popover's React Native contract, `triggerWidth` and `sheetTitle` (FR1,
  FR8).
- The trigger's touch and screen-reader behavior (FR2, FR3).
- The anchored surface's place, fit, motion and dismissal on React Native
  (FR4, FR5).
- The surface's accessibility tree and focus (FR6, FR7).

**Does not own / non-goals**

- The meaning of Popover's props, its lifecycle and its focus rules — owned by
  `component:Popover`.
- Which touches dismiss an overlay and in what order — owned by
  `family:overlay-dismissal`.
- The sheet form's container — owned by `component:react-native/BottomSheet`.
- The presentation host, the modal host and the system popover — owned by
  `spec:AST-128`.
- The trigger control and the content — owned by the product callsite.

## Public concepts

| Concept       | Closed values or states | Meaning                                                                | Availability by variant/orientation/state | Default  | Owner                            | Stability    | Invalid-value behavior          |
| ------------- | ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | -------- | -------------------------------- | ------------ | ------------------------------- |
| surface       | anchored; sheet         | from `presentation` and the screen as it opens, kept until it closes   | while open                                | anchored | `component:Popover`              | experimental | none                            |
| trigger width | `hug`; `fill`           | the trigger keeps its own width, or stretches across its parent (FR8)  | always                                    | `hug`    | `component:react-native/Popover` | experimental | any other value is a type error |
| host          | layer; in place         | in the app's layer, flipped and clamped; or in place without one (FR4) | anchored surface                          | layer    | `component:react-native/Popover` | experimental | none                            |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                      | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Popover` (`spec:AST-082` FR3) and take core's `children`, `content`, `placement` (default `below`), `alignment` (default `start`), `isOpen`, `onOpenChange`, `isEnabled`, `padding` (default step 3), `label`, `isModal` (default true), `hasCloseButton`, `closeButtonLabel` (core's "Close popover"), `hasAutoFocus`, `hasLightDismiss`, `hasEscapeDismiss` and `presentation` (default `popover`), with core's meaning. The web contract's props (`anchorRef`, `width`, `role`, `xstyle`) are not offered, and using one is a type error. The base props `id` and `isHidden` reach the trigger; `isHidden` also closes the surface.                                                                                                                                                                                          | `component:Popover`; `spec:AST-082` FR3, FR4, FR7          | verify             |
| FR2 | The trigger MUST be a wrapper around `children` that toggles the popover on a still, short touch and leaves the child control's own press to it: a touch that travels past the tooltip's touch slop, or a second finger, toggles nothing. `onOpenChange` reports each request, and a controlled popover changes only when `isOpen` does. With `isEnabled={false}` the trigger takes no touches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | DEC-1; `component:Popover` FR1                             | verify             |
| FR3 | While a screen reader runs, the trigger wrapper MUST be one button element named by the child's `label`, else Popover's `label`, with the expanded state and an activate action that toggles, since a screen reader's activation of the child sends no touch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DEC-1; `component:Popover` AR1                             | verify             |
| FR4 | The anchored surface MUST draw in the app's layer: measured against the trigger when it opens, when the trigger's layout changes and when the container it sits in settles, and hidden until measured. `placement` and `alignment` are logical and mirror in right-to-left; `above` and `below` take the preferred side when the content fits, else the other side, else the roomier side with the body capped to the room; the bounds end at the safe area and at the docked keyboard, so the surface is never behind it. A capped body scrolls inside, flashes its scroll indicator, and fades its bottom edge while content remains below. Under a finger the surface grows from its trigger on the theme's motion (`component:Popover` FR9), and under Reduce Motion it appears at once. Without a layer it draws in place against the trigger, with no flip or clamp. | `component:Popover` FR3, FR4, FR9; `spec:AST-059` FR2, FR3 | verify             |
| FR5 | With `hasLightDismiss`, a new touch outside the trigger and the surface MUST close the popover, and that touch reaches nothing under it; a tap on the trigger closes it too. With `hasEscapeDismiss`, Android's back and the VoiceOver escape gesture close it. The touch that opens the popover never counts as the first outside touch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `family:overlay-dismissal`; `component:Popover` FR1        | verify             |
| FR6 | The open surface MUST be a dialog element, modal to VoiceOver when `isModal` is true. Its first element is its name, a visually hidden text with `label` (DEC-2); then, with `hasCloseButton`, the close button named by `closeButtonLabel`, always in the accessibility tree and drawn only while a screen reader runs; then the content. With `hasAutoFocus`, once the surface is placed, screen-reader focus moves to the name, else to the first element of the content. On Android, a modal popover moves focus in under assistive technology even with `hasAutoFocus={false}`, since Android has no modal flag for a view. On close, focus returns to the trigger.                                                                                                                                                                                                   | DEC-2; `component:Popover` FR2, AR1; `spec:AST-128` FR12   | verify             |
| FR7 | On Android under assistive technology, the close button MUST be a button element at least 48 dp square in the surface's flow, closed by its activate action (`spec:AST-082` FR11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-082` FR11                                        | verify             |
| FR8 | `presentation="bottom-sheet"`, and `adaptive` on a compact screen (narrower than the theme's `md` width or shorter than 500 dp), MUST hold the content in a modal bottom sheet (`component:react-native/BottomSheet`), chosen as it opens and kept until it closes (`component:Popover` DEC-6). The sheet always light-dismisses, Escape follows `hasEscapeDismiss`, and it is named by `label`. The React Native contract adds `sheetTitle`: a header row with the title and a Done button that closes the sheet. It also adds `triggerWidth`: `hug` keeps the trigger's own width, as a button's; `fill` stretches it across its parent, as the web's block anchor (DEC-3).                                                                                                                                                                                              | `component:Popover` DEC-6; DEC-3                           | verify             |

### Allowed variation

- **AV1 — Fit.** Where the surface flips, how far it is clamped and the cap's
  height follow the screen, the keyboard and the text size.
- **AV2 — The sheet's container.** The sheet form's grabber, detents and
  motion are the bottom sheet's.

### Representative states

| State                                | Required invariant                                                         | Allowed variation  |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------ |
| tap on the trigger                   | opens; the child keeps its own press                                       | none               |
| moving touch on the trigger          | nothing toggles                                                            | none               |
| open, touch outside                  | closes; the touch reaches nothing under it                                 | none               |
| open near the screen's bottom        | opens above, or capped on the roomier side with a scrolling body           | the cap            |
| open with the keyboard up            | the surface stays above the keyboard                                       | the cap            |
| screen reader on                     | trigger is one expandable button; focus lands on the name; the close shows | none               |
| Android back while open              | closes; focus returns to the trigger                                       | none               |
| `presentation="adaptive"` on a phone | the content in a bottom sheet                                              | the sheet's motion |
| no layer                             | drawn in place against the trigger                                         | none               |

### Transformation and precedence order

- **ORD1 — Open state.** A controlled `isOpen` decides; otherwise the trigger's
  tap toggles the popover's own state; `isHidden` closes either.
- **ORD2 — Surface.** `presentation` and the screen as the popover opens; the
  choice holds until it closes.
- **ORD3 — Vertical fit.** The preferred side when the content fits, then the
  other side, then the roomier side, capped.

### Performance and resources

- **PR1 — Listen only while open.** The outside-touch listener, the back
  handler and the trigger measurement run only while the anchored surface is
  open.

## Accessibility contract

- **AR1 — Trigger.** Under a screen reader the trigger is one button with the
  expanded state; activating it toggles the popover (FR3).
- **AR2 — Name first.** The surface's name is its first element, so VoiceOver
  and TalkBack read it on entry (FR6, DEC-2).
- **AR3 — A dismiss everyone can reach.** The close button is always in the
  accessibility tree; Android back and the VoiceOver escape close the popover
  (FR5, FR6, FR7).
- **AR4 — Focus.** Focus moves in on open as FR6 states and returns to the
  trigger on close.
- **AR5 — Reduced motion.** The surface appears at once under Reduce Motion
  (FR4).

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Popover surface  | an opaque raised surface anchored to the trigger   | theme intent             | prominent      | FR4, FR6           |
| Close button     | a small close control, shown under a screen reader | theme intent             | supporting     | FR6, FR7           |
| Touch sheet      | the same content in a bottom sheet                 | `component:BottomSheet`  | prominent      | FR8                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): none fits the anchored form on phones.
React Native exposes no popover view, and Android has no anchored popover
control; a React Native `Modal` would take the whole screen and its touches.
The surface floats in the app's layer, and the sheet form is the library's
bottom sheet. Guideline pages: Popovers and Accessibility (VoiceOver, Reduce
Motion) in the Apple Human Interface Guidelines; Menus and Bottom sheets in
Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the popover surface's colour, radius
and shadow; the spacing scale for `padding`; the theme's `md` width point;
and the motion durations and easing for the surface's growth.

### Native pieces

| Native piece               | Record             | What this record uses it for             |
| -------------------------- | ------------------ | ---------------------------------------- |
| `AstryxPresentationHost`   | `spec:AST-128` FR5 | the sheet form's presentation (FR8)      |
| React Native `BackHandler` | React Native core  | Android's back closing the popover (FR5) |

## Family and system relationships

- `component:Popover` owns the props, the lifecycle and the focus rules; this
  record states how React Native draws and dismisses the popover.
- `family:overlay-dismissal` owns which touches dismiss an overlay.
- `component:react-native/BottomSheet` owns the sheet form; `spec:AST-128` owns
  the presentation host it presents through.

## Verification map

| Contract          | Verification                                                                                     | Representative states                                                     | Mutation or failure expectation                                                                                            | Audit section                         |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1               | Type tests; a contract drift test against core's Popover contract                                | each core prop and default; each web contract prop                        | an offered web prop, a renamed core prop or a changed default fails                                                        | `audit:react-native/Popover/api`      |
| FR2, ORD1         | Unit tests through the package's testing doubles (`spec:AST-112` FR15)                           | still tap; moving touch; two fingers; controlled; `isEnabled={false}`     | a moving touch that toggles, a lost child press, or a controlled popover that opens on its own fails                       | `audit:react-native/Popover/trigger`  |
| FR3, AR1          | VoiceOver and TalkBack checks; unit tests of the trigger element                                 | screen reader on; child with and without `label`                          | a trigger that is not one button, a missing expanded state, or an activate action that does nothing fails                  | `audit:react-native/Popover/a11y`     |
| FR4, ORD3         | Unit tests of the fit; Simulator and emulator captures with the keyboard up and in right-to-left | near each edge; tall content; keyboard up; no layer; Reduce Motion        | a surface outside the bounds or behind the keyboard, an overflow that does not scroll, or motion under Reduce Motion fails | `audit:react-native/Popover/layout`   |
| FR5               | Unit tests of the outside touch, back and escape                                                 | outside touch; the opening touch; `hasLightDismiss={false}`; back; escape | an outside touch that also acts below, or a dismissal that ignores its flag, fails                                         | `audit:react-native/Popover/dismiss`  |
| FR6, FR7, AR2–AR4 | VoiceOver and TalkBack checks; unit tests of the tree and focus                                  | with and without `label`; `hasAutoFocus` on and off; Android modal; close | a container label, an unreachable close, focus that does not move in or return, or an Android close under 48 dp fails      | `audit:react-native/Popover/a11y`     |
| FR8, ORD2         | Unit tests of the sheet form                                                                     | `bottom-sheet`; `adaptive` on a phone and a tablet; `sheetTitle`; `fill`  | the wrong surface for the screen, a surface that switches while open, or a Done that leaves it open fails                  | `audit:react-native/Popover/sheet`    |
| PR1               | Unit tests of listeners while closed                                                             | closed; open; closed again                                                | a listener or a measurement while closed fails                                                                             | `audit:react-native/Popover/behavior` |

## Decision log

### DEC-1 — The trigger is a wrapper that listens to touches

**Reference:** `component:react-native/Popover/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native has no element reference that points at the child's control, so
the trigger is a wrapper around `children`. It reads raw touches, so the child
keeps its own press; and since a screen reader's activation of the child sends
no touch, under a screen reader the wrapper itself is the expandable button.

### DEC-2 — The name is the surface's first element

**Reference:** `component:react-native/Popover/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

In React Native a label on a container names nothing that VoiceOver or TalkBack
reads. The popover's name is therefore a visually hidden text at the start of
the surface, which screen readers read first, as they read a dialog's title.

### DEC-3 — The trigger hugs, and a sheet may carry a title

**Reference:** `component:react-native/Popover/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

On the web the anchor is a block element that takes its parent's width; on
React Native the wrapper hugs its child, as a button does, and `fill`
stretches it for a row or a card that opens a popover. In the sheet form a
visible title and a Done button give the content a header, as the platforms'
compact popover sheets do.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
