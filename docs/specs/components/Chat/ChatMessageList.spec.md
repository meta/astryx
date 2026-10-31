---
schema_version: 3
template_version: 6
kind: component
id: component:ChatMessageList
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
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

This draft is an observational account of shipped `core/ChatMessageList`. Its
candidate invariants name their source and evidence; they do not decide any
new API, default, loading protocol, or visual direction. The current shared
records linked above continue to govern independently.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `emptyState`, `scrollToTopAction`, `density`, `gap`, `align`, `isStreaming`, the root's `BaseProps<HTMLDivElement>`, and `ref`.                                        |
| Behavior                | A polite log holds caller messages. Density selects row spacing and passes through context. A top sentinel can request older messages. A spacer moves short lists down by default. |
| End-user impact         | A reader with a numeric empty-state value sees `0`; other transcript arrangements remain unchanged.                                                                                |
| Builder impact          | None. No new caller choice or migration is introduced.                                                                                                                             |
| Compatibility/readiness | The published `./Chat` subpath and its defaults remain unchanged. This is a draft pending verification and exact-head owner review.                                                |
| Review checks           | Reject a claim that the list owns ChatLayout auto-scroll, that a draft settles an unobserved loading policy, or that DOM `aria-busy` proves spoken output.                         |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV8`; `architecture:react-component-runtime/INV3, INV5–INV6`; `spec:AST-029/FR2–FR5`.                                               |

This table is a review projection; the body below describes the observed
surface rather than creating new authority.

## Intent

ChatMessageList is the presentational message container within the Chat
composition. It owns a flex-column transcript, spacing/density context, an
optional empty state and older-message sentinel, and the log's rendered ARIA
attributes. `ChatLayout` owns auto-follow scrolling and the dock; message and
bubble components own sender presentation and content.

Consumer prop syntax and examples remain in `ChatMessageList.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes. The published Core package exposes `./Chat`
  with `ChatMessageList` and `ChatMessageListProps`.
- Compatibility class: no new API, default, or migration. Visible numeric
  empty-state content follows the existing `ReactNode` type.
- Controlled/uncontrolled behavior: not applicable; there is no controlled
  value on this component.
- Migration decision: none.

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
  context; no new naming policy is made by this draft.

## Public concepts

| Concept             | Closed values or states                         | Meaning observed                                                | Availability  | Default    | Owner     | Stability | Invalid-value behavior                             |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------- | ---------- | --------- | --------- | -------------------------------------------------- |
| `children`          | `ReactNode`                                     | Top-level transcript content                                    | every render  | required   | caller    | released  | null, false, or `[]` counts empty at the top level |
| `emptyState`        | `ReactNode`; omitted                            | Substitutes for top-level empty children                        | empty state   | omitted    | caller    | released  | absent renders no substitute                       |
| `scrollToTopAction` | async function; omitted                         | Invoked when the top sentinel intersects                        | when supplied | omitted    | caller    | released  | absent creates no sentinel or observer             |
| `density`           | `compact`; `balanced`; `spacious`               | Chooses message spacing and child density context               | every render  | `balanced` | component | released  | closed type union                                  |
| `gap`               | published `SpacingStep`; omitted                | Overrides the list's top-level row gap independently of density | every render  | omitted    | caller    | released  | closed type union                                  |
| `align`             | `top`; `bottom`                                 | Positions short content at the start or block end               | every render  | `bottom`   | component | released  | closed type union                                  |
| `isStreaming`       | `true`; `false`                                 | Exposes `aria-busy` on the polite log while streaming           | every render  | `false`    | caller    | released  | boolean                                            |
| root passthrough    | `ref`, accepted DOM/data/ARIA and styling props | Extends the outer log element                                   | every render  | omitted    | caller    | released  | owned role/live/busy attributes retain precedence  |

The table records the implementation's top-level emptiness test; it does not
promise recursive child inspection or resolve the meaning of arbitrary
non-rendering React nodes.

## Behavioral and layout contract

These candidate invariants record observable shipped behavior. A `verify`
state means the audit has not upgraded implementation into policy.

