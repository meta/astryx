---
schema_version: 3
template_version: 7
kind: component
id: component:Tour
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, accessibility]
verified_by:
  [
    packages/lab/src/Tour/Tour.test.tsx,
    packages/lab/src/Tour/__tests__/TourCardTarget.interaction.browser.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: []
---

# Tour component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Unchanged by this record.                                                                                                                         |
| Behavior                | Without a backdrop, a press on the page or on the target leaves the tour running. With a backdrop, a press anywhere ends it with `'backdrop'`.    |
| End-user impact         | A person can use the control a step introduces, or the rest of the page, while a plain tour stays open; a dimmed tour ends on a press outside it. |
| Builder impact          | None; `hasBackdrop` chooses between the two.                                                                                                      |
| Compatibility/readiness | Lab. Draft.                                                                                                                                       |
| Review checks           | Reject a press that ends a tour without a backdrop, or a press under a backdrop that leaves the tour running.                                     |
| Governing rules         | None recorded.                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Tour is the lab's guided walkthrough: a sequence of steps, each a callout
beside a highlighted target. This record states only how a press outside the
step's callout affects the tour. Consumer usage lives in `Tour.doc.mjs`.

## Compatibility and migration

- Released default preserved: `no` for a tour without a backdrop: a press on the page or on the target leaves it running (FR1, DEC-1).
- Compatibility class: behavioral, Lab.
- Controlled/uncontrolled behavior: unchanged; `isActive` and `onDismiss` are the app's.
- Migration decision: none needed. An app that ends a plain tour on an outside press passes `hasBackdrop`.

## Ownership boundary

**Owns**

- Whether a press outside the step's callout ends the tour.

**Does not own / non-goals**

- The callout's placement, focus movement, and the step controls. Not recorded here.
- Escape, which ends the tour through the shared layer dismissal stack.

## Public concepts

| Concept  | Closed values or states | Meaning                                                     | Availability by variant/orientation/state | Default | Owner            | Stability    | Invalid-value behavior |
| -------- | ----------------------- | ----------------------------------------------------------- | ----------------------------------------- | ------- | ---------------- | ------------ | ---------------------- |
| Backdrop | on, off                 | Whether the step dims the page and ends the tour on a press | Every step                                | off     | `component:Tour` | experimental | Not applicable         |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                   | Basis | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------ |
| FR1 | Without a backdrop, a press on the page or on the step's target MUST NOT end the tour. With a backdrop, a press anywhere outside the callout, the target included, MUST end the tour with `'backdrop'`. This holds for every pointer. | DEC-1 | settled            |

## Accessibility contract

- **AR1 — the page stays usable.** Without a backdrop, keyboard focus can leave the callout for the page and the target, and a press there does not end the tour (FR1).

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Backdrop         | None recorded      | Not applicable           | supporting     | FR1                |

The component implements design requirements without copying their rationale.

## Family and system relationships

None recorded.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                             | Representative states                   | Mutation or failure expectation                                           | Audit section |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| FR1      | "keeps the tour running when the target is pressed"; "keeps the tour running when the page is pressed"; "dismisses with \"backdrop\" when the backdrop is clicked"; "pressing the introduced control keeps the tour…"; "a press on the dimmed page ends a backdrop tour" | No backdrop and backdrop; a card target | A press that ends a plain tour, or leaves a dimmed tour running, fails it | None          |

## Decision log

### DEC-1 — A press does not end a tour without a backdrop

**Decider:** `cixzhang`, 2026-11-04

**Basis:** Lab-only behavior, under the owner's standing Lab grant: "Anything lab only gets an ok".

**Decision:** A step is a non-modal layer with no light dismiss. Without a backdrop, a press on the page or on the target leaves the tour running, on every pointer. With a backdrop, the dimmed overlay catches every press, the target's included, and ends the tour with `'backdrop'`.

**Rejected:** ending a tour without a backdrop on any press, which ends it when a person uses the control the step introduces.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
