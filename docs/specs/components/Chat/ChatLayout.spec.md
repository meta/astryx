---
schema_version: 3
template_version: 7
kind: component
id: component:ChatLayout
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers:
  [public-api, behavior, layout, scrolling, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/Chat/ChatLayout.test.tsx,
    packages/core/src/Chat/ChatLayoutScrollButton.test.tsx,
    packages/core/src/Chat/useChatStreamScroll.test.tsx,
    packages/core/src/Chat/useChatNewMessages.test.tsx,
    apps/storybook/stories/ChatLayout.stories.tsx,
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
    architecture:react-component-runtime,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-025, spec:AST-029]
---

# ChatLayout component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `composer`, `emptyState`, `scrollButton`, `scrollRef`, `density`, plus `BaseProps<HTMLDivElement>` and `ref` on the layout root.                                              |
| Behavior                | The root is a flex column; the message area grows and never shrinks; the dock is sticky when the root scrolls and fixed when `scrollRef` names an outer scroller.                         |
| End-user impact         | A chat transcript scrolls under a composer that stays reachable, auto-follows streaming output, and offers a scroll-to-bottom affordance when the reader has moved away from the bottom.  |
| Builder impact          | None.                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no public change. Two owner questions stay open.                                                                                                                |
| Review checks           | Reject any row that states unshipped behavior, promises a default this component does not apply, or resolves OQ1 or OQ2 without an owner decision.                                        |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV6, INV8`; `architecture:component-style-authoring/INV1–INV3, INV5`; `architecture:theme-tokens/INV3`; `spec:AST-025/FR12` (not adopted). |

This table is a review projection; the body below is authoritative.

## Intent

ChatLayout is the structural shell for a chat surface. It owns one job: place a
scrolling transcript above a docked composer so that short conversations do not
overflow, long ones scroll, and the composer stays at the bottom edge of
whichever element actually scrolls. Scroll mechanics live in
`useChatStreamScroll` and `useChatNewMessages`; this component wires them to the
DOM it owns and publishes the resulting refs through `ChatLayoutContext`.

Consumer usage, prop syntax, and examples belong in `ChatLayout.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; the component holds no
  controllable value.
- Migration decision: none.

## Ownership boundary

**Owns**

- The layout root: flex column, relative positioning, `container-type:
inline-size`, and the `chat-layout` theming target with its `density` axis.
- Which element scrolls: the root itself, or the element named by `scrollRef`.
- Dock positioning — `sticky` in self-scroll mode, `fixed` in external-scroll
  mode — and the frosted glass layer painted behind it.
- Density geometry: dock padding, message-column max-width and inline padding,
  and the blur layer's height and mask.
- Empty-state substitution and its centering box.
- The default scroll-to-bottom affordance and the visibility signal it receives.
- Publication of `scrollContainerRef` and `contentRef` through `ChatLayoutContext`.

**Does not own / non-goals**

- Scroll measurement, spring animation, lock behavior, or new-message detection —
  owned by `useChatStreamScroll` and `useChatNewMessages`.
- Message presentation, grouping, or sender semantics — owned by
  `component:ChatMessageList` and `component:ChatMessage`.
- Composer behavior, sizing, or status — owned by `component:ChatComposer`.
- The scroll-to-bottom control's own presentation — owned by
  `component:ChatLayoutScrollButton`.
- Page shell, navigation, and landmark assignment — the caller's.
- The shared effective-axis scroll capability defined by `spec:AST-025`. This
  component predates it and has not adopted it; see OQ1.

## Public concepts

