---
schema_version: 3
template_version: 7
kind: component
id: component:HoverCard
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
    packages/core/src/HoverCard/HoverCard.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    packages/core/src/Layer/useTouchTrigger.test.ts,
    packages/core/src/Layer/touchTriggerTargets.test.tsx,
    apps/storybook/stories/HoverCard.stories.tsx,
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
system_specs: [spec:AST-003, spec:AST-017]
---

# HoverCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `HoverCard` with `children` (trigger), `content`, `label`, `placement` (`above`), `alignment` (`center`), `delay` (300), `hideDelay` (200), `focusTrigger`, `triggerBehavior` (`adaptive`), `touchTrigger` (`tap` deprecated by `component:Tooltip` DEP-0016), `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `hover-card`. `useHoverCard` takes the same `triggerBehavior` and `touchTrigger`.                                                                                                                                                                             |
| Behavior                | A floating card of rich, possibly interactive content anchored to a trigger. It opens on hover after `delay`, on focus, and on a qualifying tap, stays open while the pointer is on the trigger or card, and closes on leave, Escape, or a tap outside. With `label` it is a named dialog the trigger advertises; without, a group that describes the trigger. With `triggerBehavior="hover"`, touch never opens it. With `triggerBehavior="toggle"`, hover and focus preview it, and a click, tap, Enter, or Space on a button trigger pins it open until Escape, a second press, a press outside, or focus leaving. |
| End-user impact         | Mouse, keyboard, and touch users can open the preview, move into it to use its actions, and dismiss it; screen-reader users hear it as a named popup dialog or as the trigger's description. With the toggle, a pinned card stays open while people read or use it, whatever the pointer does.                                                                                                                                                                                                                                                                                                                        |
| Builder impact          | A trigger whose information lives only in the card passes `triggerBehavior="toggle"` and a button trigger (DEC-1). `touchTrigger="tap"` callers migrate by trigger kind: the deprecating release's codemod rewrites icon and span triggers and reports the rest (`component:Tooltip` DEP-0016), and `component:Tooltip` CLN-0024 names each remaining kind's replacement at the next minor.                                                                                                                                                                                                                           |
| Compatibility/readiness | Additive `triggerBehavior`, default `adaptive`, the released behavior; `touchTrigger="tap"` deprecated and `touchTrigger` removed at the next minor, `triggerBehavior="adaptive"` keeping its `auto` behavior and `triggerBehavior="hover"` its `none` behavior (`component:Tooltip` DEP-0016, CLN-0024). Eight implementation gaps (see Current-state impact).                                                                                                                                                                                                                                                       |
| Review checks           | Reject an unnamed `dialog`, a card that cannot be hovered or dismissed (WCAG 1.4.13), Escape in the page that also closes a layer underneath, or `aria-expanded` set on a trigger whose role does not support it, a pinned card that closes on pointer leave, or a non-button toggle trigger without the development warning.                                                                                                                                                                                                                                                                                         |
| Governing rules         | WCAG 1.4.13, 2.1.1; `family:overlay-dismissal`; `spec:AST-003` FR4; `spec:AST-017` (deprecation); `architecture:public-component-api` INV9, INV21; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                                                                                                                                                                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

HoverCard previews more information about a trigger, such as a profile or a
link summary, without navigating away. It owns the trigger wiring, when the
card opens and closes for each input, the card's semantics, and its surface.
Consumer usage lives in `HoverCard.doc.mjs`.

## Compatibility and migration

- Released default preserved: the default `triggerBehavior="adaptive"` is the
  released behavior, and `touchTrigger` keeps its default `auto`. In patch
  releases `adaptive` keeps that released behavior: a tap opens the card unless the trigger itself performs an
  action. The one exception is a disabled control, which is not an action, so
  its reason opens on a tap; that restoration ships on its own as a patch
  `[fix]`. FR5's walk, under which a tap that already acts on a control around
  the trigger does not open the card, needs app code where a hint-only
  trigger sits inside a control (it declares `triggerBehavior="toggle"`), so it
  is a breaking change under `spec:AST-017` FR1 and DEC-17 and ships with
  CLN-0024 in the next minor; no caller's behavior changes in a patch
