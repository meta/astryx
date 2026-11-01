---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-092
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: [Typeahead, Tokenizer, BaseTypeahead]
---

# Incremental search results system spec

## Intent

A person typing into a typeahead sees matches for what they typed right away,
from results the page already holds, and sees results from the server join the
same list for the same query when they arrive. Each keystroke changes the
list at most once; server results only add rows below the ones already shown,
so nothing moves under the person's pointer or highlight, and a screen-reader
user hears the result count once per query, not once per arrival.

A search source answers one query with one or more lists. Each list is the
source's complete answer at that moment; the source owns how its local and
remote results merge, dedupe, and order. The typeahead shows the latest list
for the current query and owns stale-query rejection, highlight, loading
feedback, and announcements.

## Non-goals

- How a source finds local matches, caches earlier queries, merges, dedupes, or
  orders results, within the append-only rule for later lists (FR2). The
  source owns all of it (DEC-1).
- `bootstrap()`. It answers with one list.
- When a source sends its remote request. A source that shows local results
  first and wants the remote request delayed delays it itself.
- Components that call `search(query)` without a context: `CommandPalette`
  and `ChatComposerInput` trigger menus. They show the settled list (FR10).
  `PowerSearch` value editors render Typeahead and Tokenizer and get this
  behavior through them.
- Escape while a query is pending. `component:BaseTypeahead` FR3 owns it; a
  partial list follows the same rule as a settled one.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Every list is the source's complete answer.** `search(query,