| Concept        | Closed values or states                                  | Meaning                                                                            | Default     | Owner                | Stability | Invalid-value behavior                     |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- | -------------------- | --------- | ------------------------------------------ |
| `children`     | any `ReactNode`                                          | Transcript content placed in the message area.                                     | required    | caller               | stable    | n/a — required                             |
| `composer`     | any `ReactNode`                                          | Content placed inside the dock.                                                    | required    | caller               | stable    | n/a — required                             |
| `emptyState`   | `ReactNode`; omitted                                     | Rendered centred in place of `children` when `children` is empty.                  | omitted     | caller               | stable    | omitted renders `children` unchanged       |
| `scrollButton` | `undefined`; `null`; any `ReactNode`                     | `undefined` selects the wired default, `null` renders nothing, a node replaces it. | `undefined` | component/caller     | stable    | any node renders as given                  |
| `scrollRef`    | `RefObject<HTMLElement \| null>`; omitted                | Names the scrolling element; omitted makes the root scroll.                        | omitted     | caller               | stable    | a null `current` leaves scrolling inactive |
| `density`      | `compact`; `balanced`; `spacious`                        | Selects dock padding, message-column width, and blur-layer size.                   | `balanced`  | component            | stable    | closed union; rejected by types            |
| root surface   | `ref`; DOM/data/ARIA props; `className`/`style`/`xstyle` | Extends the layout root.                                                           | omitted     | public component API | stable    | n/a                                        |

`density` is a closed union. It is a documented `visualProps` axis of the
`chat-layout` target, and it is not theme-extensible: no unavailable custom value
has a safe theme-independent baseline, so it stays closed under
`architecture:component-theming-surface/INV14`.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                              | Basis                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| FR1 | The root MUST be a flex column, so an in-flow sticky dock's height is part of the root's height rather than added on top of it.                                        | Current source and tests                            |
| FR2 | The message area MUST grow into leftover space and MUST NOT shrink below its content height, so short transcripts fill the root exactly and long ones overflow it.     | Current source and tests                            |
| FR3 | With no `scrollRef`, the root MUST be the scroll container and the dock MUST be `position: sticky`.                                                                    | Current source and tests                            |
| FR4 | With a `scrollRef`, the root MUST NOT become a scroll container and the dock MUST be `position: fixed`.                                                                | Current source and tests                            |
| FR5 | `emptyState` MUST replace `children` exactly when `children` is `null`, `undefined`, `false`, or an empty array, and MUST NOT replace any other children.              | Current source and tests                            |
| FR6 | `scrollButton` MUST distinguish three cases: omitted selects the wired default, `null` renders nothing, and a supplied node replaces the default.                      | Current source and tests                            |
| FR7 | `density` MUST reflect on the root as the `chat-layout` target's `data-density`, and MUST select the dock, message-area, dock-inner, and blur-layer geometry together. | Current source, tests, and docs                     |
| FR8 | The layout MUST publish its scroll container and message content refs through `ChatLayoutContext` so the message list can register the observed content box.           | Current source                                      |
| FR9 | Accepted `ref`, DOM/data/ARIA props, `className`, `style`, and `xstyle` MUST reach and compose on the layout root.                                                     | `architecture:public-component-api/INV5–INV6, INV8` |

### Allowed variation

- **AV1 — Scroll ownership.** The caller chooses between root-owned and
  externally-owned scrolling; the dock's positioning strategy follows that choice.
- **AV2 — Scroll affordance.** The caller may keep the wired default, remove it,
  or substitute any node.
- **AV3 — Transcript content.** Any content is allowed in the message area;
  ChatMessageList is a convention, not a requirement.
- **AV4 — Density geometry.** Resolved spacing and widths follow the active
  theme's spacing scale; only the relationships between the three steps are fixed.

### Representative states

| State                               | Required invariant                                              | Allowed variation                             |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Self-scroll, short transcript       | Root fills without overflowing; dock sticky at the block end    | Empty state may occupy the message area       |
| Self-scroll, overflowing transcript | Root scrolls; message area keeps content height                 | Scroll affordance becomes visible             |
| External `scrollRef`                | Root does not scroll; dock is fixed to the viewport's block end | The named element may be the document element |
| Empty children with `emptyState`    | Centred empty state replaces the transcript                     | Any node may be the empty state               |
| `scrollButton={null}`               | No scroll affordance renders                                    | Auto-scroll behavior is unchanged             |

