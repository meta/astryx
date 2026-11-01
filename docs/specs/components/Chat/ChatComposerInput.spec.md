---
schema_version: 3
template_version: 5
kind: component
id: component:ChatComposerInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-14
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, interaction, theming]
verified_by:
  [
    packages/core/src/Chat/ChatComposerInput.test.tsx,
    apps/storybook/stories/ChatComposerInput.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-029]
---

# ChatComposerInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | ChatComposerInput remains the optional rich editing surface for ChatComposer, with controlled draft, trigger, history, paste, file, and imperative seams. Each trigger definition may opt into multi-word queries with `hasMultiWordQuery`, default `false`.                                                                                                                                                                         |
| Behavior                | Every edit path keeps the serialized draft observable. Files pasted or dropped reach `onFiles`; consumer `onPaste` receives first refusal over plain text before optional paste-as-token conversion.                                                                                                                                                                                                                                 |
| End-user impact         | Dictated or otherwise programmatically inserted text is sendable and never hidden behind the empty placeholder; dropped files reach the product attachment flow.                                                                                                                                                                                                                                                                     |
| Builder impact          | Existing props, callback signatures, prop defaults, exports, and token serialization are unchanged. Builders relying on the documented `onPaste` and `onFiles` paths receive those callbacks except where FR5 and FR6 record implementation gaps; `hasMultiWordQuery` is the one added optional trigger field. Every trigger receives the trigger-key corrections listed under Compatibility and migration (FR10, FR13, FR15, FR16). |
| Compatibility/readiness | Patch-compatible. One additive optional trigger field (DEC-1) plus trigger-key corrections that apply to every trigger (FR10, FR13, FR15, FR16); no visual decision. Implementation gaps are recorded inline on FR1, FR5, FR6, FR10, and PR2.                                                                                                                                                                                        |
| Review checks           | Reject an edit path that mutates the DOM without updating the serialized draft, a file drop that can navigate away or bypass `onFiles`, a text paste that bypasses consumer interception, changed submit/token semantics, a trigger query that alters typed text, a key that picks a row from an earlier trigger query, or a menu that reopens after a send.                                                                         |
| Governing rules         | `architecture:public-component-api/INV1`; `architecture:interaction-modality/INV1–INV4`; `architecture:knowledge-contracts/INV11, INV16`; `spec:AST-002`; `spec:AST-029`; rubric B15.                                                                                                                                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

ChatComposerInput supplies ChatComposer's rich editing surface when a plain custom
textarea is insufficient. It owns contenteditable text and selection, serialized
inline tokens, trigger menus, history recall, paste and file intake, and the
imperative editing handle.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: patch-compatible; one additive optional trigger field, no prop default changes, and trigger-key corrections for every trigger
- Controlled and composition behavior: unchanged
- Migration decision: none
- Trigger query shape: `hasMultiWordQuery` is an additive optional trigger field; omitting it keeps single-token queries
- Every trigger, opted in or not, also receives these patch-compatible corrections:
  - FR13, correction: a key never picks a row returned for an earlier query, and a result arriving after a send, clear, pick, or dismissal is discarded instead of reopening the menu.
  - FR15, correction: IME composition keys never pick a row or move the highlighted row.
  - FR16, correction: after Escape, the menu stays hidden while the same query keeps growing instead of reopening on the next keystroke.
  - FR10, correction: a tab before the trigger character is a boundary, like a space or line break.

## Ownership boundary

**Owns**

- The contenteditable surface, its accessible editing semantics, and serialization.
- Trigger-menu invocation and token insertion inside the editor.
- Enter submission, history navigation, paste precedence, file intake, and imperative edit observability.
- Registration of the editing focus control with ChatComposer.

**Does not own / non-goals**

- ChatComposer layout, send-button state, status placement, or shell elevation.
- Product validation, upload, progress, or error handling for files.
- Search result data, custom token meaning, or custom token interaction semantics supplied by callers.
- A new visual representation for the editor, token, menu, or drop target.

## Public concepts

