---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-055
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-02
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:public-component-api,
    architecture:layer-runtime,
    architecture:interaction-modality,
  ]
affects_families: [family:overlay-dismissal]
affects_contributing: [contributing:api-conventions]
affects_consumer_docs: [DropdownMenu, ComplexSelector, MultiSelector]
review_triggers: [public-api, accessibility, behavior, styling]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/ComplexSelector/ComplexSelector.test.tsx,
    packages/core/src/MultiSelector/MultiSelector.test.tsx,
  ]
---

# Caller-rendered overlay trigger system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": ["FR1", "FR2", "FR3", "FR7", "FR8", "DEC-1", "DEC-4"],
    "accessibility": ["AR1", "AR2", "AR3", "AR4"],
    "styling": ["FR4", "FR5", "FR6", "DEC-2", "DEC-3"]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One shape for every component that lets a caller supply the control opening its overlay: a render prop. The component calls the caller's function with one props object and renders what it returns, unwrapped. The props object's type is exported. The prop is named `renderTrigger` (DEC-5). No existing shipped prop changes.                                                                                                                                                                     |
| Behavior                | The caller owns the element; the component owns the behavior it hands back. Spreading the given props is the whole integration. Both a built-in control and the render prop given, the caller's control wins and a development warning fires. Hover and pressed paint stay the caller's CSS; the open state reaches CSS through `aria-expanded`.                                                                                                                                                      |
| End-user impact         | Someone operating an icon button, a chip, an avatar, or a list row that opens a menu or picker gets the system's keyboard opens, press model, focus return, and disclosure semantics instead of whatever a hand-rolled copy kept. Nothing changes for a caller who keeps the built-in control.                                                                                                                                                                                                        |
| Builder impact          | A builder supplying the control renders one element and spreads one object onto it; no `ref` plumbing, no ARIA to re-derive. New caller responsibility: the control's own hover, pressed, and focus paint, and its open-state style keyed to `aria-expanded`. A control that cannot take focus needs the component's documented alternative path (AR4).                                                                                                                                               |
| Compatibility/readiness | Additive: the render prop is absent by default and every current built-in-control path is unchanged. Authority: `current`; `cixzhang` approved this record on 2026-10-02. One owner question remains open (OQ3), and it does not change FR1–FR8 or AR1–AR4. Real-browser evidence for the focus ring and the overlay's position against the caller's control is not yet recorded.                                                                                                                     |
| Review checks           | Reject a caller-supplied control rendered inside a component-owned `<button>`, link, or `tabindex` host; a caller's control wrapped in a box-less element the component then anchors or paints focus against; disclosure ARIA missing from the handed-back props; hover or pressed paint the component writes onto an element it does not render; both controls rendering, or a silently dropped one.                                                                                                 |
| Governing rules         | [`spec:AST-002`](../AST-002/spec.md) FR4, FR15, FR16 and `spec:AST-002/DEC-1` for admission and one responsibility per input; [`architecture:public-component-api`](../../architecture/public-component-api.md) INV2, INV3, INV5 for the shared naming and pass-through grammar; [`architecture:layer-runtime`](../../architecture/layer-runtime.md) for anchoring the overlay to the trigger; [`family:overlay-dismissal`](../../families/overlay-dismissal.md) for dismissal order, unchanged here. |

This table is a review projection; the body below is authoritative.

## Intent

A menu or a picker often has to open from a control the design system does not
own: an icon button in a toolbar, an avatar, a chip, a glyph inside a list row
that is itself a link. Astryx components paint their own control, so a builder
in that position hand-rolls the overlay — anchoring, dismissal, focus return,
keyboard opens, ARIA — and every copy drifts. The person using the product then
meets a different keyboard path and whatever accessibility the copy kept.

This record owns one answer for that case, across components: **the caller
renders the control, and the component hands back the props that make it work.**
It states the shape, what the handed-back props must carry, where the styling
boundary falls, and the accessibility the arrangement must keep.

Four draft component records are each writing their own decision for this same
fact in flight. One fact has one owner (`architecture:knowledge-contracts`
INV2), so the decision lives here and those records cite it.

## Ownership boundary

**Owns**

- The shape a component uses when a caller supplies the control that opens the
  component's overlay: a render prop, not a content slot and not a wrapper.
- What the handed-back props object must carry, and that spreading it is
  sufficient.
- Where the styling boundary falls between the caller's element and the
  component, and how the open state reaches the caller's CSS.
- The accessibility contract for the arrangement: disclosure state, one
  interactive element, focus return, and a complete keyboard path.
- The resolution when a component offers both a built-in control and this prop.

**Why no existing record can hold it**