### Performance and resources

- **PR1 — No layout measurement in the component.** Density is a prop. ChatLayout
  MUST NOT add a `ResizeObserver`, media query, or animation frame of its own for
  presentation the CSS container/flex model already resolves
  (`architecture:component-style-authoring/INV2`).
- **PR2 — Shared observation only.** Content-size observation reaches the browser
  through the pooled `observeResize` utility used by `useChatNewMessages`, never a
  per-instance observer.

## Accessibility contract

- **AR1 — The wired default scroll affordance MUST NOT be focusable while it is
  visually hidden.** The hidden pill paints nothing, so focus landing on it would
  have no visible indicator (WCAG 2.2 SC 2.4.7, Level AA). `opacity` and
  `pointer-events` do not remove an element from sequential focus navigation.
- **AR2 — The scroll affordance MUST remain keyboard reachable and operable while
  visible**, with its accessible name supplied by the catalog and replaced by the
  new-messages label when new messages have arrived.
- **AR3 — All user-visible and AT-facing strings MUST come from the catalog**:
  `@astryx.chatLayout.newMessages` and
  `@astryx.chatLayoutScrollButton.scrollToBottom`.
- **AR4 — The layout MUST NOT assign a landmark role or accessible name to the
  caller's regions.** Region semantics stay caller-owned.
- The self-scroll root carries no `tabIndex`, role, or accessible name of its
  own; the keyboard path into scrolled content comes from whatever `children`
  supplies. Which layer should own that guarantee is unresolved; see OQ1.

## Design relationships

- The dock paints a `backdrop-filter` blur with a block-start mask so the
  transcript fades out behind the composer rather than ending at a hard edge.
  Blur height and mask distance step with `density`.
- The scroll affordance is a pill whose height tracks `--size-element-md`, the
  same token that sizes the `md` Button it wraps, so the pill's `overflow: hidden`
  cannot clip that Button under a theme that retunes the element scale
  (`architecture:theme-tokens/INV3`).
- Spacing, radius, shadow, duration, and easing all resolve from portable
  semantic tokens. Component-local geometry that has no semantic role — the
  message-column and dock-inner caps, the blur heights, and the empty-state
  minimum height — remains a named component design decision.
- The component declares no portable token and no public custom property.

### Theming reachability

Dispositions for ChatLayout's five anatomy parts. This record carries no
`anatomy-theming:v1` block; the block is optional during migration, and see OQ2.

| Anatomy part            | Disposition                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message area            | `none` — reachability-gap: an internal element with no `themeProps` call. `chat-layout` sits on the scrolling root, so a theme cannot reach the transcript column's own padding or width cap. |
| Frosted glass dock      | `none` — unsettled: the dock, its inner column, and the blur layer paint the signature surface and carry no target; see OQ2.                                                                  |
| Scroll-to-bottom button | `delegatesTo` the `chat-layout-scroll-button` target, whose canonical owner in the current inventory is `component:Chat`.                                                                     |
| Composer                | `delegatesTo` the `chat-composer` target, whose canonical owner in the current inventory is `component:Chat`.                                                                                 |
| Empty state             | `none` — intentional: the empty-state box only centres caller content, which is layout plumbing.                                                                                              |

The `chat-layout` target itself is declared on the Chat family document
(`Chat.doc.mjs`) rather than on `ChatLayout.doc.mjs`.

## Family and system relationships

- There is no `family:chat` record. The Chat components share the `Chat.doc.mjs`
  family document and its theming target inventory, which is not a knowledge-record
  family contract.
- `component:ChatLayoutScrollButton` owns the scroll affordance's presentation,
  label, and focus behavior. ChatLayout owns only when it is visible.