- Compatibility class: additive `triggerBehavior`; `touchTrigger="tap"` is
  deprecated; FR5's walk is a breaking change for the next minor
  (`component:Tooltip` CLN-0024); no DOM or styling change without
  `triggerBehavior`; until CLN-0024, an explicit `touchTrigger` decides taps
  under `triggerBehavior="adaptive"`, and `hover` and `toggle` ignore it
- Controlled/uncontrolled behavior: uncontrolled by default; `isOpen` forces the
  state, and a controlled card reports close requests through
  `onOpenChange(false)` without closing itself (FR7); under
  `triggerBehavior="toggle"` a press on a controlled card reports the toggled
  value through `onOpenChange` and does not change the state itself (FR9)
- Migration decision: `component:Tooltip` DEP-0016, then CLN-0024 in the next
  minor; both cover HoverCard's and `useHoverCard`'s `touchTrigger`, with the
  same codemods, and CLN-0024 brings FR5's walk to `adaptive`

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A tap inside a control still opens the card.** The shipped
  `touchTrigger="auto"` asks only whether the trigger itself performs an action,
  so a name or ID inside a clickable card opens its card on the tap that opens
  the card behind it. The walk ships with `component:Tooltip` CLN-0024 (FR5,
  DEC-1).
- **A held-closed card still opens on focus.** With `isOpen={false}`, the hover
  path stays shut but focus on the trigger opens the card, so a caller cannot
  hold it closed. Escape then only reports `onOpenChange(false)`, which the
  caller already holds, so the card stays until focus or the pointer leaves the
  trigger or the card (FR7).
- **Hover timing does not use the shared hover recognizer.** The card runs its
  own show and hide timers. `architecture:interaction-modality` INV11 has
  `useHoverCard` take its hover timing from the shared hover recognizer.
- **A roving trigger may not open on focus.** Under `focusTrigger="auto"` the
  card reads the tab order only when the trigger's listeners attach, so a
  trigger rendered with `tabindex="-1"` opens only on mouse hover after it takes
  keyboard focus, until a re-render re-attaches them. A focusable trigger
  `auto` does not recognize, such as a `<summary>` or an SVG link, never opens
  on focus. `architecture:interaction-modality` INV4 keeps hover from being the
  only discovery path.
- **A replaced trigger loses its wiring.** The card wires its trigger element
  when it opens or closes, when `label` changes, or when its listeners
  re-attach. A trigger element replaced after mount gets no popup attributes,
  description, or hover and focus opening until one of those happens (FR2,
  FR3).
- **Escape cannot close a card in another document.** HoverCard listens for
  Escape only in the page's document, so a card rendered into an iframe or a
  Picture-in-Picture window with no layer beneath it is never closed by
  Escape. WCAG 1.4.13 requires such content to be dismissible (FR6).
- **The hold follows only the pointer.** The card stays open only while the
  pointer is on the trigger or the card. A card opened by keyboard focus closes
  once the pointer crosses the trigger and leaves, while the trigger keeps
  focus, and a hover-opened card the user has tabbed into closes when the
  pointer leaves the trigger, dropping focus to the page. WCAG 1.4.13 requires
  content shown on focus to persist until focus moves or the user dismisses it.
  A card pinned by a press (FR9) is held whatever the pointer does.
- **Mixed text children get no trigger.** Text children that reach React as
  several strings, such as `Edited {when}`, have no element to attach to: no
  focusable span or popup attributes are added, and hover and focus never open
  the card (FR2).

## Ownership boundary

**Owns**

- Trigger wiring, open and close behavior per input, card semantics, and the
  `hover-card` surface (FR1–FR8), including the press toggle and the trigger
  state it sets (FR9, FR10).

**Does not own / non-goals**

- The trigger element and the card's body and actions — owned by the caller.
- Layer hosting, positioning, and inline-safe portaling — owned by
  `architecture:layer-runtime`; shared Escape ordering — owned by
  `family:overlay-dismissal`.
