---
schema_version: 3
template_version: 7
kind: component
id: component:ChatComposer
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Chat/ChatComposer.test.tsx,
    packages/core/src/Chat/ChatComposerInput.test.tsx,
    packages/core/src/Chat/ChatSendButton.test.tsx,
    apps/storybook/stories/ChatComposer.stories.tsx,
    apps/storybook/stories/ChatComposerCustomInput.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:interaction-modality,
    architecture:react-component-runtime,
    architecture:component-style-authoring,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs:
  [
    spec:AST-002,
    spec:AST-009,
    spec:AST-017,
    spec:AST-020,
    spec:AST-027,
    spec:AST-029,
  ]
---

# ChatComposer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatComposer` with a controlled or uncontrolled draft (`value`, `onChange`), `onSubmit`, `placeholder`, `isDisabled`, `isStopShown`, `onStop`, `density`, `elevation`, `status`, `statusPosition`, the drawer, header, input, footer, and send slots, and BaseProps; the exported composition context. |
| Behavior                | ChatComposer coordinates a controlled or uncontrolled draft, trims a submitted value, clears through the existing value channel, composes caller slots, and keeps the default send/stop action synchronized with context.                                                                               |
| End-user impact         | Screen-reader users can identify the disabled editor, pointer and touch users can stop an interruptible response, and users of a custom editor send the draft that editor supplied instead of stale composer state.                                                                                     |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                   |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps are listed under Current-state impact; four owner questions stay open. Evidence still pending for parts of FR1, FR5–FR7, FR10, and PR1–PR2 (read from source; see the verification map).                                            |
| Review checks           | Reject ignored context submission arguments, a disabled state hidden from the default textbox, an ancestor that blocks an enabled Stop action, or a change that settles an open question without its owner.                                                                                             |
| Governing rules         | `architecture:interaction-modality/INV4, INV7, INV9`; `architecture:public-component-api/INV5–INV6, INV9, INV12`; `architecture:component-theming-surface/INV4, INV6`; `spec:AST-020/FR1`; `spec:AST-029/DEC-4`.                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

ChatComposer is the message-entry shell for a chat surface. It coordinates the
current draft and submission operation, lays out an optional drawer, header,
status, footer, and send-area content around a default or caller-supplied input,
and owns keyboard-only editor focus indication. Products own message transport,
streaming state, validation policy, and the content placed in each slot.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: a successful submission clears through
  `onChange` in controlled mode and local state otherwise
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The public target does not reach the painted body.** The `chat-composer`
  target sits on the outer frame, so a theme cannot select the body's elevation
  and border. `architecture:component-theming-surface` INV4 puts each themable
  part's paint on its target (FR7, OQ1).
- **Styling inputs split across two elements.** `ref`, DOM props and events,
  `className`, and `style` reach the outer frame while `xstyle` reaches the
  painted body. `architecture:public-component-api` INV6 has styling inputs
  compose on one element (FR10, OQ2).

## Ownership boundary

**Owns**

- Coordinating a controlled or uncontrolled serialized draft value with the input and submit action.
- Providing the default token-capable editor and send/stop action while allowing either to be replaced.
- Laying out the drawer, header, input, footer, send, and status regions.
- Applying composer density, elevation, disabled presentation, and keyboard-only editor focus indication.
- Publishing the composition context used by custom inputs and send controls.

**Does not own / non-goals**

- Sending, retrying, cancelling, or persisting a message — owned by the product callsite.
- Deciding when a response is streaming or whether it is interruptible — owned by the product callsite.
- Attachment data, model selection, speech recognition, or validation policy — owned by the supplied slot components and product callsite.
- A product's accessible conversation transcript or live response announcements — owned by the surrounding chat surface.

## Public concepts

