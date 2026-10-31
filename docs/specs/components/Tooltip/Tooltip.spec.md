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
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Tooltip/Tooltip.test.tsx,
    packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts,
    packages/core/src/Tooltip/useTooltip.test.tsx,
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
system_specs: [spec:AST-003]
---

# Tooltip component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Tooltip` with `content`, `children` or `anchorRef`, `placement` (`above`), `alignment` (`center`), `delay` (200), `hideDelay` (0), `focusTrigger` (`auto`), `touchTrigger` (`auto`), `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `tooltip`. |
| Behavior                | A `role="tooltip"` layer that describes its trigger. It opens on hover after `delay`, on keyboard focus, and on a qualifying tap; it stays open while the pointer moves onto it, and closes on leave, Escape, or pressing the trigger (a press that focuses a text field reopens it).     |
| End-user impact         | Mouse, keyboard, and touch users can each reveal the hint, move onto it, and dismiss it; screen-reader users hear it as the trigger's description.                                                                                                                                        |
| Builder impact          | None.                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no public change. Nine implementation gaps (see Current-state impact).                                                                                                                                                                                          |
| Review checks           | Reject a tooltip that cannot be hovered or dismissed (WCAG 1.4.13), one that opens on a tap's focus or on pointer focus of a trigger that is not a text field, or a lost `aria-describedby` link.                                                                                         |
| Governing rules         | WCAG 1.4.13; `family:overlay-dismissal`; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Tooltip renders supplied tooltip content on an owned overlay surface associated
with a caller-owned trigger. It owns how the trigger is wired, when the tooltip
opens and closes for each input, and the surface's anatomy. Consumer usage lives
in `Tooltip.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; runtime, DOM, styling,
  targets, and public API remain unchanged
- Controlled/uncontrolled behavior: uncontrolled by default; `isOpen` forces the
  state, and a controlled tooltip reports close requests through
  `onOpenChange(false)` without closing itself (FR7)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

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
  FR4, accepted and not yet implemented, makes Tooltip passive.
- **Hover timing does not use the shared hover recognizer.** The tooltip runs
  its own show and hide timers, without the recognizer's intent group that
  shows the next trigger at once. `architecture:interaction-modality` INV11 has
  `useTooltip` take its hover timing from the shared hover recognizer.
- **A roving trigger may not open on focus.** Under `focusTrigger="auto"` the
  tooltip reads the tab order only when it attaches the trigger's listeners, so
  a roving toolbar button or menu item rendered with `tabindex="-1"` shows its
  tooltip only on mouse hover after it takes keyboard focus, until a change to
  `focusTrigger`, `isEnabled`, `isOpen`, `delay`, `hideDelay`, or
  `onOpenChange` re-attaches them. A focusable trigger `auto` does not
  recognize, such as a `<summary>` or an SVG link, never opens on focus.
  `architecture:interaction-modality` INV4 keeps hover from being the only
  discovery path.
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
  (FR2–FR8).

**Does not own / non-goals**

- The trigger element — supplied by the caller or referenced externally and
  outside Tooltip's owned anatomy.
- An arrow element — the current implementation renders none.
- Layer hosting and anchor positioning — owned by `architecture:layer-runtime`;
  shared Escape ordering — owned by `family:overlay-dismissal`.
- The `useTooltip` hook's public contract — an uncontracted module; this record
  covers Tooltip's observable behavior.

## Public concepts

| Concept       | Closed values or states   | Meaning                                                                                        | Availability by variant/orientation/state | Default | Owner               | Stability | Invalid-value behavior           |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ------------------- | --------- | -------------------------------- |
| Focus trigger | `auto`, `always`, `never` | Whether keyboard focus opens the tooltip: on focusable triggers (FR4's gap), always, or never. | Every trigger mode.                       | `auto`  | `component:Tooltip` | Stable    | TypeScript rejects other values. |
| Touch trigger | `auto`, `tap`, `none`     | Whether a tap opens it: unless the trigger performs its own action, always, or never.          | Touch and pen without hover.              | `auto`  | `component:Tooltip` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1 | The rendered tooltip contains one owned surface, `role="tooltip"`, carrying the `tooltip` target, at most 300 px wide, with the supplied `content` inside; content has no separate target and there is no arrow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source, docs, and tests |
| FR2 | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element; `anchorRef` attaches to that element. The trigger's `aria-describedby` gains the tooltip id, merged with and later restored to any existing value. Implementation gap: the wiring runs only when the trigger's listeners attach, so a trigger element replaced after mount, or a trigger whose own `aria-describedby` changes, loses it until a re-render re-attaches them (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests        |
| FR3 | On a hover-capable pointer, entering the trigger opens after `delay` ms; leaving closes after `hideDelay` ms. With `hideDelay` 0 a short bridge lets the pointer move onto the surface without closing it, and the surface stays open while hovered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | WCAG 1.4.13; tests              |
| FR4 | Focus that matches `:focus-visible` opens the tooltip per `focusTrigger`: keyboard focus, programmatic focus that follows keyboard input (AR4), pointer focus on a text-entry trigger, which browsers mark focus-visible, and programmatic focus on a text-entry trigger unless a finger or pen pressed that trigger and the last input was a pointer press, and on any other trigger unless the last input was a pointer (after keyboard input, as in AR4, or before any input). Implementation gap: script focus after a pointer press that focused nothing opens it, because the hook reads `:focus-visible` alone (Current-state impact). Focus a tap leaves behind, and other pointer focus, does not. Focus leaving the trigger schedules the hide as a pointer leave does. Under `focusTrigger="auto"`, focus opens the tooltip on any focusable trigger. Implementation gap: `auto` recognizes only an explicit non-negative `tabindex`, HTML links, buttons, form fields, and editable elements, so a `<summary>` or an SVG link never opens on keyboard focus; and it reads the tab order only when it attaches the trigger's listeners, on mount and again when `focusTrigger`, `isEnabled`, `isOpen`, `delay`, `hideDelay`, or `onOpenChange` changes, so a trigger rendered with `tabindex="-1"` does not open on focus until such a re-render follows its move into the tab order (Current-state impact). | Current source and tests        |
| FR5 | On touch, a completed tap opens per `touchTrigger` when the finger lifts; a touch that becomes a scroll, or a press the browser does not count as a tap, does not open it. A second tap on the trigger, a tap outside, or a scroll starting outside closes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests        |
| FR6 | Escape closes a visible tooltip; Escape during text composition is ignored. Escape routing follows `family:overlay-dismissal`: a visible topmost tooltip in the page handles that Escape, so a layer underneath stays open for that press. Implementation gap: a tooltip rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). `spec:AST-003` FR4, accepted and not yet implemented, makes Tooltip passive (Current-state impact). Pressing an uncontrolled tooltip's trigger closes it; a press that focuses a text-entry trigger reopens it through FR4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | WCAG 1.4.13; tests              |
| FR7 | `isOpen` forces the tooltip shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled tooltip answers Escape by calling `onOpenChange(false)` without hiding, and is not closed by pressing the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, any focus FR4 opens on, keyboard focus or a click into a text-field trigger, still opens the tooltip and reports `onOpenChange(true)`, and Escape then only reports `onOpenChange(false)`, so it stays until focus or the pointer leaves the trigger or the tooltip, or the caller re-renders with a new `onOpenChange` (Current-state impact). `isEnabled={false}` disables triggers and drops a pending open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests        |
| FR8 | `onOpenChange` reports each show and hide. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests        |

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

| Contract            | Verification                                                                                                                                     | Representative states                               | Mutation or failure expectation                                                                                                                                     | Audit section                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1                 | `Tooltip.test.tsx` role/content suite                                                                                                            | Rendered surface and supplied content               | Removing the surface or content fails existing tooltip role and text assertions.                                                                                    | `audit:Tooltip/anatomy`       |
| FR2–FR8             | `Tooltip.test.tsx`; `useTooltip.test.tsx`                                                                                                        | Hover, focus, tap, Escape, controlled, default open | Wrong open or close for an input fails.                                                                                                                             | `audit:Tooltip/behavior`      |
| AR1–AR4             | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`; `TooltipHoverBridge.a11y.chromium.spec.ts`; `TooltipFocusReturn.a11y.chromium.spec.ts` | Real-browser hover bridge and focus return          | A tooltip that vanishes on the way to it or strands focus fails.                                                                                                    | `audit:Tooltip/accessibility` |
| AR5                 | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`                                                                                         | Wrapped, text, anchor, and hook triggers            | A lost role, description, keyboard-focus show, or Escape dismissal fails; focus-leave hide, hover show, and leave hide run as advisory rows (Current-state impact). | `audit:Tooltip/accessibility` |
| FR5                 | `Tooltip.test.tsx` touch suite; `TouchTrigger.a11y.chromium.spec.ts`                                                                             | Tap open, scroll, second tap, tap outside           | A tap that fails to open or close as stated fails.                                                                                                                  | `audit:Tooltip/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                    | Canonical anatomy and current target                | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                                             | `audit:Tooltip/theming`       |

Read from source, with no focused test yet:

- FR2: a single number child, and restoring a trigger's own existing
  `aria-describedby`.
- FR6: a press that focuses a text-entry trigger reopening it, and Escape in
  another document.
- FR7: `isOpen={true}` suppressing focus hiding.
- FR1: the 300 px maximum width, the `tooltip` target, and the absence of an
  arrow.
- FR4: `focusTrigger="always"`, `"never"`, and when `"auto"` reads the tab order,
  programmatic focus on a text-entry trigger after pointer input opening it,
  and not after a finger or pen pressed it when the last input was a pointer press, pointer focus on a text field
  opening the tooltip, programmatic focus before any input, or after a pointer press onto a trigger that is not a text field, other pointer focus not opening it, and focus leaving the trigger
  hiding it.
- FR8: `hasHoverIndication`.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, layer-system rules,
implementation steps, or system rules. It links to their owners.
