---
schema_version: 3
template_version: 7
kind: component
id: component:ChatMessageList
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
    packages/core/src/Chat/ChatMessageList.test.tsx,
    packages/core/src/Chat/__tests__/ChatMessageList.a11y.chromium.spec.ts,
    apps/storybook/stories/ChatMessageList.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-test-sufficiency,
    architecture:component-style-authoring,
    architecture:component-theming-surface,
    architecture:react-component-runtime,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029]
---

# ChatMessageList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `emptyState`, `scrollToTopAction`, `density`, `gap`, `align`, `isStreaming`, the root's `BaseProps<HTMLDivElement>`, and `ref`.                                        |
| Behavior                | A polite log holds caller messages. Density selects row spacing and passes through context. A top sentinel can request older messages. A spacer moves short lists down by default. |
| End-user impact         | Readers get one focusable, polite log of the conversation that reports when a response is streaming; older messages load when they scroll to the top.                              |
| Builder impact          | None.                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. One implementation gap, listed under Current-state impact; two owner questions stay open.                                              |
| Review checks           | Reject a claim that the list owns ChatLayout auto-scroll, that this record settles the loading-overlap policy, or that DOM `aria-busy` proves spoken output.                       |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV8`; `architecture:react-component-runtime/INV3, INV5–INV6`; `spec:AST-029/FR2–FR5`.                                               |

This table is a review projection; the body below is authoritative.

## Intent

ChatMessageList is the presentational message container within the Chat
composition. It owns a flex-column transcript, spacing/density context, an
optional empty state and older-message sentinel, and the log's rendered ARIA
attributes. `ChatLayout` owns auto-follow scrolling and the dock; message and
bubble components own sender presentation and content.

Consumer prop syntax and examples remain in `ChatMessageList.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; there is no controlled
  value on this component.
- Migration decision: none.

## Current-state impact

- **Bottom alignment uses an extra element.** `align="bottom"` renders a flex
  spacer element before the messages to push a short list down.
  `architecture:component-style-authoring` INV7 expresses layout through styles
  on the elements a component already owns, not added elements.

## Ownership boundary

**Owns**

- The outer log element, its public DOM/ref/style passthrough, and the
  `chat-message-list` target with its `density` selector.
- The inner flex-column message box and density-based padding and gap.
- The short-list block spacer when `align` is `bottom`.
- The optional `emptyState` substitution and older-message sentinel/loading
  indicator.
- Passing the inner content element to `ChatLayoutContext.contentRef` while a
  layout is present.

**Does not own / non-goals**

- Auto-scroll, scroll-to-bottom, dock, and scroll-owner selection, which belong
  to `component:ChatLayout` and its scroll hooks.
- Sender identity, message alignment, bubbles, metadata, and text semantics,
  which belong to their child components.
- The caller's region landmark or an accessible name for arbitrary transcript
  context; this record makes no naming policy.

## Public concepts

| Concept             | Closed values or states                         | Meaning                                                         | Availability  | Default    | Owner     | Stability | Invalid-value behavior                             |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------- | ---------- | --------- | --------- | -------------------------------------------------- |
| `children`          | `ReactNode`                                     | Top-level transcript content                                    | every render  | required   | caller    | stable    | null, false, or `[]` counts empty at the top level |
| `emptyState`        | `ReactNode`; omitted                            | Substitutes for top-level empty children                        | empty state   | omitted    | caller    | stable    | absent renders no substitute                       |
| `scrollToTopAction` | async function; omitted                         | Invoked when the top sentinel intersects                        | when supplied | omitted    | caller    | stable    | absent creates no sentinel or observer             |
| `density`           | `compact`; `balanced`; `spacious`               | Chooses message spacing and child density context               | every render  | `balanced` | component | stable    | closed type union                                  |
| `gap`               | published `SpacingStep`; omitted                | Overrides the list's top-level row gap independently of density | every render  | omitted    | caller    | stable    | closed type union                                  |
| `align`             | `top`; `bottom`                                 | Positions short content at the start or block end               | every render  | `bottom`   | component | stable    | closed type union                                  |
| `isStreaming`       | `true`; `false`                                 | Exposes `aria-busy` on the polite log while streaming           | every render  | `false`    | caller    | stable    | boolean                                            |
| root passthrough    | `ref`, accepted DOM/data/ARIA and styling props | Extends the outer log element                                   | every render  | omitted    | caller    | stable    | owned role/live/busy attributes retain precedence  |

The table records the implementation's top-level emptiness test; it does not
promise recursive child inspection or resolve the meaning of arbitrary
non-rendering React nodes.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                | Basis                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| FR1 | The outer root renders `role="log"`, `aria-live="polite"`, and `tabIndex=0`; `isStreaming=true` adds `aria-busy="true"`, which is absent otherwise.                      | Current source, tests, and docs                     |
| FR2 | The chosen density is reflected as `data-density` on the root and flows to child messages through `ChatListContext`; it selects three spacing groups.                    | Current source, tests, and docs                     |
| FR3 | The optional `gap` replaces only the top-level row gap; density still selects padding and context.                                                                       | Current source, tests, and docs                     |
| FR4 | `emptyState` renders only when `children` is nullish, `false`, or an empty top-level array. Otherwise the passed children render unchanged.                              | Current source and tests                            |
| FR5 | `align="bottom"` includes a flex spacer before messages; `align="top"` omits it. Overflowing content is not given a different rendering path.                            | Current source and tests                            |
| FR6 | Supplying `scrollToTopAction` creates an observed top sentinel. An intersection starts its async transition, and a top-positioned spinner renders while it is pending.   | Current source, tests, and docs                     |
| FR7 | Inside ChatLayout, the inner content element is passed to the layout's `contentRef` and removed from that registration on cleanup; standalone lists have no layout ref.  | Current source                                      |
| FR8 | The root receives `ref`, accepted DOM/data/ARIA props, and composed `className`, `style`, and `xstyle`; component-owned log semantics are applied after forwarded props. | Current source; `architecture:public-component-api` |

