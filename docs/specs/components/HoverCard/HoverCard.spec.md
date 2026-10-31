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
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/HoverCard/HoverCard.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
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
  ]
contributing: []
system_specs: []
---

# HoverCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `HoverCard` with `children` (trigger), `content`, `label`, `placement` (`above`), `alignment` (`center`), `delay` (300), `hideDelay` (200), `focusTrigger`, `touchTrigger`, `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `hover-card`.                                                                             |
| Behavior                | A floating card of rich, possibly interactive content anchored to a trigger. It opens on hover after `delay`, on focus, and on a qualifying tap, stays open while the pointer is on the trigger or card, and closes on leave, Escape, or a tap outside. With `label` it is a named dialog the trigger advertises; without, a group that describes the trigger. |
| End-user impact         | Mouse, keyboard, and touch users can open the preview, move into it to use its actions, and dismiss it; screen-reader users hear it as a named popup dialog or as the trigger's description.                                                                                                                                                                   |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Records shipped behavior; no public change. Seven implementation gaps (see Current-state impact).                                                                                                                                                                                                                                                              |
| Review checks           | Reject an unnamed `dialog`, a card that cannot be hovered or dismissed (WCAG 1.4.13), Escape in the page that also closes a layer underneath, or `aria-expanded` set on a trigger whose role does not support it.                                                                                                                                              |
| Governing rules         | WCAG 1.4.13; `family:overlay-dismissal`; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

HoverCard previews more information about a trigger, such as a profile or a
link summary, without navigating away. It owns the trigger wiring, when the
card opens and closes for each input, the card's semantics, and its surface.
Consumer usage lives in `HoverCard.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
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

| Concept       | Closed values or states   | Meaning                                                                            | Availability by variant/orientation/state | Default | Owner                 | Stability | Invalid-value behavior           |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------- | --------- | -------------------------------- |
| Popup role    | named dialog, group       | `label` makes the card a named `dialog`; without it the card is a `group`.         | Every card.                               | group   | `component:HoverCard` | Stable    | Not applicable.                  |
| Focus trigger | `auto`, `always`, `never` | Whether focus opens the card: on focusable triggers (FR4's gap), always, or never. | Every trigger.                            | `auto`  | `component:HoverCard` | Stable    | TypeScript rejects other values. |
| Touch trigger | `auto`, `tap`, `none`     | Whether a tap opens it: unless the trigger performs its own action, always, never. | Touch without hover.                      | `auto`  | `component:HoverCard` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The open card is one surface carrying only the `hover-card` target, padded on every logical edge, with `content` inside and the theme's body font. `xstyle`, `className`, and `style` apply to the card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests |
| FR2 | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element inside an inline-safe wrapper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR3 | With `label`, the card is `role="dialog"` named by `label`; the trigger gets `aria-haspopup="dialog"` and, only when its role supports it, `aria-expanded`, each replacing the trigger's own value while the card is wired, plus `aria-controls` naming the card while open, merged with the trigger's own; the trigger's own values return on cleanup. Without `label`, the card is `role="group"` and the trigger's `aria-describedby` gains the card's id.                                                                                                                                                                                                                                                                 | Current source and tests |
| FR4 | On a hover-capable pointer, entering the trigger opens the card after `delay` ms; leaving the trigger or the card closes it after `hideDelay` ms, and moving between them keeps it open. Any focus on the trigger, keyboard, pointer, or programmatic, opens it per `focusTrigger`, except the focus a tap leaves behind, the refocus after an Escape dismiss (FR6), and the refocus after a controlled close (FR7). Implementation gap: under `auto` the tab order is read only when the trigger's listeners attach, on mount and on a re-render that re-attaches them, so a trigger rendered with `tabindex="-1"` does not open on focus until such a re-render follows its move into the tab order (Current-state impact). | WCAG 1.4.13; tests       |
| FR5 | On touch, a completed tap opens it per `touchTrigger` when the finger lifts; a touch that becomes a scroll does not. A tap on the card's own content keeps it open; a second tap on the trigger, a tap outside, or a scroll starting outside closes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR6 | Escape closes a visible card through the shared dismissal stack when it is the topmost layer in the page, so a layer underneath stays open. Implementation gap: a card rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). When focus was inside the card, it returns to the trigger, and that refocus does not reopen the card.                                                                                                                                                                                                                                                                                     | WCAG 1.4.13; tests       |
| FR7 | `isOpen` forces the card shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled card answers Escape by calling `onOpenChange(false)` without hiding, and setting `isOpen={false}` while focus is inside the card returns focus to the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, focus on the trigger still opens the card, and Escape then only reports `onOpenChange(false)` (Current-state impact). `isEnabled={false}` disables the triggers. `onOpenChange` reports each show and hide.                                                                                                                                     | Current source and tests |
| FR8 | Content renders only while open; server markup and the first client render match, including a default-open card. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |

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

| Contract            | Verification                                                                                                                       | Representative states                                    | Mutation or failure expectation                                                       | Audit section                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR2, FR8       | `HoverCard.test.tsx` render, wrapper, portal, theme font, and SSR tests                                                            | Text and element triggers; default open                  | A stray target, lost font, or hydration mismatch fails.                               | `audit:HoverCard/anatomy`       |
| FR3, AR1            | `HoverCard.test.tsx` role and trigger-attribute tests                                                                              | Labelled and unlabelled; supported and unsupported roles | Wrong role, or trigger attributes that are not replaced and restored as stated, fail. | `audit:HoverCard/accessibility` |
| FR4–FR6, AR2        | `HoverCard.test.tsx` hover, Escape, refocus, and touch tests                                                                       | Hover, focus, tap, Escape from trigger and content       | A card that cannot be reached or dismissed fails.                                     | `audit:HoverCard/behavior`      |
| FR7                 | `HoverCard.test.tsx` isEnabled, isDefaultOpen, and onOpenChange tests; `layerDismissalFamilies.test.tsx` controlled HoverCard case | Disabled, default open                                   | Wrong state reporting fails.                                                          | `audit:HoverCard/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                      | Consumer anatomy and current target                      | Missing, extra, or stale mappings fail validation.                                    | `audit:HoverCard/theming`       |

Read from source, with no focused test yet:

- FR1: the card's padding, and `xstyle`, `className`, and `style` reaching it.
- FR3: restoring the trigger's own attributes on unmount.
- FR4: the `delay` and `hideDelay` timing, and moving between the trigger and
  the card keeping it open.
- FR7: `isOpen` forcing the card, and the focus return after a controlled
  close.
- FR8: `hasHoverIndication`.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or layer-system
rules. It links to their owners.
