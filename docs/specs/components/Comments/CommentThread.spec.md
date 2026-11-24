---
schema_version: 3
template_version: 7
kind: component
id: component:CommentThread
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
    packages/core/src/Comments/CommentThread.test.tsx,
    packages/core/src/Comments/Comments.test.tsx,
    apps/storybook/stories/Comments.stories.tsx,
    packages/cli/assets/templates/blocks/components/CommentThread/CommentThreadShowcase.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-017, spec:AST-085, spec:AST-086]
---

# CommentThread component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CommentThread` and `CommentThreadProps` from `@astryxdesign/core`, with the behavior props it shares with Comments (`CommentThreadSharedProps`).                                                                                               |
| Behavior                | One thread: its first comment, one level of replies, reactions, edit history, and a reply composer, on a Card or a Section. Selection opens it; with `onDismiss`, a press outside or Escape closes it, and an unsaved draft survives the first. |
| End-user impact         | People open, read, and answer one conversation where it is anchored, without losing a half-written reply to a stray press.                                                                                                                      |
| Builder impact          | Callers pass the thread, the viewer, and a callback for each action they allow; a host Popover turns its own light and Escape dismissal off and lets the thread decide.                                                                         |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` export re-exports the Core one (`component:Comments` FR12).                                                                                                                                       |
| Review checks           | Reject a thread that wraps itself in a second interactive control, a host selection that moves focus or opens the composer, a dismissal that discards an unsaved draft on the first press, and a shake that is the only signal.                 |
| Governing rules         | `architecture:public-component-api`, `architecture:layer-runtime`, `architecture:interaction-modality`, `spec:AST-085`, and `spec:AST-086`.                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

CommentThread shows one conversation where a surface has room for only one:
a margin card beside a document, or a popover under a highlight. It gives that
thread the same rows, actions, and recovery as a thread inside Comments.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab export re-exports the
  Core one
- Controlled/uncontrolled behavior: the open state is controlled through
  `isSelected` and `onSelectedChange`, or kept by the thread when `isSelected`
  is left out; the thread data and every mutation are controlled by the host
- Migration decision: none; a Lab import reaches the Core component
  (`component:Comments` FR12)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The thread surface, its hidden toggle, and its open state when the host
  leaves `isSelected` out.
- The first comment and reply rows: avatar, header and actions, quoted
  passage, clamped body, reactions, the reply rail, and View replies.
- The reply and edit composers, the delete confirmation, the edit history, and
  their pending, failure, and focus behavior.
- With `onDismiss`, deciding whether a press outside or Escape dismisses the
  thread, and keeping an unsaved draft on the first one.

**Does not own / non-goals**

- Thread data, authorization, and transport — owned by the product callsite.
- The Popover or card that holds the thread, and its position — owned by the
  product callsite and `architecture:layer-runtime`.
- Ordering several threads and keeping one open — owned by
  `component:Comments`.

## Public concepts

Consumer prop syntax and examples remain in `CommentThread.doc.mjs`.

| Concept      | Closed values or states    | Meaning                                                                                       | Availability by variant/orientation/state | Default        | Owner             | Stability | Invalid-value behavior  |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ----------------- | --------- | ----------------------- |
| Open state   | open, closed               | an open thread unclamps its body and shows its replies; the viewer's Reply opens the composer | every thread                              | closed         | product or thread | Stable    | closed boolean          |
| Dismissal    | present, absent            | with `onDismiss`, a press outside or Escape asks the host to close the thread                 | every thread                              | absent         | product           | Stable    | absent adds no listener |
| Container    | `section`, `card`          | a Card on a section parent, a Section without outer rules on a card parent                    | every thread                              | `section`      | product           | Stable    | closed union            |
| Shared props | `CommentThreadSharedProps` | viewer, mode, callbacks, and render props, as on Comments                                     | every thread                              | as on Comments | product           | Stable    | as on Comments          |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                               | Basis                                   | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| FR1 | The thread MUST be one toggle: a press on its surface opens it with focus in the reply composer, and Enter or Space on its toggle opens or closes it and keeps focus on the toggle.                                                                                                                                                                                               | documented promise and current behavior | verify             |
| FR2 | A host `isSelected` change MUST reveal the body and replies and MUST NOT move focus or open the reply composer.                                                                                                                                                                                                                                                                   | documented promise and current behavior | verify             |
| FR3 | With `onDismiss`, a press outside the thread or an Escape that no inner layer handles MUST call `onDismiss`, except that the first one over an unsaved reply or edit MUST keep the thread open, return focus to the draft, shake the thread when motion is allowed, and announce that the draft is unsaved. A press inside a layer the thread portals elsewhere counts as inside. | documented promise and current behavior | verify             |
| FR4 | An open emoji picker, menu, or dialog inside the thread MUST close on Escape before the thread does, one Escape at a time.                                                                                                                                                                                                                                                        | documented promise and current behavior | verify             |
| FR5 | A press in the empty space of the reply composer MUST NOT close the thread.                                                                                                                                                                                                                                                                                                       | current behavior                        | verify             |
| FR6 | Mark as resolved and Reopen MUST hand keyboard focus to the control that replaces them when the host's update arrives, unless the viewer has moved focus elsewhere.                                                                                                                                                                                                               | current behavior                        | verify             |
| FR7 | A selected or highlighted thread MUST show the shared focus ring while its toggle has keyboard focus; forced colors MUST keep the selection outline on an unfocused selected thread.                                                                                                                                                                                              | `architecture:interaction-modality`     | verify             |
| FR8 | The thread MUST combine `xstyle`, `className`, and `style` on its root, forward its ref and neutral DOM props, and reflect `container` on the `comment-thread` theming target.                                                                                                                                                                                                    | `architecture:public-component-api`     | verify             |

### Allowed variation

- **AV1 — Host surface.** The thread sits on a page, in a card, or in a
  Popover; `container` matches the parent surface.
- **AV2 — Product parts.** Render props replace the body, the anchor, the
  additional actions, and the reply composer, and supply the emoji picker and
  the typing indicator.

### Representative states

| State         | Required invariant                                                          | Allowed variation        |
| ------------- | --------------------------------------------------------------------------- | ------------------------ |
| Closed        | body clamped to three lines; replies behind View replies                    | thread content           |
| Open          | unclamped body, replies, and the reply composer once the viewer chose Reply | thread content           |
| Unread reply  | the reply shows without selecting the thread or moving focus                | which reply              |
| Resolved      | Resolved in the header, and Reopen when the host allows it                  | who resolved             |
| Unsaved draft | the first dismissal keeps the thread open and announces the kept draft      | reduced motion: no shake |

### Transformation and precedence order

- **ORD1 — Escape.** The innermost open layer closes first, then an unsaved
  draft is kept once, then `onDismiss` runs.

### Performance and resources

- **PR1 — Listeners.** Without `onDismiss`, the thread adds no document
  listener.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Toggle.** The thread's toggle follows the WAI-ARIA Button pattern
  with `aria-pressed`, named "Thread by" and its author, and the whole surface
  takes the system focus ring while the toggle has focus (FR7).
- **AR2 — Replies and actions.** View replies follows the Disclosure pattern
  with `aria-expanded` and `aria-controls`; the more menu follows the Menu
  Button pattern, and focus returns to it after an edit or a delete dialog.
- **AR3 — Kept draft.** A kept draft is announced by a polite live region; the
  shake is never the only signal, and it does not run under reduced motion.
- **AR4 — Busy and failed actions.** Busy actions stay focusable
  (`spec:AST-085`); failures are announced as `component:Comments` AR2 states
  (`spec:AST-086`).
- **AR5 — Typing.** A standalone thread has no log, so the indicator
  `typingIndicator` returns says who is typing once per change, politely,
  unless the page puts the thread inside a live region that already speaks it.

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Surface          | A Card on a page, a Section without outer rules in a card or popover | current implementation   | prominent      | FR8                |
| Reply rail       | Joins the avatars of an open thread                                  | current implementation   | supporting     | FR1                |
| Kept-draft shake | A brief horizontal shake when a dismissal keeps a draft              | current implementation   | supporting     | FR3, AR3           |

## Family and system relationships

- `component:Comments` renders one CommentThread row for each thread and owns
  which thread is open in a panel.
- `component:CommentComposer` owns the reply and edit composers.
- `architecture:layer-runtime` owns the Popover that holds a thread and the
  layer stack Escape walks.

## Verification map

| Contract         | Verification                                                   | Representative states                                                                                     | Mutation or failure expectation                                                                        | Audit section                  |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| FR1–FR5, AR1–AR3 | `CommentThread.test.tsx`                                       | press, keyboard toggle, host selection, outside press, Escape, kept draft, portaled layer, reduced motion | a dismissal that discards a draft, focus that moves on host selection, or a missing announcement fails | `audit:CommentThread/behavior` |
| FR6              | `Comments.test.tsx` resolve and reopen focus tests             | keyboard resolve, keyboard reopen, a late host update after focus moved                                   | focus on the page body after the swap fails                                                            | `audit:CommentThread/behavior` |
| FR7              | `CommentThread.test.tsx` focus-ring cases and browser evidence | selected and highlighted threads with keyboard focus, forced colors                                       | a ring unset by the selection outline fails                                                            | `audit:CommentThread/states`   |
| FR8              | `hostDataAttributes.test.tsx`                                  | root passthrough                                                                                          | a dropped input or ref fails                                                                           | `audit:CommentThread/api`      |

## Decision log

None recorded.

## Open questions

- **OQ1 — Does CommentThread take `defaultIsSelected`, as CommentPin does, for
  a thread that starts open without a controlled state?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
