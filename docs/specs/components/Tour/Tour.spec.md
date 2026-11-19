---
schema_version: 3
template_version: 7
kind: component
id: component:Tour
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-11
owners: [cixzhang]
review_triggers: [behavior, accessibility]
verified_by:
  [
    packages/core/src/Tour/Tour.test.tsx,
    packages/core/src/Tour/__tests__/Tour.interaction.browser.spec.ts,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: []
contributing: []
system_specs: [spec:AST-119]
---

# Tour component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A `steps` array, the active step the app owns through `activeId`, and the reasons `onEnd` reports (`spec:AST-119`).                                                             |
| Behavior                | Without a backdrop, a press on the page or on the target leaves the tour running. With a backdrop, a press outside the callout, the target included, ends it with `'backdrop'`. |
| End-user impact         | A person can use the control a step introduces, or the rest of the page, while a plain tour stays open; a dimmed tour ends on a press outside it.                               |
| Builder impact          | An app that needs a press on the page or the target to end the tour passes `hasBackdrop`, which also dims the page and reports `'backdrop'` (DEC-1).                            |
| Compatibility/readiness | Core. The steps, the active step and the end reasons are stable (`spec:AST-119`).                                                                                               |
| Review checks           | Reject a press on the page or the target that ends a tour without a backdrop, or a press outside the callout under a backdrop that leaves the tour running.                     |
| Governing rules         | None recorded.                                                                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Tour is the guided walkthrough: a sequence of steps, each a callout beside a
highlighted target. This record states how a press outside the
step's callout affects the tour, and whether keyboard focus can leave the
callout. Consumer usage lives in `Tour.doc.mjs`.

## Compatibility and migration

- Released default preserved: `not yet released`. Without a backdrop, a press on the page or on the target leaves the tour running (FR1, DEC-1).
- Compatibility class: additive component and type exports.
- Controlled/uncontrolled behavior: controlled; `activeId`, `onActiveIdChange` and `onEnd` are the app's (`spec:AST-119` FR4, FR5).
- Migration decision: DEC-1. An app that needs an outside press to end a tour passes `hasBackdrop`, which also dims the page; the end is reported as `'backdrop'`.

## Ownership boundary

**Owns**

- Whether a press outside the step's callout ends the tour.
- Whether keyboard focus can leave the step's callout without a backdrop (AR1).
- The callout's placement, where focus goes when a step starts or the tour ends, and the step controls, as `spec:AST-119` FR6–FR17 state them.

**Does not own / non-goals**

- Escape, which ends the tour through the shared layer dismissal stack (`family:overlay-dismissal`).

## Public concepts

| Concept        | Closed values or states          | Meaning                                                                                           | Availability by variant/orientation/state | Default        | Owner            | Stability | Invalid-value behavior                                                         |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ---------------- | --------- | ------------------------------------------------------------------------------ |
| Steps          | an ordered array of step objects | The steps the tour can show; a step left out of the array does not exist (`spec:AST-119` FR1–FR3) | Every tour                                | none; required | `component:Tour` | stable    | The later of two steps that share an id is ignored, with a development warning |
| Active step    | a step id, or none               | The step that shows; the app owns it (`spec:AST-119` FR4)                                         | Every tour                                | none; required | `component:Tour` | stable    | An id that matches no step shows nothing, with a development warning           |
| Anchor         | an element, or none              | The element a step describes; a step without one shows centered (`spec:AST-119` FR6)              | Every step                                | none           | `component:Tour` | stable    | Not applicable                                                                 |
| Missing anchor | center, skipStep, endTour        | What a step does when it starts and its anchor is not in the document (`spec:AST-119` FR8)        | Every tour                                | center         | `component:Tour` | stable    | Not applicable                                                                 |
| Backdrop       | on, off                          | Whether the step dims the page and ends the tour on a press outside the callout                   | Every tour                                | off            | `component:Tour` | stable    | Not applicable                                                                 |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                             | Basis |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR1 | Without a backdrop, a press on the page or on the step's target MUST NOT end the tour. With a backdrop, a press anywhere outside the callout, the target included, MUST end the tour with `'backdrop'`. This holds for every pointer. | DEC-1 |

## Accessibility contract

- **AR1 — the page stays usable.** Without a backdrop, keyboard focus can leave the callout for the page and the target (`spec:AST-119` FR14), and a press there does not end the tour (FR1).

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Backdrop         | None recorded      | Not applicable           | supporting     | FR1                |

The component implements design requirements without copying their rationale.

The overlay and the ring carry `data-backdrop="backdrop"` while the tour has a
backdrop, so a theme can paint a dimmed step apart from a plain one
(`architecture:public-component-api` DEC-2). A theme targets the callout as
`tour`, the ring as `tour-highlight` and the overlay as `tour-overlay`.

## Family and system relationships

- `family:overlay-dismissal` owns Escape through the shared dismissal stack. The step adopts it, and this record owns only the step's outside dismissal (FR1) and whether focus can leave the callout (AR1).

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                                                                                                   | Representative states                     | Mutation or failure expectation                                           | Audit section |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| FR1      | "leaves a press on the overlay alone without a backdrop"; "is modal with a backdrop: aria-modal, Escape from anywhere, and a press on the backdrop ends it"; "without a backdrop the page stays usable, and Escape ends the tour only from the callout or the anchor"; "a press on the dimmed page, the anchor included, ends a backdrop tour" | No backdrop and backdrop; a button anchor | A press that ends a plain tour, or leaves a dimmed tour running, fails it | None          |
| AR1      | "Tab leaves a callout without a backdrop and stays in one with a backdrop"                                                                                                                                                                                                                                                                     | No backdrop                               | Focus kept in the callout fails it                                        | None          |

## Decision log

### DEC-1 — A press does not end a tour without a backdrop

**Decider:** `cixzhang`, 2026-11-04

**Basis:** Lab-only behavior, under the owner's standing Lab grant: "Anything lab only gets an ok". Promoted to current under the standing Lab grant.

**Decision:** A step is a non-modal layer with no light dismiss. Without a backdrop, a press on the page or on the target leaves the tour running, on every pointer. With a backdrop, the dimmed overlay catches every press, the target's included, and ends the tour with `'backdrop'`.

**Rejected:** ending a tour without a backdrop on any press, which ends it when a person uses the control the step introduces.

**Amended:** `spec:AST-119` FR14 and DEC-6 make a step with a backdrop a modal layer. This decision's "a step is a non-modal layer" covers a step without a backdrop.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
