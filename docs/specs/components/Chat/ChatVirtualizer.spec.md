---
schema_version: 3
template_version: 7
kind: component
id: component:ChatVirtualizer
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [yyq1025]
review_triggers: [behavior, accessibility, interaction, testing]
verified_by:
  [packages/lab/src/Chat/ChatVirtualizer.test.tsx, scripts/check-knowledge.mjs]
modules: []
families: []
design_specs: []
architecture:
  [architecture:public-component-api, architecture:react-component-runtime]
contributing: []
system_specs: [spec:AST-025, spec:AST-086, spec:AST-094]
---

# ChatVirtualizer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `@astryxdesign/lab` exports `ChatVirtualizer`, its props and its handle. This record holds only what the list owns beside the transcript it windows; consumer usage is in its `.doc.mjs`. |
| Behavior                | The list keeps the rows near the viewport mounted, follows the newest message, and keeps the row a reader is on still while rows above it measure in.                                     |
| End-user impact         | People reading a long chat transcript get the same scrolling, keyboard access and screen reader news as an unwindowed one.                                                                |
| Builder impact          | Callers render it inside `ChatMessageList`, or attach it to a scroller they own.                                                                                                          |
| Compatibility/readiness | Additive experimental Lab component; draft until owner review and real-device evidence settle it.                                                                                         |
| Review checks           | Reject a second anchoring rule or touch listener set beside Core's, a focused row that unmounts under keyboard focus, and history rows announced as new messages.                         |
| Governing rules         | `architecture:public-component-api` INV23, `architecture:react-component-runtime`, `spec:AST-025` FR12, `spec:AST-086` FR1, and `spec:AST-094`.                                           |

This table is a review projection; the body below is authoritative.

## Intent

ChatVirtualizer lets a chat transcript of thousands of messages cost about one
viewport of DOM. It owns windowing and its position. Delivery of new messages
to assistive technology, the browser's scroll anchoring rule, and the finger
scroll watch stay with their owners.

## Compatibility and migration

- Released default preserved: `yes` (new Lab component)
- Compatibility class: additive experimental
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

## Ownership boundary

**Owns**

- Which rows are mounted, the spacers that stand for the rest, and the scroll
  position it restores (follow-at-end or a row identity).
- Keeping a row that holds focus mounted while the window moves away from it.
- Its own scroll container's keyboard access, through Core's
  `useScrollableArea`.

**Does not own / non-goals**

- The browser's scroll anchoring rule: the list turns anchoring off only
  through Core's scroll-anchoring writer, the rule's one owner.
- Telling a finger's scroll from the program's, and when it ends: Core's
  `useFingerScroll` decides both; the list holds its scrollTop writes while
  that scroll lasts.
- Delivering new messages to assistive technology: `ChatMessageList`'s
  `role="log"` delivers them (`spec:AST-086` FR1).

## Public concepts

| Concept        | Closed values or states        | Meaning                                                      | Availability by variant/orientation/state | Default       |
| -------------- | ------------------------------ | ------------------------------------------------------------ | ----------------------------------------- | ------------- |
| Container mode | own container, attach          | Whether the list renders its scroller or uses the caller's   | `scrollElement` absent, or an element     | own container |
| Scroller name  | caller `label`, or the default | The accessible name of the list's own scroll container (AR1) | Own-container mode only                   | "Messages"    |

## Behavioral and layout contract

| ID  | Requirement                                                                                                                                                                                                                        | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | While its scroller is mounted, the list turns the browser's scroll anchoring off on it through Core's scroll-anchoring writer, and hands it back on unmount; the caller's own `overflow-anchor` is never read or written.          | Current source and tests |
| FR2 | While a finger scrolls the list (from its first scroll until it ends, momentum included, as `useFingerScroll` reports), the list writes no scrollTop; position corrections go to the top spacer, and settle when that scroll ends. | Current source and tests |
| FR3 | A row that holds focus stays mounted while the window moves away from it, with a spacer between it and the window, so the scroll geometry does not change.                                                                         | Current source and tests |

## Accessibility contract

- **AR1 — Keyboard access.** In own-container mode the scroll container is a
  `group` named by the list's `label`, else the translated "Messages", and
  keyboard users can focus and scroll it (`spec:AST-025` FR12). In attach mode
  the caller's scroller owns this.
- **AR2 — History is not news.** A commit that mounts rows that are not new
  messages (the window moving over history, or history loading above) marks
  the content block `aria-busy="true"` until the frame after it, so the log
  does not read those rows out as new. A message appended at the tail mounts
  unmarked, and the log delivers it.

## Design relationships

None beyond the Chat family's own records.

## Family and system relationships

- `component:ChatMessageList` owns the transcript's log and its delivery.
- `component:ChatLayout` runs its own follow on its scroller, so the list does
  not attach to it.

## Verification map

| Contract | Verification                                   | Representative states                                       | Mutation or failure expectation                                                                                                                                                                                                        | Audit section                       |
| -------- | ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1      | `ChatVirtualizer.test.tsx` anchoring test      | attach mode with a caller inline `overflow-anchor`          | Anchoring left on, the caller's inline value changed, or the attribute kept after unmount fails.                                                                                                                                       | `audit:ChatVirtualizer/behavior`    |
| FR2      | `ChatVirtualizer.test.tsx` finger-scroll tests | finger down, momentum after the lift, scroll end, no finger | A scrollTop write during a finger scroll, or a gate still held after it ends, fails.                                                                                                                                                   | `audit:ChatVirtualizer/interaction` |
| FR3, AR1 | `ChatVirtualizer.test.tsx` keyboard tests      | default and caller label; a focused row scrolled away       | A missing group name, or a focused row that unmounts, fails.                                                                                                                                                                           | `audit:ChatVirtualizer/a11y`        |
| AR2      | `ChatVirtualizer.test.tsx` busy test           | window moving over history; a tail append while following   | History mounted without `aria-busy`, or a tail append marked busy, fails. Evidence gap: whether `aria-busy` keeps history from being spoken varies by screen reader; spoken behavior is unchecked until a VoiceOver and an NVDA check. | `audit:ChatVirtualizer/a11y`        |

## Decision log

None recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