- `component:ChatMessageList` consumes `ChatLayoutContext.contentRef`.
- `spec:AST-025` owns the shared effective-axis scroll capability. ChatLayout
  does not adopt it today: it declares `overflow-y: auto` unconditionally in
  self-scroll mode rather than resolving an effective axis, and it assigns no
  keyboard access to the viewport itself. FR12 accepts an existing focusable
  descendant as the keyboard path; see OQ1 for the open ownership question.

## Verification map

| Contract | Verification                                                                                                                                 | Representative states                               | Mutation or failure expectation                                                                   | Audit section         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------- |
| FR1, FR2 | `ChatLayout.test.tsx` self-scroll layout contract                                                                                            | self-scroll, short and long transcript              | Restoring `min-height: 100%` on the message area re-adds the dock's height and the root overflows | `audit:ChatLayout/§4` |
| FR3, FR4 | `ChatLayout.test.tsx` dock positioning                                                                                                       | no `scrollRef`; external `scrollRef`                | Swapping sticky and fixed detaches the dock from the element that actually scrolls                | `audit:ChatLayout/§4` |
| FR5      | `ChatLayout.test.tsx` empty-state cases; `useChatNewMessages.test.tsx` conditional list case                                                 | empty array; populated children                     | Treating populated children as empty hides the transcript                                         | `audit:ChatLayout/§4` |
| FR6      | `ChatLayout.test.tsx` scroll-button cases                                                                                                    | custom node                                         | Rendering the default in place of a supplied node fails                                           | `audit:ChatLayout/§4` |
| FR7      | `ChatLayout.test.tsx` density cases; `themingTargets.test.ts`                                                                                | compact; balanced; spacious                         | Dropping the reflected attribute makes the theming axis unselectable                              | `audit:ChatLayout/§2` |
| FR8      | `ChatLayout.test.tsx` "first-fill scroll positioning" cases; `useChatNewMessages.test.tsx` conditional-list case                             | first fill; streaming growth                        | Losing the published refs stops auto-scroll from observing content growth                         | `audit:ChatLayout/§7` |
| AR1, AR2 | `ChatLayoutScrollButton.test.tsx` and `ChatLayout.test.tsx` tab-order cases; `ChatLayoutScrollButton.a11y.chromium.spec.ts` in real Chromium | hidden at rest; visible; re-hidden after activation | Reverting to `opacity`-only hiding puts an invisible control back in the tab order                | `audit:ChatLayout/§1` |

Read from source, with no focused test yet:

- FR3, FR4: whether the root is the scroll container.
- FR5: `null` and `undefined` children selecting the empty state.
- FR6: `null` rendering nothing, an omitted `scrollButton` selecting the wired
  default, and the default not rendering beside a supplied node.
- FR8: the published scroll container.
- FR7: the dock, message-area, dock-inner, and blur geometry for each density.
- FR9: `ref`, DOM props, `className`, `style`, and `xstyle` on the root.
- AR2: the new-messages label replacing the catalog name.
- AR3: the catalog strings; AR4: no landmark or name on caller regions.
- PR1–PR2: no layout measurement of the component's own, and the pooled
  observer.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Which layer owns the keyboard path to scrolled content, and should
  ChatLayout guarantee it?** (`human-api`) In self-scroll mode the root is the
  scroll container and carries no `tabIndex`, role, or accessible name of its
  own. `component:ChatMessageList`, the documented child, carries `role="log"`
  and `tabIndex={0}`, and `spec:AST-025/FR12` accepts such an existing
  focusable descendant instead of a named viewport. `children` is typed
  `ReactNode`, so whether a composition supplying no focusable descendant is
  also covered is unresolved, as is which layer should own the guarantee. This
  record states the arrangement and asserts no defect.
- **OQ2 — Should the frosted dock be themeable?** (`human-api`) The dock, its
  inner column, and the blur layer paint the component's signature surface, and
  no current target reaches them.

## Content boundary

This file does not duplicate `ChatLayout.doc.mjs` prop tables or examples, the
audit's scores and evidence, or the scroll, message, and composer contracts owned
by their own components and hooks.
