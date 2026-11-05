---
schema_version: 3
template_version: 7
kind: component
id: component:ChatLayoutScrollButton
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/Chat/ChatLayoutScrollButton.test.tsx,
    packages/core/src/Chat/__tests__/ChatLayoutScrollButton.a11y.chromium.spec.ts,
    packages/core/src/Chat/__tests__/ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts,
    apps/storybook/stories/ChatLayout.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-style-authoring,
    architecture:component-theming-surface,
    architecture:theme-tokens,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029]
---

# ChatLayoutScrollButton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatLayoutScrollButton` with required `isVisible` and `onClick`, optional `label`, and root `div` passthrough, styles, and ref.                                                                                                                   |
| Behavior                | A pill holding one ghost Button. Hidden state paints nothing and leaves the tab order; a non-empty `label` expands the pill and becomes the visible text; omitted or empty renders icon-only.                                                      |
| End-user impact         | Readers who scrolled up get one control back to the newest message, which is hidden and out of the tab order when they are already there; a theme that restyles its target repaints the pill they see.                                             |
| Builder impact          | None.                                                                                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Three implementation gaps (FR1a, FR3a, FR6a) are listed under Current-state impact; eight owner questions stay open.                                                                                   |
| Review checks           | Reject a target on the centring row, a hidden pill that keeps keyboard focus, a non-empty label that is not also the accessible name, or a state that paints identically to its opposite. FR1a, FR3a, and FR6a are recorded gaps, not acceptances. |
| Governing rules         | `architecture:component-theming-surface/INV4`; `architecture:component-style-authoring/INV1, INV5`; `architecture:public-component-api/INV5, INV6, INV8`; WCAG 2.2 SC 2.4.7 and SC 2.5.8 (AA).                                                     |

This table is a review projection; the body below is authoritative.

## Intent

ChatLayoutScrollButton is the floating return-to-newest affordance for a chat
transcript. It owns the pill's appearance and its visible/hidden presentation;
it owns no scroll state. ChatLayout composes it with `useChatStreamScroll` and
`useChatNewMessages` by default, and a caller may replace or remove it through
`ChatLayout`'s `scrollButton` slot.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: visibility is a required caller input, and
  the component holds no state
- Migration decision: none; DEC-1 records where the target sits

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **An empty label leaves the control unnamed (FR1a).** `label=''` renders an
  icon-only control with an empty accessible name; WCAG 2.2 SC 4.1.2 requires a
  name (OQ7).
- **The focus ring is clipped away (FR3a).** The pill's `overflow: hidden`
  clips the Button's outset focus ring, so a focused control looks the same as
  a resting one; WCAG 2.2 SC 2.4.7 requires a visible indicator (OQ8).
- **A theme cannot address the pill's states (FR6a).** The pill's visible and
  expanded states change its paint, but the target exposes neither, so a theme
  can restyle the pill only as a whole (OQ1).

## Ownership boundary

**Owns**

- The pill surface: its fill, elevation, radius, resolved height, and the
  collapsed/expanded width ceiling.
- The visible/hidden presentation, including removal from sequential focus
  navigation while hidden.
- The default accessible name when the caller supplies no `label`.
- Centring within its parent, and the gap between the pill and what sits below.

**Does not own / non-goals**

- Scroll position, lock state, and new-message detection — owned by
  `useChatStreamScroll` and `useChatNewMessages`.
- Placement in the chat dock and whether the affordance renders at all — owned
  by `component:ChatLayout` through its `scrollButton` slot.
- Action semantics, focus ring, press feedback, size geometry, and variant
  surface — owned by `component:Button`, which this component composes.

## Public concepts

