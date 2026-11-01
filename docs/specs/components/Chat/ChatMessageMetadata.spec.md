---
schema_version: 3
template_version: 6
kind: component
id: component:ChatMessageMetadata
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/Chat/ChatMessageMetadata.test.tsx,
    packages/core/src/Chat/__tests__/ChatMessageMetadata.a11y.chromium.spec.ts,
    apps/storybook/stories/ChatMessageMetadata.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:component-style-authoring,
    architecture:react-component-runtime,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029]
---

# ChatMessageMetadata component contract

This is an observational draft of the existing Core chat metadata surface and
its tested empty-scalar correction. It creates no new prop, status meaning,
announcement guarantee, or visual policy. Current shared records govern their
own scopes independently of this draft.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Optional `timestamp` and `footer` ReactNode slots, optional closed `status` union, root `BaseProps<HTMLDivElement>` and `ref`, exported through `./Chat`.                                                           |
| Behavior                | The row renders its present slots in timestamp, footer, status order, with a separator only between present slots; user sender reverses the flex row. Five delivery statuses have localized icon-and-text displays. |
| End-user impact         | Non-rendering scalar slot values no longer leave a standalone dot, a blank metadata row, or a separator without adjacent content. Visible numeric zero remains.                                                     |
| Builder impact          | No new inputs, defaults, or migration. Caller-supplied footer controls remain caller-owned.                                                                                                                         |
| Compatibility/readiness | Patch-compatible scalar correction to a released `./Chat` subpath; draft pending exact-head observational verification and owner review.                                                                            |
| Review checks           | Reject a lost visible zero, stranded separator, omitted translated status label, dropped root passthrough, or claim that a static DOM attribute proves an AT announcement.                                          |
| Governing rules         | `architecture:public-component-api/INV1, INV3, INV5–INV9`; `architecture:component-test-sufficiency/INV1–INV7`; `spec:AST-029/FR2–FR5`.                                                                             |

The table is a review projection. Consumer syntax belongs in
`ChatMessageMetadata.doc.mjs` and the Chat family consumer documentation.

## Intent

ChatMessageMetadata is the optional compact line below a chat message. It
projects caller-owned timestamp/footer content and an optional delivery status
inside the sender-aware Chat composition. It is not the message article, the
bubble surface, the transcript, or the footer control owner.

## Compatibility and migration

- Released default preserved: yes. Core `0.6.3` exports `./Chat` with this
  component, props, and status type.
- Compatibility class: patch correction for non-rendering scalar ReactNode
  values, preserving numeric `0` and the published props.
- Controlled/uncontrolled behavior: not applicable; the component stores no
  delivery state.
- Migration decision: none. Existing callers need no new option.

Consumer migration instructions, when needed, belong in release notes rather
than this record.

## Ownership boundary

**Owns**

- The optional metadata root, its `chat-message-metadata` painting target,
  ref, neutral DOM passthrough, and composed styling inputs.
- Presence checks and separators among timestamp, footer, and status.
- Sender-relative row order from the nearest Chat message context, with an
  assistant fallback outside that context.
- Status-to-glyph and translated-caption selection and the local sending/error
  paint path.

**Does not own / non-goals**

- Sender identity, article semantics, avatar, name, and body alignment:
  `ChatMessage` owns these.
- Bubble inset and placement: `ChatMessageBubble` owns these.
- Footer action semantics, button focus, and callback behavior: the caller's
  supplied content owns them.
- Transcript scrolling, loading, or delivery-state transitions: the surrounding
  composition owns these.
- A new public rule for inspecting composite, lazy, or asynchronous ReactNode
  values, or a screen-reader announcement-timing guarantee.

## Public concepts