context)` receives an optional `SearchContext` whose `update(items)` replaces
  the results shown for that query. Each list a source gives, through `update` or
  as its return value, is complete, ordered, and free of duplicate `id`s for
  that query at that moment. The typeahead shows each non-empty list as given,
  capped at its result cap; an empty `update` leaves the shown rows in place
  (FR5). It never merges, reorders, or dedupes lists. Tokenizer removes
  committed values from every list, partial or final, as `component:Tokenizer`
  FR13 requires. Its create row follows the rows and, for a searched query,
  appears only once the query settles, so it never offers a value a pending
  server result is about to show.
- **FR2 — One reflow per keystroke; later lists only append.** The first list
  shown for a query may replace the rows shown before it. Every later non-empty
  list for the same query, including the final one, keeps the rows already
  shown, by `id`, first and in the order the typeahead displays them, and every
  new row displays after them. The typeahead displays ungrouped rows first and
  then each group in order of first appearance, so a new row can join only the
  last displayed group or start a group after it. A later list never removes,
  reorders, or displays a new row above a shown row, even for a result that
  would rank higher. A row whose `id` returns with fresher data stays in its
  place. When a later list breaks this rule, the typeahead shows it as given and
  warns in development that the source moved, removed, or inserted above shown
  rows.
- **FR3 — The return value settles the query.** The array a source returns, or
  the value its promise resolves to, is the final list for the query. It
  replaces any earlier list under FR2, ends the query's busy state, and is the
  last list shown for it. An `update` call after the query settles has no
  effect.
- **FR4 — Only the current query is shown.** A list for a query that is no
  longer current is dropped, whether it comes from `update` or from the return
  value. A query stops being current when the person types a newer query,
  selects a result, clears the field, or when the source is replaced or the
  typeahead unmounts.
- **FR5 — A pending query shows its partial lists.** While a query is pending,
  a non-empty `update` shows its rows and opens the popup. An empty `update`
  leaves the shown rows in place. The control stays busy, with its loading
  indicator, until the query settles. The empty-result row appears only when the
  query settles with an empty final list.
- **FR6 — The highlight and scroll position stay put.** The first list shown for
  a new query highlights its first row. When a later list for the same query
  arrives, the highlighted item stays highlighted and the list keeps its scroll
  position. A later list never moves the popup to the other side of the field
  or moves its shown rows on screen: a popup above the field keeps its height,
  and a popup below the field grows only within the room below it. Rows beyond
  that are reached by scrolling the list. When a list that breaks FR2 moves the
  highlighted item, the
  highlight follows the item; when it drops the item, the first row is
  highlighted. Enter selects the highlighted item.
- **FR7 — An option keeps its identity while its item stays.** While an item
  remains in the lists of one query, its option element and its id stay the
  same. The active descendant keeps referencing the same option, so assistive
  technology does not re-read the highlighted row when rows are added after
  it.
- **FR8 — One result announcement per query.** The typeahead announces the
  result count once per query, when the query settles. A partial list announces
  nothing. Busy start is announced once per query as `spec:AST-086` FR6 and
  FR8 require.
- **FR9 — A failed remote answer keeps what was shown.** When a source's promise
  rejects after a non-empty `update` for the current query, the last non-empty
  list stays, the query settles, and its count is announced. When it rejects
  with no non-empty `update` for the current query, the query settles with an
  empty list and shows the empty-result row. A rejection that follows the
  typeahead's own `cancel()` when its popup closes is not a failed answer:
  nothing is announced, and the query settles with the last non-empty list for
  the current query; with none, it keeps no rows, and the next keystroke
  searches again.
- **FR10 — A single answer is still a complete answer.** A source that never
  calls `update` is shown one list per query, when the query settles. A caller
  that does not pass a context calls `search(query)` and shows only the settled
  list, which FR1 makes complete.

### Platform support

- Supported feature/engine floor: the package's supported browsers. The
  contract uses no platform feature beyond those `search()` already uses.
- Unsupported behavior: none.
- Browser evidence: DOM and accessibility-tree checks of rows, highlight, the
  active descendant, busy state, and the announcement channel across a partial
  list and its settled list.

## Current-state impact

- `SearchSource.search` gains an optional second parameter, a context with
  `update(items)`. `createStaticSource` and every existing source keep working
  unchanged.
- `component:BaseTypeahead`: FR3 and PR1 cover partial lists through FR4 here;
  AR4 announces once per query through FR8 here; option ids follow item
  identity within a query (FR7); a development warning reports a later list
  that breaks FR2.
- `component:Tokenizer`: FR13 applies to every partial and final list; the
  create row waits for a searched query to settle (FR1). Typeahead and Tokenizer inherit this through
  BaseTypeahead and add no props.
- `family:input-fields`: busy feedback is unchanged; a pending query stays busy
  while partial lists show.
- Consumer docs: the `SearchSource` reference and the Typeahead docs describe
  `update`, and that a source showing local results first pairs with
  `debounceMs={0}` and delays its own remote request.

## Verification

| Contract | Verification                                                           | Representative states                                                                                                                                                                                                              | Mutation or failure expectation                                                                                                                                           |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3 | BaseTypeahead source-contract tests                                    | synchronous update then promise, several updates, cap smaller than list                                                                                                                                                            | rows that merge lists, reorder a list, exceed the cap, or change after settle fail                                                                                        |
| FR2      | append-only tests with a deferred source, plus the development warning | local list then server list, fresher data under a shown id, grouped results with rows appended to the last group or a new group, a later list that reorders, removes, inserts above, or adds to an earlier group                   | a shown row moving, a fresher row changing place, or a breaking list without a warning fails                                                                              |
| FR4      | stale-query tests with a deferred source                               | newer query, selection, clear, source replacement, unmount                                                                                                                                                                         | a list for a superseded query appearing fails                                                                                                                             |
| FR5      | pending-state tests                                                    | first partial list, empty partial list, settled empty list                                                                                                                                                                         | busy ending early, an empty row while pending, or rows cleared by an empty update fail                                                                                    |
| FR6, FR7 | keyboard tests plus real-browser layout and accessibility tree         | highlight on first row, highlight moved by arrows, a scrolled list receiving appended rows, a popup above the field receiving appended rows, a popup below the field whose appended rows exceed the room below                     | the highlight, scroll position, side of the field, or a shown row's screen position moving, or the active descendant id changing for the same item, fails                 |
| FR8      | announcement-channel tests                                             | partial then settled, settled only                                                                                                                                                                                                 | a second count announcement for one query, or none at settle, fails                                                                                                       |
| FR9      | rejection tests                                                        | reject after a non-empty update, reject after only empty updates while the previous query's rows show, reject without update, reject after the popup closes and cancels, with and without a non-empty update for the current query | shown rows cleared after a non-empty update, the previous query's rows settling as this query's, a missing announcement, or an announcement after the popup closed, fails |
| FR10     | existing Typeahead, Tokenizer, CommandPalette suites                   | single-answer sources, context-free callers                                                                                                                                                                                        | any behavior change for a source that never calls `update` fails                                                                                                          |

## Decision log

### DEC-1 — The search source merges its own results

**Reference:** `spec:AST-092/DEC-1`
**Decider:** cixzhang, 2026-10-22

"I think merging server results should be the work of the search source." The
source knows which results are local, which are remote, how they dedupe, and
in what order a person should see them, so each list it gives is its whole
answer. The typeahead stays a renderer of the current query's latest list.

Rejected: the typeahead merging a separate local answer and remote answer,
which would make one merge and ordering rule part of every typeahead.

### DEC-2 — Partial lists arrive through `update`; the return value stays final

**Reference:** `spec:AST-092/DEC-2`
**Decider:** cixzhang, 2026-10-22

The return value of `search()` keeps its meaning, the final list, and the
optional context adds partial lists. Every caller that awaits an array keeps
getting one, a source can show local matches synchronously before it returns,
and settling is the end of the returned promise.

Rejected: `search()` returning an async iterable, which breaks every caller
that awaits an array and cannot deliver its first list synchronously.

### DEC-3 — Server results only append

**Reference:** `spec:AST-092/DEC-3`
**Decider:** cixzhang, 2026-10-22

"Server results should never cause a reflow of items that already appear in
the typeahead." "When server results return we should only append. Only one
reflow per keystroke is allowed." A person aims the pointer or the highlight at
a row they can see; a row that moves after they aimed at it makes them pick the
wrong person. So each keystroke changes the list at most once, and every later
list for that query keeps the shown rows in place and adds below them (FR2).

Rejected: placing a higher-ranked server result above shown rows, which moves
the row a person was about to pick.

## Open questions

None.