| Concept                 | Closed values or states                                      | Meaning                                                                                          | Availability by variant/orientation/state        | Default                     | Owner                               | Stability | Invalid-value behavior                                                        |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------- | ----------------------------------- | --------- | ----------------------------------------------------------------------------- |
| Draft ownership         | uncontrolled; controlled `value` + `onChange`                | Selects where the serialized input draft is stored and how clearing is reported.                 | Every ChatComposer                               | uncontrolled empty string   | `component:ChatComposer`            | stable    | Controlled `value` without an updating owner remains caller-controlled.       |
| Submission              | input submit; default send; custom context `onSubmit(value)` | Delivers one trimmed, non-empty supplied value and clears the draft through the current channel. | Enabled composer with a non-empty supplied value | no submission               | `component:ChatComposer`            | stable    | Empty values and submissions while disabled are ignored.                      |
| Input composition       | default ChatComposerInput; custom React node                 | Supplies the editing surface and optional registered focus control.                              | Every ChatComposer                               | ChatComposerInput           | `component:ChatComposer`            | stable    | A custom input without a registered control gets textarea focus fallback.     |
| Editing availability    | enabled; disabled                                            | Controls whether the draft can be edited or submitted.                                           | Every ChatComposer                               | enabled                     | `component:ChatComposer`            | stable    | Disabled submission is ignored.                                               |
| Primary action          | send; stop                                                   | Sends the current draft or requests interruption.                                                | Default ChatSendButton or a custom sendButton    | send                        | `component:ChatComposer`            | stable    | A shown Stop action without `onStop` renders but does nothing (OQ4).          |
| Density                 | compact; balanced; spacious                                  | Selects composer spacing.                                                                        | Every ChatComposer                               | balanced                    | `component:ChatComposer`            | stable    | Unknown values are rejected by TypeScript.                                    |
| Elevation               | low; none                                                    | Selects a raised body or a flat bordered body.                                                   | Every ChatComposer                               | low                         | `component:ChatComposer`            | stable    | Unknown values are rejected by TypeScript.                                    |
| Status                  | absent; error; warning; top; bottom                          | Adds announced feedback before or after the body.                                                | Optional status object                           | absent; bottom when present | `component:ChatComposer`            | stable    | An omitted message renders the bar and announces nothing.                     |
| Named composition slots | drawer; header actions/context; input; footer/send actions   | Lets callers compose supporting controls and information around the draft.                       | Optional, independently supplied                 | omitted                     | `component:ChatComposer`            | stable    | Omitted slot groups emit no empty header; footer remains for the send action. |
| BaseProps surface       | ref; DOM props/events; className/style; xstyle               | Extends the component with DOM identity, behavior, and styling.                                  | Every ChatComposer                               | omitted                     | `architecture:public-component-api` | stable    | Split between the frame and the body (FR10, OQ2).                             |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR1  | Controlled mode MUST report changes through `onChange`; uncontrolled mode MUST retain them locally. Every successful submit MUST trim and deliver the value supplied to that operation, then clear through the same value channel.                                                                                                                                 | public types and docs; `architecture:public-component-api/INV3, INV9, INV12`; focused tests                                              |
| FR2  | The default editor MUST serialize its current text/tokens, submit Enter without Shift, preserve Shift+Enter, defer during IME composition, and allow a caller key handler to prevent the default operation.                                                                                                                                                        | implementation, docs, and focused tests                                                                                                  |
| FR3  | `isDisabled` MUST prevent draft edits and submissions and MUST expose `aria-disabled="true"` on the default textbox; removing the prop MUST remove that state.                                                                                                                                                                                                     | `spec:AST-020/FR1` (WCAG 2.2 4.1.2); `architecture:interaction-modality/INV5`; red/green focused test                                    |
| FR4  | When `isStopShown` is true, the default primary action MUST remain an enabled, named Stop button and call `onStop`; if editing is also disabled, ancestor styling MUST NOT block its pointer, touch, or keyboard activation.                                                                                                                                       | `architecture:interaction-modality/INV4, INV7, INV9`; red/green focused and browser-story tests                                          |
| FR5  | Omitted header slots MUST omit the header row; the drawer precedes the body; input fills the body between header and footer; footer actions precede send actions and the primary action; status follows `statusPosition`.                                                                                                                                          | implementation, props, stories, and blocks                                                                                               |
| FR6  | `compact` reduces body padding and gap; `balanced` and `spacious` produce the same body spacing. Whether `spacious` should differ is open (OQ3).                                                                                                                                                                                                                   | implementation and published union; no current owner selects distinct spacious geometry                                                  |
| FR7  | `low` applies low rest and medium hover and focus-within elevation; `none` applies no shadow and a border. Implementation gap: the public target does not reach the painted body (Current-state impact; OQ1).                                                                                                                                                      | implementation; `architecture:component-theming-surface/INV4, INV6`; the `chat-composer` target sits on the frame (Current-state impact) |
| FR8  | Keyboard focus entering the registered/default editor MUST add the shared focus indication to the body; pointer focus MUST not add that extra ring. Clicking non-interactive body space MUST focus the registered control, then a textarea fallback.                                                                                                               | implementation; `architecture:interaction-modality/INV1–INV3, INV9`; focused tests                                                       |
| FR9  | Error status is announced assertively and warning status politely through the shared announcement channel, once per occasion: one state transition, which a rerender or an update to the same value does not repeat (`spec:AST-086` FR6); the status bar itself carries no live role. Both pair a semantic icon with color and can render above or below the body. | implementation, docs, and stories; `spec:AST-020/FR1`; `spec:AST-086/FR2, FR5, FR6`                                                      |
| FR10 | `ref`, DOM props and events, `className`, and `style` reach the outer frame; `xstyle` reaches the painted body. Implementation gap: the styling inputs split across two elements (Current-state impact; OQ2).                                                                                                                                                      | implementation; `architecture:public-component-api/INV5–INV6, INV8`                                                                      |
| FR11 | The exported context MUST expose the current value, change and submit operations, placeholder, disabled/stop/send state, stop callback, and mutable input focus control to custom composition.                                                                                                                                                                     | public export, types, docs, stories, and focused tests; `architecture:public-component-api/INV12`                                        |

