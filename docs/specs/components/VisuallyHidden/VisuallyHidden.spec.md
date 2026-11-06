---
schema_version: 3
template_version: 7
kind: component
id: component:VisuallyHidden
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/VisuallyHidden/VisuallyHidden.test.tsx,
    apps/storybook/stories/VisuallyHidden.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009, spec:AST-071]
---

# VisuallyHidden component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A wrapper with required `children` and an optional `as` element; accessibility and data props pass through. It accepts no `className` or `style` and ignores `xstyle` today (FR3 gap, OQ1). |
| Behavior                | Content is clipped from sight by a fixed style block no caller input can displace, and stays in the accessibility tree unless the caller passes `hidden`, `inert`, or `aria-hidden`.        |
| End-user impact         | Screen-reader users hear names and announcements that sighted users do not need to see.                                                                                                     |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact; OQ1 is open.                                        |
| Review checks           | Reject a `display: none` or `visibility: hidden` hide, a caller input that displaces the clip, or dropped `aria-*` passthrough.                                                             |
| Governing rules         | `architecture:public-component-api/INV5,INV6,INV8`; `spec:AST-071` FR2.                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

VisuallyHidden exposes content to assistive technology while keeping it out of
sight: names for icon-only controls, live announcement regions, and
supplementary screen-reader context. It owns the hiding technique and the
guarantee that the hidden node cannot be styled visible.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, or
  DOM output changes. `xstyle` is accepted by the type and ignored;
  `className` and `style` are not accepted; the styling surface is the FR3 gap (OQ1)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Styling inputs not accepted (FR3).** VisuallyHidden drops `className` and
  `style` and ignores `xstyle`, so callers cannot style the element, where
  `architecture:public-component-api` INV6 and `spec:AST-071` FR2 have root
  styling inputs compose. The consumer docs plan to remove `xstyle`; OQ1
  decides whether the component conforms or INV6's owner records it as an
  exception.

## Ownership boundary

**Owns**

- The rendered element and its fixed clip style block.
- Passing accessibility, identity, data, and event props through.

**Does not own / non-goals**

- What the hidden content says and whether it is a live region — owned by the
  caller, through `children`, `as`, and ARIA props.
- Shared status announcements — owned by `spec:AST-086` and its shared channel.
- Theming — VisuallyHidden has no theming target.

## Public concepts

| Concept | Closed values or states                                                                            | Meaning                                | Availability by variant/orientation/state | Default | Owner                      | Stability | Invalid-value behavior                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- | ------- | -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Element | An intrinsic element, or a component that forwards `className` and `ref` to the element it renders | The rendered element, inline or block. | Always                                    | `span`  | `component:VisuallyHidden` | Stable    | A component that does not forward `className` and `ref` renders its content unclipped, and the ref stays unset. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | VisuallyHidden renders `children` in the element named by `as` (default `span`). Its own hiding keeps the content in the accessibility tree; a caller's `hidden`, `inert`, or `aria-hidden` passes through and removes it, by the caller's choice.                                                                                                                                                                                                                                                                                                                                          | Current source and tests |
| FR2 | When `as` is an intrinsic element or forwards `className` to the element it renders, that element is absolutely positioned at the inline-start and block-start of its containing block, 1px by 1px with a −1px margin, no padding or border, clipped to an empty rectangle with hidden overflow, unwrapped, and ignores pointer events and selection.                                                                                                                                                                                                                                       | Current source and tests |
| FR3 | `ref` reaches the element (for a component `as`, when it forwards `ref`), and supported `aria-*`, `role`, `id`, `data-*`, and event props reach it. The clip styles apply after every caller input, so nothing displaces the clip. Root styling inputs compose on the element (`architecture:public-component-api` INV6, `spec:AST-071` FR2). Implementation gap: `className` and `style` are not accepted and `xstyle` is ignored; the consumer docs plan to remove `xstyle`, and OQ1 decides whether VisuallyHidden conforms or becomes a recorded INV6 exception (Current-state impact). | Current source and tests |

### Allowed variation

- **AV1 — Element choice.** Callers choose an inline or block element, such as
  a `div` for block content or a live region.

### Representative states