| Concept             | Closed values or states     | Meaning                                                              | Availability by variant/orientation/state | Default             | Owner                               | Stability | Invalid-value behavior                            |
| ------------------- | --------------------------- | -------------------------------------------------------------------- | ----------------------------------------- | ------------------- | ----------------------------------- | --------- | ------------------------------------------------- |
| `isVisible`         | `true`, `false`             | Whether the affordance is presented and operable                     | always                                    | required            | `component:ChatLayoutScrollButton`  | stable    | required boolean; no fallback                     |
| `label` — omitted   | `undefined`                 | Icon-only; the translated default becomes the accessible name        | always                                    | this is the default | `component:ChatLayoutScrollButton`  | stable    | —                                                 |
| `label` — non-empty | any non-empty string        | Visible text, which is also the accessible name                      | always                                    | —                   | `component:ChatLayoutScrollButton`  | stable    | —                                                 |
| `label` — empty     | `''`                        | Icon-only with an empty accessible name — see FR1a                   | always                                    | —                   | `component:ChatLayoutScrollButton`  | stable    | no fallback is applied; the control is unnamed    |
| `onClick`           | `() => void`                | Activation callback; its type declares no arguments                  | always                                    | required            | `component:ChatLayoutScrollButton`  | stable    | required; no default action                       |
| root `div`          | `BaseProps<HTMLDivElement>` | `ref`, `xstyle`, `className`, `style`, and remaining DOM passthrough | always                                    | none                | `architecture:public-component-api` | stable    | `onClick` is omitted from the inherited DOM props |

Consumer syntax and prop defaults remain in `ChatLayoutScrollButton.doc.mjs`.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                            | Basis                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| FR1  | The control MUST expose a non-empty accessible name in every reachable state.                                                                                                                                        | WCAG 2.2 SC 4.1.2                                                              |
| FR1a | `label` omitted uses the translated default; a non-empty `label` is the name. Implementation gap: `label=''` satisfies neither (Current-state impact).                                                               | Current source                                                                 |
| FR2  | While `isVisible` is false the pill MUST paint nothing and MUST NOT accept focus, programmatic or sequential.                                                                                                        | Current source and tests; WCAG 2.2 SC 2.4.7                                    |
| FR3  | While `isVisible` is true the pill MUST remain keyboard reachable and activate on Enter.                                                                                                                             | Current source and tests; WCAG 2.2 SC 2.1.1                                    |
| FR3a | A focused control MUST paint a visible focus indicator. Implementation gap: the ring is clipped away entirely (Current-state impact).                                                                                | WCAG 2.2 SC 2.4.7; `spec:AST-020/FR1`                                          |
| FR4  | A **non-empty** `label` MUST render as visible text; omitted or empty renders icon-only with no visible text.                                                                                                        | Current source and tests                                                       |
| FR5  | The pill MUST take its resolved height from the element-size token so no theme scale makes it clip the Button it wraps.                                                                                              | Current source and tests                                                       |
| FR6  | The public theming target MUST sit on the pill — the element painting fill, elevation, and radius — not on the row that centres it.                                                                                  | `architecture:component-theming-surface/INV4`                                  |
| FR6a | The target reflects neither the visible nor the expanded state that drives its paint. Implementation gap: a theme cannot address either state; whether the target should reflect them is OQ1 (Current-state impact). | Current source                                                                 |
| FR7  | The transition between states MUST collapse to `0s` under `prefers-reduced-motion: reduce`.                                                                                                                          | Current source                                                                 |
| FR8  | The collapsed control MUST be at least 24 by 24 CSS pixels.                                                                                                                                                          | WCAG 2.2 SC 2.5.8 (AA)                                                         |
| FR9  | Consumer `ref`, styles, and remaining DOM props MUST reach the component's outer element.                                                                                                                            | Current source and tests; `architecture:public-component-api/INV5, INV6, INV8` |

**FR1a — the empty-label naming gap.** `label=''` is permitted by the public
type and is what ordinary caller code produces from an empty or not-yet-loaded
string. It reaches the Button as `label=''`, `aria-label=''`, and
`isIconOnly={true}`, because `??` passes an empty string through. Button sets
its own `aria-label` only when `label !== ''`, so the caller's empty
`aria-label` survives; icon-only renders no visible text; and the chevron Icon
carries no `label`, so it is `aria-hidden="true"`. The result is a focusable,
operable control with no accessible name.