- The `useHoverCard` hook's public contract — an uncontracted module; this
  record covers HoverCard's observable behavior.

## Public concepts

| Concept          | Closed values or states       | Meaning                                                                                                                                                                                                                                                                                                                                                                                    | Availability by variant/orientation/state                                                                  | Default    | Owner                 | Stability                                                                                     | Invalid-value behavior           |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------- | --------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| Popup role       | named dialog, group           | `label` makes the card a named `dialog`; without it the card is a `group`.                                                                                                                                                                                                                                                                                                                 | Every card.                                                                                                | group      | `component:HoverCard` | Stable                                                                                        | Not applicable.                  |
| Focus trigger    | `auto`, `always`, `never`     | Whether focus opens the card: on focusable triggers (FR4's gap), always, or never.                                                                                                                                                                                                                                                                                                         | Every trigger.                                                                                             | `auto`     | `component:HoverCard` | Stable                                                                                        | TypeScript rejects other values. |
| Trigger behavior | `adaptive`, `hover`, `toggle` | How the trigger opens the card; under every value, hover on a fine pointer and focus preview it (FR4). Under `adaptive`, a tap opens it unless the tap already acts (FR5, DEC-1), and no press pins it; under `hover`, touch never opens it, and no press pins it; under `toggle`, a click, a completed tap, Enter, or Space pins it, and the same press on a pinned card closes it (FR9). | Every trigger; `toggle` pins only on a button trigger, and any other trigger keeps tap-only opening (FR9). | `adaptive` | `component:HoverCard` | Stable                                                                                        | TypeScript rejects other values. |
| Touch trigger    | `auto`, `tap`, `none`         | Whether a tap opens it under `triggerBehavior="adaptive"`: unless the tap already acts, as the innermost control around the tapped element decides (DEC-1); always; never. Ignored under `triggerBehavior="hover"` and `"toggle"`.                                                                                                                                                         | Touch without hover.                                                                                       | `auto`     | `component:HoverCard` | Stable; `tap` deprecated (`component:Tooltip` DEP-0016); removed at the next minor (CLN-0024) | TypeScript rejects other values. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| FR1  | The open card is one surface carrying only the `hover-card` target, padded on every logical edge, with `content` inside and the theme's body font. `xstyle`, `className`, and `style` apply to the card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests                                                                   |
| FR2  | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element inside an inline-safe wrapper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests                                                                   |
| FR3  | With `label`, the card is `role="dialog"` named by `label`; the trigger gets `aria-haspopup="dialog"` and, only when its role supports it, `aria-expanded`, each replacing the trigger's own value while the card is wired, plus `aria-controls` naming the card while open, merged with the trigger's own; the trigger's own values return on cleanup. Without `label`, the card is `role="group"` and the trigger's `aria-describedby` gains the card's id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests                                                                   |
| FR4  | On a hover-capable pointer, entering the trigger opens the card after `delay` ms; leaving the trigger or the card closes it after `hideDelay` ms, and moving between them keeps it open. Any focus on the trigger, keyboard, pointer, or programmatic, opens it per `focusTrigger`, except the focus a tap leaves behind, the refocus after an Escape dismiss (FR6), and the refocus after a controlled close (FR7). Implementation gap: under `auto` the tab order is read only when the trigger's listeners attach, on mount and on a re-render that re-attaches them, so a trigger rendered with `tabindex="-1"` does not open on focus until such a re-render follows its move into the tab order (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                         | WCAG 1.4.13; tests                                                                         |
| FR5  | On touch, a completed tap opens it per `triggerBehavior` when the finger lifts; a touch that becomes a scroll does not. Under `adaptive`, a tap that already acts leaves it shut, decided as `component:Tooltip` DEC-1 decides it: the innermost control from the tapped element outward, the trigger included, decides, and an `aria-disabled` control, or a label for a disabled control, is not an action (DEC-1). Until `component:Tooltip` CLN-0024 removes `touchTrigger`, an explicit `touchTrigger` decides instead under `adaptive`: `tap` opens on every tap and `none` on no tap. Implementation gap: the walk ships with `component:Tooltip` CLN-0024 in the next minor; until then `adaptive`, like the shipped `touchTrigger="auto"`, asks only whether the trigger itself performs an action, apart from a disabled control (Compatibility and migration). A tap on the card's own content keeps it open; a second tap on the trigger, a tap outside, or a scroll starting outside closes it. Under `hover`, no tap opens it. Under `toggle`, FR9 decides what a tap does. `hover` and `toggle` ignore `touchTrigger`. | Current source and tests                                                                   |
| FR6  | Escape closes a visible card through the shared dismissal stack when it is the topmost layer in the page, so a layer underneath stays open. Implementation gap: a card rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). When focus was inside the card, it returns to the trigger, and that refocus does not reopen the card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | WCAG 1.4.13; tests                                                                         |
| FR7  | `isOpen` forces the card shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled card answers Escape by calling `onOpenChange(false)` without hiding, and setting `isOpen={false}` while focus is inside the card returns focus to the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, focus on the trigger still opens the card, and Escape then only reports `onOpenChange(false)` (Current-state impact). `isEnabled={false}` disables the triggers. `onOpenChange` reports each show and hide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests                                                                   |
| FR8  | Content renders only while open; server markup and the first client render match, including a default-open card. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                                                   |
| FR9  | With `triggerBehavior="toggle"` and a trigger whose role is `button` (a `<button>` or `role="button"`), a click, a completed tap, Enter, or Space on the trigger pins the card open, and the same press on a pinned card closes it. Hover and focus still preview it per FR4; on touch no preview opens and a tap pins it, while a touch that becomes a scroll pins nothing. A pinned card stays open when the pointer leaves the trigger and the card, and a press on its own content keeps it pinned; Escape (FR6), a second press on the trigger, a press outside the trigger and the card, or focus moving outside them closes it. In a controlled card a press reports the toggled value through `onOpenChange` and does not change the state itself (FR7). A press that pins or closes the layer stops at its trigger: it does not reach a clickable row, card, or container around it, or the control a label names. A trigger whose role is not `button` gets a development warning and keeps tap-only opening: every completed tap opens the card, and no press pins it.                                                     | DEC-1; WCAG 1.4.13, 2.1.1                                                                  |
| FR10 | While `triggerBehavior="toggle"` wires a button trigger, the trigger carries `aria-expanded`, `true` only while pinned, and `aria-controls` naming the card while it shows, with or without `label`, each replacing the trigger's own value while wired and restored on cleanup; FR3's popup role and description are kept. When the card pins, a polite live region announces it once: its `label` when it has one, else its text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DEC-1; WAI-ARIA 1.2 `aria-expanded`                                                        |
| FR11 | A press inside an open HoverCard surface acts only within that surface: it never activates the trigger, a clickable container around it, or the control a label names. Interactive content inside the card (a link, a button) keeps its own activation. The press still reaches page-level listeners, so a menu or Typeahead inside the surface keeps working.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:HoverCard` FR9 (a pinning press stops at its trigger); `component:Tooltip` FR11 |

### Allowed variation

- **AV1 — Content.** Any content, including interactive actions.
- **AV2 — Theme styling.** Themes restyle `hover-card`.

### Representative states

| State               | Required invariant                             | Allowed variation |
| ------------------- | ---------------------------------------------- | ----------------- |
| Unlabelled          | `role="group"`; trigger described by the card. | Content.          |
| Labelled            | Named `dialog`; trigger advertises the popup.  | Content.          |
| Hover into card     | Stays open; actions usable.                    | Delays.           |
| Escape from content | Closes; focus back on trigger; no reopen.      | —                 |
| Tap-open            | Opens on lift; survives taps on its content.   | —                 |

### Transformation and precedence order

- **ORD1 — Open state.** `isOpen`, then the input triggers, apart from FR7's
  focus gap.

### Performance and resources

- **PR1 — Listeners.** An unchanged rerender does not rebind the trigger's
  listeners; an element trigger rebinds them on each open and close, and any
  trigger rebinds them when `onOpenChange` changes identity.

## Accessibility contract

- **AR1 — Popup semantics.** FR3.
- **AR2 — Content on hover or focus.** FR4–FR6 keep the card hoverable,
  dismissible, and persistent per WCAG 1.4.13, except FR6's other-document gap,
  FR7's held-closed Escape gap, and the pointer-only hold (Current-state
  impact).
- **AR3 — A pinned card is a toggletip.** Under `triggerBehavior="toggle"` the
  trigger is a named button that reports `aria-expanded` and `aria-controls`
  (FR10); keyboard and touch users pin and close the card without hover (FR9);
  it is announced once when it pins (FR10); and it persists until Escape, a
  second press, a press outside, or focus leaving (FR9, WCAG 1.4.13).

## Design relationships

| Anatomy or state | Design requirement                               | Representation authority       | Hierarchy role    | Component contract |
| ---------------- | ------------------------------------------------ | ------------------------------ | ----------------- | ------------------ |
| Trigger          | Caller element that opens the card.              | Caller content                 | Context-dependent | FR2                |
| Card             | Padded floating surface anchored to the trigger. | Current source and public docs | Prominent         | FR1                |
| Body             | Caller content inside the card.                  | Caller content                 | Prominent         | FR1                |
| Actions          | Optional caller buttons inside the card.         | Caller content                 | Supporting        | FR4                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger": {
    "none": {
      "reason": "intentional: The trigger is the caller's element and carries its own component's target."
    }
  },
  "Card": {"target": "hover-card"},
  "Body": {"inherits": "hover-card"},
  "Actions": {
    "none": {
      "reason": "intentional: Actions are caller-rendered controls that carry their own components' targets."
    }
  }
}
```