| State             | Required invariant                                                      | Allowed variation |
| ----------------- | ----------------------------------------------------------------------- | ----------------- |
| Icon-only label   | Hidden `span` gives the control its accessible name.                    | Text.             |
| Live region       | Block element with caller `aria-live` stays hidden and announced.       | Politeness.       |
| Styling attempted | The clip still wins; caller styling has no effect today (FR3 gap, OQ1). | —                 |

### Transformation and precedence order

- **ORD1 — Props.** Caller props → fixed clip styles, so the clip wins.

### Performance and resources

- **PR1 — Static render.** VisuallyHidden holds no state and uses no hooks.

## Accessibility contract

- **AR1 — Perceivable to assistive technology.** Hiding uses clipping, never
  `display: none`, `visibility: hidden`, or `aria-hidden`, so the content is
  read and can name or describe other elements.
- **AR2 — Live regions and hiding by caller choice.** VisuallyHidden adds no
  role or live region of its own; a caller's `role`, `aria-live`, `hidden`,
  `inert`, and `aria-hidden` pass through.

## Design relationships

| Anatomy or state | Design requirement                                  | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Hidden content   | Present to assistive technology, absent from sight. | Current source and docs  | Supporting     | FR1–FR3, AR1, AR2  |

Theming: VisuallyHidden has no theming target, by design; a visible style on a
hidden node would defeat its purpose.

## Family and system relationships

- `architecture:public-component-api` owns passthrough, ref, and styling-input
  rules; FR3 applies INV5, INV6, and INV8 and records the INV6 gap.

## Verification map

| Contract | Verification                                                                                     | Representative states                                                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Audit section                   |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, AR1 | `VisuallyHidden.test.tsx` render and icon-label tests                                            | Default, `as`, icon-only control                                                        | Content leaving the accessibility tree or a lost accessible name fails. Gap: no test covers a caller `hidden`, `inert`, or `aria-hidden` passing through.                                                                                                                                                                                                                                                                                                                                                                                             | `audit:VisuallyHidden/a11y`     |
| FR2      | `VisuallyHidden.test.tsx` clip-style test; stable visual baseline `core-visuallyhidden--default` | Default                                                                                 | A `hidden` attribute fails the unit test; content that becomes visible comes back changed in the visual baseline. Gap: no unit test asserts a clip declaration, although the test environment exposes them.                                                                                                                                                                                                                                                                                                                                           | `audit:VisuallyHidden/behavior` |
| FR3, AR2 | `VisuallyHidden.test.tsx` `as`, ref, passthrough, and styling tests                              | `as` with `aria-live`; ref; `id`, `role`, `data-testid`; `className`, `style`, `xstyle` | A lost `aria-live`, a missed ref, or a dropped `id` or `role` fails. The styling tests pin today's dropped `className`, `style`, and `xstyle` attribute, which pins the recorded FR3 gap, not the contract. Gap: no test asserts that VisuallyHidden adds no role or live region of its own; the ref test still passes when a wrapper receives the ref; no test asserts other `aria-*` or event props; no test checks that the clip wins over caller styles; and no test covers a component `as` that does or does not forward `className` and `ref`. | `audit:VisuallyHidden/behavior` |
| PR1      | Source review                                                                                    | Every state                                                                             | Gap: no automated check fails if VisuallyHidden adds state or a hook.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `audit:VisuallyHidden/behavior` |
| AR1      | Accessibility-tree evidence (`spec:AST-009` FR3)                                                 | Icon-only label; live region                                                            | Gap: no accessibility-tree check proves the hidden content stays in the tree; the unit tests query the DOM.                                                                                                                                                                                                                                                                                                                                                                                                                                           | `audit:VisuallyHidden/a11y`     |

## Decision log

None recorded. The record describes shipped behavior; OQ1 is open.

## Open questions

- **OQ1 — Should VisuallyHidden accept root styling inputs?** (`human-api`)
  `architecture:public-component-api` INV6 has root styling inputs compose
  unless a family decision names an exception, and the consumer docs plan to
  remove `xstyle`; until an owner decides, the styling-free surface is the FR3
  gap. If styling-free is a deliberate exception, INV6's owner
  records it (with a `spec:AST-071` known-gap entry) and FR3 links it, and
  callers keep no way to style the element. If composition is the direction,
  FR3 stays as written and a conforming implementation closes the gap.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
