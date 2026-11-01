---
schema_version: 3
template_version: 7
kind: component
id: component:ClickableCard
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    theming,
    accessibility,
    interaction,
    navigation,
    testing,
  ]
verified_by:
  [
    packages/core/src/ClickableCard/ClickableCard.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.chromium.spec.ts,
    packages/core/src/__tests__/CardPress.a11y.chromium.spec.ts,
    packages/core/src/hooks/useClickableContainer.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/ClickableCard.stories.tsx,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-005, spec:AST-009, spec:AST-085]
---

# ClickableCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A Card with a required `label` and either `onClick` (action) or `href` (navigation), plus `isDisabled` and Card's padding, variant, elevation, and size inputs.                       |
| Behavior                | A visually hidden native button or link owns the card's action; the whole card surface activates it, while nested controls and selected text keep their own outcomes.                 |
| End-user impact         | People can activate a card from anywhere on it, by pointer or keyboard, and a disabled card stays reachable and announced while doing nothing.                                        |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                          |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact.                                             |
| Review checks           | Reject a live destination while disabled, duplicate activation, activation from a nested control or selected text, a destination that skips the shared decision, or lost focus paint. |
| Governing rules         | `family:navigation-destinations/FR1,FR3–FR5`; `architecture:interaction-modality/INV2–INV5`; `architecture:public-component-api/INV5–INV8`; `spec:AST-085` FR1, FR2, FR5, FR6.        |

This table is a review projection; the body below is authoritative.

## Intent

ClickableCard turns a Card surface into one action or navigation target
without taking activation away from the interactive content inside it.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  DOM, target, or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Two focus indicators on nested controls (AR3).** The card draws its focus
  outline while any descendant has keyboard focus, so focusing a nested
  control shows the card outline and the control's own, where
  `architecture:interaction-modality` INV3 allows one indicator per focus move.
- **Disabled state not reflected on the target (FR4).** The `clickable-card`
  target reflects `variant` but not the disabled state, so a theme cannot
  style it there, where `architecture:component-theming-surface` INV6 keeps
  state on the owning target.

## Ownership boundary

**Owns**

- The hidden native button or link that carries the card's action, and its
  name.
- Card-surface activation, and its suppression for nested interactive
  descendants and selected text.
- Enabled, disabled, hover, pressed, and delegated focus paint on the card.
- The `clickable-card` target on the painted root.

**Does not own / non-goals**

- Selection or toggling — owned by `component:SelectableCard`.
- Semantics, paint, or activation of caller content.
- Destination acceptance — owned by `family:navigation-destinations`.
- Card padding, variant paint, radius, elevation, and sizing — owned by
  `component:Card`.

## Public concepts

| Concept          | Closed values or states                                | Meaning                                                      | Availability by variant/orientation/state | Default | Owner                            | Stability | Invalid-value behavior                   |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------- | ------- | -------------------------------- | --------- | ---------------------------------------- |
| Activation mode  | action (`onClick`); navigation (`href`); neither (OQ1) | Which hidden native control owns the card's action.          | Every variant                             | neither | `component:ClickableCard`        | Stable    | `href` wins when both are given.         |
| Disabled         | enabled; disabled                                      | Disabled cards stay focusable and announced but run nothing. | Both modes                                | enabled | `component:ClickableCard`        | Stable    | —                                        |
| Nested ownership | card surface; nested interactive descendant; selection | Only a surface press activates the card.                     | Enabled cards                             | surface | `component:ClickableCard`        | Stable    | —                                        |
| Destination      | accepted; blocked                                      | Every navigation sink uses the shared destination decision.  | Navigation mode                           | none    | `family:navigation-destinations` | Stable    | A blocked destination does not navigate. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | The root is Card's `div`. With `href`, a visually hidden native link holds the destination and `target`; otherwise a visually hidden `button type="button"` calls `onClick`. `label` names that control, and the hidden control is the card's tab stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests                                                |
| FR2 | A primary-button press on the card surface calls `onClick` once with the card as `currentTarget`, then performs an accepted navigation unless the callback cancels it. A middle press on the surface of a card given `href` opens an accepted destination in a new tab without calling `onClick`. A press inside a nested interactive descendant, or one that ends a text selection, does not activate the card. Activating the hidden button of an action card calls `onClick` once; activating the hidden link navigates without calling `onClick`.                                                                                                                                                                        | Current source and tests; `architecture:public-component-api` INV7      |
| FR3 | Plain, new-tab, modified, middle-click, and surface-delegated navigation use the shared destination decision; a blocked destination does not navigate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `family:navigation-destinations` FR1, FR3–FR5                           |
| FR4 | `isDisabled` keeps the hidden control focusable with `aria-disabled="true"`; Enter, Space, and clicks on it do nothing. A disabled link keeps its link role and name but has no `href` or `target`. The control stays focusable and announced (`spec:AST-085` FR1, FR2, FR5); the card's own click and mouseup handling and the caller's `onMouseUp` are removed, other caller event props still reach the root, and the surface shows no hover or pressed paint (`spec:AST-085` FR6), and renders at half opacity. The disabled state is reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: the `clickable-card` target reflects no disabled state (Current-state impact). | Current source and tests                                                |
| FR5 | While enabled, the root paints the shared hover overlay under a hover-capable pointer and the pressed overlay for mouse and touch presses, and a bordered card's border responds to hover. Keyboard focus on the hidden control shows the shared focus outline on the root.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source, stories, and `architecture:interaction-modality`        |
| FR6 | The root carries the `clickable-card` target reflecting `variant` beside Card's target. `ref` reaches the root; supported DOM, ARIA, data, and event props reach it; a caller `onMouseUp` runs after the card's own; `xstyle`, `className`, and `style` compose after the component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Caller content.** Caller content keeps its own semantics, theming,
  and interaction inside the card.
