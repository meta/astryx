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
system_specs: [spec:AST-055, spec:AST-082, spec:AST-093, spec:AST-112]
---

# Popover (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Popover` under core's name, with core's `children` (the trigger, as content or as a render function), `content`, `placement`, `alignment`, `isOpen`, `onOpenChange`, `isEnabled`, `padding`, `label`, `isModal`, `hasCloseButton`, `closeButtonLabel`, `hasAutoFocus`, `hasLightDismiss`, `hasEscapeDismiss` and `presentation`. The web contract's props (`anchorRef`, `width`, `role`, `xstyle`) are not offered. Its React Native contract adds `sheetTitle` (DEC-2). |
| Behavior                | The caller's control toggles a dialog surface anchored to it: the system popover on iOS, and on Android a surface drawn in the app's layer, flipped and clamped inside the safe bounds and above the keyboard, its body scrolling when capped. A touch outside closes it and reaches nothing under it; Android back and the VoiceOver escape close it. `presentation` `bottom-sheet`, or `adaptive` on a compact screen, holds the content in a bottom sheet instead, modal per `isModal`.     |
| End-user impact         | A person opens contextual content from a control and closes it with a tap outside, back or the escape gesture. VoiceOver and TalkBack users reach the control with its expanded state, land on the popover's first control and always have a close button; focus that the popover would strand returns to where it was.                                                                                                                                                                        |
| Builder impact          | An app passes its trigger control as on the web; the render-function form hands it the props to spread on that control. A sheet form may show a title with Done. The app root provides the layer the drawn surface uses.                                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Review checks           | Reject a web contract prop offered on React Native, an element of the component's own around the caller's control, an outside touch that closes the popover and also acts on what is under it, a drawn surface hidden behind the keyboard, a container label that names nothing, a popover a screen reader cannot close, focus moved when it was not stranded, a sheet whose modality ignores `isModal`, or a surface that moves under Reduce Motion.                                          |
| Governing rules         | `component:Popover` FR1, FR2, FR4, FR6, FR8, FR9, AR4, DEC-6 and DEC-8; `spec:AST-055` FR1–FR4 and AR2; `spec:AST-116` FR16–FR20; `family:overlay-dismissal`; `spec:AST-082` FR3–FR5, FR7 and FR11; `spec:AST-093` FR2–FR4; DEC-1–DEC-3 below.                                                                                                                                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

Popover on React Native is core's contextual dialog anchored to a trigger.
The trigger is the caller's own control, the surface is the platform's popover
where the platform has one and Astryx's floating surface elsewhere, and it
closes the ways a phone closes a popover: a tap outside, back or the escape
gesture. This record states only what React Native adds to
`component:Popover` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: as core: `isOpen` with `onOpenChange`, or
  uncontrolled; a controlled request goes through `onOpenChange` and `isOpen`
  stays the truth
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: the package takes `children` as content only, inside a wrapper
  that reads touches and, under a screen reader, becomes one button of its own
  around the caller's control; it hands the caller no trigger props, and it
  takes `triggerWidth` (`hug` or `fill`) for that wrapper.
- FR4 gap: on iOS the surface is drawn in place of the system popover.
- FR4 gap: the drawn surface appears at once under a finger, without growing
  from its trigger.
- FR6 gap: focus moves to the surface's name, or with no `label` to the close
  button, instead of the first control in the content; on Android under
  assistive technology a modal popover moves focus in with
  `hasAutoFocus={false}`.
- FR6 gap: on close, focus always returns to the trigger, whether or not it
  was stranded.
- FR8 gap: the sheet is always modal, whatever `isModal` says, and without a
  `label` it is named by `sheetTitle`, else by nothing, instead of by the
  trigger's text.

## Ownership boundary

**Owns**

- Popover's React Native contract and `sheetTitle` (FR1, FR8).
- The trigger's place in React Native's touch and accessibility trees (FR2,
  FR3).
- The surface's place, fit, motion and dismissal on React Native (FR4, FR5).
- The surface's accessibility tree and focus on React Native (FR6, FR7).

**Does not own / non-goals**

- The meaning of Popover's props, its lifecycle and its focus rules — owned by
  `component:Popover`.
- The caller-rendered trigger — owned by `spec:AST-055`; focus return and the
  sheet's modality — owned by `spec:AST-116`.
- Which touches dismiss an overlay — owned by `family:overlay-dismissal`.
- The sheet form's container — owned by `component:react-native/BottomSheet`.
- The trigger control and the content — owned by the product callsite.

## Public concepts

