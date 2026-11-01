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
system_specs: [spec:AST-003, spec:AST-017]
---

# Tooltip component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Tooltip` with `content`, `children` or `anchorRef`, `placement` (`above`), `alignment` (`center`), `delay` (200), `hideDelay` (0), `focusTrigger` (`auto`), `pressTrigger` (`none`), `touchTrigger` (`auto`; `tap` deprecated by DEP-0016), `isEnabled`, `isOpen`, `isDefaultOpen`, `onOpenChange`, and `hasHoverIndication`; target `tooltip`. `useTooltip` takes the same `pressTrigger` and `touchTrigger`.                                                                     |
| Behavior                | A `role="tooltip"` layer that describes its trigger. It opens on hover after `delay`, on keyboard focus, and on a qualifying tap; it stays open while the pointer moves onto it, and closes on leave, Escape, or pressing the trigger (a press that focuses a text field reopens it). With `pressTrigger="toggle"`, hover and focus preview it, and a click, tap, Enter, or Space on a button trigger pins it open until Escape, a second press, a press outside, or focus leaving. |
| End-user impact         | Mouse, keyboard, and touch users can each reveal the hint, move onto it, and dismiss it; screen-reader users hear it as the trigger's description. With the toggle, people on touch, keyboard, or a screen reader can keep it open to read it, and hear it once when it pins.                                                                                                                                                                                                       |
| Builder impact          | A trigger whose information lives only in the tooltip passes `pressTrigger="toggle"` and a button trigger (DEC-1). `touchTrigger="tap"` callers migrate by trigger kind: the deprecating release's codemod rewrites icon and span triggers and reports the rest (DEP-0016), and CLN-0024 names each remaining kind's replacement at the next minor.                                                                                                                                 |
| Compatibility/readiness | Additive `pressTrigger`, default `none`; `touchTrigger="tap"` deprecated (DEP-0016); `touchTrigger` folds into `pressTrigger` at the next minor (CLN-0024). FR9, FR10, and AR6 are not yet built; ten further implementation gaps (see Current-state impact).                                                                                                                                                                                                                       |
| Review checks           | Reject a tooltip that cannot be hovered or dismissed (WCAG 1.4.13), one that opens on a tap's focus or on pointer focus of a trigger that is not a text field, a lost `aria-describedby` link, a pinned tooltip that closes on pointer leave or lets Escape pass to the layer beneath, a toggle without `aria-expanded`, or a non-button toggle trigger without the development warning.                                                                                            |
| Governing rules         | WCAG 1.4.13, 2.1.1; `family:overlay-dismissal`; `spec:AST-003` FR4; `spec:AST-017` (deprecation); `architecture:public-component-api` INV9, INV21; `architecture:layer-runtime`; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Tooltip renders supplied tooltip content on an owned overlay surface associated
with a caller-owned trigger. It owns how the trigger is wired, when the tooltip
opens and closes for each input, and the surface's anatomy. Consumer usage lives
in `Tooltip.doc.mjs`.

## Compatibility and migration

- Released default preserved: the defaults stay `pressTrigger="none"` and
  `touchTrigger="auto"`. In patch releases `auto` keeps its released
  behavior: a tap opens the tooltip unless the trigger itself performs an
  action. The one exception is a disabled control, which is not an action, so
  its reason opens on a tap; that restoration ships on its own as a patch
  `[fix]`. FR5's walk, under which a tap that already acts on a control around
  the trigger does not open the tooltip, needs app code where a hint-only
  trigger sits inside a control (it declares `pressTrigger="toggle"`), so it
  is a breaking change under `spec:AST-017` FR1 and DEC-17 and ships with
  CLN-0024 in the next minor; no caller's behavior changes in a patch
- Compatibility class: additive `pressTrigger`; `touchTrigger="tap"` is
  deprecated (DEP-0016); FR5's walk is a breaking change for the next minor
  (CLN-0024); DOM, styling, and targets remain unchanged without `pressTrigger`
- Controlled/uncontrolled behavior: uncontrolled by default; `isOpen` forces the
  state, and a controlled tooltip reports close requests through
  `onOpenChange(false)` without closing itself (FR7); under
  `pressTrigger="toggle"` a press on a controlled tooltip reports the toggled
  value through `onOpenChange` and does not change the state itself (FR9)
- Migration decision: DEP-0016, then CLN-0024 in the next minor