### Allowed variation

- **AV1 — Slot content.** Callers may omit or replace each named slot while preserving the composer's value, submit, focus, and disabled contracts.
- **AV2 — Product workflow.** Callers decide when to show status or Stop and what their callbacks do; ChatComposer owns only the local affordance and dispatch.
- **AV3 — Editor implementation.** A custom input may be a textarea, contenteditable editor, or other control when it follows the exported context and focus-control contract.

### Representative states

| State                        | Required invariant                                                                                  | Allowed variation                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Empty draft                  | Default send action is disabled and submission does not fire.                                       | Placeholder and optional slots vary.                         |
| Non-empty draft              | Enter or Send submits one trimmed value and clears through the active ownership channel.            | Serialized token representation and transport behavior vary. |
| Controlled draft             | Caller value remains authoritative; onChange receives edits and clear requests.                     | The caller may accept or defer each update.                  |
| Custom input                 | Context operations act on the supplied value and body click uses its registered focus control.      | DOM/editor implementation varies.                            |
| Disabled editing             | Default textbox exposes disabled state and cannot edit or submit.                                   | Supporting content remains visible.                          |
| Disabled, interruptible work | Stop remains named, enabled, and reachable by pointer, touch, and keyboard.                         | Product cancellation behavior varies.                        |
| Flat elevation               | Body has no shadow and uses its bordered presentation; keyboard focus indication remains available. | Theme tokens vary.                                           |
| Status above or below        | Announcement urgency, icon, color, and selected placement remain synchronized.                      | Message content and status type vary.                        |
| Narrow viewport              | Composer remains within its containing inline size and the primary action remains operable.         | Available inline size and optional slot content vary.        |

### Transformation and precedence order

- **ORD1 — Value update.** Receive an editor value → publish through `onChange` when controlled or update local state when uncontrolled → derive current context value and send availability.
- **ORD2 — Submission.** Receive the operation's supplied value → trim → reject empty or disabled submission → call public `onSubmit` once → request clearing through the current value channel.
- **ORD3 — Primary action.** Resolve `isStopShown` → expose Stop and dispatch `onStop`, otherwise derive send availability from current draft and disabled state → submit the current context value.
- **ORD4 — Composition order.** Optional top status → drawer → body header → input → footer actions → send actions → primary action → optional bottom status.

### Performance and resources

- **PR1 — Context stability.** The exported context value SHOULD retain referential stability while none of its public members changes.
- **PR2 — Focus coordination.** The component adds no document listener or observer of its own for body-click focus or focus indication; it mounts the shared interaction-modality tracker, which adds document-level `pointerdown` and `keydown` listeners (`architecture:interaction-modality`).

## Accessibility contract

- **AR1 — Editing state.** The default contenteditable surface acts as the textbox and MUST expose disabled state through `aria-disabled` when editing is unavailable.
- **AR2 — Native actions.** The default Send and Stop controls remain native buttons with translated accessible names; disabled Send uses native disabled behavior, while explicit Stop remains operable.
- **AR3 — Keyboard editing.** Enter submission MUST preserve Shift+Enter newline behavior, IME composition, and caller cancellation through `preventDefault()`.
- **AR4 — Focus indication.** Keyboard focus in the editor MUST produce the shared visible focus treatment; pointer focus does not claim keyboard modality, and focus on an internal action remains owned by that action.
- **AR5 — Status feedback.** Error feedback is announced assertively and warning feedback politely through the shared announcement channel (`spec:AST-086` FR2, FR5); the visible status bar carries no live role and stays readable. Visible icon and color do not replace the caller's message content.

## Design relationships

| Anatomy or state    | Design requirement                                                  | Representation authority                                                                                   | Hierarchy role | Component contract |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| Composer frame      | Groups body and optional status into one compositional shell.       | Current source                                                                                             | container      | FR5                |
| Composer body       | Provides the painted rounded input/action surface and elevation.    | elevation is shipped; public theme reachability is unsettled                                               | prominent      | FR7                |
| Drawer              | Places attachment/context content before the body.                  | delegated to `component:ChatComposerDrawer`                                                                | supporting     | FR5                |
| Header              | Places caller actions at start and caller context at end.           | Current source                                                                                             | supporting     | FR5                |
| Input               | Owns or hosts the editing surface and its focus control.            | delegated to `component:ChatComposerInput` or caller custom input                                          | prominent      | FR1–FR3, FR8, FR11 |
| Footer              | Places caller actions and the primary action on the final body row. | Current source                                                                                             | supporting     | FR4–FR5            |
| Send or stop action | Presents the current primary operation.                             | delegated to `component:ChatSendButton` or caller custom send button                                       | prominent      | FR1, FR4           |
| Status message      | Adds error or warning feedback before or after the body.            | shared-channel announcement and color are shipped; separate public theme reachability is not asserted here | supporting     | FR5, FR9, AR5      |

