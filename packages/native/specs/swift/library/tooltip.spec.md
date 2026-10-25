---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:native-swift-library-tooltip
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
applies_to: [packages/native/apple/Sources/Astryx/Tooltip/]
verified_by:
  [packages/native/apple/Tests/AstryxTests/TooltipPresenterTests.swift]
deciding_specs: []
---

# Swift tooltip architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | `spec:AST-082` FR3: a platform honors a core prop as core does, here the tooltips core's components show through `useTooltip` and `Tooltip`, including its `touchTrigger`; `spec:AST-093` FR4.                                  |
| System behavior         | One internal modifier, `astryxTooltip`, shows every Swift component's tooltip as core's: above the view, on a resting pointer, keyboard focus, or a direct tap; hidden by a press, Escape, or leaving; never seen by VoiceOver. |
| End-user impact         | A person on an iPhone, an iPad, or a Mac reads a tooltip the same way in every component and as on the web, and a VoiceOver user hears its words once.                                                                          |
| Builder impact          | A component passes its words, its hint, and how focus and touch reach it; it does not build its own tooltip.                                                                                                                    |
| Compatibility/readiness | Internal; no public API. Draft; hover, focus, Escape, and tap are tested as logic until an app-hosted UI test exists.                                                                                                           |
| Review checks           | Reject a component tooltip built outside `astryxTooltip`, SwiftUI's `.help` anywhere in the package, a bubble VoiceOver reads, a tap that keeps an enclosing row from running, or a change that rebuilds the decorated view.    |
| Governing rules         | `spec:AST-082` FR3; `spec:AST-093` FR2, FR4.                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Purpose

Core's components show tooltips through one hook, so every tooltip on the web
opens, places, and dismisses the same way. This record states how Swift does
the same: one internal modifier that every Swift component uses, so a
component records only its words and which inputs reach its tooltip.

## System model

A component calls `astryxTooltip(_ text:, hint:, focus:, touch:, isDisabled:)`
on the view the tooltip describes.

- `text` is the tooltip's words. Blank words and a disabled view show nothing.
- `hint` is words VoiceOver reads as the hint, as core puts given tooltip words
  in the description; it is `nil` for words already in the view's name.
- `focus` says how keyboard focus reaches the tooltip, as core's
  `focusTrigger`: `none` (focus shows nothing, as on an element that is not
  focusable), `control` (the view is a control that takes focus already), or
  `tabStop` (a static view is made a tab stop while it has words, as core gives
  a static element with a tooltip a tab stop).
- `touch` says what a direct tap does, as core's `touchTrigger`: `auto` (the
  default) opens the tooltip unless the view is a control, `tap` always opens
  it, and `none` never does.

The bubble is an overlay drawn in core's tooltip look, the same on every input. SwiftUI's `.help` does not fit: it is also
the VoiceOver hint, so it reads words already in a view's name twice, and it
shows with the system's own look and delay, never on keyboard focus or a tap.

## Boundaries and invariants

- **INV1 — Placement and size.** The bubble sits `space.s1` above the view, as
  core places it, below when the bubble and its gap do not fit under the
  window's safe top plus core's `space.s4` floor, and slides sideways to stay
  inside the safe area of the window that holds the view with the same floor,
  as core's layer stays inside the viewport. Its words wrap past core's
  300-point width. The bubble draws in the view's own layer, so a scroll view
  or another clipping container around the view cuts it off, where core's top
  layer is never clipped.
- **INV2 — Pointer.** A pointer resting on the view shows the bubble after
  core's 200 ms. It stays while the pointer is on the view or on the bubble,
  hides 100 ms after the pointer leaves both, and a press hides it.
- **INV3 — Keyboard focus.** Where focus reaches the tooltip, focus the
  keyboard brings shows the bubble at once, as core's `focusin` does, and it
  hides 100 ms after focus leaves. Whether the keyboard brought focus is
  decided once, as focus arrives, as core's `:focus-visible` check is: focus
  that arrives while a pointer rests on the view, or within half a second of a
  press, shows nothing until focus leaves and returns. SwiftUI does not say who
  moved focus, so focus code moves counts as the keyboard's.
