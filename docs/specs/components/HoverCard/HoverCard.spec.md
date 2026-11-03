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
    packages/core/src/HoverCard/HoverCard.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    packages/core/src/Layer/useTouchTrigger.test.ts,
    packages/core/src/Layer/touchTriggerTargets.test.tsx,
    apps/storybook/stories/HoverCard.stories.tsx,
    packages/core/src/HoverCard/__tests__/HoverCardAudit.a11y.chromium.spec.ts,
    .github/a11y-audit-axe.json,
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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `HoverCard` with `children` (trigger), `content`, `label`, `placement` (`above`), `alignment` (`center`), `delay` (300), `hideDelay` (200), `focusTrigger`, `touchTrigger` (`auto`), `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `hover-card`. `useHoverCard` takes the same `touchTrigger`.                                                                                        |
| Behavior                | A floating card of rich, possibly interactive content anchored to a trigger. It opens on hover after `delay`, on focus, and on a tap that `touchTrigger` allows, stays open while the pointer is on the trigger or card, and closes on leave, Escape, or a tap outside. With `label` it is a named dialog the trigger advertises; without, a group that describes the trigger. With `touchTrigger="none"`, touch never opens it. |
| End-user impact         | Mouse, keyboard, and touch users can open the preview, move into it to use its actions, and dismiss it; screen-reader users hear it as a named popup dialog or as the trigger's description. Under the default `touchTrigger="auto"`, a tap on a trigger that performs an action performs only that action.                                                                                                                      |
| Builder impact          | `touchTrigger` answers whether it is safe to consume a tap to show the card (DEC-1): keep the default `auto` on a trigger that performs an action, pass `tap` where a tap only reveals the card, and pass `none` where a tap must never show it.                                                                                                                                                                                 |
| Compatibility/readiness | No public API change: `touchTrigger` keeps its released values and its default `auto`. Five implementation gaps (see Current-state impact).                                                                                                                                                                                                                                                                                      |
| Review checks           | Reject an unnamed `dialog`, a card that cannot be hovered or dismissed (WCAG 1.4.13), Escape in the page that also closes a layer underneath, `aria-expanded` set on a trigger whose role does not support it, or a tap under `touchTrigger="auto"` that both performs the trigger's action and shows the card.                                                                                                                  |
| Governing rules         | WCAG 1.4.13, 2.1.1; `family:overlay-dismissal`; `spec:AST-003` FR4; `spec:AST-017` (lifecycle); `architecture:public-component-api` INV9, INV21; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

HoverCard previews more information about a trigger, such as a profile or a
link summary, without navigating away. It owns the trigger wiring, when the
card opens and closes for each input, the card's semantics, and its surface.
Consumer usage lives in `HoverCard.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes. `touchTrigger` keeps its released values
  and its default `auto`. A disabled control is not an action, so its reason
  opens on a tap (FR5); that restoration ships on its own as a patch `[fix]`
- Compatibility class: no public prop, default, DOM, or styling change
- Controlled/uncontrolled behavior: uncontrolled by default; `isOpen` forces the
  state, and a controlled card reports close requests through
  `onOpenChange(false)` without closing itself (FR7)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A held-closed card still opens on focus.** With `isOpen={false}`, the hover
  path stays shut but focus on the trigger opens the card, so a caller cannot
  hold it closed. Escape then only reports `onOpenChange(false)`, which the
  caller already holds, so the card stays until focus or the pointer leaves the
  trigger or the card (FR7).
- **Hover timing does not use the shared hover recognizer.** The card runs its
  own show and hide timers. `architecture:interaction-modality` INV11 has
  `useHoverCard` take its hover timing from the shared hover recognizer.
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
- **Mixed text children get no trigger.** Text children that reach React as
  several strings, such as `Edited {when}`, have no element to attach to: no
  focusable span or popup attributes are added, and hover and focus never open
  the card (FR2).

## Ownership boundary

**Owns**

- Trigger wiring, open and close behavior per input, card semantics, and the
  `hover-card` surface (FR1–FR8).

**Does not own / non-goals**

- The trigger element and the card's body and actions — owned by the caller.
- Layer hosting, positioning, and inline-safe portaling — owned by
  `architecture:layer-runtime`; shared Escape ordering — owned by
  `family:overlay-dismissal`.