| Concept        | Closed values or states                                            | Observed meaning                                                  | Availability                                        | Default                                     | Owner                               | Stability     | Invalid-value behavior                                                                               |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ----------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `timestamp`    | Omitted or caller ReactNode                                        | Optional first item, normally a time                              | Any composition                                     | Omitted                                     | Caller                              | Released      | Null, booleans, and empty string do not render a scalar slot; `0` renders; non-scalars remain opaque |
| `footer`       | Omitted or caller ReactNode                                        | Optional middle item such as model information or caller controls | Any composition                                     | Omitted                                     | Caller                              | Released      | Same scalar treatment as timestamp                                                                   |
| `status`       | `sending`, `sent`, `delivered`, `read`, `error`, omitted           | Optional delivery caption and glyph                               | Any composition                                     | Omitted                                     | Component/caller input              | Released      | Closed type union; omitted contributes no item                                                       |
| Sender context | `user`, `assistant`, `system`, absent                              | Selects user-reversed or other forward row order                  | Within `ChatMessage` or standalone                  | Assistant when absent                       | `ChatMessage` / local fallback      | Observational | Non-user values share the forward path                                                               |
| Root surface   | `BaseProps<HTMLDivElement>`, `ref`, `xstyle`, `className`, `style` | Extends the metadata row when it exists                           | Slot passes scalar-presence check or status present | Absent for empty scalar slots and no status | `architecture:public-component-api` | Released      | Non-scalar values remain opaque; target and consumer styles combine                                  |

## Behavioral and layout contract

The following candidate invariants name their evidence. They are observations
for review, not current product policy created by this draft.

| ID  | Candidate invariant                                                                                                                                                                          | Basis                                                                                               | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | The root appears when at least one slot passes the shared scalar-presence predicate or `status` is present. Non-scalar values are treated as present without inspecting their inner content. | Public ReactNode seam, shared `isRenderable` scalar utility, focused red/green and browser evidence | Verify correction  |
| FR2 | Accepted slot values render in timestamp, footer, status order with dots between values considered present; numeric `0` is visible in either slot, and non-scalar nodes remain opaque.       | Shipped ordering, shared scalar utility, focused tests, light/dark browser cases                    | Verify correction  |
| FR3 | A `user` message reverses row direction; `assistant`, `system`, and absent context use the forward path.                                                                                     | Source, Chat context, sender and RTL browser fixtures                                               | Verify observation |
| FR4 | Status selects one of five registry icons and localized labels; failure uses the error text token, and sending has a CSS pulse suppressed under reduced motion.                              | Source, locale catalog, owned browser status matrix                                                 | Verify observation |
| FR5 | The root merges the target, default StyleX output, and consumer `xstyle`, `className`, and `style`; accepted neutral DOM/ARIA inputs and `ref` reach that root.                              | Source, public API authority, existing passthrough test                                             | Verify observation |
| FR6 | A status item has a translated title and author-supplied `aria-label`, an icon and visible localized text. The row declares no live-region role or imperative announcement.                  | Source, DOM tests and axe fixtures; no real-AT timing claim                                         | Verify observation |

### Allowed variation

- **AV1 - Slot content.** The caller decides the structure and semantics inside
  timestamp and footer slots. This component does not inspect non-scalar nodes.
- **AV2 - Theme.** Semantic colors, typography, and spacing resolve through the
  active Theme; the root remains the public metadata painting target.
- **AV3 - Context.** Standalone use takes the assistant ordering fallback.

### Representative states

| State                       | Observed result                                                             | Allowed variation                      |
| --------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| Standalone timestamp        | One root and one visible item                                               | Caller content                         |
| User or assistant message   | Sender-relative row order                                                   | Text direction inherited from the page |
| Timestamp + footer + status | Items separated according to scalar presence; composite nodes remain opaque | Caller footer content                  |
| Each delivery status        | Distinct localized caption and mapped icon                                  | Active translation and theme tokens    |
| Non-rendering scalar slots  | No stranded dot; no row when all items are empty                            | Composite nodes remain opaque          |
| Numeric `0`                 | Visible content, not an empty marker                                        | Either slot                            |
| Long footer at narrow width | Content reflows within its container                                        | Caller text may wrap                   |

### Transformation and precedence order