| Concept            | Closed values or states                                        | Meaning                                                                                     | Availability by state           | Default                     | Owner                         | Stability | Invalid-value behavior                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------- | ----------------------------- | --------- | --------------------------------------------------------------------- |
| draft storage      | DOM-owned; `value` controlled; ChatComposer context controlled | Selects the serialized draft source and observable change channel.                          | every editor                    | context or empty DOM        | `component:ChatComposerInput` | stable    | Explicit `value` wins; unsupported values are rejected by TypeScript. |
| submission         | Enter; Shift+Enter; IME Enter; consumer-cancelled Enter        | Submits one trimmed non-empty draft only on uncancelled Enter without Shift or composition. | enabled editor                  | Enter submits               | `component:ChatComposerInput` | stable    | Empty or composing submission is ignored.                             |
| trigger menu       | omitted; one or more trigger definitions                       | Opens suggestions at a configured character and inserts text or a serialized token.         | when triggers are configured    | omitted                     | `component:ChatComposerInput` | stable    | Unknown trigger characters remain ordinary text.                      |
| trigger query      | single-token; multi-word                                       | Sets where an active trigger query ends, as FR10 and FR11 state.                            | while a trigger is active       | single-token                | `component:ChatComposerInput` | stable    | Omitting `hasMultiWordQuery` keeps single-token queries.              |
| history            | enabled; disabled                                              | Recalls submitted drafts at text boundaries with ArrowUp and ArrowDown.                     | when enabled and history exists | enabled                     | `component:ChatComposerInput` | stable    | Mid-text arrow keys retain native caret behavior.                     |
| text paste         | consumer-handled; paste-as-token; plain text                   | Gives `onPaste` first refusal, then optional token conversion, then inserts plain text.     | enabled editor                  | long-paste token conversion | `component:ChatComposerInput` | stable    | A handled callback stops later insertion paths.                       |
| file intake        | pasted; dropped                                                | Prevents browser navigation and passes the files to `onFiles`.                              | when files are supplied         | no callback                 | `component:ChatComposerInput` | stable    | Empty drops do nothing; disabled input does not emit files.           |
| imperative editing | insert token; expand token; insert text; focus; get value      | Lets composing features such as dictation operate through the editor's owned behavior.      | while mounted                   | none                        | `component:ChatComposerInput` | stable    | Calls without a mounted editor are no-ops or return an empty value.   |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| FR1  | Every user or imperative edit that changes serialized content MUST update empty state and emit the effective value through the active `onChange` channel. Implementation gap: `handleRef.insertToken` inserts the token without emitting the value through `onChange` or updating empty state, so the placeholder stays visible.                                                                                                                                                                                                                                                  | Shipped `onChange` contract, imperative handle, and ChatDictation callsite. |
| FR2  | Enter without Shift MUST submit one trimmed non-empty draft and clear it unless the event is composing, the trigger menu consumes it, or a consumer prevents default.                                                                                                                                                                                                                                                                                                                                                                                                             | Shipped implementation and consumer docs.                                   |
| FR3  | Shift+Enter and mid-text history arrows MUST retain native multiline editing behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Shipped implementation and focused tests.                                   |
| FR4  | `value` supplied directly on ChatComposerInput MUST win over ChatComposer context, while an emitted echo MUST NOT rebuild the DOM or move the caret.                                                                                                                                                                                                                                                                                                                                                                                                                              | Shipped controlled precedence and regression tests.                         |
| FR5  | Plain-text paste precedence MUST be consumer `onPaste` → configured/default paste-as-token → plain insertion. Implementation gap: a paste whose selection starts inside a token inserts the text after that token without calling `onPaste`.                                                                                                                                                                                                                                                                                                                                      | Public callback meaning and objective callback composition.                 |
| FR6  | File paste and file drop MUST prevent native insertion/navigation and deliver the same ordered `File[]` to `onFiles`; disabled editors MUST NOT emit file callbacks. Implementation gap: a file paste whose selection starts inside a token never reaches `onFiles`.                                                                                                                                                                                                                                                                                                              | Shipped public `onFiles` contract and consumer docs.                        |
| FR7  | Trigger-menu keyboard handling MUST run before consumer and built-in editor handling; IME composition MUST never submit.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Shipped interaction contract and tests.                                     |
| FR8  | History recall MUST operate only at the draft boundaries and MUST restore the pending draft after stepping past the newest item.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Shipped behavior and tests.                                                 |
| FR9  | The root MUST keep forwarding its ref, BaseProps attributes, and styling seams; the imperative handle remains separate in `handleRef`.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Released public API and `architecture:public-component-api`.                |
| FR10 | A trigger activates when its character starts the text or follows a space, a tab, or a line break, and its query runs from after that character to the caret. Inside an active multi-word query, FR11 limits which characters activate. A no-break space, such as the one after an inserted token, is not a boundary. A single-token query ends at a space, a tab, or a line break. Implementation gap: a trigger character that begins a text node activates whatever precedes it, such as an `@` typed directly after an inserted token and before its trailing no-break space. | Shipped trigger detection; DEC-1.                                           |
| FR11 | A trigger with `hasMultiWordQuery: true` keeps its query through spaces and punctuation. The query ends only at a line break, past an implementation-owned length bound of at least 64 characters, or where the same trigger's character after a space, a tab, or a line break starts a new query; no word count, punctuation list, or termination callback applies. Inside an active multi-word query, another trigger's character does not activate under FR10, so the query continues through it.                                                                              | DEC-1.                                                                      |
| FR12 | Ending a trigger query MUST leave the typed text unchanged. Only an explicit pick of a current row replaces the range from the trigger character to the caret.                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-1.                                                                      |
| FR13 | While a newer search for the active query is pending, Enter without Shift submits the draft as typed and MUST NOT pick a row; no key picks a row returned for an earlier query. Results for a superseded query, or arriving after a pick, dismissal, submission, or the query ending, are discarded, so the menu never reopens over a sent or cleared draft. This applies to every trigger.                                                                                                                                                                                       | DEC-1; reference chat composer behavior.                                    |
| FR14 | When a multi-word query settles with no matches, the menu is hidden unless the trigger supplies `emptySearchText`. A single-token query with no matches shows the empty message.                                                                                                                                                                                                                                                                                                                                                                                                  | DEC-1.                                                                      |
| FR15 | Keys pressed during IME composition MUST NOT pick a row or move the highlighted row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DEC-1; FR7.                                                                 |
| FR16 | Escape on a visible menu dismisses it, and the menu stays hidden while the same query keeps growing from the same trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-1.                                                                      |