### DEP-0016 — Deprecate `touchTrigger="tap"`

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0016`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| cleanup          | `CLN-0024`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| package          | `@astryxdesign/core`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| surface          | `touchTrigger="tap"` on `Tooltip`, `HoverCard`, `useTooltip`, and `useHoverCard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| old contract     | Every completed tap opens the layer, even on a trigger that performs its own action; a mouse click, Enter, or Space does not keep it open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| replacement      | `pressTrigger="toggle"`: a tap still opens the layer, and a click, Enter, or Space pins it too (FR9); a non-button trigger keeps tap-only opening (FR9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| direct authority | `component:Tooltip` DEC-1 and `component:HoverCard` DEC-1. Owner: `cixzhang`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| warning          | Static `@deprecated` metadata on the `tap` value; consumer docs and the release notes name `DEP-0016` and `pressTrigger="toggle"`. No runtime warning (`spec:AST-017` FR29, FR29a). When `touchTrigger` and `pressTrigger="toggle"` are both given, `pressTrigger` wins                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| migration        | Mechanical only where the result is observably the same: on a trigger that is statically a non-interactive element, such as an icon or a span, `pressTrigger="toggle"` replaces `touchTrigger="tap"`. That rewrite keeps every production behavior because FR9 keeps a non-button toggle trigger on tap-only opening, as `touchTrigger="tap"` does; in development such a trigger also gets FR9's warning, which points its caller to a button trigger. On a trigger whose tooltip repeats its own text, a button, a link, or an element the codemod cannot identify, the toggle changes what a click, Enter, or Space does (and on a button adds `aria-expanded`), so the caller migrates by hand; the deprecated `tap` keeps working until CLN-0024 |
| codemod          | An `astryx upgrade` codemod staged in `packages/cli/assets/codemods/transforms/next/`, with tests and fixtures, checked by the codemod verify workflow, and available in the release that deprecates `tap`: it rewrites static `touchTrigger="tap"` to `pressTrigger="toggle"` only where the trigger is statically a non-interactive icon or span, which FR9 keeps on tap-only opening, reports every other `touchTrigger="tap"` site (an own-text trigger, a button, a link, or an unknown element) with a manual-migration note and leaves it unchanged, removes static `touchTrigger="auto"`, and reports spreads and dynamic values it cannot prove (`spec:AST-017` FR29c, FR29d)                                                                |
| downstream       | In the deprecating release, Core FieldLabel's info icon moves from `touchTrigger="tap"` to `component:InfoTip` with `pressTrigger="toggle"` (`component:FieldLabel` FR9), and Lab InfoTip and the CLI page templates migrate too, the templates to a button trigger with `pressTrigger="toggle"` so they carry no development warning (`spec:AST-017` FR29c); docs, stories, templates, and examples teach only `pressTrigger`                                                                                                                                                                                                                                                                                                                        |
| transition       | no prior transition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| state            | `proposed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| target plan      | `CLN-0024` in the next minor release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### CLN-0024 — `touchTrigger` folds into `pressTrigger`

| Field       | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id          | `CLN-0024`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| lifecycle   | `DEP-0016`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| delta       | `touchTrigger` is removed from `Tooltip`, `HoverCard`, `useTooltip`, and `useHoverCard`. `pressTrigger` takes `auto`, `toggle`, and `none`, default `auto`: `auto` is the released `touchTrigger="auto"` (a tap opens the layer unless the trigger performs its own action, and no press pins it), `none` is the released `touchTrigger="none"` (no tap or press opens it), and `toggle` is unchanged. `auto` gains FR5's walk: a tap that already acts on a control around the trigger does not open the layer. A hint-only trigger inside a control migrates by declaring `pressTrigger="toggle"`, which no codemod can decide; Astryx's own info-only triggers (InfoTip, FieldLabel's info button, and a standalone StatusDot) declare it before this minor; a StatusDot inside a button, link, menu item, or option stays an image whose status the host's accessible name carries. One prop decides what a press does |
| replacement | Each remaining `touchTrigger="tap"` site has a named replacement (`spec:AST-017` FR8): a button or link whose only job is its tooltip takes `pressTrigger="toggle"`, so its tooltip keeps a touch path; a button or link with its own action whose accessible name already carries the layer's text drops `tap` and takes `auto`, so a tap performs the action and opens no layer (`architecture:interaction-modality` INV4's case); any other button or link with its own action moves the layer's information to an adjacent info trigger that declares `pressTrigger="toggle"`, such as an InfoTip, or into its visible label, so that information keeps a touch path, and then drops `tap`; a trigger whose tooltip repeats its own text takes `pressTrigger="toggle"` (FR9's own-text exception); an unknown element is reported for a manual choice (`architecture:interaction-modality` INV4)                       |
| codemod     | The minor's `astryx upgrade` codemod, with tests and fixtures: `touchTrigger="none"` becomes `pressTrigger="none"`; `touchTrigger="auto"` and the released `pressTrigger="none"` are removed, since `auto` reproduces them; `pressTrigger="toggle"` is kept and any `touchTrigger` beside it removed; a remaining `touchTrigger="tap"` becomes `pressTrigger="toggle"` on an own-text trigger the codemod can identify; every button and link `tap` site is reported with the options in its note (`pressTrigger="toggle"` when the trigger's only job is its layer; remove `tap` for `auto` when the trigger's accessible name already carries the layer's text; otherwise move the information to an adjacent InfoTip or the visible label, then remove `tap`), since no static check tells them apart, and every other remaining `tap` site is reported; spreads and dynamic values are reported                        |
| rollback    | Restore `touchTrigger` and the two-value `pressTrigger` from the final-patch baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| state       | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
- **A tap inside a control still opens the tooltip.** The shipped
  `touchTrigger="auto"` asks only whether the trigger itself performs an action,
  so a truncated label inside a link opens its tooltip on the tap that follows
  the link. The walk ships with CLN-0024 (FR5, DEC-1).
- **Press-to-pin is not built.** `pressTrigger`, its toggle (FR9), the trigger
  wiring and announcement (FR10), and a pinned tooltip's Escape priority
  (`spec:AST-003` FR4) are specified and not implemented, and the codemod
  DEP-0016 names does not exist yet. `touchTrigger="tap"` is the shipped way to
  open on every tap.
- **The tooltip consumes Escape until AST-003 ships.** A visible, topmost
  tooltip handles Escape, as `family:overlay-dismissal` records, so the layer
  underneath it, such as a Dialog, stays open for that press. `spec:AST-003`
  FR4, accepted and not yet implemented, makes an unpinned tooltip passive.
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
  (FR2–FR8), including the press toggle and the trigger state it sets (FR9,
  FR10).

**Does not own / non-goals**

- The trigger element — supplied by the caller or referenced externally and
  outside Tooltip's owned anatomy.
- An arrow element — the current implementation renders none.
- Layer hosting and anchor positioning — owned by `architecture:layer-runtime`;
  shared Escape ordering — owned by `family:overlay-dismissal`.
- The `useTooltip` hook's public contract — an uncontracted module; this record
  covers Tooltip's observable behavior.

## Public concepts

| Concept       | Closed values or states   | Meaning                                                                                                                                                                           | Availability by variant/orientation/state                           | Default | Owner               | Stability                                                                 | Invalid-value behavior           |
| ------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------- | ------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Focus trigger | `auto`, `always`, `never` | Whether keyboard focus opens the tooltip: on focusable triggers (FR4's gap), always, or never.                                                                                    | Every trigger mode.                                                 | `auto`  | `component:Tooltip` | Stable                                                                    | TypeScript rejects other values. |
| Press trigger | `none`, `toggle`          | Whether a click, tap, Enter, or Space on the trigger pins the tooltip open: never, leaving taps to `touchTrigger`, or on every press (FR9).                                       | Button triggers; a non-button trigger keeps tap-only opening (FR9). | `none`  | `component:Tooltip` | Stable                                                                    | TypeScript rejects other values. |
| Touch trigger | `auto`, `tap`, `none`     | Whether a tap opens it: unless the tap already acts, as the innermost control around the tapped element decides (DEC-1); always; or never. Ignored under `pressTrigger="toggle"`. | Touch and pen without hover.                                        | `auto`  | `component:Tooltip` | Stable; `tap` deprecated (DEP-0016); folds into `pressTrigger` (CLN-0024) | TypeScript rejects other values. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| FR1  | The rendered tooltip contains one owned surface, `role="tooltip"`, carrying the `tooltip` target, at most 300 px wide, with the supplied `content` inside; content has no separate target and there is no arrow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests                                                                     |
| FR2  | Trigger wiring: a single string or number child is wrapped in a focusable inline span; element `children` attach to their first element; `anchorRef` attaches to that element. The trigger's `aria-describedby` gains the tooltip id, merged with and later restored to any existing value. Implementation gap: the wiring runs only when the trigger's listeners attach, so a trigger element replaced after mount, or a trigger whose own `aria-describedby` changes, loses it until a re-render re-attaches them (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                                                                            |
| FR3  | On a hover-capable pointer, entering the trigger opens after `delay` ms; leaving closes after `hideDelay` ms. With `hideDelay` 0 a short bridge lets the pointer move onto the surface without closing it, and the surface stays open while hovered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | WCAG 1.4.13; tests                                                                                  |
| FR4  | Focus that matches `:focus-visible` opens the tooltip per `focusTrigger`: keyboard focus, programmatic focus that follows keyboard input (AR4), pointer focus on a text-entry trigger, which browsers mark focus-visible, and programmatic focus on a text-entry trigger unless a finger or pen pressed that trigger and the last input was a pointer press, and on any other trigger unless the last input was a pointer (after keyboard input, as in AR4, or before any input). Implementation gap: script focus after a pointer press that focused nothing opens it, because the hook reads `:focus-visible` alone (Current-state impact). Focus a tap leaves behind, and other pointer focus, does not. Focus leaving the trigger schedules the hide as a pointer leave does. Under `focusTrigger="auto"`, focus opens the tooltip on any focusable trigger. Implementation gap: `auto` recognizes only an explicit non-negative `tabindex`, HTML links, buttons, form fields, and editable elements, so a `<summary>` or an SVG link never opens on keyboard focus; and it reads the tab order only when it attaches the trigger's listeners, on mount and again when `focusTrigger`, `isEnabled`, `isOpen`, `delay`, `hideDelay`, or `onOpenChange` changes, so a trigger rendered with `tabindex="-1"` does not open on focus until such a re-render follows its move into the tab order (Current-state impact).                                                         | Current source and tests                                                                            |
| FR5  | On touch, a completed tap opens per `touchTrigger` when the finger lifts; a touch that becomes a scroll, or a press the browser does not count as a tap, does not open it. Under `auto`, a tap that already acts leaves it shut: walking out from the tapped element, the trigger included, the innermost button, link, label, form control, option, menu item, or row or card made clickable with `useClickableContainer` decides, and an `aria-disabled` control, or a label for a disabled control, is not an action, so a disabled control's reason opens on a tap even inside a clickable row or card (DEC-1). Implementation gap: the walk ships with CLN-0024 in the next minor; until then `auto` asks only whether the trigger itself performs an action, apart from a disabled control (Compatibility and migration). A second tap on the trigger, a tap outside, or a scroll starting outside closes it. Under `pressTrigger="toggle"`, FR9 decides what a tap does and `touchTrigger` is ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                                                                            |
| FR6  | Escape closes a visible tooltip; Escape during text composition is ignored. Escape routing follows `family:overlay-dismissal`: a visible topmost tooltip in the page handles that Escape, so a layer underneath stays open for that press. Implementation gap: a tooltip rendered into another document, such as an iframe or a Picture-in-Picture window, with no layer beneath it is never closed by Escape (Current-state impact). `spec:AST-003` FR4, accepted and not yet implemented, makes an unpinned tooltip passive and gives a pinned one Escape first (Current-state impact). Outside `pressTrigger="toggle"`, pressing an uncontrolled tooltip's trigger closes it; a press that focuses a text-entry trigger reopens it through FR4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | WCAG 1.4.13; tests                                                                                  |
| FR7  | `isOpen` forces the tooltip shown or hidden, and `isOpen={true}` suppresses hover and focus hiding; a controlled tooltip answers Escape by calling `onOpenChange(false)` without hiding, and is not closed by pressing the trigger. `isDefaultOpen` opens it on mount, still dismissible. Implementation gap: with `isOpen={false}`, any focus FR4 opens on, keyboard focus or a click into a text-field trigger, still opens the tooltip and reports `onOpenChange(true)`, and Escape then only reports `onOpenChange(false)`, so it stays until focus or the pointer leaves the trigger or the tooltip, or the caller re-renders with a new `onOpenChange` (Current-state impact). `isEnabled={false}` disables triggers and drops a pending open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                                                                            |
| FR8  | `onOpenChange` reports each show and hide. `hasHoverIndication` (`auto`: a single string or number child) adds a hover cue to the inline trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                                                            |
| FR9  | With `pressTrigger="toggle"` and a trigger whose role is `button` (a `<button>` or `role="button"`), a click, a completed tap, Enter, or Space on the trigger pins the tooltip open, and the same press on a pinned tooltip closes it. Hover and keyboard focus still preview it per FR3 and FR4; on touch no preview opens and a tap pins it, while a touch that becomes a scroll pins nothing. A pinned tooltip stays open when the pointer leaves the trigger and the surface; Escape (FR6), a second press, a press outside the trigger and the surface, or focus moving outside them closes it. In a controlled tooltip a press reports the toggled value through `onOpenChange` and does not change the state itself (FR7). A press that pins or closes the layer stops at its trigger: it does not reach a clickable row, card, or container around it, or the control a label names. A trigger whose role is not `button` gets a development warning and keeps tap-only opening: a tap opens the tooltip as `touchTrigger="tap"` does, and no press pins it. A trigger whose tooltip repeats its own visible text, such as a truncated Text that is its own tab stop, may take `pressTrigger="toggle"` without being a button: a press pins it as on a button trigger, and it gets no development warning, no `aria-expanded` or `aria-controls`, and no announcement, since its text is already its content. Implementation gap: not yet built (Current-state impact). | DEC-1; WCAG 1.4.13, 2.1.1                                                                           |
| FR10 | While `pressTrigger="toggle"` wires a button trigger, the trigger carries `aria-expanded`, `true` only while pinned, and `aria-controls` naming the surface while it shows, each replacing the trigger's own value while wired and restored on cleanup; FR2's `aria-describedby` is kept. When the tooltip pins, its text is announced once through a polite live region; a preview announces nothing beyond the description. Implementation gap: not yet built (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-1; WAI-ARIA 1.2 `aria-expanded`                                                                 |
| FR11 | A press inside an open Tooltip surface acts only within that surface: it never activates the trigger, a clickable container around it, or the control a label names. A tooltip that renders inside a FileInput dropzone, a ClickableCard, an Item row, or a `<label>` keeps a click on its text from opening the file picker, activating the container, or toggling or focusing the labelled control. The press still reaches page-level listeners, so a menu or Typeahead inside the surface keeps working.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Tooltip` FR9 (a pinning press stops at its trigger); the one-tap-one-action tap strategy |

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
- **AR6 — A pinned tooltip is a toggletip.** Under `pressTrigger="toggle"` the
  trigger is a named button that reports `aria-expanded` and `aria-controls`
  (FR10), apart from FR9's trigger whose tooltip repeats its own text; keyboard and touch users pin and close the tooltip without hover
  (FR9); it is announced once when it pins (FR10); and it persists until
  Escape, a second press, a press outside, or focus leaving (FR9, WCAG 1.4.13).
  Implementation gap: not yet built.

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

| Contract            | Verification                                                                                                                                                                                                      | Representative states                                                                                                                                                                                                                                                                       | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                   | Audit section                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1                 | `Tooltip.test.tsx` role/content suite                                                                                                                                                                             | Rendered surface and supplied content                                                                                                                                                                                                                                                       | Removing the surface or content fails existing tooltip role and text assertions.                                                                                                                                                                                                                                                                                                                                  | `audit:Tooltip/anatomy`       |
| FR2–FR8             | `Tooltip.test.tsx`; `useTooltip.test.tsx`                                                                                                                                                                         | Hover, focus, tap, Escape, controlled, default open                                                                                                                                                                                                                                         | Wrong open or close for an input fails.                                                                                                                                                                                                                                                                                                                                                                           | `audit:Tooltip/behavior`      |
| AR1–AR4             | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`; `TooltipHoverBridge.a11y.chromium.spec.ts`; `TooltipFocusReturn.a11y.chromium.spec.ts`                                                                  | Real-browser hover bridge and focus return                                                                                                                                                                                                                                                  | A tooltip that vanishes on the way to it or strands focus fails.                                                                                                                                                                                                                                                                                                                                                  | `audit:Tooltip/accessibility` |
| AR5                 | `Tooltip.a11y.test.tsx`; `Tooltip.a11y.chromium.spec.ts`                                                                                                                                                          | Wrapped, text, anchor, and hook triggers                                                                                                                                                                                                                                                    | A lost role, description, keyboard-focus show, or Escape dismissal fails; focus-leave hide, hover show, and leave hide run as advisory rows (Current-state impact).                                                                                                                                                                                                                                               | `audit:Tooltip/accessibility` |
| FR5                 | `Tooltip.test.tsx` touch suite; `TouchTrigger.a11y.chromium.spec.ts`; `useTouchTrigger.test.ts` and `touchTriggerTargets.test.tsx` disabled-control cases, with tap-destination cases an evidence gap until built | Tap open, scroll, second tap, tap outside; a trigger inside a link, a clickable row, or a clickable card; a trigger in running text; a disabled control inside a clickable row                                                                                                              | A tap that fails to open or close as stated, opens the tooltip on a tap that already acts, or leaves a disabled control's reason shut fails.                                                                                                                                                                                                                                                                      | `audit:Tooltip/behavior`      |
| FR9, FR10, AR6      | Evidence gap until built: a press-toggle suite in `Tooltip.test.tsx` and `useTooltip.test.tsx`, and a real-touch and keyboard case in `TouchTrigger.a11y.chromium.spec.ts`                                        | Click, Enter, Space, and tap pin; second press, press outside, focus leaving, and Escape close; pointer leave keeps the pin; controlled; non-button trigger; a truncated Text trigger whose tooltip repeats its text; a toggle trigger inside a ClickableCard, an Item row, and a `<label>` | A press that does not pin or close as stated, a pin lost on pointer leave, a missing or stale `aria-expanded` or `aria-controls`, a second announcement, a non-button trigger without the warning or its tap fallback, an own-text trigger that warns, gets `aria-expanded`, or is announced, or a pinning press that also activates the card, row, or labelled control around the trigger, fails.                | `audit:Tooltip/behavior`      |
| FR11                | `Tooltip.test.tsx` surface-press suite; `FileInputTooltipPress.a11y.chromium.spec.ts`                                                                                                                             | A tooltip inside a clickable container and inside a `<label>`; FileInput compact and dropzone status tooltips, with a click on the empty dropzone as the positive control                                                                                                                   | A click on tooltip text that runs the container's click handler, checks or focuses a labelled control, or opens the file picker fails.                                                                                                                                                                                                                                                                            | —                             |
| DEP-0016, CLN-0024  | Evidence gap until built: the codemod's tests and fixtures beside its transform, and the codemod verify workflow                                                                                                  | `touchTrigger="tap"` on an icon and a span, and on an own-text trigger, an info-only button, a button with its own action, a link, and an unknown element, under each codemod; `"auto"` and `"none"`; `pressTrigger` beside `touchTrigger`; spreads and dynamic values                      | A rewrite that changes behavior; under DEP-0016's codemod, a rewritten own-text, button, link, or unknown-element site; under CLN-0024's codemod, a rewritten button, link, or unknown-element site, or an identifiable own-text site left unrewritten; a reported site without its manual-migration note (all three options for a button or link); a missed static use; or a silently skipped dynamic one fails. | `audit:Tooltip/api`           |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                     | Canonical anatomy and current target                                                                                                                                                                                                                                                        | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                           | `audit:Tooltip/theming`       |

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

### DEC-1 — A press pins the layer; a tap that already acts stays with its control

**Reference:** `component:Tooltip/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`

A tooltip keeps previewing on hover and focus, and `pressTrigger="toggle"`
adds one more open state of the same layer: a press pins it, so people on
touch, keyboard, or a screen reader can keep it open long enough to read it. A
pinned tooltip is a toggletip, so its trigger is a button that reports
`aria-expanded`. Components declare `pressTrigger="toggle"` where the tooltip
is the only home of their information, such as an info icon, a status dot, or
a timestamp.

`touchTrigger="auto"`, the default until `touchTrigger` folds into
`pressTrigger` at the next minor (CLN-0024), is the fallback. Under it, a tap
that already acts does not open the layer, so one tap does one thing: a
truncated label inside a link follows the link, while a truncated label in
running text opens its tooltip. Whether a tap acts is decided by walking out
from the tapped element: the innermost control on that path decides, whether a
button, link, label, form control, option, menu item, or row or card made
clickable with `useClickableContainer`, the trigger included. An `aria-disabled`
control, or a label for a disabled control, is not an action, so its reason
opens on a tap, even inside a clickable row or card. An element that acts only
through a role-less `onClick` is a caller fix: it needs a role.

The walk ships with the fold at the next minor (CLN-0024).
`touchTrigger="tap"` is deprecated in favor of the toggle (DEP-0016).
`component:HoverCard` DEC-1 applies the same rules, and `component:InfoTip` is
the info-icon preset over the toggle.

Rejected: a separate toggletip component, which would repeat Tooltip's and
HoverCard's previews (`architecture:public-component-api` INV21).

Rejected: judging the trigger alone, which lets one tap do two things.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, layer-system rules,
implementation steps, or system rules. It links to their owners.
