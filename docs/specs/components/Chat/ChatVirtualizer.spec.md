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

| Area                    | Contract                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `@astryxdesign/lab` exports `ChatVirtualizer`, its props and its handle. This record holds only what the list owns beside the transcript it windows; consumer usage is in its `.doc.mjs`.                  |
| Behavior                | The list mounts the rows near the viewport, follows the newest message, keeps the row a reader is on still while rows above it measure in, and announces each new message once.                            |
| End-user impact         | People reading a long chat transcript get the same scrolling and keyboard access as an unwindowed one. They hear each new message once, in history too, and never hear history as news.                    |
| Builder impact          | Callers render it inside `ChatMessageList`, or attach it to a scroller they own. They may give the words to announce for a message, and say when a streamed message is complete.                           |
| Compatibility/readiness | Additive experimental Lab component; draft until owner review and real-device evidence settle it.                                                                                                          |
| Review checks           | Reject a second anchoring rule or touch listener set beside Core's, a focused row that unmounts under keyboard focus, a row in a live region, a second run of mounted rows, and history announced as news. |
| Governing rules         | `architecture:public-component-api` INV23, `architecture:react-component-runtime`, `spec:AST-025` FR12, `spec:AST-086` FR1, FR2, FR5 and FR6, and `spec:AST-094`.                                          |

This table is a review projection; the body below is authoritative.

## Intent

ChatVirtualizer lets a chat transcript of thousands of messages cost about one
viewport of DOM. It owns windowing, its position, and the announcement of new
messages in the transcript it windows, so a row mounts only for the window. The
browser's scroll anchoring rule and the finger scroll watch stay with their
owners.

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
- Announcing the new messages of the transcript it windows, through the shared
  polite channel, and keeping every row it mounts out of a live region (AR2).

**Does not own / non-goals**

- The browser's scroll anchoring rule: the list turns anchoring off only
  through Core's scroll-anchoring writer, the rule's one owner.
- Telling a finger's scroll from the program's, and when it ends: Core's
  `useFingerScroll` decides both; the list holds its scrollTop writes while
  that scroll lasts.
- Content added outside its rows, such as a typing indicator beside the list:
  `ChatMessageList`'s `role="log"` delivers it (`spec:AST-086` FR4).
- The words of a message's announcement beyond the default: the caller gives
  them.

## Public concepts

| Concept            | Closed values or states                           | Meaning                                                                                                            | Availability by variant/orientation/state | Default                  |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------ |
| Container mode     | own container, attach                             | Whether the list renders its scroller or uses the caller's                                                         | `scrollElement` absent, or an element     | own container            |
| Scroller name      | caller `label`, or the default                    | The accessible name of the list's own scroll container (AR1)                                                       | Own-container mode only                   | "Messages"               |
| Announcement words | caller words for a message, empty, or the default | What the list announces for one new message; empty words announce nothing (AR2)                                    | Every new message                         | translated "New message" |
| Message completion | complete, streaming                               | Whether a new message is ready to announce; a streaming one is announced when the caller reports it complete (AR2) | Every new message                         | complete                 |

## Behavioral and layout contract

| ID  | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| FR1 | While its scroller is mounted, the list turns the browser's scroll anchoring off on it through Core's scroll-anchoring writer, and hands it back on unmount; the caller's own `overflow-anchor` is never read or written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                     |
| FR2 | While a finger scrolls the list (from its first scroll until it ends, momentum included, as `useFingerScroll` reports), the list writes no scrollTop; position corrections go to the top spacer, and settle when that scroll ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                     |
| FR3 | A row that holds focus stays mounted while the window moves away from it, with a spacer between it and the window, so the scroll geometry does not change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                     |
| FR4 | While the reader scrolls, the list reads the scroller's scroll position and size in one batched pass per scroll event, before any write, because the rows it mounts depend on them; the scroll handler writes nothing to the DOM, so it forces no layout. A correction pass runs only when the content changes (an append, a row's measured size, or the window mounting other rows), the scroller's size changes, a sizing prop changes (overscan, the estimated row size, the row-type reader), a caller declares a position, or a finger's scroll ends; a pass whose scroll write the browser clamped runs once more on the next frame, and a history load's pass releases its hold on the next frame. It never runs for a scroll event alone or for a commit that changes none of these, such as a parent re-render with the same rows. Each pass writes its spacers, reads in one batch, writes its spacers and the scroll position, and reads the scroll position once more to claim any move the browser made itself, so it forces at most two layouts (`architecture:react-component-runtime` INV18). | `architecture:react-component-runtime` INV18 |

### Performance and resources

- **PR1 — One run of mounted rows.** The list mounts one contiguous run of
  rows, the window and its overscan, between a top and a bottom spacer, plus at
  most the one focused row that FR3 keeps. A message appended outside the
  window mounts only when the window reaches it, at any transcript length and
  for any batch size (DEC-1).

## Accessibility contract

- **AR1 — Keyboard access.** In own-container mode the scroll container is a
  `group` named by the list's `label`, else the translated "Messages", and
  keyboard users can focus and scroll it (`spec:AST-025` FR12). In attach mode
  the caller's scroller owns this.