### Allowed variation

- **AV1 — Search content.** Builders own trigger characters, search sources, item rendering, and inserted values.
- **AV2 — Token content.** Builders may use the structured Badge form or the custom render escape hatch and own custom semantics.
- **AV3 — Product file workflow.** Builders own accepted types, validation, upload, progress, and errors after `onFiles` receives the files.

### Representative states

| State                               | Required invariant                                                                                                                   | Allowed variation                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| empty                               | Placeholder is visible and the serialized value is empty.                                                                            | Placeholder copy.                      |
| typed or imperatively inserted text | Placeholder is absent and the same serialized value is observable to ChatComposer and callbacks (FR1 records an implementation gap). | Draft content.                         |
| controlled update                   | External value is reflected without corrupting a live caret or treating a stale echo as authoritative.                               | Parent update timing.                  |
| trigger menu open                   | Combobox semantics and active option wiring are exposed; menu interaction owns its keys.                                             | Search source and item rendering.      |
| trigger search pending              | Enter submits the draft as typed; no earlier query's row can be picked.                                                              | Loading copy and source latency.       |
| trigger menu hidden                 | The editor reports a collapsed combobox and the menu consumes no keys.                                                               | Why the menu is hidden.                |
| file paste or drop                  | Native insertion/navigation is prevented and files reach `onFiles` once (FR6 records an implementation gap).                         | File types and product handling.       |
| disabled                            | Editing and file callbacks are unavailable and disabled state is exposed.                                                            | Product reason and surrounding status. |

### Transformation and precedence order

- **ORD1 — Draft source.** Explicit `value` → ChatComposer context value → editor DOM.
- **ORD2 — Change channel.** Explicit controlled input callback when `value` is explicit → ChatComposer context callback → distinct local callback.
- **ORD3 — Key handling.** Trigger menu → consumer `onKeyDown` → IME/submit/history behavior.
- **ORD4 — Plain paste.** Consumer `onPaste` → paste-as-token behavior → plain insertion (FR5 records an implementation gap).
- **ORD5 — File intake.** Files on clipboard or data transfer → prevent native behavior → emit `onFiles` when enabled (FR6 records an implementation gap).

### Performance and resources

- **PR1 — Selection work.** Selection reads and writes are scoped to the mounted editable and run only for direct editing actions or controlled synchronization.
- **PR2 — Async trigger work.** Search cancellation goes through the supplied `SearchSource` and its optional `cancel`, and `debounceMs` sets the delay before an async search starts. Implementation gap: each keystroke that changes the query also calls `search('')` at once to detect whether the source is async, so an async source receives an undelayed search.
- **PR3 — Portal cleanup.** Token portals are cleaned through the existing token hook when content changes or unmounts.

## Accessibility contract

- **AR1 — Editing semantics.** Without triggers, the surface is a named multiline textbox; with triggers, it exposes the adopted combobox semantics without invalid multiline ARIA.
- **AR2 — Disabled state.** Disabled editing is exposed with `aria-disabled` and cannot accept content or file callbacks.
- **AR3 — Keyboard ownership.** IME, trigger-menu keys, consumer cancellation, Enter submission, and boundary-only history do not steal one another's keys.
- **AR4 — Focus visibility.** When composed in ChatComposer, the semantic editor focus owner drives the shell's shared keyboard focus indicator.
- **AR5 — Collapsed suggestions.** While the menu is hidden, the editor reports `aria-expanded="false"`, exposes no active descendant, and arrow keys, Enter, and Escape reach the editor and its surroundings.

## Design relationships