This record states the obligation and records the current behavior as violating
it. Closing the gap means choosing between falling back to the default name,
rejecting the value, or treating an empty label as a caller error — a public
API and compatibility decision that belongs to the owner. See OQ7.

**FR3a — the clipped focus ring.** The composed Button draws its focus ring as
an `outline` at a positive `outline-offset`, outside its border box. The button
fills the pill, and the pill clips with `overflow: hidden` to keep the
collapse/expand animation inside its rounded shape, so none of the ring is
painted.

Keyboard access itself is intact — the control takes focus and activates — so
this is a visibility defect, not a reachability one. The remedy is a production
change to how the pill clips or where the ring is drawn, and the choice between
those changes rendered geometry, so it needs a visual review. Recorded as OQ8.

**FR6a — the unreflected state axes.** `isVisible` selects visible/hidden
styles and `label` selects collapsed/expanded styles, both on the painting
target, and `themeProps('chat-layout-scroll-button')` is called with no state
argument. A theme can therefore restyle the pill but cannot address either
state. Naming those axes is new public theming surface, so the shape belongs to
the owner. See OQ1.

### Allowed variation

- **AV1 — Expanded width.** The labelled pill's width ceiling is a component
  design decision, not a theme value. What happens to a label past that ceiling
  is not settled here; see OQ3.
- **AV2 — Resolved geometry.** Height, radius, spacing, and duration resolve
  from theme tokens, so absolute values differ by theme without becoming
  regressions.
- **AV3 — Composition.** ChatLayout renders this by default, but a caller may
  substitute any node or remove the affordance entirely.

### Representative states

| State                     | Required invariant                                                                                           | Allowed variation                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| hidden                    | paints nothing, refuses focus, keeps its layout box (FR2)                                                    | transition duration               |
| visible, label omitted    | named from the default, focusable, at least 24 by 24 CSS pixels, no visible text (FR1, FR3, FR4, FR8)        | resolved pill size                |
| visible, non-empty label  | the label is both the visible text and the accessible name (FR1, FR4)                                        | expanded width up to the ceiling  |
| visible, empty label      | **fails FR1** — icon-only with an empty accessible name (FR1a)                                               | none; this is a recorded defect   |
| visible, hovered          | the pointer paints a state distinct from rest                                                                | the overlay the theme resolves    |
| visible, keyboard-focused | **fails FR3a** — focus is held and `:focus-visible` matches, but the ring is clipped away and paints nothing | none; this is a recorded defect   |
| visible, pressed          | the press paints a state distinct from hover and rest                                                        | the pressed treatment             |
| any visible state, themed | the documented target repaints the pill (FR6); its state axes are unreachable (FR6a)                         | which properties a theme declares |

### Performance and resources

- **PR1 — No state, no effects, no observers.** The component derives every
  rendered difference from its props during render and registers no listener,
  timer, observer, or animation frame.

## Accessibility contract

- **AR1 — Named.** The control MUST expose a non-empty accessible name in every
  reachable state (WCAG 2.2 SC 4.1.2) (FR1). Omitted and non-empty `label`
  satisfy this; `label=''` does not, and that gap is recorded as FR1a rather
  than resolved here.
- **AR2 — Focus follows paint.** A control that paints nothing MUST NOT be
  focusable, because focus landing on it would have no visible indicator
  (WCAG 2.2 SC 2.4.7). `opacity` and `pointer-events` do not achieve this;
  `visibility` does (FR2).
- **AR3a — Focus is visible.** A focused control MUST paint a focus indicator
  (WCAG 2.2 SC 2.4.7). The ring is declared but clipped away; recorded as FR3a
  rather than resolved here.
- **AR3 — Target size.** The collapsed control MUST be at least 24 by 24 CSS
  pixels (WCAG 2.2 SC 2.5.8 AA) (FR8).