| ID  | Candidate invariant                                                                                                                                                      | Basis                                                  | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------ |
| FR1 | The outer root renders `role="log"`, `aria-live="polite"`, and `tabIndex=0`; `isStreaming=true` adds `aria-busy="true"`, which is absent otherwise.                      | Shipped source, colocated DOM tests and consumer docs  | verify             |
| FR2 | The chosen density is reflected as `data-density` on the root and flows to child messages through `ChatListContext`; it selects three spacing groups.                    | Shipped source, colocated density test, family docs    | verify             |
| FR3 | The optional `gap` replaces only the top-level row gap; density still selects padding and context.                                                                       | Shipped source and consumer docs                       | verify             |
| FR4 | `emptyState` renders only when `children` is nullish, `false`, or an empty top-level array. Otherwise the passed children render unchanged.                              | Shipped source, empty-array and numeric-zero tests     | verify             |
| FR5 | `align="bottom"` includes a flex spacer before messages; `align="top"` omits it. Overflowing content is not given a different rendering path.                            | Shipped source, colocated tests, existing family story | verify             |
| FR6 | Supplying `scrollToTopAction` creates an observed top sentinel. An intersection starts its async transition, and a top-positioned spinner renders while it is pending.   | Shipped source, consumer docs, focused async test      | verify             |
| FR7 | Inside ChatLayout, the inner content element is passed to the layout's `contentRef` and removed from that registration on cleanup; standalone lists have no layout ref.  | Shipped source and context definition                  | verify             |
| FR8 | The root receives `ref`, accepted DOM/data/ARIA props, and composed `className`, `style`, and `xstyle`; component-owned log semantics are applied after forwarded props. | Shipped source and shared public API authority         | verify             |

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

| State                         | Observed result                                       | Allowed variation                          |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Two messages and a system row | Polite log with messages in source order              | Caller controls row content                |
| Empty top-level children      | Optional centered empty state                         | An omitted empty state leaves an empty log |
| Compact/balanced/spacious     | Different token-derived row spacing and child density | `gap` may override only row spacing        |
| Short top/bottom list         | Bottom includes a spacer, top omits it                | Container height is caller-owned           |
| Streaming                     | Log has `aria-busy=true`                              | Message content remains caller-owned       |
| Top action pending            | Spinner above content while transition is pending     | Async action result is caller-owned        |

### Performance and resources

- An `IntersectionObserver` is installed only when `scrollToTopAction` exists,
  and disconnected on cleanup. Its root is ChatLayout's scroll container when
  available, otherwise the document viewport.
- An Effect registers the inner content element with ChatLayout, then clears
  that registration on cleanup. This draft does not prescribe an internal hook
  or listener implementation.

## Accessibility contract

- The shipped root is a focusable polite log with `aria-busy` reflecting
  `isStreaming`; this describes browser-exposed semantics, not an observed
  screen-reader announcement transcript.
- The loading spinner is a separate child of the log. The list adds no
  interactive button or directional keyboard behavior of its own.
- Caller-supplied content remains responsible for names and semantics inside
  messages. This record does not claim one browser/AT pairing proves another.

## Design relationships

No current component-local design decision is added by this observational
backfill. Spacing uses portable semantic token steps. The family consumer doc
owns the published `chat-message-list` theme target and its `density` axis.
This record does not choose a new visual representation or a new theming target.

## Family and system relationships

- No `family:chat` authority record currently exists. `Chat.doc.mjs` is the
  consumer family document, not a product-authority family contract.
- `ChatLayout` owns the scroll container and provides `contentRef`; the list
  registers its content element without taking over ChatLayout's scrolling.
- `spec:AST-029` governs observational audit backfills and keeps their
  evidence inventory separate from component policy.

## Verification map

| Contract | Evidence                                                            | Representative states              | Mutation or failure expectation                          | Audit section              |
| -------- | ------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- | -------------------------- |
| FR1      | `ChatMessageList.test.tsx` ARIA assertions; Chromium audit receipts | rest, streaming                    | Dropping busy or the log role changes the exposed state  | `audit:ChatMessageList/§1` |
| FR2–FR3  | density test, theming-target guard, rendered comparison             | three densities and gap override   | Losing density reflection or row spacing becomes visible | `audit:ChatMessageList/§2` |
| FR4–FR5  | empty/align tests, component-owned Storybook and Chromium receipts  | empty, top and bottom              | Empty substitute or short-list placement changes         | `audit:ChatMessageList/§4` |
| FR6      | `ChatMessageList.test.tsx` async action/status test                 | sentinel absent, pending, settled  | Action loss or stuck spinner fails the focused test      | `audit:ChatMessageList/§6` |
| FR7      | ChatLayout integration and source review                            | standalone, inside layout, unmount | Content observation can lose registration                | `audit:ChatMessageList/§7` |
| FR8      | `themingTargets.test.ts`, focused root passthrough inspection       | ref, DOM/ARIA, styling             | Consumer inputs fail to reach or compose on the root     | `audit:ChatMessageList/§3` |

## Decision log

None. This draft settles no component-local product decision.

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

This file contains no audit score, screenshot matrix, run transcript, consumer
prop example, new public API, or cross-component visual policy.