## Family and system relationships

- `family:overlay-dismissal` owns Escape routing and topmost handling.
- `architecture:layer-runtime` owns hosting, positioning, and portaling.
- `architecture:interaction-modality` owns the focus modality FR4 uses and,
  through INV11, the hover timing source for FR4.
- `architecture:component-theming-surface` owns the `hover-card` target.

## Verification map

| Contract                     | Verification                                                                                                                                                                                                                                                                                                                                                                                 | Representative states                                                                                                                                                                                                                                                  | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                           | Audit section                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR2, FR8                | `HoverCard.test.tsx` render, wrapper, portal, theme font, and SSR tests                                                                                                                                                                                                                                                                                                                      | Text and element triggers; default open                                                                                                                                                                                                                                | A stray target, lost font, or hydration mismatch fails.                                                                                                                                                                                                                                                                                                   | `audit:HoverCard/anatomy`       |
| FR3, AR1                     | `HoverCard.test.tsx` role and trigger-attribute tests                                                                                                                                                                                                                                                                                                                                        | Labelled and unlabelled; supported and unsupported roles                                                                                                                                                                                                               | Wrong role, or trigger attributes that are not replaced and restored as stated, fail.                                                                                                                                                                                                                                                                     | `audit:HoverCard/accessibility` |
| FR4–FR6, AR2                 | `HoverCard.test.tsx` hover, Escape, refocus, and touch tests; `useTouchTrigger.test.ts` and `touchTriggerTargets.test.tsx` disabled-control cases; tap-destination cases an evidence gap until built                                                                                                                                                                                         | Hover, focus, tap, Escape from trigger and content; a trigger inside a link or a clickable card; a disabled control inside a clickable row                                                                                                                             | A card that cannot be reached or dismissed, or that opens on a tap that already acts, fails.                                                                                                                                                                                                                                                              | `audit:HoverCard/behavior`      |
| FR7                          | `HoverCard.test.tsx` isEnabled, isDefaultOpen, and onOpenChange tests; `layerDismissalFamilies.test.tsx` controlled HoverCard case                                                                                                                                                                                                                                                           | Disabled, default open                                                                                                                                                                                                                                                 | Wrong state reporting fails.                                                                                                                                                                                                                                                                                                                              | `audit:HoverCard/behavior`      |
| FR9, FR10, AR3               | `usePressPin.test.tsx` HoverCard suites (click, Enter, Space, and tap pin; second press, press outside, and focus leaving close; pointer leave and presses on the card keep the pin; labelled and unlabelled announcements; a non-button trigger) and stop-at-trigger cases; `layerDismissalFamilies.test.tsx` pinned HoverCard over a Dialog, uncontrolled and controlled, closed by Escape | Click, Enter, Space, and tap pin; second press, press outside, focus leaving, and Escape close; pointer leave and presses on the card keep the pin; labelled and unlabelled; non-button trigger; a toggle trigger inside a ClickableCard, an Item row, and a `<label>` | A press that does not pin or close as stated, a pin lost on pointer leave, a missing or stale `aria-expanded` or `aria-controls`, a second announcement, a non-button trigger without the warning or its tap fallback, or a pinning press that also activates the card, row, or labelled control around the trigger, fails.                               | `audit:HoverCard/behavior`      |
| FR5, FR9 (`triggerBehavior`) | `HoverCard.test.tsx` trigger-behavior suite                                                                                                                                                                                                                                                                                                                                                  | `adaptive` by default and explicitly, `hover`, and `toggle`, each with mouse hover, focus, and touch; `touchTrigger` beside each value                                                                                                                                 | Under any value, a lost hover or focus preview; under `adaptive`, an info-only tap that leaves the card shut or a press that pins it; under `hover`, a tap that opens it or a press that pins it; under `toggle`, a click, tap, Enter, or Space that does not pin or close it as FR9 states; or a `touchTrigger` that changes `hover` or `toggle`, fails. | `audit:HoverCard/behavior`      |
| FR11                         | `HoverCard.test.tsx` surface-press suite                                                                                                                                                                                                                                                                                                                                                     | A card inside a clickable container and inside a `<label>`; a button inside the card                                                                                                                                                                                   | A click on card content that runs the container's click handler or activates a labelled control, or a card button that stops working, fails.                                                                                                                                                                                                              | —                               |
| Theming anatomy map          | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                | Consumer anatomy and current target                                                                                                                                                                                                                                    | Missing, extra, or stale mappings fail validation.                                                                                                                                                                                                                                                                                                        | `audit:HoverCard/theming`       |