- **AR4 — Reduced motion.** The state transition MUST collapse to `0s` under
  `prefers-reduced-motion: reduce` (FR7).
- **AR5 — Translated strings.** The default accessible name MUST resolve through
  the translator catalog, never a literal.

## Design relationships

| Anatomy or state | Design requirement                          | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------- | ------------------------ | -------------- | ------------------ |
| pill surface     | floating affordance over the transcript     | unsettled                | supporting     | FR5, FR6           |
| hidden state     | absent rather than dimmed                   | unsettled                | supporting     | FR2, AR2           |
| labelled state   | text accompanies the glyph on the same pill | unsettled                | supporting     | FR4                |

The component implements design requirements without copying their rationale.
An `unsettled` representation remains a human decision; principles do not let an
agent invent the answer. No `authority: current` design record covers a floating
scroll affordance today, so these rows record the gap rather than a requirement.

## Family and system relationships

- `family:buttons` owns the action surface this component composes through
  `component:Button`. This component is not a member: its public purpose is a
  transcript affordance that contains a button, and the family's membership rule
  excludes components that merely use a Button as an action slot. See OQ4.
- `architecture:component-theming-surface` owns the target/anatomy relationship
  this component's theming must satisfy; FR6 adopts INV4 directly.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract       | Verification                                                                                                                                                                                                                                                                                        | Representative states                  | Mutation or failure expectation                                                                            | Audit section                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1, FR4       | `ChatLayoutScrollButton.test.tsx` role/name and visible-text cases                                                                                                                                                                                                                                  | label omitted; non-empty label         | dropping `isIconOnly` renders the translated name as clipped visible text, and the name case still passes  | `audit:ChatLayoutScrollButton/a11y`       |
| FR1a           | No focused test; read from source across three files (`??` passing `''` through, Button's `label !== ''` guard, the Icon's decorative default).                                                                                                                                                     | label empty                            | a fallback added here would make the derivation stale without any test failing                             | `audit:ChatLayoutScrollButton/a11y`       |
| FR2, FR3       | `ChatLayoutScrollButton.test.tsx` tab cases; `ChatLayoutScrollButton.a11y.chromium.spec.ts`                                                                                                                                                                                                         | hidden at rest; scrolled up; re-hidden | replacing `visibility` with `opacity` alone leaves the invisible control in the tab order                  | `audit:ChatLayoutScrollButton/a11y`       |
| FR3a           | `ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts` interaction pass: the focused frame's bytes are compared with a rest frame captured from the same page, and the ring's outward reach is measured against the clipping ancestor's room (recorded as `ringChangedPixels`, `outreach`, `roomPx`) | collapsed and labelled, light and dark | the result is recorded and annotated, never asserted, so repairing the clip cannot turn this check red     | `audit:ChatLayoutScrollButton/a11y`       |
| FR5            | `ChatLayoutScrollButton.a11y.chromium.spec.ts` two-theme geometry pair                                                                                                                                                                                                                              | neutral and butter                     | a literal height lets a larger element scale clip the Button the pill wraps                                | `audit:ChatLayoutScrollButton/theming`    |
| FR6            | `ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts` placement and probe-theme reach tests                                                                                                                                                                                                         | visible, collapsed, neutral and probe  | moving the target back to the centring row leaves the pill unchanged under the probe theme                 | `audit:ChatLayoutScrollButton/theming`    |
| FR6a           | source: `themeProps()` is called with no state argument, and `Chat.doc.mjs` declares the target with no `visualProps`/`states`                                                                                                                                                                      | visible/hidden; collapsed/expanded     | adding either axis is new public theming surface, so no test may assert its shape before the owner decides | `audit:ChatLayoutScrollButton/theming`    |
| hover, pressed | `ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts` interaction pass — each frame asserts the pseudo-class matched and that the captured bytes differ from a rest frame of the same page                                                                                                          | collapsed and labelled, light and dark | a frame captured after release, or with the pointer elsewhere, fails its own engagement assertion          | `audit:ChatLayoutScrollButton/design`     |
| FR8            | `ChatLayoutScrollButtonSurface.a11y.chromium.spec.ts` measured target box                                                                                                                                                                                                                           | visible, collapsed                     | a smaller resolved size drops the control below the AA minimum                                             | `audit:ChatLayoutScrollButton/a11y`       |
| FR9            | `ChatLayoutScrollButton.test.tsx` passthrough case                                                                                                                                                                                                                                                  | any                                    | dropping `...rest` silently discards `data-*`, `id`, and ARIA the caller set                               | `audit:ChatLayoutScrollButton/public-api` |