- **AV2 — Router integration.** An accepted destination may use the native
  link or the active link provider.
- **AV3 — Card appearance.** Card variants, padding, elevation, and sizing vary
  without changing activation ownership.

### Representative states

| State               | Required invariant                                                            | Allowed variation          |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Enabled action      | Hidden button operable by keyboard and by the surface; `onClick` runs once.   | Content and appearance.    |
| Enabled navigation  | Hidden link keeps its destination; surface presses use the shared decision.   | Native or provider router. |
| Disabled action     | Hidden button focusable with `aria-disabled`; nothing runs.                   | —                          |
| Disabled navigation | Link role and name kept; no `href` or `target`; focusable; nothing navigates. | —                          |
| Nested control      | The descendant handles its own event; the card does not activate.             | Any interactive child.     |

### Transformation and precedence order

- **ORD1 — Event ownership.** Disabled removes the card's own click and
  mouseup handling; then text selection and nested interactive ownership
  suppress card activation; otherwise, for a primary-button press, `onClick`
  runs before any accepted destination and may cancel it, and a middle press
  opens an accepted `href` without calling `onClick`.
- **ORD2 — Navigation.** Decide the destination before choosing native,
  router, same-tab, new-tab, modified, middle-click, or delegated activation.

### Performance and resources

- **PR1 — Shared resources only.** ClickableCard installs the shared press
  controller on mount and marks its root as a press surface only while
  enabled; it adds no timer, observer, request, portal, or layout measurement
  of its own.

## Accessibility contract

- **AR1 — Native semantic owner.** The hidden button or link exposes its
  native role and the `label`; the visible root adds no role of its own.
- **AR2 — Disabled stays perceivable.** A disabled card's control stays in the
  tab order, announces `aria-disabled`, and is inert (FR4).
- **AR3 — One focus indicator per focus move.** Focus on the hidden control is
  shown once, on the card root (`architecture:interaction-modality` INV3).
  Implementation gap: the root also outlines while a nested control has focus,
  so that control shows two indicators (Current-state impact).