- **ORD1 - Presence before separators.** Decide scalar presence with the shared
  predicate while treating non-scalar caller nodes as opaque, then place
  punctuation between values considered present. The status check remains
  independent of the slot checks.
- **ORD2 - Composition.** Resolve sender context, select flex order, and compose
  component StyleX and theme target with consumer styling inputs on one root.

### Performance and resources

- **PR1 - Render derivation.** The component creates no local React state,
  Effects, timers, observer, or event listeners. Its local animation is CSS and
  suppressed for reduced motion.

## Accessibility contract

- **AR1 - Display semantics.** The metadata line does not add a button, focus
  target, list role, or live region of its own. Interactive footer content retains
  its own semantics and keyboard behavior.
- **AR2 - Visible delivery state.** The status caption accompanies the glyph so
  state identification does not rely on color or the icon alone.
- **AR3 - Evidence boundary.** Browser-exposed markup and axe coverage do not
  establish spoken output or announcement timing; any such future claim follows
  `spec:AST-009` and its named AT evidence rule.

## Design relationships

| Anatomy or state | Design requirement                                               | Representation authority                     | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------- | -------------- | ------------------ |
| Metadata row     | Semantic supporting typography and sender-relative reading order | Local representation unsettled               | Supporting     | FR2–FR3            |
| Delivery status  | Registry glyph, caption, and semantic error token                | Local prominence and motion choice unsettled | Supporting     | FR4, AR2           |

No current component-local ChatMessageMetadata design decision is introduced.
The draft `design:motion` and `design:system-states` records are not adopted as
current authority by this record.

## Family and system relationships

- There is no current `family:chat` product-authority record. `Chat.doc.mjs` is
  consumer composition guidance, not a family contract.
- `architecture:public-component-api` owns root export and passthrough;
  `architecture:component-theming-surface` owns the public painting target;
  `architecture:component-test-sufficiency` owns bounded evidence coverage.
- `spec:AST-029` keeps the closed audit inventory and score outside this
  component draft.

## Verification map

| Contract     | Evidence                                               | Representative states                       | Mutation or failure expectation                                   | Audit section                             |
| ------------ | ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| FR1–FR2      | `ChatMessageMetadata.test.tsx`; Chromium receipts      | empty scalar, zero, timestamp/footer/status | A nullish-only guard reintroduces a stray separator or blank row  | `audit:ChatMessageMetadata/behavior`      |
| FR3          | Storybook sender fixtures and Chromium RTL frames      | user, assistant, standalone in LTR/RTL      | Wrong relative ordering becomes visible                           | `audit:ChatMessageMetadata/rtl`           |
| FR4, AR2     | Status fixtures, locale catalog, Chromium/axe receipts | five statuses, light/dark, reduced motion   | A dropped status label or failed theme paint is visible           | `audit:ChatMessageMetadata/accessibility` |
| FR5          | Existing passthrough test and theming-target guard     | DOM/data/ARIA and styling                   | Root drops accepted caller inputs or target                       | `audit:ChatMessageMetadata/public-api`    |
| FR6, AR1–AR3 | Axe and browser semantic receipts                      | static status and caller button             | Missing text/icon or falsely claimed AT timing remains detectable | `audit:ChatMessageMetadata/testing`       |

## Decision log

None. This draft makes no new component-local product decision.

## Open questions

- **OQ1 - Should non-scalar ReactNode slots ever be normalized for emptiness?**
  (`human-api`) Arrays, Fragments, lazy content, and promises remain opaque under
  the existing scalar predicate; this audit does not consume or inspect them.
- **OQ2 - Should standalone delivery-status changes be announced, and if so by
  which owner?** (`human-api`) The current row is display-only. No spoken-timing
  claim is made without a current owner and applicable AT evidence.

## Content boundary

This record does not store an audit score, screenshot manifest, CI transcript,
consumer prop example, new public API, or shared visual policy. Those remain in
the audit PR evidence, consumer docs, and their canonical owners.