Read from source, with no focused test yet:

- FR1a: `label=''` producing an empty accessible name.
- FR6a: the target reflecting no state.
- FR7: the transition collapsing to `0s` under reduced motion.

## Decision log

### DEC-1 — The public theming target rides the pill, not the row that centres it

**Reference:** `component:ChatLayoutScrollButton/DEC-1`
**Decider:** `cixzhang`, `2026-09-23`

The component renders two elements: a full-width row that centres the pill and
holds the gap below it, and the pill, which paints the fill, elevation, and
radius. The public target sits on the pill, the element a theme restyles, as
`architecture:component-theming-surface/INV4` requires. Consumer `ref`, styles,
and DOM props stay on the outer row (FR9).

Rejected: a second target for the pill — new theming surface for one painted part.

Rejected: moving consumer passthrough to the pill — it changes where a caller's `id` and ref resolve.

## Open questions

- **OQ1 — Should the target reflect its style-driving states?** (`human-api`)
  The pill selects between visible/hidden and collapsed/expanded style objects,
  and `themeProps` reflects neither, so a theme cannot address either state.
  Exposing them means adding `visualProps`/`states` to a public target, which is
  new theming surface rather than a repair.
- **OQ2 — Is `isVisible` the right name on a non-layer component?** (`human-api`)
  The shared convention reserves `isOpen`/`isVisible` for layer components. The
  prop is released in `@astryxdesign/core@0.6.3`, so any change is breaking and
  needs a compatibility decision.
- **OQ3 — What should happen to a label past the expanded ceiling?** (`human-design`)
  The pill clips at its width ceiling with no ellipsis and no wrap. The
  accessible name survives, so only sighted readers lose text, and locale
  expansion is the realistic trigger. No `authority: current` design record
  covers truncation for this surface.
- **OQ4 — Does this component belong to `family:buttons`?** (`human-api`)
  Its public purpose is a transcript affordance, and it is absent from the
  family's member list, but it is a single composed Button with no other
  content. The family contract's exclusion for "components that merely use a
  Button as a trigger or action slot" is the reading applied above.
- **OQ5 — Is animating the pill's `max-width` acceptable?** (`human-design`)
  Expanding and collapsing animates a layout property. Reduced motion is
  honored and the subtree is one button, but the record that would govern
  animated properties, `design:motion`, is `authority: draft`.
- **OQ6 — The consumer doc has no anatomy inventory.** (`human-api`)
  `architecture:component-theming-surface` records this as open migration work
  across Core, so no `### Theming anatomy` block is written here: there are no
  published anatomy names for it to map.

- **OQ8 — How should the focus ring escape the pill's clip?** (`human-design`)
  The pill needs `overflow: hidden` for its collapse/expand animation, and the
  Button's ring is drawn outside its border box, so the two are in direct
  conflict. Candidate answers — inset the button so the ring fits, draw the
  ring on the pill, or clip on a different element — each change rendered
  geometry and belong to a visual review.
- **OQ7 — What should `label=''` do?** (`human-api`)
  It produces an unnamed control (FR1a). The candidate answers — fall
  back to the translated default, reject the value in the type, or treat it as
  a caller error — are a public API and compatibility decision on a released
  prop, so this record states the gap without choosing one.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
