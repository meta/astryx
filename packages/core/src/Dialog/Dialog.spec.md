---
schema_version: 3
template_version: 4
kind: component
id: component:Dialog
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-07
owners: [cixzhang, imdreamrunner]
review_triggers: [behavior, accessibility, public-api]
verified_by:
  [
    packages/core/src/Dialog/Dialog.test.tsx,
    packages/core/src/Dialog/DialogHeader.test.tsx,
    packages/core/src/Dialog/__tests__/Dialog.a11y.test.tsx,
    packages/core/src/Dialog/__tests__/Dialog.a11y.chromium.spec.ts,
    packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts,
  ]
modules: [module:Dialog/DialogHeader]
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-013, spec:AST-020, spec:AST-021]
---

# Dialog component contract

## Intent

Dialog presents one modal task above the current page. It owns the transition into
and out of that modal focus context so keyboard and assistive-technology users start
inside visible content and return to the invoking context when the task closes.

This record captures Dialog's component-local focus lifecycle. Shared dismissal,
layer ordering, public API admission, and runtime resource ownership stay with their
current family and architecture owners.

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records the shipped native-modal and inline-preview split.
- Controlled/uncontrolled behavior: Dialog visibility remains controlled.
- Migration decision: none; the current focus lifecycle is made explicit.

## Ownership boundary

**Owns**

- initial focus after the native modal becomes visible;
- the default DialogHeader title focus target;
- focus return to the external invoking element when the modal closes; and
- suppression of modal focus behavior for inline documentation rendering.

**Does not own / non-goals**

- Escape, backdrop, nesting, and topmost-layer dismissal — owned by
  `family:overlay-dismissal` and `architecture:layer-runtime`;
- the public admission or naming of autofocus props on descendant components —
  owned by those components and `architecture:public-component-api`;
- focus-ring appearance and modality detection — owned by accessibility and
  interaction authority; or
- a generic focus-management API for every overlay.

## Public concepts

| Concept               | Closed values or states                             | Meaning                                                         | Default                         | Owner                                    | Stability      |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- | ---------------------------------------- | -------------- |
| visibility            | open, closed                                        | whether the controlled modal is presented                       | caller-controlled               | `component:Dialog`                       | stable         |
| presentation          | native modal, inline preview                        | native dialog behavior versus non-modal documentation rendering | native modal                    | `component:Dialog`                       | stable         |
| initial-focus request | eligible descendant, default title, native fallback | where focus begins after modal presentation                     | DialogHeader title when present | `component:Dialog` plus descendant owner | stable outcome |
| invoking focus        | focusable external trigger, unavailable trigger     | context restored after close when still reachable               | restore when possible           | `component:Dialog`                       | stable outcome |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                        | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| FR1 | A native Dialog MUST become visibly modal before Dialog applies its component-owned initial-focus request.                                                                                                                                                                                                                                                                                                | shipped `showModal()` ordering and descendant-focus behavior | settled            |
| FR2 | Dialog MUST honor an eligible descendant initial-focus request. A request is eligible only when its rendered target is inside the active Dialog, is neither hidden nor inert, and can receive programmatic focus when selection runs. DialogHeader supplies its title as the default when no non-default eligible request is rendered. Ordering among multiple non-default requests is unspecified (AV3). | shipped DialogHeader and descendant autofocus behavior       | settled            |
| FR3 | When no eligible descendant request exists, Dialog MUST preserve the native dialog's valid initial-focus behavior rather than move focus outside the modal.                                                                                                                                                                                                                                               | native modal semantics and shipped fallback                  | settled            |
| FR4 | Closing a native Dialog MUST return focus to the still-connected external element that invoked the modal when that element can receive focus. Descendant mount focus MUST NOT replace that return owner.                                                                                                                                                                                                  | shipped trigger-return intent and regression history         | settled            |
| FR5 | Inline rendering MUST NOT open a modal, apply modal initial focus, trap focus, or return focus as if a modal had closed.                                                                                                                                                                                                                                                                                  | documented `isInline` preview behavior                       | settled            |
| FR6 | Initial-focus selection MUST follow the rendered eligible descendants, not a private component type or source-only assumption.                                                                                                                                                                                                                                                                            | composable descendant contract                               | settled            |
| FR7 | A native modal Dialog MUST be a focus region through Core's shared focus-region module: Tab from its last tabbable control moves focus to its first, and Shift+Tab from its first moves focus to its last, so focus never leaves the modal for the browser's own interface. When a Dialog opens from a Dialog, the innermost one holding focus answers Tab.                                               | owner decision DEC-2                                         | settled            |

### Allowed variation

- **AV1 — Initial target.** A form control, action, heading, or other eligible
  descendant may be the initial target when its owner exposes the supported intent.
- **AV2 — No request.** Browser-native selection may vary where no eligible request
  exists, provided focus does not escape the active modal.
- **AV3 — Multiple requests.** Callers should identify one intended initial target.
  Conflict ordering among multiple simultaneous requests is not a public API promise.