The public `chat-composer` target sits on the frame and cannot select the body's
elevation and border (Current-state impact). No anatomy-theming map is recorded
yet; the block is optional during migration, so the map is deferred.

## Family and system relationships

- No current family or design record governs ChatComposer-specific behavior.
- `architecture:public-component-api` owns BaseProps element ownership, callback semantics, and the exported composition context.
- `architecture:interaction-modality` owns modality parity, focus ownership, and the requirement that enabled Stop remain reachable.
- `architecture:component-theming-surface` owns the anatomy-to-target disposition and makes the current body reachability mismatch blocking without deciding its repair shape.
- `architecture:component-test-sufficiency` owns public-state partitions, negative assertions, observable output, and the exact-head browser boundary.
- `architecture:react-component-runtime` owns render-derived state and browser/server boundaries.
- `architecture:knowledge-contracts` keeps consumer syntax in `ChatComposer.doc.mjs` and system behavior in this record.
- `spec:AST-020/FR1` carries the current WCAG 2.2 accessibility baseline.
- `spec:AST-029` owns the audit evidence inventory this record's verification map follows.

## Verification map

| Contract  | Verification                                                                                                                                                       | Representative states                                                           | Mutation or failure expectation                                                                          | Audit section                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, FR11 | `ChatComposer.test.tsx` input composition tests                                                                                                                    | context-supplied value, custom input reading value, change, and disabled        | A context submission that ignores its argument, or a context member a custom input cannot read, fails.   | `audit:ChatComposer/api-behavior`   |
| FR2, AR3  | `ChatComposerInput.test.tsx`                                                                                                                                       | Enter, Shift+Enter, composing, cancelled keydown                                | A key path that sends during composition or loses a newline fails.                                       | `audit:ChatComposer/input-behavior` |
| FR3, AR1  | `ChatComposer.test.tsx` "exposes disabled state on the default textbox and clears it when enabled"                                                                 | disabled and re-enabled default textbox                                         | A textbox that loses or keeps its disabled state wrongly fails.                                          | `audit:ChatComposer/accessibility`  |
| FR4, AR2  | `ChatComposer.test.tsx` "keeps the Stop action pointer-operable while editing is disabled"; the `DisabledStreamingNarrow` story play in `ChatComposer.stories.tsx` | disabled editing with Stop shown; a narrow viewport with no horizontal overflow | A Stop action an ancestor blocks, or one that does not call `onStop`, fails.                             | `audit:ChatComposer/modality`       |
| FR7       | `ChatComposer.test.tsx` elevation tests                                                                                                                            | `low` default, `none`                                                           | Levels that share a body class, or a default other than `low`, fail.                                     | `audit:ChatComposer/theming`        |
| FR8, AR4  | `ChatComposer.test.tsx` focus indication tests and custom-input focus tests                                                                                        | keyboard, pointer, programmatic after each, internal button, body click         | A ring on pointer focus, a missing ring on keyboard focus, or a body click that skips the control fails. | `audit:ChatComposer/focus`          |
| FR9, AR5  | `ChatComposer.test.tsx` status announcement tests                                                                                                                  | error, warning, StrictMode mount, repeat after clear, no message, page load     | A live role on the bar, a repeated or missing announcement, or the wrong urgency fails.                  | `audit:ChatComposer/accessibility`  |

Read from source, with no focused test yet:

- FR1: controlled and uncontrolled draft storage, trimming, rejecting an empty
  or disabled submission, and clearing through the active channel.
- FR5: slot order, the omitted header row, and status placement above or below
  the body.
- FR6: the density spacing.
- FR7: the shadow and border values for each elevation.
- FR10: where each BaseProps input lands.
- PR1–PR2: context stability, and no document listener or observer of the
  component's own.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Body theming reachability.** Should a new stable body target be added, should the released `chat-composer` target move, or should elevation be projected through the existing root target by another compatible mechanism? (`human-api`)
- **OQ2 — BaseProps owner.** Should ref, neutral DOM props/events, `className`, `style`, and `xstyle` all own the outer frame or the painted body, and what compatibility path preserves existing consumers? (`human-api`)
- **OQ3 — Spacious density.** Should `spacious` intentionally alias `balanced`, or should it receive distinct spacing selected by design? (`human-design`)
- **OQ4 — Stop callback invariant.** When `isStopShown` is true without `onStop`, should the component reject the combination, disable or hide Stop, or keep the currently inert action? (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or shared system rules. It links to their owners.