- **AR2 — New messages are announced; rows are not live.** No row the list
  mounts is in a live region, so a commit that mounts rows announces nothing:
  the window moving, history loading above, or a thread loading. The list
  announces new messages through the shared polite channel (`spec:AST-086`
  FR2, FR5), once per occasion (FR6), wherever the reader is and whether or
  not the row is mounted (DEC-1).
  - A new message is one appended after the last message of the previous data,
    or the first message of an empty transcript. A thread loaded into an empty
    list in one change, a thread that replaces the rows, and history loaded
    above are not new.
  - A new message is ready on the data change that appends it. A message the
    caller reports as streaming is ready on the first data change that reports
    it complete. A message removed before it is ready is not announced.
  - The messages that become ready on one data change are one occasion. One
    message announces its announcement words; several announce their count,
    such as "3 new messages".
  - A message's row stays readable in browse mode once the window reaches it
    (`spec:AST-086` FR7).

## Design relationships

None beyond the Chat family's own records.

## Family and system relationships

- `component:ChatMessageList` owns the transcript's log, which delivers content
  added outside this list's rows. It keeps its log semantics while it hosts
  this list.
- `architecture:list-windowing` owns which module computes a window; PR1 keeps
  the mounted rows in the shape that module computes.
- `component:ChatLayout` runs its own follow on its scroller, so the list does
  not attach to it.

## Verification map

| Contract | Verification                                                                                                                | Representative states                                                                                                                                                                                                                                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                                                                                                           | Audit section                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1      | `ChatVirtualizer.test.tsx` anchoring test                                                                                   | attach mode with a caller inline `overflow-anchor`                                                                                                                                                                                                                                                                                                                         | Anchoring left on, the caller's inline value changed, or the attribute kept after unmount fails.                                                                                                                                                                                                                                          | `audit:ChatVirtualizer/behavior`    |
| FR2      | `ChatVirtualizer.test.tsx` finger-scroll tests                                                                              | finger down, momentum after the lift, scroll end, no finger                                                                                                                                                                                                                                                                                                                | A scrollTop write during a finger scroll, or a gate still held after it ends, fails.                                                                                                                                                                                                                                                      | `audit:ChatVirtualizer/interaction` |
| FR3, AR1 | `ChatVirtualizer.test.tsx` keyboard tests                                                                                   | default and caller label; a focused row scrolled away                                                                                                                                                                                                                                                                                                                      | A missing group name, or a focused row that unmounts, fails.                                                                                                                                                                                                                                                                              | `audit:ChatVirtualizer/a11y`        |
| AR2      | `ChatVirtualizer.test.tsx` live-status test, and announcement tests on the channel spy                                      | window moving over history; history loaded above; a thread loaded into an empty list, and one replacing the rows; the first message of an empty transcript; a tail append while following and while in history; a streamed reply, complete later; a 2,000-message batch; caller words, empty words, and the default; a rerender and a StrictMode replay with the same data | A row with a live status in the accessibility tree, history or a loaded thread announced, a new message not announced or announced twice, a streamed message announced before it is complete, or a batch announced other than once with its count, fails. Evidence gap: spoken behavior is unchecked until a VoiceOver and an NVDA check. | `audit:ChatVirtualizer/a11y`        |
| PR1      | `ChatVirtualizer.test.tsx` mounted-row tests                                                                                | a tail append while in history; a 2,000-message batch while following and while in history; a thread switch while in history; a focused row scrolled away                                                                                                                                                                                                                  | A mounted row outside the window and its overscan, other than the one focused row, fails.                                                                                                                                                                                                                                                 | `audit:ChatVirtualizer/behavior`    |
| FR4      | `ChatVirtualizer.test.tsx` layout trace: reads of scroll geometry, rects and row sizes, and writes to spacers and scrollTop | an append while following; scrolling up over history; an append in history; a fling of scroll events; a parent re-render with the same rows                                                                                                                                                                                                                                | A correction pass with more than two write-then-read turns (two forced layouts), a scroll event that writes to the DOM or reads the scroller's size more than once, or a pass for a commit that changes nothing it reads, fails.                                                                                                          | `audit:ChatVirtualizer/behavior`    |

## Decision log

### DEC-1 — A windowed transcript announces new messages through the shared channel

**Reference:** `component:ChatVirtualizer/DEC-1`
**Decider:** pending (the component owner)

A live log reads only what is added inside it. Delivery by the log therefore
needs each new message's row mounted, and every other mount kept from being
read. The shared channel keeps the two apart: a window move announces nothing,
a new message is heard while the reader is in history, and the mounted rows
stay one run plus a focused row (PR1). The channel speaks plain text, so a code
block or a list loses its structure in the announcement; the full message stays
readable in browse mode when the reader reaches it. The default words are short
because the list cannot read the text of a row it has not mounted.

Rejected: delivery by `ChatMessageList`'s log, with other mounts marked `aria-busy` — screen readers differ in honoring `aria-busy` inside a live region.

Rejected: `ChatMessageList` dropping its log role while it hosts the list — the log still delivers content added beside the list.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