| Concept | Closed values or states               | Meaning                                                                            | Availability by variant/orientation/state | Default  | Owner                            | Stability    | Invalid-value behavior |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | -------- | -------------------------------- | ------------ | ---------------------- |
| surface | system popover; drawn anchored; sheet | from the platform, `presentation` and the screen as it opens, kept until it closes | while open                                | anchored | `component:react-native/Popover` | experimental | none                   |
| host    | layer; in place                       | the drawn surface in the app's layer, flipped and clamped; or in place without one | drawn surface                             | layer    | `component:react-native/Popover` | experimental | none                   |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                                  | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Popover` (`spec:AST-082` FR3) and take core's `children`, `content`, `placement` (default `below`), `alignment` (default `start`), `isOpen`, `onOpenChange`, `isEnabled`, `padding` (default step 3), `label`, `isModal` (default true), `hasCloseButton`, `closeButtonLabel` (core's "Close popover"), `hasAutoFocus`, `hasLightDismiss`, `hasEscapeDismiss` and `presentation` (default `popover`), with core's meaning. The web contract's props (`anchorRef`, `width`, `role`, `xstyle`) are not offered, and using one is a type error. The base props `id` and `isHidden` reach the trigger; `isHidden` also closes the surface.                                                                                                                                                                                                                                                                                                                                                              | `component:Popover`; `spec:AST-082` FR3, FR4, FR7                                      | verify             |
| FR2 | The trigger MUST be the caller's own control (`spec:AST-055` FR1–FR4, AR2). `children` as a function receives one props object, the anchor the surface positions against, the handler that toggles the popover and its expanded state, to spread on that control; a press on the control toggles the popover, `onOpenChange` reports each request, and a controlled popover changes only when `isOpen` does. With `children` as content, the component's box around it anchors the surface and reads the control's presses, and it is never an interactive or accessibility element of its own. With `isEnabled={false}` no request opens it.                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-055` FR1–FR4, AR2; `component:Popover` FR1                                   | verify             |
| FR3 | The caller's control MUST be the one element that opens the popover under a screen reader, with the expanded state from the handed-back props (`spec:AST-055` AR2); the component adds no element around it (OQ1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-055` AR2; `component:Popover` AR1                                            | verify             |
| FR4 | On iOS, the anchored form MUST be the system popover, anchored to the trigger and kept anchored in a compact width (`spec:AST-082` FR11, `spec:AST-093` FR2, DEC-3). On Android it MUST draw in the app's layer: measured against the trigger when it opens, when the trigger's layout changes and when the container it sits in settles, and hidden until measured. `placement` and `alignment` are logical and mirror in right-to-left; `above` and `below` take the preferred side when the content fits, else the other side, else the roomier side with the body capped to the room; the bounds end at the safe area and at the docked keyboard, so the surface is never behind it. A capped body scrolls inside, flashes its scroll indicator, and fades its bottom edge while content remains below. Under a finger the drawn surface grows from its trigger on the theme's motion (`component:Popover` FR9), and under Reduce Motion it appears at once. Without a layer it draws in place against the trigger, with no flip or clamp. | DEC-3; `component:Popover` FR3, FR4, FR9; `spec:AST-059` FR2, FR3; `spec:AST-082` FR11 | verify             |
| FR5 | With `hasLightDismiss`, a new touch outside the trigger and the surface MUST close the popover, and that touch reaches nothing under it; a tap on the trigger closes it too. With `hasEscapeDismiss`, Android's back and the VoiceOver escape close it: a modal popover takes them as the topmost layer, and a non-modal popover takes them only while focus is inside it or on its trigger, else they pass to the screen beneath (`spec:AST-116` FR15). The touch that opens the popover never counts as the first outside touch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:overlay-dismissal`; `component:Popover` FR1; `spec:AST-116` FR15               | verify             |
| FR6 | The open surface MUST be a dialog element, modal to VoiceOver when `isModal` is true. Its first element is its name, a visually hidden text with `label` (DEC-1); then, with `hasCloseButton`, the close button named by `closeButtonLabel`, always in the accessibility tree and drawn only while a screen reader runs; then the content. With `hasAutoFocus`, once the surface is placed, focus enters the first control in the content, else the named surface; the close button is never the entry (`component:Popover` FR2). With `hasAutoFocus={false}`, focus stays where it is. When the popover closes, focus moves only if focus entered the surface while it was open and is now stranded inside the closing surface or on nothing: first to the element focused when the popover opened, then along `spec:AST-116` FR20's chain (`spec:AST-116` FR17–FR20, `component:Popover` AR4).                                                                                                                                               | DEC-1; `component:Popover` FR2, AR1, AR4; `spec:AST-116` FR17–FR20                     | verify             |
| FR7 | On Android under assistive technology, the close button MUST be a button element at least 48 dp square in the surface's flow, closed by its activate action (`spec:AST-082` FR11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-082` FR11                                                                    | verify             |
| FR8 | `presentation="bottom-sheet"`, and `adaptive` on a compact screen (narrower than the theme's `md` width or shorter than 500 dp), MUST hold the content in a bottom sheet (`component:react-native/BottomSheet`), chosen as it opens and kept until it closes (`component:Popover` DEC-6). With `isModal` the sheet is modal and always light-dismisses; with `isModal={false}` it is a non-modal sheet: no scrim, the screen behind stays usable, a tap on the screen does not close it, and it closes by a swipe down and by back or the VoiceOver escape under FR5's focus rule (`spec:AST-116` FR15, FR16; `component:Popover` DEC-8). It is named by `label`, else by the trigger's text. The React Native contract adds `sheetTitle`: a header row with the title and a Done button (the catalog's "Done" message) that closes the sheet (DEC-2).                                                                                                                                                                                         | `component:Popover` DEC-6, DEC-8; `spec:AST-116` FR16; DEC-2                           | verify             |

### Allowed variation

- **AV1 — The system popover.** On iOS its arrow, placement, sizing and
  motion are the system's and may change with each OS release.
- **AV2 — Fit.** Where the drawn surface flips, how far it is clamped and the
  cap's height follow the screen, the keyboard and the text size.
- **AV3 — The sheet's container.** The sheet form's grabber, detents and
  motion are the bottom sheet's.

### Representative states

| State                                  | Required invariant                                                          | Allowed variation  |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------ |
| press on the caller's control          | opens; the control keeps its own press, focus ring and role                 | none               |
| iOS, any width                         | the system popover anchored to the trigger                                  | the system's look  |
| Android, open, touch outside           | closes; the touch reaches nothing under it                                  | none               |
| Android, open near the screen's bottom | opens above, or capped on the roomier side with a scrolling body            | the cap            |
| open with the keyboard up              | the surface stays above the keyboard                                        | the cap            |
| screen reader on                       | the caller's control has the expanded state; focus enters the first control | none               |
| closed with focus already outside      | focus stays where it is                                                     | none               |
| `presentation="adaptive"` on a phone   | the content in a bottom sheet, modal per `isModal`                          | the sheet's motion |

### Transformation and precedence order

- **ORD1 — Open state.** A controlled `isOpen` decides; otherwise a press on
  the trigger toggles the popover's own state; `isHidden` closes either.
- **ORD2 — Surface.** `presentation` and the screen as the popover opens, then
  the platform; the choice holds until it closes.
- **ORD3 — Vertical fit.** The preferred side when the content fits, then the
  other side, then the roomier side, capped.
- **ORD4 — Focus return.** Only stranded focus moves: the element focused when
  the popover opened, then `spec:AST-116` FR20's chain.

### Performance and resources

- **PR1 — Listen only while open.** The outside-touch listener, the back
  handler and the trigger measurement run only while the drawn surface is
  open.

## Accessibility contract

- **AR1 — The trigger.** The caller's control is the one element that opens
  the popover, with the expanded state (FR2, FR3).
- **AR2 — Name first.** The surface's name is its first element, so a screen
  reader reading the surface reads its name before its content (FR6, DEC-1).
- **AR3 — A dismiss everyone can reach.** The close button is always in the
  accessibility tree; Android back and the VoiceOver escape close the popover
  (FR5, FR6, FR7).
- **AR4 — Focus.** Focus enters as FR6 states, and on close only stranded
  focus moves (FR6, ORD4).
- **AR5 — Reduced motion.** The drawn surface appears at once under Reduce
  Motion (FR4).

## Design relationships

| Anatomy or state | Design requirement                                   | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| System popover   | the platform's popover anchored to the trigger (iOS) | prescribed by the platform | prominent      | FR4                |
| Drawn surface    | an opaque raised surface anchored to the trigger     | theme intent               | prominent      | FR4, FR6           |
| Close button     | a small close control, shown under a screen reader   | theme intent               | supporting     | FR6, FR7           |
| Touch sheet      | the same content in a bottom sheet                   | `component:BottomSheet`    | prominent      | FR8                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): on iOS, the system popover (FR4,
DEC-3). On Android the candidates are `PopupWindow` and Compose's `Popup`
(DEC-3); neither fits, so Android draws the surface in the app's layer. The sheet form is the library's bottom
sheet. Guideline pages: Popovers and Accessibility (VoiceOver, Reduce Motion)
in the Apple Human Interface Guidelines (`spec:AST-093` FR3); on Android, this
record follows Material 3's Menus and Bottom sheets pages.

