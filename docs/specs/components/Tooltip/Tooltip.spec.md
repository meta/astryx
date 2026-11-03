---
schema_version: 3
template_version: 7
kind: component
id: component:Tooltip
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Layer/usePressPin.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    packages/core/src/Tooltip/Tooltip.test.tsx,
    packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts,
    packages/core/src/Tooltip/useTooltip.test.tsx,
    packages/core/src/Layer/touchTriggerTargets.test.tsx,
    packages/core/src/Tooltip/__tests__/Tooltip.a11y.test.tsx,
    packages/core/src/Tooltip/__tests__/Tooltip.a11y.chromium.spec.ts,
    packages/core/src/Tooltip/__tests__/TooltipHoverBridge.a11y.chromium.spec.ts,
    packages/core/src/Tooltip/__tests__/TooltipFocusReturn.a11y.chromium.spec.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-003, spec:AST-017, spec:AST-086/FR12, spec:AST-086/FR14]
---

# Tooltip component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/Layer/usePressPin.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Tooltip` with `content`, `children` or `anchorRef`, `placement` (`above`), `alignment` (`center`), `delay` (200), `hideDelay` (0), `focusTrigger` (`auto`), `touchTrigger` (`auto`), `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `tooltip`. `useTooltip` takes the same `touchTrigger`, and its return includes imperative `show` and `hide` (FR12). The press-to-pin path (FR9, FR10) is internal to Core and has no public prop; `component:InfoTip` is its only caller.                                                                                                                                                                |
| Behavior                | A `role="tooltip"` layer that describes its trigger. It opens on hover after `delay`, on keyboard focus, and on a tap that `touchTrigger` allows; it stays open while the pointer moves onto it, and closes on leave, Escape, or pressing the trigger (a press that focuses a text field reopens it). With `touchTrigger="none"`, no touch or pen tap opens it. On the internal press-to-pin path, hover and focus preview it, and a click, tap, Enter, or Space on a button trigger pins it open until Escape, a second press, a press outside, or focus leaving. `useTooltip`'s `show()` holds it open the same way until `hide()`, Escape, a press outside, or focus leaving (FR12). |
| End-user impact         | Mouse, keyboard, and touch users can each reveal the hint, move onto it, and dismiss it; screen-reader users hear it as the trigger's description. Under the default `touchTrigger="auto"`, a tap on a trigger that performs an action performs only that action. On the press-to-pin path, people on touch, keyboard, or a screen reader can keep help open to read it, and hear it once when it pins.                                                                                                                                                                                                                                                                                 |
| Builder impact          | `touchTrigger` answers one question: is it safe to consume a tap to show this tooltip (DEC-1)? Keep the default `auto` on a trigger that performs an action, pass `tap` where a tap only reveals the tooltip, and pass `none` where a tap must never show it. Help behind an info icon uses `component:InfoTip`; an app's own toggle-style trigger is a button that calls `useTooltip`'s `show()` and `hide()` (DEC-1).                                                                                                                                                                                                                                                                 |
| Compatibility/readiness | `useTooltip` adds `show` and `hide` (FR12), an additive change. `touchTrigger` keeps its released values and its default `auto`, and the press-to-pin path adds no public prop. Nine implementation gaps (see Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Review checks           | Reject a tooltip that cannot be hovered or dismissed (WCAG 1.4.13), one that opens on a tap's focus or on pointer focus of a trigger that is not a text field, a lost `aria-describedby` link, a tap under `touchTrigger="auto"` that both performs the trigger's action and shows the tooltip, a pinned tooltip that closes on pointer leave or lets Escape pass to the layer beneath, a pinning trigger without `aria-expanded`, or a non-button pinning trigger without the development warning.                                                                                                                                                                                     |
| Governing rules         | WCAG 1.4.13, 2.1.1; `family:overlay-dismissal`; `spec:AST-003` FR4; `spec:AST-017` (lifecycle); `architecture:public-component-api` INV9, INV21; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                                                                                                                                                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

Tooltip renders supplied tooltip content on an owned overlay surface associated
with a caller-owned trigger. It owns how the trigger is wired, when the tooltip
opens and closes for each input, and the surface's anatomy. Consumer usage lives
in `Tooltip.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes. `touchTrigger` keeps its released values
  and its default `auto`. A disabled control is not an action, so its reason
  opens on a tap (FR5); that restoration ships on its own as a patch `[fix]`
- Compatibility class: additive: `useTooltip`'s return gains `show` and `hide`
  (FR12); no public prop, default, DOM, styling, or target change; the
  press-to-pin path (FR9, FR10) is internal and adds no public surface
- Controlled/uncontrolled behavior: uncontrolled by default; `isOpen` forces the
  state, and a controlled tooltip reports close requests through
  `onOpenChange(false)` without closing itself (FR7); on the press-to-pin path
  a press on a controlled tooltip reports the toggled value through
  `onOpenChange` and does not change the state itself (FR9)
- Migration decision: none

### CLN-0028 — Remove the surface registry behind `hasInteractiveAncestor`

| Field     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0028`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| lifecycle | No deprecation: the next-minor removal of a documented answer that `architecture:layer-runtime` INV17 replaces                                                                                                                                                                                                                                                                                                                                                   |
| delta     | The Tooltip and HoverCard surface registry (`Layer/layerSurfacePress.ts`) is removed, and the public `hasInteractiveAncestor` no longer answers true for a press inside an open Tooltip or HoverCard surface; its JSDoc sentence saying so goes with it. INV17 already keeps such a press from every bubble-phase React handler around the layer, so a caller that asks `hasInteractiveAncestor` from a native listener or a capture-phase handler sees a change |
| rollback  | Restore the registry and the JSDoc sentence from the final-patch baseline                                                                                                                                                                                                                                                                                                                                                                                        |
| state     | `pending` — lands in 0.8.0, a declared minor, with its `[breaking]` Changeset                                                                                                                                                                                                                                                                                                                                                                                    |

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **`hasInteractiveAncestor` still asks the surface registry.** Until the
  next minor, the public `hasInteractiveAncestor` answers true for a press
  inside an open Tooltip or HoverCard surface, as its documentation states;
  Core's own containers rely on `architecture:layer-runtime` INV17 instead.
  `CLN-0028` removes the registry and that answer.
- **A held-closed tooltip still opens on focus.** With `isOpen={false}`, the
  hover path stays shut but any focus FR4 opens on, keyboard focus or a click
  into a text-field trigger, opens the tooltip and reports `onOpenChange(true)`, so a caller cannot hold it closed.
  Escape then only reports `onOpenChange(false)`, which the caller already
  holds, so the tooltip stays until focus or the pointer leaves the trigger or the tooltip, or the caller re-renders with
  a new `onOpenChange` (FR7).
- **Escape cannot close a tooltip in another document.** Tooltip listens for
  Escape only in the page's document and its surface is a manual popover, so a
  tooltip rendered into an iframe or a Picture-in-Picture window with no layer
  beneath it is never closed by Escape. WCAG 1.4.13 requires such content to
  be dismissible (FR6).
- **The tooltip consumes Escape until AST-003 ships.** A visible, topmost
  tooltip handles Escape, as `family:overlay-dismissal` records, so the layer
  underneath it, such as a Dialog, stays open for that press. `spec:AST-003`
  FR4, accepted and not yet implemented, makes an unpinned tooltip passive.
- **Hover timing does not use the shared hover recognizer.** The tooltip runs
  its own show and hide timers, without the recognizer's intent group that
  shows the next trigger at once. `architecture:interaction-modality` INV11 has
  `useTooltip` take its hover timing from the shared hover recognizer.
- **A changed trigger loses its wiring.** The tooltip wires its trigger only
  when the trigger's listeners attach, which repeats only when `focusTrigger`,
  `isEnabled`, `isOpen`, `delay`, `hideDelay`, or `onOpenChange` changes. Until
  then, a replaced element child or `anchorRef` target gets no
  `aria-describedby` and no hover or focus opening, and a trigger that
  re-renders with its own new `aria-describedby` loses the tooltip id (FR2,
  AR1).
- **Script focus after an empty click opens the tooltip.** After a pointer
  press that focuses nothing, such as a click on page text, script focus on a
  trigger matches `:focus-visible` and opens the tooltip, though
  `architecture:interaction-modality` INV1 counts that press as pointer input
  (FR4).
- **Mixed text children get no trigger.** Text children that reach React as
  several strings, such as `Edited {when}`, take neither the text nor the
  element path: no focusable span or `aria-describedby` is added, and hover and
  focus never open the tooltip (FR2).
- **The binding runs some adopted tooltip parts as advisory.** The tooltip
  pattern binding still runs hiding when focus leaves, showing on hover, and
  hiding on leave as advisory rows, so a regression there does not fail either
  binding lane. `spec:AST-020` FR9 makes an adopted expectation required.

## Ownership boundary

**Owns**

- The rendered tooltip surface and content inside that surface (FR1).
- Trigger wiring and when the tooltip opens and closes for each input
  (FR2–FR8), including the internal press-to-pin path and the trigger state it sets
  (FR9, FR10).

**Does not own / non-goals**

- The trigger element — supplied by the caller or referenced externally and
  outside Tooltip's owned anatomy.
- An arrow element — the current implementation renders none.
- Layer hosting and anchor positioning — owned by `architecture:layer-runtime`;
  shared Escape ordering — owned by `family:overlay-dismissal`.
- The rest of the `useTooltip` hook's public contract — an uncontracted
  module; this record covers Tooltip's observable behavior and the hook's
  `show` and `hide` (FR12).

## Public concepts

| Concept       | Closed values or states   | Meaning                                                                                                                                                                                                                   | Availability by variant/orientation/state                                     | Default | Owner               | Stability | Invalid-value behavior           |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- | ------------------- | --------- | -------------------------------- |
| Focus trigger | `auto`, `always`, `never` | Whether keyboard focus opens the tooltip: on focusable triggers, judged when focus arrives (FR4), always, or never.                                                                                                       | Every trigger mode.                                                           | `auto`  | `component:Tooltip` | Stable    | TypeScript rejects other values. |
| Touch trigger | `auto`, `tap`, `none`     | Whether it is safe to consume a tap to show the tooltip (DEC-1): `auto` shows it on a tap unless the trigger itself performs an action, a disabled control excepted (FR5); `tap` shows it on every tap; `none` on no tap. | Touch and pen without hover; the press-to-pin path decides taps itself (FR9). | `auto`  | `component:Tooltip` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1  | The rendered tooltip contains one owned surface, `role="tooltip"`, carrying the `tooltip` target, at most 300 px wide, with the supplied `content` inside; content has no separate target and there is no arrow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests                                                                                                                        |
| FR2  | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element; `anchorRef` attaches to that element. The trigger's `aria-describedby` gains the tooltip id, merged with and later restored to any existing value. Implementation gap: the wiring runs only when the trigger's listeners attach, so a trigger element replaced after mount, or a trigger whose own `aria-describedby` changes, loses it until a re-render re-attaches them (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                                                                                                                               |
| FR3  | On a hover-capable pointer, entering the trigger opens after `delay` ms; leaving closes after `hideDelay` ms. With `hideDelay` 0 a short bridge lets the pointer move onto the surface without closing it, and the surface stays open while hovered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | WCAG 1.4.13; tests                                                                                                                                     |
| FR4  | Focus that matches `:focus-visible` opens the tooltip per `focusTrigger`: keyboard focus, programmatic focus that follows keyboard input (AR4), pointer focus on a text-entry trigger, which browsers mark focus-visible, and programmatic focus on a text-entry trigger unless a finger or pen pressed that trigger and the last input was a pointer press, and on any other trigger unless the last input was a pointer (after keyboard input, as in AR4, or before any input). Implementation gap: script focus after a pointer press that focused nothing opens it, because the hook reads `:focus-visible` alone (Current-state impact). Focus a tap leaves behind, and other pointer focus, does not. Focus leaving the trigger schedules the hide as a pointer leave does. Under `focusTrigger="auto"`, focus opens the tooltip on any focusable trigger, judged when focus arrives.                                                                                                                                                                                                                     | Current source and tests                                                                                                                               |
| FR5  | On touch and pen, a completed tap opens the tooltip per `touchTrigger` when the finger lifts; a touch that becomes a scroll, or a press the browser does not count as a tap, does not open it. Under `auto`, a tap opens it unless the trigger itself performs an action; an `aria-disabled` control, or a label for a disabled control, is not an action, so a disabled control's reason opens on a tap, even inside a clickable row or card (DEC-1). Under `tap`, every tap opens it; under `none`, no tap does. A second tap on the trigger, a tap outside, or a scroll starting outside closes it. On the press-to-pin path, FR9 decides what a tap does. Whether `auto` also leaves the tooltip shut when the tap acts on a control around the trigger is open (OQ1).                                                                                                                                                                                                                                                                                                                                      | Current source and tests                                                                                                                               |
| FR6  | Escape closes a visible tooltip; Escape during text composition is ignored. Escape routing follows `family:overlay-dismissal`: a visible topmost tooltip in the page handles that Escape, so a layer underneath stays open for that press. Implementation gap: a tooltip rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). `spec:AST-003` FR4, accepted and not yet implemented, makes an unpinned tooltip passive and gives a pinned one Escape first (Current-state impact). Outside the press-to-pin path and a `show()` hold (FR12), pressing an uncontrolled tooltip's trigger closes it; a press that focuses a text-entry trigger reopens it through FR4.                                                                                                                                                                                                                                                                                                                                     | WCAG 1.4.13; tests                                                                                                                                     |
| FR7  | `isOpen` forces the tooltip shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled tooltip answers Escape by calling `onOpenChange(false)` without hiding, and is not closed by pressing the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, any focus FR4 opens on, keyboard focus or a click into a text-field trigger, still opens the tooltip and reports `onOpenChange(true)`, and Escape then only reports `onOpenChange(false)`, so it stays until focus or the pointer leaves the trigger or the tooltip, or the caller re-renders with a new `onOpenChange` (Current-state impact). `isEnabled={false}` disables triggers and drops a pending open.                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                                                                                                                               |
| FR8  | `onOpenChange` reports each show and hide. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                                                                                                               |
| FR9  | On the press-to-pin path, an internal Tooltip option with no public prop that `component:InfoTip` uses, a click, a completed tap, Enter, or Space on a trigger whose role is `button` (a `<button>` or `role="button"`) pins the tooltip open, and the same press on a pinned tooltip closes it. Hover and keyboard focus still preview it per FR3 and FR4; on touch no preview opens and a tap pins it, while a touch that becomes a scroll pins nothing. A pinned tooltip stays open when the pointer leaves the trigger and the surface; Escape (FR6), a second press, a press outside the trigger and the surface, or focus moving outside them closes it. In a controlled tooltip a press reports the toggled value through `onOpenChange` and does not change the state itself (FR7). A press that pins or closes the layer stops at its trigger: it does not reach a clickable row, card, or container around it, or the control a label names. A trigger whose role is not `button` gets a development warning and keeps tap-only opening: every completed tap opens the tooltip, and no press pins it. | DEC-1; WCAG 1.4.13, 2.1.1                                                                                                                              |
| FR10 | While the press-to-pin path wires a button trigger, the trigger carries `aria-expanded`, `true` only while pinned, and `aria-controls` naming the surface while it shows, each replacing the trigger's own value while wired and restored on cleanup; FR2's `aria-describedby` is kept. When the tooltip pins, its text is announced once through a polite live region; a preview announces nothing beyond the description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DEC-1; WAI-ARIA 1.2 `aria-expanded`                                                                                                                    |
| FR11 | A press inside an open Tooltip surface acts only within that surface: it never activates the trigger, a clickable container around it, or the control a label names. A tooltip that renders inside a FileInput dropzone, a ClickableCard, an Item row, or a `<label>` keeps a click on its text from opening the file picker, activating the container, or toggling or focusing the labelled control. The press still reaches page-level listeners, so a menu or Typeahead inside the surface keeps working. `architecture:layer-runtime` INV17 states this stop for every layer root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:Tooltip` FR9 (a pinning press stops at its trigger); `component:Tooltip` DEC-1 (one tap does one thing); `architecture:layer-runtime` INV17 |
| FR12 | `useTooltip`'s return includes imperative `show(): void` and `hide(): void`. `show()` opens the tooltip and keeps it open until `hide()`, Escape, a press outside, or focus leaving its trigger, as a pinned tooltip does (FR6, FR9); `hide()` closes it. Both report through the hook's `onShow` and `onHide`, which the Tooltip component maps to `onOpenChange` (FR8). While `isEnabled` is false, `show()` does nothing. Under a controlled `isOpen`, they report the request through `onShow`/`onHide` and do not override `isOpen` (FR7). They are how an app builds a toggle-style trigger: the app's own button calls them, carries `aria-expanded` (true while shown) and `aria-controls` naming the surface, and keeps its own accessible name.                                                                                                                                                                                                                                                                                                                                                       | Owner decision, 2026-11-02: app control through `useTooltip`'s imperative show and hide, not a prop.                                                   |

### Allowed variation

- Supplied content may vary without adding a Tooltip-owned child target.

### Representative states

- The owned anatomy is unchanged across wrapped-trigger and external-anchor
  modes; the trigger remains outside it.

### Transformation and precedence order

- **ORD1 — Open state.** `isOpen`, then the input triggers, apart from FR7's
  focus gap.

### Performance and resources

- **PR1 — Timers.** A pending show is dropped when triggers are disabled or the
  component unmounts.

## Accessibility contract

- **AR1 — Description.** The trigger's `aria-describedby` names the tooltip
  (FR2), apart from FR2's changed-trigger gap.
- **AR2 — Content on hover or focus.** The tooltip is hoverable, dismissible,
  and persistent per WCAG 1.4.13 (FR3, FR6), except FR6's other-document gap and
  FR7's held-closed Escape gap.
- **AR3 — Focus modality.** Only `:focus-visible` focus opens it (FR4).
- **AR4 — Focus return.** When closing a popover from the keyboard returns
  focus to a trigger that carries a tooltip, the tooltip shows for that focus
  without an error.
- **AR5 — Tooltip pattern.** The record adopts the APG tooltip pattern's parts:
  `role="tooltip"`, the trigger's `aria-describedby`, showing on keyboard focus
  and hiding when focus leaves, Escape dismissal, and showing on hover and
  hiding on leave (FR1–FR4, FR6), with FR6's other-document gap and FR7's
  held-closed Escape gap as the exceptions to Escape dismissal. Hiding when focus leaves, showing on hover,
  and hiding on leave go beyond the required parts `spec:AST-020` FR15 adopts
  and are this record's named exception, kept because they ship.
- **AR6 — A pinned tooltip is a toggletip.** On the press-to-pin path the
  trigger is a named button that reports `aria-expanded` and `aria-controls`
  (FR10); keyboard and touch users pin and close the tooltip without hover
  (FR9); it is announced once when it pins (FR10); and it persists until
  Escape, a second press, a press outside, or focus leaving (FR9, WCAG 1.4.13).

## Design relationships

| Anatomy or state | Design requirement                                  | Representation authority       | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Tooltip surface  | Presents the current painted overlay surface.       | Current source and public docs | Supporting     | FR1                |
| Tooltip text     | Presents supplied content within the owned surface. | Current source and public docs | Prominent      | FR1                |

The trigger is caller-owned and outside this anatomy. The current implementation
has no arrow element.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Tooltip surface": {"target": "tooltip"},
  "Tooltip text": {"inherits": "tooltip"}
}
```

## Family and system relationships

- `family:overlay-dismissal` owns Escape routing and topmost handling.
- `architecture:layer-runtime` owns hosting and positioning.
- `architecture:interaction-modality` owns the focus-visible modality FR4 uses
  and, through INV11, the hover timing source for FR3.
- `architecture:component-theming-surface` owns the `tooltip` target.

## Verification map

| Contract            | Verification                                                                                                                                                                   | Representative states                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                 | Audit section                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1                 | `Tooltip.test.tsx` role/content suite                                                                                                                                          | Rendered surface and supplied content                                                                                                                                                                                               | Removing the surface or content fails existing tooltip role and text assertions.                                                                                                                                                                                                                                                | `audit:Tooltip/anatomy`       |
| FR2–FR8             | `Tooltip.test.tsx`; `useTooltip.test.tsx`                                                                                                                                      | Hover, focus, tap, Escape, controlled, default open; `auto` judged when focus arrives (roving member, `<summary>`, non-focusable wrapper)                                                                                           | Wrong open or close for an input fails.                                                                                                                                                                                                                                                                                         | `audit:Tooltip/behavior`      |
| AR1–AR4             | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`; `TooltipHoverBridge.a11y.chromium.spec.ts`; `TooltipFocusReturn.a11y.chromium.spec.ts`                               | Real-browser hover bridge and focus return                                                                                                                                                                                          | A tooltip that vanishes on the way to it or strands focus fails.                                                                                                                                                                                                                                                                | `audit:Tooltip/accessibility` |
| AR5                 | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`                                                                                                                       | Wrapped, text, anchor, and hook triggers                                                                                                                                                                                            | A lost role, description, keyboard-focus show, or Escape dismissal fails; focus-leave hide, hover show, and leave hide run as advisory rows (Current-state impact).                                                                                                                                                             | `audit:Tooltip/accessibility` |
| FR5                 | `Tooltip.test.tsx` touch suite; `TouchTrigger.a11y.chromium.spec.ts` finger and pen cases; `useTouchTrigger.test.ts` and `touchTriggerTargets.test.tsx` disabled-control cases | Tap open, scroll, second tap, tap outside; `touchTrigger` `auto`, `tap`, and `none`; an action trigger and a trigger that performs no action; a trigger in running text; a disabled control inside a clickable row                  | A tap that fails to open or close as stated, opens the tooltip on a trigger that performs an action under `auto` or on any tap under `none`, or leaves a disabled control's reason shut fails.                                                                                                                                  | `audit:Tooltip/behavior`      |
| FR9, FR10, AR6      | `usePressPin.test.tsx` Tooltip suites; `TouchTrigger.a11y.chromium.spec.ts` press-to-pin and mouse cases; `layerDismissalFamilies.test.tsx` pinned Tooltip over a Dialog       | Click, Enter, Space, and tap pin; second press, press outside, focus leaving, and Escape close; pointer leave keeps the pin; controlled; non-button trigger; a pinning trigger inside a ClickableCard, an Item row, and a `<label>` | A press that does not pin or close as stated, a pin lost on pointer leave, a missing or stale `aria-expanded` or `aria-controls`, a second announcement, a non-button trigger without the warning or its tap fallback, or a pinning press that also activates the card, row, or labelled control around a child trigger, fails. | `audit:Tooltip/behavior`      |
| FR11                | `Tooltip.test.tsx` surface-press suite; `FileInputTooltipPress.a11y.chromium.spec.ts`                                                                                          | A tooltip inside a clickable container and inside a `<label>`; FileInput compact and dropzone status tooltips, with a click on the empty dropzone as the positive control                                                           | A click on tooltip text that runs the container's click handler, checks or focuses a labelled control, or opens the file picker fails.                                                                                                                                                                                          | —                             |
| FR12                | `useTooltip.showHide.test.tsx`; `Tooltip.stories.tsx` `CustomToggleTrigger`                                                                                                    | An app button calls `show()` and `hide()`; Escape, a press outside, and focus leaving close a shown tooltip; a controlled `isOpen`; `show()` while `isEnabled` is false                                                             | A tooltip that `show()` does not open or hold, `hide()` does not close, a close path that leaves it open, a missing `onShow` or `onHide`, a `show()` that overrides a controlled `isOpen`, or a disabled tooltip that `show()` opens fails                                                                                      | —                             |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                  | Canonical anatomy and current target                                                                                                                                                                                                | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                                                                                                                                                                                                         | `audit:Tooltip/theming`       |

Read from source, with no focused test yet:

- FR2: a single number child, and restoring a trigger's own existing
  `aria-describedby`.
- FR6: a press that focuses a text-entry trigger reopening it, and Escape in
  another document.
- FR7: `isOpen={true}` suppressing focus hiding.
- FR1: the 300 px maximum width, the `tooltip` target, and the absence of an
  arrow.
- FR4: `focusTrigger="always"` and `"never"`,
  programmatic focus on a text-entry trigger after pointer input opening it,
  and not after a finger or pen pressed it when the last input was a pointer press, pointer focus on a text field
  opening the tooltip, programmatic focus before any input, or after a pointer press onto a trigger that is not a text field, other pointer focus not opening it, and focus leaving the trigger
  hiding it.
- FR8: `hasHoverIndication`.

## Decision log

### DEC-1 — `touchTrigger` decides whether a tap may show the tooltip

**Reference:** `component:Tooltip/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`; amended `2026-11-01` and `2026-11-02`

`touchTrigger` answers one question: is it safe to consume a tap to show this
content? A tap that shows a tooltip must not come before the tap that performs
the control's action, so one tap does one thing. `auto`, the default, shows
the tooltip on a tap only when the trigger performs no action of its own;
`tap` declares that every tap may show it; `none` declares that no tap may. An
`aria-disabled` control, or a label for a disabled control, is not an action,
so its reason opens on a tap. An element that acts only through a role-less
`onClick` is a caller fix: it needs a role.

A press-to-pin toggle answers a different question, so it does not replace
`touchTrigger`. A toggle needs a button under the trigger that the caller did
not add, it adds interactions that are not clearly connected to the trigger,
and it does not solve the touch case. Tooltip has no public toggle prop. An
app builds a toggle-style trigger by having its own button call `useTooltip`'s
imperative `show()` and `hide()` (FR12). `component:InfoTip` keeps its current behavior for now: it pins
through Tooltip's internal press-to-pin path (FR9, FR10).
`component:HoverCard` DEC-1 applies the same rules.

Rejected: a separate toggletip component, which would repeat Tooltip's and
HoverCard's previews (`architecture:public-component-api` INV21).

## Open questions

- **OQ1 — Does `touchTrigger="auto"` also leave the tooltip shut when a tap
  acts on a control around the trigger, such as a truncated label inside a
  link?** (`human-api`) Today `auto` judges the trigger alone.

## Content boundary

This file does not duplicate consumer prop tables, examples, layer-system rules,
implementation steps, or system rules. It links to their owners.
