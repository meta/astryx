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
verified_by: [packages/lab/src/Tour/Tour.test.tsx]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: []
contributing: []
system_specs: []
---

# Tour component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Unchanged by this record.                                                                                                                                                       |
| Behavior                | Without a backdrop, a press on the page or on the target leaves the tour running. With a backdrop, a press outside the callout, the target included, ends it with `'backdrop'`. |
| End-user impact         | A person can use the control a step introduces, or the rest of the page, while a plain tour stays open; a dimmed tour ends on a press outside it.                               |
| Builder impact          | An app that needs a press on the page or the target to end the tour passes `hasBackdrop`, which also dims the page and reports `'backdrop'` (DEC-1).                            |
| Compatibility/readiness | Lab. FR1 and AR1 record implementation gaps on main.                                                                                                                            |
| Review checks           | Reject a press on the page or the target that ends a tour without a backdrop, or a press outside the callout under a backdrop that leaves the tour running.                     |
| Governing rules         | None recorded.                                                                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Tour is the lab's guided walkthrough: a sequence of steps, each a callout
beside a highlighted target. This record states how a press outside the
step's callout affects the tour, and whether keyboard focus can leave the
callout. Consumer usage lives in `Tour.doc.mjs`.

## Compatibility and migration

- Released default preserved: `no` for a tour without a backdrop: a press on the page or on the target leaves it running (FR1, DEC-1).
- Compatibility class: behavioral, Lab.
- Controlled/uncontrolled behavior: unchanged; `isActive` and `onDismiss` are the app's.
- Migration decision: DEC-1. An app that needs an outside press to end a tour passes `hasBackdrop`, which also dims the page and reports `'backdrop'` instead of `'close'`.

## Ownership boundary

**Owns**

- Whether a press outside the step's callout ends the tour.
- Whether keyboard focus can leave the step's callout without a backdrop (AR1).

**Does not own / non-goals**

- The callout's placement, where focus goes when a step starts or the tour ends, and the step controls. Not recorded here.
- Escape, which ends the tour through the shared layer dismissal stack (`family:overlay-dismissal`).

## Public concepts

| Concept  | Closed values or states | Meaning                                                                         | Availability by variant/orientation/state | Default | Owner            | Stability    | Invalid-value behavior |
| -------- | ----------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ---------------- | ------------ | ---------------------- |
| Backdrop | on, off                 | Whether the step dims the page and ends the tour on a press outside the callout | Every step                                | off     | `component:Tour` | experimental | Not applicable         |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                       | Basis |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR1 | Without a backdrop, a press on the page or on the step's target MUST NOT end the tour. With a backdrop, a press anywhere outside the callout, the target included, MUST end the tour with `'backdrop'`. This holds for every pointer. Implementation gap: a press on the page or on the target ends the tour reporting `'close'`, with or without a backdrop; the dim overlay catches no press. | DEC-1 |

## Accessibility contract

- **AR1 — the page stays usable.** Without a backdrop, keyboard focus can leave the callout for the page and the target, and a press there does not end the tour (FR1). Implementation gap: keyboard focus stays in the callout.

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Backdrop         | None recorded      | Not applicable           | supporting     | FR1                |

The component implements design requirements without copying their rationale.

## Family and system relationships

- `family:overlay-dismissal` owns Escape through the shared dismissal stack. The step adopts it, and this record owns only the step's outside dismissal (FR1) and whether focus can leave the callout (AR1).

## Verification map

| Contract | Verification                                                                                                                                                             | Representative states | Mutation or failure expectation     | Audit section |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----------------------------------- | ------------- |
| FR1      | "dismisses with \"backdrop\" when the backdrop is clicked"; it clicks the overlay element directly in jsdom, so neither half is verified in a real browser (the FR1 gap) | Backdrop              | A dimmed tour left running fails it | None          |
| AR1      | Pending: the AR1 gap                                                                                                                                                     | No backdrop           | Focus kept in the callout fails it  | None          |

## Decision log

### DEC-1 — A press does not end a tour without a backdrop

**Decider:** `cixzhang`, 2026-11-04

**Basis:** Lab-only behavior, under the owner's standing Lab grant: "Anything lab only gets an ok". Promoted to current under the standing Lab grant.

**Decision:** A step is a non-modal layer with no light dismiss. Without a backdrop, a press on the page or on the target leaves the tour running, on every pointer. With a backdrop, the dimmed overlay catches every press, the target's included, and ends the tour with `'backdrop'`.

**Rejected:** ending a tour without a backdrop on any press, which ends it when a person uses the control the step introduces.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