| Anatomy or state | Design requirement                 | Representation authority | Hierarchy role | Component contract  |
| ---------------- | ---------------------------------- | ------------------------ | -------------- | ------------------- |
| input root       | existing themed target             | observed implementation  | supporting     | FR9                 |
| editable surface | ordinary composer editing surface  | ChatComposer family      | prominent      | FR1–FR4, AR1–AR4    |
| placeholder      | secondary text while empty         | current token role       | supporting     | FR1                 |
| trigger menu     | delegated Typeahead behavior       | Typeahead owner          | floating       | FR7, FR10–FR16, AR5 |
| inline token     | structured Badge or caller content | Badge or caller owner    | supporting     | AV2                 |

The existing `chat-composer-input` target remains on the root. This record does not
add a theming target or decide a new visual state.

## Family and system relationships

- `component:ChatComposer` owns layout, submission orchestration, send state, and the shell focus ring; this component owns the editing surface and its change channel.
- Typeahead and SearchSource own result collection behavior; ChatComposerInput owns when the trigger menu participates in editor key precedence.
- `architecture:interaction-modality` owns the shared focus-visibility mechanics.
- `spec:AST-029` owns the observational audit-backfill boundary.

## Verification map

| Contract              | Verification                                                                       | Representative states                                                                       | Mutation or failure expectation                                                                                                                                                                  | Audit section                           |
| --------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| FR1, ORD1–ORD2        | focused imperative insertion and controlled-sync tests; `ImperativeInsertion` play | empty → inserted text; controlled echo; external override                                   | Text appears only in the DOM, placeholder remains, callback is stale, or the caret jumps.                                                                                                        | `audit:ChatComposerInput/behavior`      |
| FR2–FR3, FR7–FR8, AR3 | focused keyboard, IME, trigger, and history tests                                  | Enter; Shift+Enter; composition; cancelled key; boundary and mid-text arrows                | A key submits twice, submits during composition, or steals native editing.                                                                                                                       | `audit:ChatComposerInput/interaction`   |
| FR10–FR16, AR5        | focused trigger-query and trigger keyboard tests                                   | single-token; multi-word; line break; length bound; pending search; no matches; IME; Escape | A query ends early or alters text, Enter picks an earlier query's row or fails to submit while a search is pending, a late result reopens the menu after a send, or a hidden menu consumes keys. | `audit:ChatComposerInput/interaction`   |
| FR5, ORD4             | focused long-paste interception tests                                              | consumer handled; token conversion; plain insertion                                         | Consumer interception is skipped or multiple insertion paths run.                                                                                                                                | `audit:ChatComposerInput/behavior`      |
| FR6, ORD5, AR2        | focused paste/drop tests and `FileDrop` play                                       | paste; drop; disabled                                                                       | Files navigate away, insert into the editor, bypass `onFiles`, or emit while disabled.                                                                                                           | `audit:ChatComposerInput/behavior`      |
| AR1, AR4              | role/name/ARIA tests plus exact-head accessibility and visual gates                | textbox; combobox; disabled; keyboard focus                                                 | Name, role, multiline, expanded, disabled, or visible focus semantics regress.                                                                                                                   | `audit:ChatComposerInput/accessibility` |
| FR9                   | ref, target, package, and repository checks                                        | ref; BaseProps; xstyle; className; style                                                    | Root ownership or a styling seam moves or disappears.                                                                                                                                            | `audit:ChatComposerInput/api`           |

## Decision log

### DEC-1 — Trigger queries are non-destructive and act only on current results

**Reference:** `component:ChatComposerInput/DEC-1`
**Decider:** `cixzhang`, `2026-10-06`; pending-search Enter, `2026-10-14`; cross-trigger continuation applies the same reference-composer direction, `2026-10-14`

Only the caller knows whether its suggestions contain spaces, so multi-word
queries are a per-trigger opt-in and single-token triggers such as commands keep
ending at whitespace. A multi-word query never changes what the person typed: it
ends as FR11 states, and only an explicit pick replaces text. Suggestions act
only on the current query: while a search is pending, Enter sends the message as
typed and never picks a row from an earlier query, and results that arrive after
the send are dropped so the menu never reopens over the cleared composer. This
matches the reference chat composer, where a message may simply start with a
trigger. An unmatched multi-word phrase hides the menu instead of covering prose
with an empty panel. Inside an active multi-word query another trigger's
character does not start a query, so `@Jordan /` keeps the mention query, while
the same trigger's character starts a new query as FR11 states; both match the
reference chat composer.

Rejected: word caps, punctuation terminators, or a termination callback; they cut off real names and depend on language.

Rejected: holding Enter until a pending search settles; it blocks sending a message that only starts with a trigger.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, current audit scores,
or visual design rationale. It records shipped behavior, objective corrections, and
the trigger-query contract in DEC-1, without deciding a new visual representation.