- [`architecture:public-component-api`](../../architecture/public-component-api.md)
  is `current` and approved. A record carries one `authority` value, so adding
  these unapproved claims to it would present them as approved
  (`architecture:knowledge-contracts` INV1, INV5). That record also holds the
  shared API grammar and links its human rulings as `deciding_specs`
  (`spec:AST-002/DEC-1`, `spec:AST-005/DEC-1`, `spec:AST-012/DEC-1`); a new
  cross-component ruling belongs in the spec it links, not inside it. Its own
  INV18/DEC-7 boundary keeps observable caller-visible behavior in a product
  contract.
- [`spec:AST-002`](../AST-002/spec.md) is `current`, with the same authority
  problem, and owns a different fact: whether a public API is admitted at all,
  and the naming of operations and functions. This record sits downstream of
  AST-002 FR4 — it says which composition seam a caller-supplied control uses
  once admission has been passed.
- [`family:overlay-dismissal`](../../families/overlay-dismissal.md) owns how an
  overlay closes, not how it opens or who renders the control. The adopters here
  are not one sibling family either: they span menus, context menus, and
  pickers.
- The four component records in flight would each hold a private copy of this
  decision, which INV2 forbids.

## Non-goals

- A trigger **region** that wraps arbitrary caller content and responds to a
  contextual gesture, such as `ContextMenu`'s right-click area. That is a
  different fact: no control is supplied, no props are handed back, and the
  overlay is anchored to the pointer rather than to a rect. OQ3 asks the owner
  to confirm that boundary.
- Non-interactive trigger **content** rendered inside a control the component
  owns, such as `Collapsible`'s `trigger: ReactNode` inside its own `<button>`.
  That shape stays valid for content and is unchanged; FR3 only forbids using it
  for a caller-supplied control.
- The system-wide `render<X>` prefix rule itself (DEC-6): this record follows it; `spec:AST-002` and the API Conventions page own it.
- Hook-shaped trigger APIs (FR8).
- Anchoring, dismissal order, the press model, focus trapping, and overlay
  anatomy. Their owners are linked, not restated.
- Equivalent internal implementations remain valid when they satisfy this
  contract. Internal modules, files, function names, algorithms, data
  structures, storage layouts, manifests, journals, locks, transaction
  protocols, and CI job/workflow topology belong in architecture or
  implementation unless callers or interoperating systems intentionally depend
  on that exact mechanism as a public protocol.

## Public API and concepts

| Concept                 | Closed values or states                    | Meaning                                                                                                                    | Default          | Owner                  | Stability |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------- | --------- |
| caller-rendered mode    | prop absent, prop present                  | Absent: the component renders its own control and chrome. Present: the caller's control replaces them.                     | absent           | `spec:AST-055`         | proposed  |
| the render prop         | `(props: <Name>TriggerProps) => ReactNode` | The caller's function; the component calls it and renders the result unwrapped                                             | —                | `spec:AST-055`         | proposed  |
| handed-back props       | one object, spread onto one element        | Ref/anchor, `id`, the opening and toggling handlers, and the disclosure ARIA of AR1; see FR2                               | —                | `spec:AST-055`         | proposed  |
| open state in CSS       | `aria-expanded="true"` / `"false"`         | The only system-supplied signal a caller styles the open state from; the component writes no paint on the caller's element | `false`          | `spec:AST-055`         | proposed  |
| hover and pressed paint | caller's own CSS                           | Not supplied by the component, because the component does not render the element                                           | none             | the caller             | proposed  |
| both controls given     | caller's control renders                   | The caller's control wins; a development warning fires; the component's own control and its chrome do not render           | caller's control | `spec:AST-055`         | proposed  |
| hook trigger props      | `triggerProps`, `getTriggerProps`          | A hook's return value, a separate convention, unchanged by this record                                                     | —                | the owning hook record | stable    |

## Requirements

### Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                                                | Verification state                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR1 | A component that lets a caller supply the control which opens its overlay MUST take that control as a render prop named `renderTrigger` (DEC-5): a function the component calls with one props object, whose returned element the component renders as given. The component MUST NOT wrap the returned element in an element of its own, and MUST NOT require a particular tag or a particular Astryx component.           | DEC-1; `spec:AST-002` FR4                                                                            | Accepted; jsdom evidence pending         |
| FR2 | Spreading the handed-back props onto one element MUST be the whole integration. The object MUST carry the ref or anchor the overlay positions against, the `id` AR1 needs, every handler that opens, toggles, and closes the overlay from that control on the component's supported input paths, and the disclosure attributes of AR1. The object's type MUST be exported from the component's public entry point.         | DEC-1; `architecture:public-component-api` INV1, INV5                                                | Accepted; jsdom evidence pending         |
| FR3 | A caller-supplied control MUST NOT be taken as a `ReactNode` slot that the component renders inside an interactive element of its own. Callers routinely pass an interactive component, and that shape nests one interactive element inside another (AR2). A content slot rendered inside a component-owned control remains valid for non-interactive content and is unchanged.                                            | DEC-1; AR2                                                                                           | Accepted; jsdom evidence pending         |
| FR4 | The caller's control MUST own a box. A component MUST NOT render it inside a wrapper with no box of its own (`display: contents`), and MUST NOT depend on such a wrapper where it paints or offsets a focus indicator on the trigger, or positions the overlay against the trigger's rect: there is no rect to anchor to and no box on which to paint. FR1 removes the need for any wrapper.                               | DEC-2; `architecture:layer-runtime` anchor contract                                                  | Accepted; real-browser evidence required |
| FR5 | Hover, pressed, and every other pointer paint on the caller's control MUST remain the caller's own CSS. The component MUST NOT write paint onto an element it does not render. The component MUST publish the overlay's open state on the handed-back props as `aria-expanded`, so a caller styles the open state from the rendered attribute and no additional public API is added for it.                                | DEC-3; `spec:AST-002` FR1, FR2                                                                       | Accepted; jsdom evidence pending         |
| FR6 | The prop's consumer documentation MUST show styling the open state from `aria-expanded` on the caller's control, and MUST state that a pressed look keyed to `:active` is not a substitute, because `:active` does not behave the same under a finger, and press paint follows `spec:AST-094` FR11's profiles instead.                                                                                                     | DEC-3; no current core component styles off `aria-expanded`, so callers have no example to copy      | Accepted; documentation evidence pending |
| FR7 | Where a component offers both a built-in control and this prop, exactly one control MUST render. The caller's control MUST win, identically in every presentation the component supports, and a development warning MUST fire; the component's own chrome for the replaced control MUST NOT render. Silently ignoring a supplied prop, or rendering both, is rejected.                                                     | `spec:AST-002` FR15 (never silently render a broken state); `architecture:public-component-api` INV3 | Accepted; jsdom evidence pending         |
| FR8 | A hook that returns props for a trigger — `triggerProps` and `getTriggerProps` on `useLightbox`, `usePopover`, `useMenuHover`, and `useHoverCard` — follows hook conventions and is unchanged by this record. Those return-value names are NOT precedent for a component prop's name or shape. This record does not require a hook to grow a render prop, nor a component to republish its trigger props as a hook return. | DEC-4                                                                                                | Settled by DEC-4; no code change         |

### Accessibility contract

- **AR1 — The caller's control carries the disclosure.** The handed-back props
  MUST put `aria-haspopup` naming the overlay's kind, `aria-expanded` carrying
  its open state, and `aria-controls` naming its element on the caller's
  control. Where the overlay takes its accessible name from that control, the
  props MUST also carry the `id` the overlay's `aria-labelledby` points at; a
  component that names its overlay another way, such as its own `label`, states
  that in its own record instead.
- **AR2 — One interactive element, one focus ring.** The caller's control MUST
  be the only interactive element for opening the overlay. The component MUST
  NOT add a `<button>`, a link, or a `tabindex` host around it: a control inside
  a control is invalid HTML, and it breaks keyboard operation and screen-reader
  announcement. The control's own focus ring MUST be the visible focus
  indicator, which requires the box FR4 preserves.
- **AR3 — Focus returns to the control.** Closing the overlay by any supported
  route — a selection, Escape, a light dismiss, or an imperative handle — MUST
  return focus to the caller's control while that control is still in the
  document.
- **AR4 — Every supported configuration keeps a complete keyboard path.** A
  caller's control that can take focus MUST open and operate the overlay from
  the keyboard exactly as the built-in control does. Where the component
  supports a control that cannot take focus, it MUST supply and document another
  complete keyboard path to open and operate the overlay; it MUST NOT present a
  pointer-only configuration as supported.

### Platform support

- Supported feature/engine floor: every supported renderer and every supported
  browser. Nothing here is behind a capability check.
- Unsupported behavior: a caller's control that cannot take focus degrades under
  AR4's documented alternative path, never into a pointer-only overlay.
- Browser evidence: FR4 and AR2 are layout and paint claims — the focus ring on
  the caller's control, and the overlay's position against that control's rect.
  jsdom has neither layout nor paint, so real-Chromium evidence is required for
  them. The remaining requirements are provable in jsdom.

## Current-state impact

