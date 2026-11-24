---
schema_version: 3
template_version: 7
kind: component
id: component:CommentComposer
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
    packages/core/src/Comments/CommentComposer.test.tsx,
    apps/storybook/stories/Comments.stories.tsx,
    packages/cli/assets/templates/blocks/components/CommentComposer/CommentComposerShowcase.tsx,
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
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-017, spec:AST-085, spec:AST-086]
---

# CommentComposer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CommentComposer` and `CommentComposerProps` from `@astryxdesign/core`, with `CommentEmojiPickerRenderProps` for its picker slot.                                                                  |
| Behavior                | A controlled composer: a growing input with typeahead triggers, agent commands, and pasted or dropped images, above attach and emoji buttons, product controls, and Post. Empty drafts never post. |
| End-user impact         | People write a comment, quote a passage, attach images, pick an emoji, and post with Enter or Post, and a failed post keeps their words.                                                           |
| Builder impact          | Callers own the draft, clear it once the comment posts, and supply the emoji picker through `emojiPicker`.                                                                                         |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` export re-exports the Core one (`component:Comments` FR12).                                                                                          |
| Review checks           | Reject a composer that owns the draft, native-disabled Post while posting, a caller `onClick` that never runs, an English word assembled in code, and an emoji button without `emojiPicker`.       |
| Governing rules         | `architecture:public-component-api`, `architecture:internationalization`, `spec:AST-085`, and `spec:AST-086`.                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

CommentComposer writes a comment wherever one starts: a new margin comment on a
text selection, the composer docked in Comments, or a reply and an edit inside
a thread. It gives each the same input, attachments, and posting rules.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab export re-exports the
  Core one
- Controlled/uncontrolled behavior: the draft is controlled through `value`
  and `onChange`
- Migration decision: none; a Lab import reaches the Core component
  (`component:Comments` FR12)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The input, its growth to five lines, Enter to post and Shift+Enter for a new
  line, and refusing empty drafts.
- The quoted passage, image attach, paste, and drop, the emoji button and its
  Popover, the `/` agent-command menu, and Post.
- Busy and failure presentation for posting and uploads.

**Does not own / non-goals**

- The draft, posting, and storage — owned by the product callsite.
- The emoji picker — supplied by the product through `emojiPicker`.
- Typeahead sources such as an `@` people search — supplied by the product as
  triggers.

## Public concepts

Consumer prop syntax and examples remain in `CommentComposer.doc.mjs`.

| Concept        | Closed values or states | Meaning                                                                  | Availability by variant/orientation/state | Default | Owner   | Stability | Invalid-value behavior              |
| -------------- | ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------- | ------- | --------- | ----------------------------------- |
| Draft          | string                  | the controlled text of the comment                                       | every composer                            | none    | product | Stable    | an empty or blank draft never posts |
| Busy           | busy, idle              | a post is in flight: Post and attach stay focusable and refuse presses   | every composer                            | idle    | product | Stable    | closed boolean                      |
| Emoji picker   | present, absent         | the picker the emoji button opens; it receives `onSelect`                | every composer                            | absent  | product | Stable    | absent shows no emoji button        |
| Image uploader | present, absent         | uploads attached, pasted, or dropped images and appends them as Markdown | every composer                            | absent  | product | Stable    | absent shows no attach button       |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                     | Basis                                   | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| FR1 | Enter or Post MUST call `onSubmit` with the draft, and an empty or blank draft MUST NOT post; Shift+Enter MUST add a line.                                                                                                              | documented promise and current behavior | verify             |
| FR2 | While `isSubmitting`, Post and the attach and emoji buttons MUST stay focusable with `aria-disabled` and refuse presses, and images pasted or dropped into the input MUST be refused.                                                   | `spec:AST-085`                          | verify             |
| FR3 | With `emojiPicker`, the emoji button MUST open a Popover holding what the function returns; `onSelect` MUST append the emoji to the draft, close the Popover, and return focus to the input. Without it, there MUST be no emoji button. | current behavior                        | human decision     |
| FR4 | The caller's `onClick` MUST run. A composer inside a thread MUST stop its click from reaching the thread; a standalone composer MUST let it bubble.                                                                                     | `architecture:public-component-api`     | verify             |
| FR5 | Every word the composer shows MUST come from the catalog, including the agent-command menu's usage line and summary.                                                                                                                    | `architecture:internationalization`     | settled            |
| FR6 | Each upload or post failure MUST show its own error Banner, announced once as a new occasion even when its words repeat (`spec:AST-086`).                                                                                               | `spec:AST-086`                          | verify             |
| FR7 | The composer MUST combine `xstyle`, `className`, and `style` on its root, forward its ref and neutral DOM props, and paint the `comment-composer` theming target.                                                                       | `architecture:public-component-api`     | verify             |

### Allowed variation

- **AV1 — Context.** A new comment, a reply, or an edit; the placeholder and
  the input's name follow the context.
- **AV2 — Footer.** Product `controls` sit after the attach and emoji buttons;
  keep them to one short control.

### Representative states

| State   | Required invariant                                                     | Allowed variation |
| ------- | ---------------------------------------------------------------------- | ----------------- |
| Empty   | Post refuses                                                           | placeholder       |
| Quoting | the passage shows above the input, with Remove when the host allows it | highlight color   |
| Busy    | Post and attach focusable and refusing                                 | which action      |
| Failed  | an error Banner with Retry when the host passes `onRetry`              | product message   |

### Transformation and precedence order

- **ORD1 — Emoji.** `onSelect` appends to the latest draft, then closes the
  Popover, then focuses the input.

### Performance and resources

- **PR1 — Picker.** The picker renders only while its Popover is open.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Name.** The input is named by `label`, else the placeholder.
- **AR2 — Busy.** The composer reports `aria-busy` while posting, and focus
  never drops to the page (`spec:AST-085`).
- **AR3 — Failures.** Failures are announced once, assertively, through the
  shared channel (`spec:AST-086`).

## Design relationships

| Anatomy or state | Design requirement                                    | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Input            | Grows to five lines above the footer                  | current implementation   | prominent      | FR1                |
| Footer           | Attach, emoji, product controls, then Post at the end | current implementation   | supporting     | FR2, FR3           |

## Family and system relationships

- `component:Comments` docks a CommentComposer for new comments, and
  `component:CommentThread` uses one for replies and edits.
- `component:ChatComposer` provides the input and its typeahead.

## Verification map

| Contract      | Verification                                                  | Representative states                  | Mutation or failure expectation                                                           | Audit section                    |
| ------------- | ------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR2, AR2 | `CommentComposer.test.tsx`                                    | empty, busy, paste and drop while busy | a posted empty draft, native disabled Post, or an accepted file while busy fails          | `audit:CommentComposer/behavior` |
| FR3           | `CommentComposer.test.tsx` emoji cases                        | with and without `emojiPicker`         | a missing insert, an open Popover after a pick, or an emoji button without the slot fails | `audit:CommentComposer/behavior` |
| FR4           | `CommentComposer.test.tsx` and `CommentThread.test.tsx`       | standalone and in-thread clicks        | a caller handler that never runs, or a thread that closes on a composer press, fails      | `audit:CommentComposer/behavior` |
| FR5           | `CommentComposer.test.tsx` catalog case and the catalog check | French overrides                       | an English word assembled in code fails                                                   | `audit:CommentComposer/i18n`     |
| FR6, AR3      | `CommentComposer.test.tsx` failure cases                      | repeated failures with the same words  | a second failure that is not announced fails                                              | `audit:CommentComposer/behavior` |
| FR7           | `hostDataAttributes.test.tsx`                                 | root passthrough                       | a dropped input or ref fails                                                              | `audit:CommentComposer/api`      |

## Decision log

None recorded.

## Open questions

- **OQ1 — Is `emojiPicker`, a render function that receives `onSelect`, the
  public name and shape for the picker slot?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