Theme values read (`spec:AST-093` FR4): the drawn surface's colour, radius and
shadow; the spacing scale for `padding`; the theme's `md` width point; and the
motion durations and easing for the surface's growth.

### Native pieces

| Native piece               | Record             | What this record uses it for                                         |
| -------------------------- | ------------------ | -------------------------------------------------------------------- |
| `AstryxPresentationHost`   | `spec:AST-128` FR5 | the sheet form's presentation, and the iOS system popover (FR4, FR8) |
| React Native `BackHandler` | React Native core  | Android's back closing the popover (FR5)                             |

## Family and system relationships

- `component:Popover` owns the props, the lifecycle and the focus rules; this
  record states how React Native shows and dismisses the popover.
- `spec:AST-055` owns the caller-rendered trigger, and `spec:AST-116` owns
  focus return and the sheet's modality.
- `family:overlay-dismissal` owns which touches dismiss an overlay.
- `component:react-native/BottomSheet` owns the sheet form.

## Verification map

| Contract                | Verification                                                                                                                     | Representative states                                                                                      | Mutation or failure expectation                                                                                                         | Audit section                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1                     | Type tests; a contract drift test against core's Popover contract                                                                | each core prop and default; each web contract prop                                                         | an offered web prop, a renamed core prop or a changed default fails                                                                     | `audit:react-native/Popover/api`      |
| FR2, FR3, ORD1, AR1     | Unit tests through the package's testing doubles (`spec:AST-112` FR15); VoiceOver and TalkBack checks                            | render-function children; content children; controlled; `isEnabled={false}`                                | an element of the component's own around the control, a missing expanded state, or a controlled popover that opens on its own fails     | `audit:react-native/Popover/trigger`  |
| FR4, ORD2, ORD3         | Simulator checks of the system popover; unit tests of the drawn fit; emulator captures with the keyboard up and in right-to-left | iOS compact and regular widths; Android near each edge; tall content; keyboard up; no layer; Reduce Motion | a drawn surface on iOS, a surface outside the bounds or behind the keyboard, or motion under Reduce Motion fails                        | `audit:react-native/Popover/layout`   |
| FR5                     | Unit tests of the outside touch, back and escape                                                                                 | outside touch; the opening touch; `hasLightDismiss={false}`; back; escape                                  | an outside touch that also acts below, or a dismissal that ignores its flag, fails                                                      | `audit:react-native/Popover/dismiss`  |
| FR6, FR7, ORD4, AR2–AR4 | VoiceOver and TalkBack checks; unit tests of the tree, focus entry and focus return                                              | with and without `label`; `hasAutoFocus` on and off; focus moved out before close; close                   | a container label, focus on the name or the close button at entry, focus moved when not stranded, or an Android close under 48 dp fails | `audit:react-native/Popover/a11y`     |
| FR8                     | Unit tests of the sheet form                                                                                                     | `bottom-sheet`; `adaptive` on a phone and a tablet; `isModal` false; `sheetTitle`                          | the wrong surface for the screen, a modal sheet under `isModal={false}`, a nameless sheet, or a Done that leaves it open fails          | `audit:react-native/Popover/sheet`    |
| PR1                     | Unit tests of listeners while closed                                                                                             | closed; open; closed again                                                                                 | a listener or a measurement while closed fails                                                                                          | `audit:react-native/Popover/behavior` |