- `architecture:public-component-api` gains `spec:AST-055` in its
  `deciding_specs` and a line in its `Deciding specs` list when this record
  becomes `current`. No invariant of that record changes: FR1–FR8 sit inside its
  INV2, INV3, and INV5 grammar rather than amending it.
- `contributing:api-conventions` gains the render-prop composition rule for a
  caller-supplied control, spelled `renderTrigger` (DEC-5). The system-wide
  `render<X>` prefix rule (DEC-6) lands in `spec:AST-002` and the API
  Conventions page, not here.
- `component:DropdownMenu`, `component:ComplexSelector`, and
  `component:MultiSelector` cite this record instead of each recording a private
  copy of the same decision. Their consumer docs gain the `aria-expanded`
  styling guidance FR6 requires.
- `family:overlay-dismissal`, `architecture:layer-runtime`, and
  `architecture:interaction-modality` are read, not changed: dismissal order,
  anchoring, and modality keep their owners.
- No shipped public API changes. Every component keeps its built-in control and
  its current default.
- While this record is `draft` its `review-applicability:v1` block routes
  nothing: global routing loads `current` claims only
  (`architecture:knowledge-contracts` INV20). It becomes live on approval.

## Verification

| Contract      | Verification                                                                                                                  | Representative states                                                                                 | Mutation or failure expectation                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| FR1, FR3, AR2 | Per-component caller-rendered-trigger suites in `DropdownMenu.test.tsx`, `ComplexSelector.test.tsx`, `MultiSelector.test.tsx` | The caller returns an interactive component; the caller returns a non-button element                  | A component-owned interactive ancestor, or a second element with a role for opening, fails: the rendered tree must hold exactly one. |
| FR2           | The same suites, spreading the object and adding nothing else                                                                 | Open by pointer, open by keyboard, toggle closed, anchor resolved                                     | A prop the caller must supply by hand, or a missing exported props type, fails.                                                      |
| FR4, AR2      | Real-Chromium evidence beside the owning component's suites                                                                   | Keyboard focus on the caller's control; the overlay positioned against it                             | A focus ring with no box to paint on, or an overlay that loses its anchor rect, fails. Not provable in jsdom.                        |
| FR5, FR6      | The same suites plus the component's consumer-doc checks                                                                      | Open and closed; a caller styling the open state from `aria-expanded`                                 | Component-written hover or pressed paint on the caller's element, or a prop documented without the `aria-expanded` route, fails.     |
| FR7           | The same suites, both controls supplied, in every presentation the component supports                                         | Pointer presentation and touch presentation                                                           | Two rendered controls, a silently dropped prop, or a presentation that resolves the other way, fails.                                |
| AR1, AR3      | The same suites                                                                                                               | Closed, open, named overlay; close by selection, Escape, light dismiss, and handle                    | A missing disclosure attribute, an unnamed overlay, or focus landing on `<body>` after close, fails.                                 |
| AR4           | The owning component's keyboard suite                                                                                         | A focusable caller control; a caller control that cannot take focus, where the component supports one | A configuration reachable only by pointer, or an undocumented alternative path, fails.                                               |
| FR8           | Source inspection of the named hooks                                                                                          | `useLightbox`, `usePopover`, `useMenuHover`, `useHoverCard`                                           | A hook return renamed or reshaped to match a component prop fails: this record changes none of them.                                 |

Known verification gap: the per-component suites and the real-Chromium evidence
named above do not exist on `main` yet. This record is `draft` and does not
govern review until they do and the owner approves it.

## Decision log

### DEC-1 — A caller-supplied overlay control is a render prop

**Reference:** `spec:AST-055/DEC-1`
**Decider:** `cixzhang`, `2026-10-02`

The caller renders the control; the component hands back the props that make it
work. Spreading those props on one element is the whole integration, so the
builder writes no `ref` plumbing and re-derives no ARIA, and the person using
the product gets the system's keyboard opens, focus return, and disclosure
semantics on an icon button, a chip, an avatar, or a list row.

Rejected: a content slot on the `Collapsible` pattern — `trigger: ReactNode`
rendered inside a component-owned `<button>`. Callers routinely pass an
interactive component; a button inside a button is invalid HTML and breaks both
keyboard operation and screen-reader announcement, so that shape cannot serve
this case at all. The slot shape remains correct for non-interactive trigger
content.

### DEC-2 — The trigger owns a box

**Reference:** `spec:AST-055/DEC-2`
**Decider:** `cixzhang`, `2026-10-02`

A caller's control keeps a box of its own, and the component renders no wrapper
around it.