For the `emptyState` slot, numeric `0` is visible content. Nullish values,
booleans, and an empty string do not create an empty wrapper. This describes
scalar output only; it does not decide how to inspect nested children.

### Allowed variation

- **AV1 - Content.** Any caller-owned ReactNode may be placed in the list; the
  list does not infer sender metadata from children.
- **AV2 - Spacing.** Density selects token-based defaults; the optional `gap`
  selects a published spacing step without changing the child density.
- **AV3 - Scroll ownership.** The list may be used alone or inside ChatLayout;
  auto-follow behavior remains outside this component.

### Representative states

| State                         | Required invariant                                    | Allowed variation                          |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Two messages and a system row | Polite log with messages in source order              | Caller controls row content                |
| Empty top-level children      | Optional centered empty state                         | An omitted empty state leaves an empty log |
| Compact/balanced/spacious     | Different token-derived row spacing and child density | `gap` may override only row spacing        |
| Short top/bottom list         | Bottom includes a spacer, top omits it                | Container height is caller-owned           |
| Streaming                     | Log has `aria-busy=true`                              | Message content remains caller-owned       |
| Top action pending            | Spinner above content while transition is pending     | Async action result is caller-owned        |

### Performance and resources

- **PR1 — Sentinel observer.** An `IntersectionObserver` is installed only when
  `scrollToTopAction` exists, and disconnected on cleanup. Its root is ChatLayout's scroll container when
  available, otherwise the document viewport.
- **PR2 — Layout registration.** An Effect registers the inner content element
  with ChatLayout, then clears that registration on cleanup.

## Accessibility contract

- **AR1 — Log semantics.** The root is a focusable polite log with `aria-busy`
  reflecting `isStreaming` (FR1); this states browser-exposed semantics, not a
  screen-reader announcement transcript.
- **AR2 — No keyboard model.** The loading spinner is a separate child of the
  log. The list adds no interactive button or directional keyboard behavior of
  its own.
- **AR3 — Caller content.** Caller-supplied content remains responsible for
  names and semantics inside messages.

## Design relationships

No component-local design decision is recorded. Spacing uses portable semantic token steps. The family consumer doc
owns the published `chat-message-list` theme target and its `density` axis.
No anatomy-theming map is recorded yet; the block is optional during
migration, so the map is deferred.

## Family and system relationships

- No `family:chat` authority record currently exists. `Chat.doc.mjs` is the
  consumer family document, not a product-authority family contract.
- `ChatLayout` owns the scroll container and provides `contentRef`; the list
  registers its content element without taking over ChatLayout's scrolling.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract | Verification                                                                                          | Representative states      | Mutation or failure expectation                              | Audit section              |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ | -------------------------- |
| FR1, AR1 | `ChatMessageList.test.tsx` role and `aria-busy` tests                                                 | rest, streaming            | A dropped log role or busy state fails.                      | `audit:ChatMessageList/§1` |
| FR2–FR3  | `ChatMessageList.test.tsx` density and gap tests; `themingTargets.test.ts`                            | densities; gap override    | Lost density reflection or a gap that changes density fails. | `audit:ChatMessageList/§2` |
| FR4      | `ChatMessageList.test.tsx` empty-state tests                                                          | empty; numeric empty state | A missing or hidden empty state fails.                       | `audit:ChatMessageList/§4` |
| FR5      | `ChatMessageList.test.tsx` spacer tests                                                               | default, bottom, top       | A spacer that appears or vanishes wrongly fails.             | `audit:ChatMessageList/§4` |
| FR6      | `ChatMessageList.test.tsx` "loads older messages through the top sentinel and exposes pending status" | pending, settled           | A lost action or stuck spinner fails.                        | `audit:ChatMessageList/§6` |
| FR8      | `ChatMessageList.test.tsx` `data-testid` test                                                         | data prop                  | A dropped prop fails.                                        | `audit:ChatMessageList/§3` |

Read from source, with no focused test yet:

- FR1: `tabIndex=0` on the log.
- FR2: density reaching child messages through context.
- FR4: `null` and `false` children selecting the empty state.
- FR7: content registration with ChatLayout and its cleanup.
- FR8: `ref`, `className`, `style`, and `xstyle` on the root, and owned log
  semantics winning over forwarded props.
- PR1–PR2: observer and registration cleanup.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 - What is the intended overlap policy for repeated top-sentinel
  intersections while an async load remains pending?** (`human-api`) The current
  source invokes the action on intersection; this record does not add a
  single-flight, initial-load, or exhaustion guarantee.
- **OQ2 - Should emptiness inspect nested non-rendering ReactNode values?**
  (`human-api`) The shipped test is limited to the top-level `children` value.
  Do not reinterpret that test as a policy about generators, fragments,
  promised children, or arrays of non-rendering values.

## Content boundary

This file does not duplicate consumer prop tables or examples, ChatLayout's
scroll behavior, or cross-component visual policy. It links to their owners.