## Decision log

### DEC-1 — The name is the surface's first element

**Reference:** `component:react-native/Popover/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

In React Native a label on a container names nothing that VoiceOver or TalkBack
reads. The popover's name is therefore a visually hidden text at the start of
the surface, which screen readers read first, as they read a dialog's title.

### DEC-2 — A sheet may carry a title

**Reference:** `component:react-native/Popover/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

In the sheet form a visible title and a Done button give the content a header,
as the platforms' compact popover sheets do.

### DEC-3 — iOS uses the system popover; Android draws

**Reference:** `component:react-native/Popover/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

iOS has a system popover, which stays anchored to its trigger in every width
when it is asked to, so the anchored form uses it on iPhone and iPad alike.
On Android the anchored windows are `PopupWindow` and Compose's `Popup`. They
place content in a window of their own beside an anchor, with outside-touch
dismissal, but bring no surface or placement rule of Material's (Material 3
has no popover pattern for arbitrary content), do not keep the content above
the docked keyboard, and take it out of the app's layer, where the overlay
dismissal of FR5 runs. Android therefore draws the surface in the app's layer,
where it keeps its trigger, stays above the keyboard and dismisses as every
other overlay does.

## Open questions

- **OQ1 — How does a screen reader open a popover whose trigger is content
  children, with no element of the component's own around the control?**
  (`human-api`) A screen reader's activation of the wrapped control sends no
  touch the component's box can read.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