- **AV4 — Unavailable invoker.** Dialog MUST still close without error when the
  invoker was removed or can no longer receive focus; in that state it need not
  restore focus.

### Representative states

| State                                         | Required invariant                                          | Allowed variation                          |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| native modal with DialogHeader                | modal is visible before focus; title receives default focus | another earlier supported request may win  |
| native modal with explicit descendant request | requested eligible descendant receives focus                | descendant type and location               |
| native modal without request                  | focus remains within valid native modal behavior            | browser-selected eligible descendant       |
| modal close                                   | connected invoking element regains focus                    | no restoration when invoker is unavailable |
| Tab or Shift+Tab at the modal's edge          | focus wraps to the other end inside the modal               | which controls are tabbable                |
| inline preview                                | surrounding page focus remains unchanged                    | inline content and layout                  |

## Accessibility contract

- **AR1 — Focus enters visible modal content.** Initial focus MUST NOT target hidden
  pre-modal content or remain behind the active modal.
- **AR2 — Focus returns to context.** Closing a native Dialog MUST restore focus to
  its still-connected external invoking context when that context can receive focus.
- **AR3 — The initial target remains perceivable.** A programmatically focusable
  heading or control MUST preserve its accessible role, name, and operability.

## Design relationships

Dialog focus timing and destination do not prescribe title styling, modal size,
motion, backdrop appearance, or visual hierarchy. Those remain with Dialog's
component design and theming owners.

## Family and system relationships

- `family:overlay-dismissal` owns which close request is accepted and ensures one
  Escape press affects only the topmost relevant layer.
- `architecture:layer-runtime` owns modal layer ordering and shared lifecycle.
- `architecture:react-component-runtime` owns node/resource replacement safety.
- `architecture:interaction-modality` INV1 decides whether initial focus and the
  focus returned on close show the shared focus indicator; Dialog's
  `Dialog.a11y.browser.spec.ts` verifies both after pointer and keyboard input.
- This component owns the destination and return outcome for Dialog's modal focus
  lifecycle.

## Verification map

| Contract     | Verification                                                                                                             | Representative states                                     | Mutation or failure expectation                                                                                                                             | Audit section              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1–FR3, AR1 | shared modal-dialog binding in `Dialog.a11y.test.tsx` and `Dialog.a11y.chromium.spec.ts`; local DialogHeader focus tests | header default, explicit descendant, no request           | the shared contract fails when focus is applied before native modality, misses the declared target, or leaves the visible modal on native fallback          | audit:Dialog/accessibility |
| FR4, AR2     | shared modal-dialog browser binding plus the local unavailable-invoker close test                                        | external trigger, descendant mount focus, removed trigger | the shared contract records an exact current failure when descendant focus replaces the return owner; the local test keeps close safe after invoker removal | audit:Dialog/behavior      |
| FR5          | inline Dialog tests                                                                                                      | DialogHeader and focusable children                       | inline preview steals focus or invokes native modal methods                                                                                                 | audit:Dialog/behavior      |
| FR6, AR3     | shared modal-dialog binding plus the local composed-action focus fixture                                                 | DialogHeader heading, TextInput, action button            | focus depends on a private React child type or strips semantics from the target                                                                             | audit:Dialog/public-api    |
| FR7          | `Dialog.test.tsx`, `AlertDialog.test.tsx` and `CommandPalette.test.tsx` focus-region suites                              | last and first tabbable control, Dialog in Dialog, inline | Tab from the last control leaves the modal, or an outer Dialog answers an inner one's Tab                                                                   | audit:Dialog/accessibility |

## Decision log

### DEC-1 — Dialog owns focus timing; descendants own focus intent

**Reference:** `component:Dialog/DEC-1`
**Decider:** pending owner review

Dialog waits until native modal presentation before applying the selected request.
Descendant components own their supported focus intent; the DOM marker used today is
implementation evidence, not a permanent or newly admitted public API.

### DEC-2 — Every modal presentation is a focus region through one module

**Reference:** `component:Dialog/DEC-2`
**Decider:** `cixzhang`, `2026-10-28`

A modal surface contains Tab the way the APG modal dialog pattern describes:
Tab and Shift+Tab move through the modal's controls and wrap at either end.
Core's shared focus-region module provides that containment: the Tab
containment `useFocusTrap` applies for Drawer and Popover. Each modal
presentation applies the same module instead of
leaving Tab to the browser: Dialog, and AlertDialog and CommandPalette through
it, a modal BottomSheet, Lightbox, and a modal Drawer. A fault in the wrapping
is fixed in that module, not worked around in a component.

Rejected: leaving Tab to native `showModal()`, which sends focus to the browser's own interface from inside a modal.

## Open questions

None. DEC-2 settles focus containment.

## Content boundary

This file does not duplicate Dialog's prop table, dismissal rules, visual design,
private focus marker, audit results, or implementation plan. Consumer syntax remains
in `Dialog.doc.mjs`; implementation remediation is separate from this contract.