Rejected: `display: contents` on a trigger wrapper. A box-less element gives the
focus indicator nothing to paint on and the overlay no rect to anchor against,
so keyboard users lose the visible focus the control is supposed to show and the
overlay loses its position. This rejection is about a wrapper the component
renders around a caller's control and about a component that anchors or paints
against it; a trigger region that anchors to the pointer instead is a different
case (OQ3).

### DEC-3 — Pointer paint stays with the caller; the open state is `aria-expanded`

**Reference:** `spec:AST-055/DEC-3`
**Decider:** `cixzhang`, `2026-10-02`

The caller owns the element, so hover and pressed states are the caller's own
CSS. The one thing the caller cannot know is whether the overlay is open, and
the handed-back props already carry it as `aria-expanded`, so the open state
reaches CSS through the rendered attribute instead of through new public API.

Because no current core component styles off `aria-expanded` — every current use
only emits the attribute — the route has no in-repo example to copy, so FR6
requires it to be documented on the prop. The same documentation states that
`:active` is not a substitute: it does not behave the same under a finger,
which is why press paint follows `spec:AST-094` FR11's profiles instead of
`:active`.

### DEC-4 — Hook trigger props are a different convention

**Reference:** `spec:AST-055/DEC-4`
**Decider:** `cixzhang`, `2026-10-02`

`useLightbox` returns `triggerProps` and `getTriggerProps`; `usePopover`,
`useMenuHover`, and `useHoverCard` return `triggerProps`. That matches hook
conventions, where a returned object of props to spread is the normal shape, and
it stays exactly as it is.

Rejected: reading those return-value names as precedent for a component prop's
name or shape. A hook hands back a value the caller destructures; a component
prop hands the caller a callback. They are different conventions, and neither
one settles the other.

### DEC-5 — The prop is named `renderTrigger`

**Reference:** `spec:AST-055/DEC-5`
**Decider:** `cixzhang`, `2026-10-02`

`render*` is the existing convention for function-valued public component
props, with no counterexample in core: `renderOption`, `renderValue`,
`renderItem`, `renderToken`, `renderContent`, `renderSelectionLabel`,
`renderLineContent`, `renderExpanded`, `renderGroupHeader`, `renderCell`,
`renderTooltip`, `renderHoverCard`, `renderMenu`, `renderOverlay`. A bare noun
holding a function appears only inside config objects a caller passes, never as
a public component prop.

Rejected: a bare `trigger`. It reads well at a callsite, but the name is
already public in the system with a different shape — `Collapsible`'s
`trigger: ReactNode` — so reusing it for a function would give one name two
shapes, which `spec:AST-002` FR16 and `architecture:public-component-api` INV2
both push against. The builder reading `renderTrigger` also knows from the name
alone that a function is expected.

### DEC-6 — `render<X>` is the prefix for every render prop

**Reference:** `spec:AST-055/DEC-6`
**Decider:** `cixzhang`, `2026-10-02`

A public component prop whose value is a function returning rendered output is
named `render<X>`. The convention was already near-universal; this writes it
down so a builder can predict the name and a reviewer can cite it instead of
re-arguing it.

This record follows the rule rather than owning it: a naming rule for public
API is `spec:AST-002`'s fact — it already owns operation and function naming in
FR11 and FR17 — together with the API Conventions page's `Prop Naming` section,
which today rules on booleans, callbacks, enums, direction, and HTML collisions
but says nothing about function-valued props. Both owe an amendment carrying
this rule; until they carry it, cite this decision.

## Open questions

- **OQ3 — Does a trigger region that wraps arbitrary content fall inside this record?** (`human-api`)

  `ContextMenu` does not take a control: it wraps caller content in an element of
  its own and opens on a contextual gesture, anchored to the pointer rather than
  to the wrapper's rect, and it paints no focus ring on that wrapper. Open pull
  request #6839 proposes making that wrapper inline or box-less so a reference
  inside prose can own a context menu.

  Non-goals reads that as a different fact, outside FR1 and outside DEC-2's
  rejection, because neither of DEC-2's two reasons — nothing to paint a focus
  ring on, no rect to anchor to — applies when the component paints no ring and
  anchors to the pointer. The owner is asked to confirm that boundary, or to pull
  trigger regions inside this record, in which case FR1 and FR4 need a stated
  exception for them.

## Content boundary

This record does not duplicate any component's anatomy, prop table, theming
targets, or consumer examples; the overlay positioning and anchor-name contract
in `architecture:layer-runtime`; the dismissal and Escape ordering in
`family:overlay-dismissal`; the press model in
`module:DropdownMenu/useMenuPress`; or the admission argument in
`spec:AST-002`. It links their canonical owners.