Read from source, with no focused test yet:

- FR1: the card's padding, and `xstyle`, `className`, and `style` reaching it.
- FR3: restoring the trigger's own attributes on unmount.
- FR4: the `delay` and `hideDelay` timing, and moving between the trigger and
  the card keeping it open.
- FR7: `isOpen` forcing the card, and the focus return after a controlled
  close.
- FR8: `hasHoverIndication`.

## Decision log

### DEC-1 — A press pins the card; a tap that already acts stays with its control

**Reference:** `component:HoverCard/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`; amended `2026-11-01`

A card keeps previewing on hover and focus, and `triggerBehavior="toggle"` adds
one more open state of the same layer: a press pins it, so people on touch,
keyboard, or a screen reader can keep it open to read or use it. Components
declare `triggerBehavior="toggle"` where the card is the only home of their
information, such as a timestamp's details. `adaptive`, the default and the
released behavior, previews on hover and focus and opens on a tap; `hover`
previews on hover and focus only, so touch never opens the card; `toggle` adds
the pin on every device. Under `adaptive`, a tap that already acts does not
open the card. The
walk that decides it starts at the tapped element and the innermost control
decides; an `aria-disabled` control, or a label for a disabled control, is not
an action; and an element that acts only through a role-less `onClick` is a
caller fix, as `component:Tooltip` DEC-1 states. The deprecation of
`touchTrigger="tap"` and the removal of `touchTrigger` are `component:Tooltip` DEP-0016 and CLN-0024,
which apply here unchanged.

Rejected: judging the trigger alone, which lets one tap open a name's card over
the card the same tap opened.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or layer-system
rules. It links to their owners.
