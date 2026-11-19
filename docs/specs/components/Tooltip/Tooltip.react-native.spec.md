---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Tooltip
platform_of: component:Tooltip
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, layout, accessibility, platform]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Tooltip (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Tooltip` under core's name, with core's `children`, `content`, `placement` (`above`), `alignment` (`center`), `delay` (200), `hideDelay` (0), `focusTrigger` (`auto`), `touchTrigger` (`auto`), `isEnabled`, `isOpen`, `isDefaultOpen` and `onOpenChange`. The web contract's `anchorRef` and `hasHoverIndication`, and the `useTooltip` hook, are not offered (DEC-3).                                                                    |
| Behavior                | A short hint drawn on the theme's inverted surface beside its trigger, in the app's layer. A mouse or pen pointer shows it after `delay`, keyboard focus at once; it stays open while the pointer is over it, and leaving hides it after `hideDelay`. A tap opens it as `touchTrigger` says. Its words reach screen readers as the trigger's accessibility hint, never as a second element. A touch outside closes an open tooltip and reaches nothing under it. |
| End-user impact         | Pointer and keyboard users see the hint as on the web. Touch users keep the trigger's own tap and hold; a trigger with no action of its own shows the hint on a tap. VoiceOver and TalkBack read the hint right after the trigger's name.                                                                                                                                                                                                                        |
| Builder impact          | An app wraps a control or a view in `Tooltip` as on the web; Button, IconButton and ToggleButton inside take its words as their hint.                                                                                                                                                                                                                                                                                                                            |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                   |
| Review checks           | Reject a web contract prop offered on React Native, a hold that opens the tooltip, a tap that opens it on a trigger with an action of its own under `auto`, the words read twice or as a separate element, a surface that takes touches, an outside touch that closes the tooltip and also acts on what is under it, or a hover-opened tooltip that takes the hover from its trigger.                                                                            |
| Governing rules         | `component:Tooltip` FR1, FR3–FR8 and DEC-1; `family:overlay-dismissal`; `spec:AST-082` FR3–FR5, FR7 and FR11; `spec:AST-093` FR2–FR4; DEC-1–DEC-3 below.                                                                                                                                                                                                                                                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

Tooltip on React Native is core's short hint anchored to a trigger. Neither
platform exposes a tooltip view to React Native, so Astryx draws it, and on a
touch screen, where there is no hover, it reaches people as the trigger's
accessibility hint and, where the trigger has no tap of its own, on a tap. This
record states only what React Native adds to `component:Tooltip` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: as core: `isOpen` with `onOpenChange`, or
  uncontrolled with `isDefaultOpen`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR4 gap: under `touchTrigger="auto"`, a tap opens nothing, even on a trigger
  with no action of its own or on a disabled control; only `tap` opens it on
  touch.
- FR6 gap: Android's back and the VoiceOver escape gesture do not close an
  open tooltip.
- FR3 gap: a hover-opened tooltip hides as the pointer leaves the trigger, with
  no bridge onto the surface, and the surface does not keep it open; keyboard
  focus waits for `delay`.
- FR5 gap: the surface is painted `color.textPrimary`, not
  `color.backgroundInverted`.
- FR6 gap: a controlled tooltip shown by `isOpen` closes on a touch outside
  instead of asking through `onOpenChange(false)`.

## Ownership boundary

**Owns**

- Tooltip's React Native contract (FR1).
- How its words reach screen readers on React Native (FR2).
- Its triggers on React Native: pointer, focus and touch (FR3, FR4).
- The surface's place and paint, and its dismissal on React Native (FR5,
  FR6).

**Does not own / non-goals**

- The meaning of Tooltip's props and `touchTrigger` — owned by
  `component:Tooltip`.
- A control's own `tooltip` prop — owned by each control's record.
- Which touches dismiss an overlay — owned by `family:overlay-dismissal`.

## Public concepts

| Concept       | Closed values or states    | Meaning                                                                                        | Availability by variant/orientation/state | Default | Owner                            | Stability    | Invalid-value behavior |
| ------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | -------------------------------- | ------------ | ---------------------- |
| words channel | hint; hidden copy          | a press control inside takes the words as its hint; else a hidden copy after the trigger (FR2) | text `content`                            | hint    | `component:react-native/Tooltip` | experimental | none                   |
| opened by     | pointer; focus; tap; state | what opened the tooltip, which decides whether it holds the dismiss shield (FR6)               | while open                                | none    | `component:react-native/Tooltip` | experimental | none                   |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                           | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Tooltip` (`spec:AST-082` FR3) and take core's `children`, `content`, `placement` (default `above`), `alignment` (default `center`), `delay` (default 200 ms), `hideDelay` (default 0 ms), `focusTrigger` (default `auto`), `touchTrigger` (default `auto`), `isEnabled`, `isOpen`, `isDefaultOpen` and `onOpenChange`, with core's meaning. `anchorRef` and `hasHoverIndication` are not offered, and using one is a type error (DEC-3). The base props `id` and `isHidden` reach the trigger wrapper; `isHidden` also hides the surface. Empty `content` shows no surface.                                                                                                                                                            | `component:Tooltip`; `spec:AST-082` FR3, FR4, FR7; DEC-3        | verify             |
| FR2 | The words MUST reach screen readers once, after the trigger's name (DEC-1): text `content` is offered to the press controls inside (Button, IconButton, ToggleButton), which take it as their accessibility hint unless their own `tooltip` gives one, and never when it repeats the control's name; while no control takes it, or `content` is not text, a visually hidden copy sits at the trigger's bottom end corner, so a screen reader reads it right after the trigger. The surface is hidden from screen readers, and opening it announces nothing.                                                                                                                                                                                                                       | DEC-1; `component:Tooltip` FR2, AR1                             | verify             |
| FR3 | A mouse or pen pointer entering the trigger MUST show the tooltip after `delay` and leaving MUST hide it after `hideDelay`; leaving before `delay` shows nothing. With `hideDelay` 0 a short bridge lets the pointer move from the trigger onto the surface, and the surface stays open while the pointer is over it, so the hint is hoverable (`component:Tooltip` FR3, AR2). Keyboard focus shows it at once per `focusTrigger`, as core does; `delay` is the hover delay. Blur hides it after `hideDelay`. A touch pointer's hover is ignored.                                                                                                                                                                                                                                 | `component:Tooltip` FR3, FR4, AR2                               | verify             |
| FR4 | On touch, a hold MUST open nothing, so the trigger keeps its own hold, and a tap MUST open the tooltip as `touchTrigger` says (`spec:AST-082` FR3): `auto` opens it unless the trigger performs an action of its own, and a disabled control performs none, so a tap shows its reason; `tap` toggles it on a still tap whatever the trigger is; `none` never opens it on touch. A touch that travels past the platform's touch slop is a scroll and opens nothing.                                                                                                                                                                                                                                                                                                                | `component:Tooltip` FR5, DEC-1; `spec:AST-082` FR3              | verify             |
| FR5 | The surface MUST be drawn in the app's layer, measured against the trigger when it opens and hidden until measured; `placement` and `alignment` are logical and mirror in right-to-left; it flips to the opposite side when it does not fit and is then clamped inside the safe bounds, and keeps the asked side when neither fits. It is at most six times `space.s12` wide, on the theme's inverted surface, `color.backgroundInverted`, with the body type in `color.backgroundSurface`, `radius.container`, `space.s2` by `space.s1` padding and no shadow, as core's surface is. It takes no touches; a pointer over it keeps it open (FR3). A trigger scrolled outside the layer draws nothing until it scrolls back. Without a layer it draws in place beside the trigger. | `component:Tooltip` FR1; `spec:AST-093` FR4                     | verify             |
| FR6 | A tooltip opened by focus, a tap or `isDefaultOpen` MUST close on a touch outside, and that touch reaches nothing under it (`family:overlay-dismissal`). A controlled tooltip shown by `isOpen` answers that touch by calling `onOpenChange(false)` and stays as `isOpen` says (`component:Tooltip` FR7); a parent that keeps `isOpen` true after that touch leaves the page usable. A tooltip a pointer's hover opened holds no such shield, so the trigger keeps the hover; any touch still closes it and reaches what it lands on. Android's back and the VoiceOver escape gesture close an open tooltip, and a controlled one calls `onOpenChange(false)` instead (`component:Tooltip` FR6, FR7). Unmounting the trigger closes its tooltip.                                  | DEC-2; `family:overlay-dismissal`; `component:Tooltip` FR6, FR7 | verify             |
| FR7 | `isOpen` MUST decide the tooltip when set, the triggers only asking through `onOpenChange`; `isDefaultOpen` shows it on mount and it stays dismissible; `isEnabled={false}` removes the triggers and the hidden copy, while a controlled `isOpen` still shows it (`component:Tooltip` FR7, FR8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Tooltip` FR7, FR8                                    | verify             |

### Allowed variation

- **AV1 — Fit.** Where the surface flips and how far it is clamped follow the
  screen and the text size.

### Representative states

| State                            | Required invariant                                      | Allowed variation |
| -------------------------------- | ------------------------------------------------------- | ----------------- |
| mouse over the trigger           | shows after `delay`; the trigger keeps the hover        | none              |
| mouse moves onto the surface     | stays open while the pointer is over it                 | none              |
| keyboard focus                   | shows at once unless `focusTrigger="never"`             | none              |
| tap on a Button inside, `auto`   | the button acts; no tooltip; its hint carries the words | none              |
| tap on a plain view, `auto`      | the tooltip opens                                       | the fit           |
| hold on the trigger              | nothing opens                                           | none              |
| open by a tap, touch outside     | closes; the touch reaches nothing under it              | none              |
| screen reader on a Button inside | one element: the name, then the words as its hint       | none              |
| `content` that is not text       | a hidden copy after the trigger                         | none              |

### Transformation and precedence order

- **ORD1 — Open state.** A controlled `isOpen` decides; otherwise pointer,
  focus and the tap `touchTrigger` allows show it, and their leave, blur, a
  touch outside, back or escape hide it.
- **ORD2 — Words.** A press control's own `tooltip`, then the wrapping
  Tooltip's text, as the hint; then the hidden copy.

### Performance and resources

- **PR1 — Nothing while closed.** A closed tooltip holds no shield and no
  timer beyond a pending `delay`; with `touchTrigger` `auto` or `none` the
  wrapper takes no touch handlers where no tap can open it.

## Accessibility contract

- **AR1 — Read once, after the name.** The words are the trigger's hint or a
  hidden copy right after it, never both and never a separate surface element
  (FR2).
- **AR2 — The trigger keeps its gestures.** A hold never opens the tooltip,
  and a tap on a trigger with an action of its own stays that action's (FR4).
- **AR3 — Dismiss.** Back and the VoiceOver escape close an open tooltip
  (FR6).
- **AR4 — No announcement.** Opening the tooltip announces nothing; screen
  readers already have the words (FR2).

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Tooltip surface  | the inverted surface with body words, no arrow or shadow | theme intent             | supporting     | FR5                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): none fits. iOS and Android expose no
tooltip view to React Native, and Android's view tooltip text is not bridged,
so Astryx draws the surface with the theme. Guideline pages: Offering help and
Accessibility (VoiceOver) in the Apple Human Interface Guidelines
(`spec:AST-093` FR3); on Android, this record follows Material 3's Tooltips
page.

Theme values read (`spec:AST-093` FR4): `color.backgroundInverted`,
`color.backgroundSurface`, `radius.container`, `space.s1`, `space.s2` and
`space.s12`, and the body type.

## Family and system relationships

- `component:Tooltip` owns the props, `touchTrigger`'s meaning and the words;
  this record states how React Native draws the hint and how a touch screen
  reaches it.
- Each control's record owns its own `tooltip` prop; the press controls take a
  wrapping Tooltip's words as their hint (FR2).
- `family:overlay-dismissal` owns which touches dismiss the tooltip.

## Verification map

| Contract            | Verification                                                                                          | Representative states                                                                       | Mutation or failure expectation                                                                                                                                           | Audit section                         |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1                 | Type tests; a contract drift test against core's Tooltip contract                                     | each core prop and default; `anchorRef`; `hasHoverIndication`                               | an offered web prop, a renamed core prop or a changed default fails                                                                                                       | `audit:react-native/Tooltip/api`      |
| FR2, ORD2, AR1, AR4 | VoiceOver and TalkBack checks; unit tests through the package's testing doubles (`spec:AST-112` FR15) | a Button inside; a plain view; non-text content; a control with its own tooltip             | the words read twice, a separate element for them, or an announcement on open fails                                                                                       | `audit:react-native/Tooltip/a11y`     |
| FR3                 | Unit tests of pointer and focus                                                                       | a mouse in and out; onto the surface; leaving before `delay`; focus; `focusTrigger="never"` | a hover show without the delay, a focus show that waits, a surface that closes under the pointer, a touch hover that shows it, or focus that shows it under `never` fails | `audit:react-native/Tooltip/triggers` |
| FR4, AR2            | Unit tests of touch                                                                                   | `auto` on a button and on a plain view; a disabled control; `tap`; `none`; a hold; a scroll | a hold that opens it, a tap that opens it over a trigger's action under `auto`, or a scroll that opens it fails                                                           | `audit:react-native/Tooltip/triggers` |
| FR5                 | Unit tests of placement; Simulator and emulator captures in two themes and right-to-left              | near each edge; neither side fits; trigger scrolled out; no layer                           | a surface outside the bounds, one that takes touches, or one drawn for a trigger outside the layer fails                                                                  | `audit:react-native/Tooltip/layout`   |
| FR6, AR3            | Unit tests of the shield, back and escape                                                             | opened by tap, focus, hover and `isOpen`; a parent holding `isOpen`; back                   | an outside touch that acts below a shielded tooltip, a hover-opened tooltip that takes the hover, or back that leaves it open fails                                       | `audit:react-native/Tooltip/dismiss`  |
| FR7, ORD1           | Unit tests of state                                                                                   | controlled; `isDefaultOpen`; `isEnabled={false}`                                            | a controlled tooltip that changes on its own, or triggers that stay with `isEnabled={false}`, fails                                                                       | `audit:react-native/Tooltip/state`    |
| PR1                 | Unit tests of handlers and timers while closed                                                        | closed; `auto`; `none`                                                                      | a shield or touch handler while no tap can open it fails                                                                                                                  | `audit:react-native/Tooltip/behavior` |

## Decision log

### DEC-1 — The words are the trigger's hint

**Reference:** `component:react-native/Tooltip/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

VoiceOver and TalkBack read an element's hint right after its name, so the
tooltip's words become the press control's hint, and the trigger stays one
element. Where no control takes them, a visually hidden copy sits at the
trigger's bottom end corner, which screen readers reach next, since VoiceOver
orders elements by their frames.

### DEC-2 — A hover-opened tooltip leaves the hover to its trigger

**Reference:** `component:react-native/Tooltip/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

On iOS a pointer's hover is hit-tested like a touch, so a full-screen dismiss
shield under the pointer would take the hover from the trigger and hide the
tooltip on the next move. A tooltip that a hover opened therefore holds no
shield; it closes when the pointer leaves, and a touch closes it and still
reaches what it lands on, as a click does on the web.

### DEC-3 — Only the component crosses to React Native

**Reference:** `component:react-native/Tooltip/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

`anchorRef` points at a web element, `hasHoverIndication` marks the web's
inline text trigger (a string child wrapped in a focusable inline span), which a
React Native view does not have, and `useTooltip` hands back attributes
for a web element (`aria-describedby`, `aria-expanded`, `aria-controls`) and a
ref to it. None has a React Native counterpart, so React Native offers the
`Tooltip` component alone, and a trigger is the content it wraps.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
