---
schema_version: 3
template_version: 7
kind: component
id: component:Comments
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, interaction, testing]
verified_by:
  [
    packages/core/src/Comments/Comments.test.tsx,
    packages/core/src/Comments/icons.test.tsx,
    packages/lab/src/Comments/index.test.ts,
    apps/storybook/stories/Comments.stories.tsx,
    packages/cli/assets/templates/blocks/components/Comments/CommentsShowcase.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs:
  [spec:AST-002, spec:AST-017, spec:AST-085, spec:AST-086, spec:AST-087]
---

# Comments component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/Comments/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `Comments`, `CommentsProps`, `DEFAULT_COMMENT_REACTIONS`, `COMMENT_ICON_KEYS`, and the family's data and render-prop types from `@astryxdesign/core`. `CommentThread` and `CommentComposer` have their own records.                                                                                    |
| Behavior                | A panel of comment threads and activity events in time order, with a composer for new comments. The host owns the data and every mutation; the panel owns presentation, which thread is open, focus, and announcements.                                                                                |
| End-user impact         | People read, post, reply, react, edit, delete, and resolve comments with the keyboard, pointer, or touch, and focus never drops to the page after a change.                                                                                                                                            |
| Builder impact          | Callers pass controlled threads and events, a viewer, and a callback for each action they allow. Optional render props supply the emoji picker and the typing indicator.                                                                                                                               |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` Comments exports re-export the Core ones (FR12).                                                                                                                                                                                                         |
| Review checks           | Reject a panel that mutates host data, a selection change from the host that moves focus or opens a composer, focus that drops to the page after a change, a failure without its own Banner, a live region added for content the log already delivers, and an import of a component that stays in Lab. |
| Governing rules         | `architecture:public-component-api`, `architecture:react-component-runtime`, `architecture:internationalization`, `spec:AST-017` FR29 and FR29a (lifecycle), `spec:AST-085` (focusable disabled controls), and `spec:AST-086` (status announcements).                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Comments is the conversation about one document, task, or record: its threads,
their replies, and its activity, with the composer for a new comment. It gives
every product the same comment reading, writing, and recovery behavior while
the product keeps its data, transport, and authorization.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the
  Core ones (FR12)
- Controlled/uncontrolled behavior: the threads, events, and every mutation are
  controlled by the host; the open thread is controlled through
  `selectedThreadId` and `onSelectedThreadChange`, or kept by the panel when
  `selectedThreadId` is left out
- Migration decision: none; a Lab import reaches the Core components (FR12)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The timeline: threads and activity events in time order, the empty state,
  the loading state, Load earlier comments, and the load failure.
- Which thread is open when the host leaves `selectedThreadId` out, and
  scrolling a host-selected thread into view.
- The new-comment composer and its position, and the dialogs threads open: the
  delete confirmation and the edit history.
- Pending, failure, and Retry presentation for each action, focus after every
  change, and the announcements of failures and progress.

**Does not own / non-goals**

- Thread data, unread state, resolution, authorization, transport, and
  persistence — owned by the product callsite.
- Passage anchoring and highlights for inline comments — owned by the product
  callsite, which passes each thread its `anchor`.
- The emoji picker and the typing indicator — supplied by the product through
  `emojiPicker` and `typingIndicator`.
- A single thread's rows, actions, and reply composer — owned by
  `component:CommentThread`; the composer — owned by
  `component:CommentComposer`.

## Public concepts

Consumer prop syntax and examples remain in `Comments.doc.mjs`.

| Concept         | Closed values or states                     | Meaning                                                                                                                  | Availability by variant/orientation/state | Default      | Owner            | Stability | Invalid-value behavior                    |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------ | ---------------- | --------- | ----------------------------------------- |
| Mode            | `read-write`, `read-only`                   | whether composers and editing actions show                                                                               | every panel                               | `read-write` | product          | Stable    | closed union                              |
| Layout          | `pane`, `embedded`                          | fill a sized container, or take the content height inside a card or popover                                              | every panel                               | `pane`       | product          | Stable    | closed union                              |
| Container       | `section`, `card`                           | the parent surface: threads are Cards on a section parent and divided Sections on a card                                 | every panel                               | `section`    | product          | Stable    | closed union                              |
| Composer place  | `bottom`, `top`, `none`                     | where the new-comment composer docks                                                                                     | `read-write` mode                         | `bottom`     | product          | Stable    | closed union                              |
| Open thread     | one thread id, or none                      | the thread whose body unclamps and whose replies and reply composer show                                                 | every panel                               | none         | product or panel | Stable    | an unknown id opens no thread             |
| Action callback | present, absent                             | each of post, edit, delete, react, retry, resolve, reopen, and history is offered only when the host passes its callback | every thread                              | absent       | product          | Stable    | an absent callback hides its action       |
| Render props    | `emojiPicker`, `typingIndicator`, `render*` | product-supplied parts the panel places                                                                                  | every panel                               | none         | product          | Stable    | an absent render prop leaves its part out |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                           | Basis                                   | Draft review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| FR1  | Comments MUST render its threads and activity events in time order and MUST NOT mutate the host's data; every change reaches the host through its callback.                                                                                                                                                                                                                   | documented promise and current behavior | verify             |
| FR2  | An action MUST show only when the host passes its callback and `mode` allows it. A callback that returns a Promise MUST show its action pending until it settles, and a rejection MUST show an error Banner beside what failed, with Retry when the action can repeat.                                                                                                        | documented promise and current behavior | verify             |
| FR3  | A `selectedThreadId` change from the host MUST reveal and scroll that thread into view and MUST NOT move focus or open a composer; only the viewer's Reply action opens the reply composer.                                                                                                                                                                                   | documented promise and current behavior | verify             |
| FR4  | When `selectedThreadId` is left out, the panel MUST keep the open thread itself and report each change through `onSelectedThreadChange`.                                                                                                                                                                                                                                      | current behavior                        | verify             |
| FR5  | After a delete, focus MUST move to the next thread, or to the thread when a reply was deleted. After Load earlier comments, focus MUST stay on that control, or move to the Retry that replaces it when loading fails. When the host's update replaces a focused Mark as resolved with Reopen, or a focused Reopen with Mark as resolved, focus MUST move to the replacement. | documented promise and current behavior | verify             |
| FR6  | The panel MUST NOT import a component that stays in Lab. The emoji picker and the typing indicator MUST come from `emojiPicker` and `typingIndicator`; without them, there is no emoji button and typing shows nothing.                                                                                                                                                       | component-import boundary               | human decision     |
| FR7  | `typingIndicator` MUST receive the open thread's typing people, each once and without the viewer, and its result MUST show at the end of the open thread only.                                                                                                                                                                                                                | current behavior                        | human decision     |
| FR8  | `loadVersions` MUST be the only source of edit history. An edited comment MUST open its history only when `loadVersions` is set, and a history returned at once MUST open with no loading state.                                                                                                                                                                              | current behavior                        | verify             |
| FR9  | A reaction option MUST be `{key, emoji, label?}`, and a reaction MUST mark the viewer's own with `isSelected`. A reaction's name MUST be its `label`, else the localized name of a default reaction, else its emoji.                                                                                                                                                          | current behavior                        | verify             |
| FR10 | Lists of names MUST join through the provider-aware list formatter, never raw `Intl`.                                                                                                                                                                                                                                                                                         | `architecture:internationalization`     | settled            |
| FR11 | The panel MUST combine `xstyle`, `className`, and `style` on its root, forward its ref and neutral DOM props, and reflect `layout`, `density`, and `container` on the `comments` theming target.                                                                                                                                                                              | `architecture:public-component-api`     | verify             |
| FR12 | The `@astryxdesign/lab` Comments exports re-export the Core ones, so a Lab import renders the Core components and takes the Core props.                                                                                                                                                                                                                                       | `spec:AST-017` FR29 and FR29a           | settled            |

### Allowed variation

- **AV1 — Data.** Thread content, people, reactions, events, and anchors vary
  freely; the panel's presentation rules stay fixed.
- **AV2 — Surface.** Callers size the panel or embed it, and pick the container
  that matches the parent surface.
- **AV3 — Product parts.** Render props replace a comment's body, anchor,
  additional actions, composer, empty state, and event row, and supply the
  emoji picker and the typing indicator.

### Representative states

| State          | Required invariant                                                          | Allowed variation          |
| -------------- | --------------------------------------------------------------------------- | -------------------------- |
| Empty          | the empty state, and the composer when `mode` allows it                     | product empty state        |
| Loading        | skeleton rows and a busy region                                             | composer actions shown     |
| Load failure   | an error Banner with Retry                                                  | product message            |
| Open thread    | unclamped body, replies, and the reply composer when the viewer chose Reply | thread content             |
| Pending action | the action stays focusable and refuses a second press                       | which action               |
| Failed action  | an error Banner beside what failed, with Retry when it can repeat           | product message            |
| Read-only      | no composer and no editing actions                                          | reactions and links remain |

### Transformation and precedence order

- **ORD1 — Timeline.** Merge threads and events, then sort by time, then
  render each with its own row.
- **ORD2 — Open thread.** `selectedThreadId` when passed, else the panel's own
  selection, then reveal and scroll that thread.

### Performance and resources

- **PR1 — No polling.** The panel opens no connection and runs no timer for
  live state; typing and unread state arrive as host data.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Log.** The threads sit in a log named after the region, so new
  comments are read politely; each comment is an article named by its author,
  and the region reports busy while comments load.
- **AR2 — Failures and progress.** An error Banner carries no live role. Its
  failure is announced once, assertively, through the shared channel, unless
  it sits inside the log, which delivers it; a comment's progress label follows
  the same rule, politely (`spec:AST-086`). The edit-history dialog announces
  its failure through an alert region inside the dialog.
- **AR3 — Focus.** Focus never drops to the page after a change (FR5), and
  busy actions stay focusable (`spec:AST-085`).
- **AR4 — Typing.** Inside the threads log, the log announces the typing
  indicator's text, so the indicator does not announce it again. In the
  embedded layout, which has no log, the indicator `typingIndicator` returns
  says who is typing once per change, politely.

## Design relationships

| Anatomy or state | Design requirement                                             | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Thread surface   | A Card on a section parent, a divided Section on a card parent | current implementation   | prominent      | FR11               |
| Composer         | Docks at the bottom or top of the panel                        | current implementation   | prominent      | FR2                |
| Activity event   | A timeline row between threads, in time order                  | current implementation   | supporting     | FR1                |

The panel paints the `comments` target; threads paint `comment-thread` and the
composer paints `comment-composer`.

## Family and system relationships

- `component:CommentThread` owns a thread's rows, actions, and reply composer;
  the panel renders one for each thread.
- `component:CommentComposer` owns the composer the panel docks.
- `component:CommentPin` takes the same `CommentUser` records for its
  participants.
- `spec:AST-086` owns how failures and progress are announced (AR2).
- `spec:AST-087` owns the icon slots the family's `comment:*` keys use.
- `spec:AST-017` FR29 and FR29a own any later deprecation of the Lab re-exports (FR12).

## Verification map

| Contract                  | Verification                                                 | Representative states                                                            | Mutation or failure expectation                                                                                       | Audit section             |
| ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1–FR5, AR1–AR3          | `Comments.test.tsx`                                          | empty, loading, load failure, open thread, pending and failed actions, read-only | a mutation of host data, a missing Banner or Retry, or focus on the page body after a change fails focused assertions | `audit:Comments/behavior` |
| FR6–FR9, AR4              | `Comments.test.tsx` render-prop, history, and reaction tests | with and without each render prop, synchronous and Promise history               | an emoji button without `emojiPicker`, a typing row without `typingIndicator`, or a loading flash fails               | `audit:Comments/api`      |
| FR11                      | `hostDataAttributes.test.tsx` and the probe theme check      | root passthrough and reflected states                                            | a dropped input or an unreflected state fails                                                                         | `audit:Comments/api`      |
| FR12                      | Lab `index.test.ts` identity and props-type cases            | Lab imports                                                                      | a Lab export that is not the Core export fails                                                                        | `audit:Comments/api`      |
| Documentation and surface | component docs, block metadata, root export, Storybook       | public examples and discovery                                                    | missing or stale discoverability fails repository checks                                                              | `audit:Comments/docs`     |

## Decision log

None recorded.

## Open questions

- **OQ1 — Is `emojiPicker`, a render function that receives `onSelect`, the
  public name and shape for the composer's picker slot?** (`human-api`)
- **OQ2 — Is `typingIndicator`, a render function that receives the typing
  people, the public name and shape for the typing slot, and does an open
  thread show no typing row without it, for every input (FR6)?**
  (`human-api`)
- **OQ3 — Does the reaction tooltip's narrow list ("Ada, Ben, 2 others" in
  English) read well enough, or does Core need a long list style?**
  (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