- The `useHoverCard` hook's public contract — an uncontracted module; this
  record covers HoverCard's observable behavior.

## Public concepts

| Concept       | Closed values or states   | Meaning                                                                                                                                                                                                                | Availability by variant/orientation/state | Default | Owner                 | Stability | Invalid-value behavior           |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------- | --------- | -------------------------------- |
| Popup role    | named dialog, group       | `label` makes the card a named `dialog`; without it the card is a `group`.                                                                                                                                             | Every card.                               | group   | `component:HoverCard` | Stable    | Not applicable.                  |
| Focus trigger | `auto`, `always`, `never` | Whether focus opens the card: on focusable triggers, judged when focus arrives (FR4), always, or never.                                                                                                                | Every trigger.                            | `auto`  | `component:HoverCard` | Stable    | TypeScript rejects other values. |
| Touch trigger | `auto`, `tap`, `none`     | Whether it is safe to consume a tap to show the card (DEC-1): `auto` shows it on a tap unless the trigger itself performs an action, a disabled control excepted (FR5); `tap` shows it on every tap; `none` on no tap. | Touch without hover.                      | `auto`  | `component:HoverCard` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| FR1  | The open card is one surface carrying only the `hover-card` target, padded on every logical edge, with `content` inside and the theme's body font. `xstyle`, `className`, and `style` apply to the card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                                     |
| FR2  | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element inside an inline-safe wrapper, and a first element replaced after mount, by new children or by a child that swaps its own root, is wired in place of the old one.                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests                                     |
| FR3  | With `label`, the card is `role="dialog"` named by `label`; the trigger gets `aria-haspopup="dialog"` and, only when its role supports it, `aria-expanded`, each replacing the trigger's own value while the card is wired, plus `aria-controls` naming the card while open, merged with the trigger's own; the trigger's own values return on cleanup. Without `label`, the card is `role="group"` and the trigger's `aria-describedby` gains the card's id.                                                                                                                                                                                                              | Current source and tests                                     |
| FR4  | On a hover-capable pointer, entering the trigger opens the card after `delay` ms; leaving the trigger or the card closes it after `hideDelay` ms, and moving between them keeps it open. Any focus on the trigger, keyboard, pointer, or programmatic, opens it per `focusTrigger`, except the focus a tap leaves behind, the refocus after an Escape dismiss (FR6), and the refocus after a controlled close (FR7). Under `auto`, whether focus counts is judged when it arrives: focus on the trigger itself, or within a trigger that is focusable at that moment, so a roving-tabindex member opens when the arrow keys reach it.                                      | WCAG 1.4.13; tests                                           |
| FR5  | On touch, a completed tap opens the card per `touchTrigger` when the finger lifts; a touch that becomes a scroll does not. Under `auto`, a tap opens it unless the trigger itself performs an action; an `aria-disabled` control, or a label for a disabled control, is not an action, so a disabled control's reason opens on a tap (DEC-1). Under `tap`, every tap opens it; under `none`, no tap does. A tap on the card's own content keeps it open; a second tap on the trigger, a tap outside, or a scroll starting outside closes it. Whether `auto` also leaves the card shut when the tap acts on a control around the trigger is open (`component:Tooltip` OQ1). | Current source and tests                                     |
| FR6  | Escape closes a visible card through the shared dismissal stack when it is the topmost layer in the page, so a layer underneath stays open. Implementation gap: a card rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). When focus was inside the card, it returns to the trigger, and that refocus does not reopen the card.                                                                                                                                                                                                                                  | WCAG 1.4.13; tests                                           |
| FR7  | `isOpen` forces the card shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled card answers Escape by calling `onOpenChange(false)` without hiding, and setting `isOpen={false}` while focus is inside the card returns focus to the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, focus on the trigger still opens the card, and Escape then only reports `onOpenChange(false)` (Current-state impact). `isEnabled={false}` disables the triggers. `onOpenChange` reports each show and hide.                                                                                  | Current source and tests                                     |
| FR8  | Content renders only while open; server markup and the first client render match, including a default-open card. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                                     |
| FR11 | A press inside an open HoverCard surface acts only within that surface: it never activates the trigger, a clickable container around it, or the control a label names. Interactive content inside the card (a link, a button) keeps its own activation. The press still reaches page-level listeners, so a menu or Typeahead inside the surface keeps working. `architecture:layer-runtime` INV17 states this stop for every layer root.                                                                                                                                                                                                                                   | `component:Tooltip` FR11; `architecture:layer-runtime` INV17 |

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

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                           | Representative states                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                                               | Audit section                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR2, FR8       | `HoverCard.test.tsx` render, wrapper, portal, theme font, SSR, replaced-trigger, and card `xstyle`/`className`/`style` tests; `HoverCardAudit` Chromium frames of `HoverCard / Open States` for the single target, equal padding on every logical edge, and the text trigger's dashed hover cue                                                                                        | Text and element triggers; default open                                                                                                                    | A stray target, lost font, or hydration mismatch fails, and so do card `xstyle`, `className`, or `style` that do not reach the card, missing or unequal card padding, or a lost dashed cue on a text trigger.                                                                 | `audit:HoverCard/anatomy`       |
| FR3, AR1            | `HoverCard.test.tsx` role, trigger-attribute, and attribute-restore tests; `HoverCardAudit` frames and the audit axe pass on `HoverCard / Open States`                                                                                                                                                                                                                                 | Labelled and unlabelled; supported and unsupported roles                                                                                                   | Wrong role, trigger attributes that are not replaced and restored as stated, or a new axe violation on an open card, fail.                                                                                                                                                    | `audit:HoverCard/accessibility` |
| FR4–FR6, AR2        | `HoverCard.test.tsx` hover, delay and hide-delay timing, trigger-to-card hold, Escape, refocus, and touch tests, and its `focusTrigger="auto"` roving, `<summary>`, wrapper, left-the-tab-order, and focus-inside-a-focusable-trigger cases; `HoverCardAudit` hover-and-keyboard pass in Chromium; `useTouchTrigger.test.ts` and `touchTriggerTargets.test.tsx` disabled-control cases | Hover, focus, tap, Escape from trigger and content; `touchTrigger` `auto`, `tap`, and `none`; an action trigger; a disabled control inside a clickable row | A card that cannot be reached or dismissed, that opens before `delay` or closes before `hideDelay`, that closes while the pointer moves from the trigger into it, or that opens on a tap on a trigger that performs an action under `auto` or on any tap under `none`, fails. | `audit:HoverCard/behavior`      |
| FR7                 | `HoverCard.test.tsx` isEnabled, isDefaultOpen, onOpenChange, `isOpen` forcing, and controlled-close focus-return tests; `layerDismissalFamilies.test.tsx` controlled HoverCard case                                                                                                                                                                                                    | Disabled, default open, held open, held closed, closed by the caller with focus inside                                                                     | Wrong state reporting, a hover that hides a card held open or opens one held closed, or focus left inside a card the caller closes, fails.                                                                                                                                    | `audit:HoverCard/behavior`      |
| FR11                | `HoverCard.test.tsx` surface-press suite                                                                                                                                                                                                                                                                                                                                               | A card inside a clickable container and inside a `<label>`; a button inside the card                                                                       | A click on card content that runs the container's click handler or activates a labelled control, or a card button that stops working, fails.                                                                                                                                  | —                               |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                          | Consumer anatomy and current target                                                                                                                        | Missing, extra, or stale mappings fail validation.                                                                                                                                                                                                                            | `audit:HoverCard/theming`       |

Read from source, with no focused test yet:

- FR3: restoring the trigger's own attributes on unmount.
- FR7: `isOpen={true}` keeping the card open when focus leaves the trigger.
- FR8: `hasHoverIndication={true}` and `{false}`.

Checked only in a browser, with no unit test:

- FR1: the card's padding.
- FR8: the default `hasHoverIndication` cue on a text trigger.

## Decision log

### DEC-1 — `touchTrigger` decides whether a tap may show the card

**Reference:** `component:HoverCard/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`; amended `2026-11-01` and `2026-11-02`

`touchTrigger` answers whether it is safe to consume a tap to show the card,
as `component:Tooltip` DEC-1 states: `auto`, the default, shows the card on a
tap only when the trigger performs no action of its own, so one tap does one
thing; `tap` declares that every tap may show it; `none` declares that no tap
may. An `aria-disabled` control, or a label for a disabled control, is not an
action, and an element that acts only through a role-less `onClick` is a
caller fix. HoverCard has no public toggle prop; toggle-style triggers follow
`component:Tooltip` DEC-1.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or layer-system
rules. It links to their owners.
