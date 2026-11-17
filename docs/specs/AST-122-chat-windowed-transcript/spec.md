---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-122
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture:
  [
    architecture:list-windowing,
    architecture:component-import-boundaries,
    architecture:react-component-runtime,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs:
  [ChatMessageList, ChatLayout, useChatMessageListVirtualization]
---

# Windowed chat transcript system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/Chat/ChatMessageList*",
    "packages/core/src/Chat/ChatLayout.tsx",
    "packages/core/src/Chat/useChatStreamScroll.ts",
    "packages/core/src/virtualization/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person reads a chat conversation of hundreds or thousands of messages, and
the page holds about one screen of message rows. The conversation opens at its
newest message, a streaming reply stays in view, and the message the person
reads stays in place while rows measure, older messages load above, and new
messages arrive below. A product keeps ChatLayout, its stream scroll, its
scroll-to-bottom button and the older-message sentinel when it windows its
transcript.

## Non-goals

- Windowing children. A list of caller children renders every child, as
  `component:ChatMessageList` describes.
- Windowing outside ChatLayout. A list that no ChatLayout holds renders every
  item (FR3).
- Fetching, paging or caching messages. The caller owns its data;
  `scrollToTopAction` keeps its contract.
- Browser find in page over unmounted rows (AR4).
- Lab's `component:ChatVirtualizer`, which keeps its own record.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Public contract

```tsx
const virtualization = useChatMessageListVirtualization();
const listRef = useRef<ChatMessageListHandle>(null);

<ChatLayout composer={<ChatComposer onSubmit={send} />}>
  <ChatMessageList
    items={messages}
    getItemKey={message => message.id}
    renderItem={renderMessage}
    estimateItemSize={message => (message.kind === 'tool' ? 48 : 120)}
    virtualization={virtualization}
    handleRef={listRef}
    scrollToTopAction={loadOlder}
    isStreaming={isStreaming}
  />
</ChatLayout>;

listRef.current?.scrollToItem(messageId, {align: 'center'});
```

## Requirements

- **FR1 — An item model beside children.** ChatMessageList accepts `items`,
  `getItemKey` and `renderItem` in place of `children`. It renders one row per
  item, in order, keyed by `getItemKey`. Without `virtualization`, every item
  renders in the list's column as children do. An empty `items` array shows
  `emptyState`. The item model's props are the public type
  `ChatMessageListItemsProps<T>`, beside `ChatMessageListProps`, whose shape
  and children behavior do not change. Chat also exports
  `useChatMessageListVirtualization` and the types
  `ChatMessageListVirtualizationCapability`, `ChatMessageListHandle`,
  `ChatMessageListItemAlign` and `ChatMessageListScrollToItemOptions`.
- **FR2 — Windowing is an opt-in capability.** `useChatMessageListVirtualization()`
  returns an opaque capability that stays the same for the life of the
  component that calls the hook. ChatMessageList windows its items only while
  `virtualization` carries that capability. ChatMessageList and ChatLayout
  import no windowing code; the capability carries the windowed renderer
  (`architecture:component-import-boundaries` INV7).
- **FR3 — ChatLayout owns the scrollport.** Inside ChatLayout, the list windows
  against the layout's scroll container: the layout root, or the element that
  `scrollRef` names, the page included. Outside a ChatLayout, the list renders
  every item and warns once in development.
- **FR4 — What mounts.** The list mounts the rows that cover the scrollport,
  the rows within one scrollport height above it and half a scrollport height
  below it (at least 200 CSS px each), the last item (FR10), and one row that
  holds focus (AR3). Gaps stand for every other item. A gap's height is the sum of its items'
  measured sizes, or `estimateItemSize` for an item that has not rendered,
  96 CSS px by default, so the scroll range stands for the whole
  conversation. A scroll that stays inside half of that overscan keeps the
  mounted rows. The space between two rows is inside the later row, so each
  row's measured size includes it.
- **FR5 — The conversation opens at its end.** On the server, and on the client
  before the scroll container measures, the first window covers the end of
  the list at an 800 CSS px seed height. Before the first frame paints, the
  list moves the position to the end of the scroll range.
- **FR6 — Rows measure themselves.** A row reports its border-box height in the
  commit that mounts it, and again through Core's pooled resize observer each
  time it changes, as while a reply streams into it. The list keeps each
  measured size by key while its row unmounts, remounts, and moves to another
  index.
- **FR7 — End anchoring.** While ChatLayout's stream scroll follows the newest
  message, and while the list opens, the last item is the anchor. A size
  change of any item above it and a change of keys keep the last item's top
  at the same distance from the scrollport's bottom, in the frame of the
  change. A change of the scrollport's height keeps that distance too. The
  last item's own growth and appended items are new content (FR10).
- **FR8 — Row anchoring.** Otherwise the anchor is the item at the
  scrollport's top, at the position of the last scroll event (FR9). A size change of an item above
  it, items that load above it, and a removal keep its top at the same
  distance from the scrollport's top. A removed anchor gives its place to its
  first surviving successor, then to its nearest surviving predecessor. When
  no item survives a change of keys, the list moves to the end of the new
  list.
- **FR9 — One writer.** The list never writes the scroll position itself
  while a stream scroll runs on the layout's scroll container. It asks that
  stream scroll to move the position by an amount, and to stop following
  before a reveal. The stream scroll does not read those moves as the
  reader's, and a follow in flight moves with them. The list takes the
  position the stream scroll reads for each scroll event and reads none
  itself. When content above the end gets shorter, the browser clamps the
  position onto the end of the shorter range; the list does not read that
  clamp as another writer's move.
- **FR10 — New content comes from the newest row.** The last item stays
  mounted, and its row is the only element the list registers with
  ChatLayout's content observer (`ChatLayoutContext.contentRef`). The growth
  of that row, as while a reply streams, and the new row of an appended item
  reach the stream scroll's follow and the default scroll button's New
  messages state as new content does for children. A correction and a move
  of the window change neither, so they never start a follow or set New
  messages. As for children, New messages counts ChatMessage rows. ChatLayout
  and its scroll button do not change.
- **FR11 — Reveal by key.** While the list windows, `handleRef` receives a
  handle with `scrollToItem(key, {align})`. It places the item, mounted or
  not: its top at the scrollport's top for `'start'` (the default), its
  center at the scrollport's center for `'center'`, or its bottom at the
  scrollport's bottom for `'end'`, clamped to the scroll range. The item
  takes the place, not the space before it inside its row. It stops the
  follow. The reveal holds through every move of the position until it is
  written. The item then keeps its place while it and the rows around it
  measure, until another writer, the reader or the follow, moves the
  position. `scrollToItem` returns false and does nothing for a key no item
  has.
- **FR12 — A scroll keeps its motion.** From a scroll event the list did not
  cause until that scroll ends, the list writes no scroll position for a row
  anchor's correction (FR8): the element that holds the rows moves by the
  correction instead, whatever its size, so the reader's row stays in place.
  Such a scroll comes from a finger and its momentum, a wheel, a scrollbar
  or keys. The scroll ends at its `scrollend` event, or 150 ms after its
  last scroll event where no `scrollend` fires. Then the element returns to
  its place and the list moves the position by the same amount, in one
  frame. While the stream scroll follows the newest message, the end is the
  anchor (FR7): its correction is written at once and moves the follow with
  it (FR9).
- **FR13 — Older history.** `scrollToTopAction` keeps its sentinel above the
  first item. It fires when the reader reaches the top of the list, and the
  items it loads keep the reader's item in place (FR8).
- **FR14 — The browser does not anchor the rows.** While it windows, the list
  turns the browser's scroll anchoring off on the element that holds its rows,
  through Core's scroll-anchoring owner module
  (`architecture:public-component-api` INV23), and gives it back on unmount.
  The scroll container's own anchoring stays with the stream scroll.

### Accessibility contract

- **AR1 — The log is unchanged.** The list keeps `role="log"`,
  `aria-live="polite"`, `tabIndex=0` and the `aria-busy` that `isStreaming`
  sets (`component:ChatMessageList` FR1).
- **AR2 — History is not news.** A commit that mounts rows that are not
  appended at the end marks the element that holds the rows
  `aria-busy="true"` until the next animation frame. Such commits come from
  the window moving over history, a reveal, items loading above, and a
  replaced conversation. An append mounts unmarked. Evidence gap: whether
  `aria-busy` keeps those rows from being spoken varies by screen reader, and
  DOM evidence does not show what VoiceOver or NVDA speaks.
- **AR3 — Focus stays.** A row that holds focus stays mounted while the window
  moves away from it, through the shared focus island of
  `architecture:list-windowing`. When its item is removed, focus moves to the
  log, the `tabIndex=0` element of AR1.
- **AR4 — Find in page sees mounted rows.** Browser find in page and a screen
  reader's virtual cursor reach only mounted rows. The consumer docs say so,
  and send find in a conversation to a search of the items and
  `scrollToItem`.

### Performance and resources

- **PR1 — Layout reads.** On the scroll path the list reads no layout: it
  takes the position the stream scroll reads for each scroll event, and
  writes nothing then. A correction pass reads the scroll container's position and
  size, the list's offset and the rows that mounted, in one batch before any
  write (`architecture:react-component-runtime` INV18). A commit that mounts
  no row, changes no key, and holds no reveal or correction reads and writes
  nothing.
- **PR2 — Shared owners.** Rows and the scroll container use Core's pooled
  resize observer. The page's `scrollend` and resize use the shared input
  stream (`architecture:react-component-runtime` INV16). Every
  listener, observer, timer and animation frame ends on unmount (INV5).
- **PR3 — Unused cost.** A page that renders ChatMessageList and ChatLayout
  without the capability carries only its wiring
  (`architecture:component-import-boundaries` INV10).

### Platform support

- Supported feature/engine floor: every supported browser; rows observe their
  size through `ResizeObserver`. Where no `scrollend` event fires, a scroll
  ends 150 ms after its last scroll event (FR12).
- Unsupported behavior: with no `ResizeObserver`, rows measure once as they
  mount, and a later size change keeps its measured size until the row
  remounts.
- Browser evidence: DOM and scroll-position assertions over a scripted
  layout that clamps the position as a browser does, for FR1–FR14 and
  AR1–AR3; real-browser checks in Chromium at phone and desktop widths for
  FR5, FR7, FR10 and FR11.

## Current-state impact

- `component:ChatMessageList`: its public contract gains the FR1 types and
  props. FR4 (the empty state) gains the item-model case. FR7 amendment: a
  windowed list registers its newest row with ChatLayout's content observer,
  not its content element (FR10).
- `component:ChatLayout`: its public shape does not change. A windowed list
  registers its newest row through `ChatLayoutContext.contentRef`. The
  stream scroll gains a private shift and a listener for the position it
  reads on each scroll event (FR9).
- `architecture:list-windowing`: the block axis has measured rows beside one
  shared pitch, the last item can stay mounted beside the focus island, and
  Chat's message list windows through the shared module. INV3 amendment:
  adopting the module changes no consumer's public API, except an opt-in API
  that a system spec defines for the consumer; FR1's item model and FR2's
  capability are that API for ChatMessageList.
- `architecture:react-component-runtime` INV18 amendment: the
  stream scroll of `component:ChatLayout` reads its scroll container's
  position once per scroll event, before any write, to follow the newest
  message; a windowed list takes that read and makes none of its own on the
  scroll path (FR9, PR1).
- `architecture:component-import-boundaries`: ChatMessageList's windowing is
  reachable only through `useChatMessageListVirtualization`.
- `useChatStreamScroll` keeps its public options and return value.
- Consumer docs: `ChatMessageList.doc.mjs`,
  `useChatMessageListVirtualization.doc.mjs`, and the hook's example block.

## Verification

| Contract  | Verification                                                                                           | Representative states                                                                                               | Mutation or failure expectation                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| FR1       | ChatMessageList item-model tests                                                                       | items without virtualization; an empty array with `emptyState`                                                      | An item that does not render, renders out of order, or an empty state that does not show, fails.                     |
| FR2, FR3  | Windowing tests; the hook's example-block test                                                         | the capability inside and outside ChatLayout                                                                        | Windowing without the capability, every row mounted inside ChatLayout, or no warning outside it, fails.              |
| FR4, FR5  | Windowing tests over a scripted layout; measured-window math tests                                     | a 5,000-message conversation at open; a 2,000-message example block                                                 | More than about one screen of rows, a first window away from the end, or a scroll range off the sizes, fails.        |
| FR6, FR7  | End-anchor tests; the Chromium spec                                                                    | a row above the last one grows, or gets shorter and the position clamps; the last row streams; a shorter scrollport | The last row's top moving, or a distance from the end other than zero, fails.                                        |
| FR8, FR13 | Row-anchor tests; the sentinel test                                                                    | a row above the reader resizes; 100 items load above; the reader's item is removed; the sentinel intersects         | The reader's row moving, a scroll position that does not grow by the loaded items' sizes, or no action, fails.       |
| FR9, FR10 | Stream-scroll shift and position tests; windowing growth and new-message tests; the Chromium spec      | a correction upward while following; a clamp; a shift during a follow; a streamed reply; an append in history       | Following that stops after a correction or a clamp, an append that is not followed, or no New messages, fails.       |
| FR11      | `scrollToItem` tests; the Chromium spec                                                                | an unmounted item at `'start'`, with rows shorter than their estimates; `'center'` and `'end'`; an unknown key      | The item away from its place, a follow that continues, or true for an unknown key, fails.                            |
| FR12      | Scroll-in-motion tests                                                                                 | a row above the reader grows during a scroll, also at the top of loaded history; `scrollend`; 150 ms; after it ends | A write during the scroll, no write when it ends, or a held change after it ended, fails.                            |
| FR14      | Review of the scroll-anchoring writer's callers                                                        | the windowed list mounted and unmounted                                                                             | A write of the anchoring attribute outside its owner module fails review.                                            |
| AR1–AR3   | Log-semantics, busy and focus tests                                                                    | item mode at rest; the window moving over history; a new message; a focused row scrolled away, then removed         | A lost log attribute, history unmarked, an append marked busy, a focused row unmounted, or focus off the log, fails. |
| PR1–PR3   | Review; a first-load size comparison of ChatMessageList and ChatLayout with and without the capability | a parent render with the same rows; a page without the capability                                                   | A pass that reads layout for an unchanged commit, or more than the wiring allowance where unused, fails.             |

Evidence gap: neither the scripted layout nor the Chromium checks show a
painted frame. Frame traces in Chromium and in Safari on iOS, with a finger's
momentum for FR12, check FR5, FR7 and FR12 for a frame that paints rows away
from their anchor.

## Decision log

### DEC-1 — Windowing is a capability on the item model

**Reference:** `spec:AST-122/DEC-1`
**Decider:** pending

ChatMessageList windows an item model when `virtualization` carries the
capability from `useChatMessageListVirtualization()`. A windowed list must
size, key and render items it has not mounted, which caller children cannot
express. The capability keeps the windowing code off every page that renders
a list without it.

Rejected: windowing built into ChatMessageList, because every chat page would
carry its code (`architecture:component-import-boundaries` INV7, INV10).
Rejected: a public headless chat virtualizer hook that ChatLayout wires,
because windowing hooks stay private (`architecture:list-windowing` INV2).

### DEC-2 — The stream scroll is the one writer

**Reference:** `spec:AST-122/DEC-2`
**Decider:** pending

The list asks the stream scroll for every position change. The stream scroll
reads the reader's intent from moves it did not make, so a second writer
would stop the follow on every upward correction.

Rejected: a list that writes the scroll position itself, for that reason.

### DEC-3 — The follow state decides end anchoring

**Reference:** `spec:AST-122/DEC-3`
**Decider:** pending

The last item is the anchor exactly while the stream scroll follows the
newest message, so the list and the layout share one rule for being at the
end. The last item's own growth stays the stream scroll's to follow, so a
streaming reply keeps the motion it has without windowing.

Rejected: a separate distance band for the end, because two rules would
disagree near the bottom.

### DEC-4 — New content comes from the newest row

**Reference:** `spec:AST-122/DEC-4`
**Decider:** pending

A windowed list's height changes when an estimate becomes a measured size,
with no new content. The newest row changes only with new content, so the
layout's follow and New messages keep their rules when they observe that row
alone, and ChatLayout does not change.

Rejected: observing the element that holds every row, because estimate
corrections would start follows and set New messages.
Rejected: a growth report from the list to ChatLayout, because ChatLayout
would carry that wiring on every chat page (`architecture:component-import-boundaries` INV10).

### DEC-5 — A reveal names an item by key

**Reference:** `spec:AST-122/DEC-5`
**Decider:** pending

`scrollToItem` takes the item's key, because the reader's target keeps its key
while items load above it and its index moves.

### DEC-6 — Fixed defaults and no length threshold

**Reference:** `spec:AST-122/DEC-6`
**Decider:** pending

The estimate defaults to 96 CSS px. The overscan is one scrollport height
above and half a height below, and it is not a public option. A list with the
capability windows at any length, so a live conversation never switches
between a full render and a windowed one.

Rejected: a message count above which the list starts to window, because a
growing conversation would switch render paths while the reader reads.

### DEC-7 — Windowing needs ChatLayout

**Reference:** `spec:AST-122/DEC-7`
**Decider:** pending

ChatLayout owns the scroll container, the follow and the scroll button. A list
outside it has no scrollport to window against, so it renders every item.

Rejected: a list that becomes its own scroll container outside ChatLayout,
because the follow, the scroll button and the dock would not reach it.

### DEC-8 — Find in page is a documented trade

**Reference:** `spec:AST-122/DEC-8`
**Decider:** pending

Unmounted rows are not in the document, so browser find in page cannot reach
them. The consumer docs name the trade and the route around it: search the
items and call `scrollToItem`.

Rejected: hidden text for unmounted rows, because it costs the DOM that
windowing saves.

### DEC-9 — Corrections wait for a scroll to end

**Reference:** `spec:AST-122/DEC-9`
**Decider:** pending

A position write during a finger's momentum stops it, and a write during a
smooth scroll fights it. The list holds a row anchor's corrections as an
offset of the element that holds the rows, from a scroll it did not cause
until that scroll ends, whatever moves the position. An end anchor's
corrections are written at once, so the end stays in place while the
follow moves it.

Rejected: holding corrections in the gap above the rows, because near the
top of loaded history, where older messages load during a scroll, no gap
sits above them.
Rejected: holding corrections only for a finger's scroll, through Core's
finger-scroll watch, because that watch loads Core's gesture host, several
times the cost of the window itself, on every page that windows a
conversation.

## Open questions

- **OQ1 — Does `handleRef` also work without `virtualization`?** (`human-api`)
  Without the capability every row is mounted, and the caller can scroll its
  own elements. One option sets the handle in both modes, so a product can
  turn windowing on without changing its find code; the other sets it only
  while the list windows, so the handle exists only where it is needed.