- **AR4 — Modality parity.** Keyboard, pointer, and touch users each have an
  operable path; hover is never the only one.

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority | Hierarchy role                   | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------ | -------------------------------- | ------------------ |
| Container        | The Card surface with enabled interaction paint and delegated focus. | Current source and docs  | Context-dependent action surface | FR4–FR6, AR3, AR4  |
| Content          | Caller hierarchy and interaction, unchanged.                         | Caller-owned content     | Context-dependent                | FR2, AV1           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "clickable-card"},
  "Content": {
    "none": {
      "reason": "intentional: Caller-supplied content retains its own theming ownership; ClickableCard applies no content target."
    }
  }
}
```

## Family and system relationships

- `family:navigation-destinations` owns destination acceptance and parity
  across navigation sinks; FR3 applies it.
- `architecture:interaction-modality` owns modality and focus-indicator rules;
  FR5 and AR3 apply them and AR3 records the gap.
- `architecture:component-theming-surface` sets the rules the `clickable-card`
  target follows; FR4 records the disabled-state gap.
- `architecture:public-component-api` owns ref, passthrough, cancellation, and
  styling-input rules; FR2 and FR6 apply them.
- `spec:AST-085` owns disabled-control behavior; FR4 and AR2 apply it.

## Verification map

| Contract            | Verification                                                                                                                                                                  | Representative states                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                 | Audit section                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, AR1            | `ClickableCard.test.tsx` hidden-control, label, and target tests; `Button.a11y.test.tsx` and `Button.a11y.chromium.spec.ts` ClickableCard states                              | Action and navigation; `clickable-card` and `clickable-card-as-link` | A missing hidden button or link, a lost `aria-label` or `target`, an unexposed button role or name at the accessibility tree, or a link card losing its computed `link` role fails. Gap: the link card's name at the accessibility tree, and that the root adds no role, have no check.                                                                                                                                                         | `audit:ClickableCard/accessibility` |
| FR2, ORD1           | `ClickableCard.test.tsx` surface, hidden-control, keyboard, nested-control, and selection tests                                                                               | Surface; hidden control; Enter; nested button and input; selection   | A missing or duplicate `onClick`, a wrong `currentTarget`, or activation from a nested control or selection fails. Gap: no test cancels navigation from `onClick`. No test covers activating the hidden link of a card given both `href` and `onClick`. No ClickableCard test covers a middle press on a card given `href`.                                                                                                                     | `audit:ClickableCard/behavior`      |
| FR3, ORD2           | `useClickableContainer.test.tsx`; `ClickableCard.test.tsx` link tests                                                                                                         | Plain, modified, middle, target, accepted, blocked                   | A blocked destination reaching a sink, or a lost activation method, fails in the shared hook tests.                                                                                                                                                                                                                                                                                                                                             | `audit:ClickableCard/navigation`    |
| FR4, AR2            | `ClickableCard.test.tsx` disabled and touch-press tests; `Button.a11y.chromium.spec.ts` `clickable-card-disabled` state                                                       | Disabled action and navigation                                       | A disabled control leaving the tab order, a live `href` or `target`, a callback that runs, a touch-press marker while disabled, or a disabled action card whose unavailable state or inertness (click, Enter, Space) fails at the accessibility tree fails. Gap: the disabled link card has no accessibility-tree check (`spec:AST-085` FR5), and disabled hover and mouse-press paint (`spec:AST-085` FR6) and the half opacity have no check. | `audit:ClickableCard/accessibility` |
| FR5, AR3, AR4       | `ClickableCard.test.tsx` touch-press tests; `CardPress.a11y.chromium.spec.ts` on `core-clickablecard--with-on-click`; stable visual baseline `core-clickablecard--navigation` | Rest; desktop hover and mouse press; touch press                     | A hover that does not paint over rest, a mouse press that does not paint over hover, a touch press that does not match the desktop press or fade, or a changed rest appearance fails or comes back changed. Gap: the border hover and the focus outline have no automated check.                                                                                                                                                                | `audit:ClickableCard/design`        |
| FR6                 | `ClickableCard.test.tsx` elevation tests; `themingTargets.test.ts`                                                                                                            | Elevations; target inventory                                         | A lost elevation class or target fails. Gap: no test covers the ref, DOM passthrough, `onMouseUp` order, or the styling-input merge.                                                                                                                                                                                                                                                                                                            | `audit:ClickableCard/api`           |
| PR1                 | Source review                                                                                                                                                                 | Enabled and disabled                                                 | Gap: no automated check fails if ClickableCard adds its own timer, observer, or measurement.                                                                                                                                                                                                                                                                                                                                                    | `audit:ClickableCard/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                 | Consumer anatomy and current target                                  | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                   | `audit:ClickableCard/theming`       |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — Should rendering ClickableCard without `href` or `onClick` remain a
  supported focusable no-op, or should the public contract reject or inert
  that composition?** (`human-api`) The released types and render admit it
  today.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, shared destination rules, or Card styling. It
links to their owners.