- **INV4 — Escape.** Escape hides a shown bubble wherever focus is and goes no
  further, as core's top-most layer takes the press.
- **INV5 — Touch.** `auto`, core's default, opens the tooltip on a tap unless
  the view is a control (`focus: control`), whose tap belongs to its action;
  `tap` and `none` override it, as core's. A direct tap opens the bubble at
  once; a click from a trackpad or mouse, which hovers first, opens nothing.
  The tap is a simultaneous gesture, so the view's own action and an enclosing
  row's button or link still run. Another tap on the view closes it; a tap
  anywhere but the view or the bubble, or a scroll or pinch anywhere but the
  bubble, closes it and still reaches what it lands on, as core's outside
  dismissal does.
- **INV6 — Disabled and blank.** A disabled view and blank words show no
  tooltip on any input.
- **INV7 — VoiceOver.** VoiceOver never sees the bubble, and the tap is left
  alone while VoiceOver runs; `hint` is the hint.
- **INV8 — Look.** The bubble draws body text in `color.backgroundSurface` on
  `color.textPrimary`, padded `space.s1` by `space.s2`, with
  `radius.container`.
- **INV9 — One structure.** The modifier keeps one view structure whatever its
  words or disabled state, so a change never rebuilds the view it decorates.

## Change coupling

A change to core's `useTooltip`, `Tooltip`, or `useTouchTrigger` behavior, or
to how a Swift component calls `astryxTooltip`, reviews this record. The
tooltip tests prove it stays current.

## Owning code

- `packages/native/apple/Sources/Astryx/Tooltip/TooltipPresenter.swift` — the
  modifier, the bubble, the Escape shortcut, and the outside-tap monitor.

## Deciding specs

- `spec:AST-082` FR3 — a platform honors a core prop as core does, here core's `useTooltip`, `Tooltip`, and `touchTrigger`.

## Verification

| Invariant  | Evidence                                                                                                                                                                       | Failure signal                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| INV1       | `TooltipPresenterTests.swift`: above unless no room; slides inside the window; long words wrap within 300 points                                                               | a bubble below with room above, or one line past 300 points                                                       |
| INV2       | `TooltipPresenterTests.swift`: delay and bridge; the pointer on the view or the bubble keeps it up                                                                             | a bubble that hides while hovered or shows at once on a pointer                                                   |
| INV3       | `TooltipPresenterTests.swift`: focus shows at once for `control` and `tabStop`, never for `none`; only keyboard focus                                                          | a delayed focus bubble, one on a view focus does not reach, or one a pointer's focus opens                        |
| INV5       | `TooltipPresenterTests.swift`: `auto` resolves as core's; only a direct touch on a tap trigger opens it; a gesture elsewhere closes it, one on the view or the bubble does not | a bubble from a pointer click, under VoiceOver, or on a control under `auto`; one a gesture elsewhere leaves open |
| INV6       | `TooltipPresenterTests.swift`: blank words and a disabled view show nothing                                                                                                    | a tooltip on a disabled view                                                                                      |
| INV8       | `TooltipPresenterTests.swift`: the bubble's colors and padding in two themes                                                                                                   | a bubble in other colors                                                                                          |
| INV9       | `TooltipPresenterTests.swift`: a view with a tooltip draws as it did without                                                                                                   | a decorated view that draws differently                                                                           |
| No `.help` | `TooltipPresenterTests.swift`: no Swift source uses `.help(`                                                                                                                   | a view that shows tooltip words through `.help`                                                                   |
| INV2–INV7  | Not measured: hover, focus, Escape, and tap need an app-hosted UI test, which the package lacks                                                                                | none until that test exists                                                                                       |
