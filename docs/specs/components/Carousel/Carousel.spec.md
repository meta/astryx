---
schema_version: 3
template_version: 7
kind: component
id: component:Carousel
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
owners: [cixzhang]
review_triggers: [behavior, accessibility]
verified_by:
  [
    packages/core/src/Carousel/Carousel.test.tsx,
    packages/core/src/Carousel/__tests__/Carousel.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:buttons]
design_specs: []
architecture: [architecture:interaction-modality]
contributing: []
system_specs: [spec:AST-085, spec:AST-025]
---

# Carousel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes.                                                                                                                                                                                                                                                            |
| Behavior                | An edge scroll button whose direction has run out is hidden and takes no tab stop. When the focused edge button runs out, focus moves to the scroll area.                                                                                                                |
| End-user impact         | A keyboard user who scrolls to the first or last item stays inside the carousel instead of landing on the page body or on an invisible control. The scroll area is a group named like the carousel (`spec:AST-025` FR12), so screen-reader users hear where they landed. |
| Builder impact          | None.                                                                                                                                                                                                                                                                    |
| Compatibility/readiness | No API change. Shipped Carousel and its current tests still use native `disabled` and hand focus to the opposite button; they change with conformance work.                                                                                                              |
| Review checks           | Reject focus left on a hidden edge button, focus dropped to the page body, or an edge handoff that moves focus to anything but the scroll area.                                                                                                                          |
| Governing rules         | `spec:AST-085` FR1, FR4; `spec:AST-025` FR12; `architecture:interaction-modality` INV1.                                                                                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Carousel shows a horizontally scrolling row of items inside a labelled region,
with optional scroll buttons at each edge. This record covers only what the edge
scroll buttons do when their direction runs out. Other Carousel behavior is
uncontracted until this record grows.

## Compatibility and migration

- Released default preserved: yes, except where focus lands at an edge.
- Compatibility class: behavior correction; no API change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: DEC-1.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Edge scroll button visibility, tab order, and the focus destination when one
  runs out.

**Does not own / non-goals**

- Scroll area keyboard access and naming — `spec:AST-025`.
- Disabled control semantics in general — `spec:AST-085`.
- Button naming, sizing, and activation — `family:buttons`.
- Looping, snapping, edge fades, and slide semantics — uncontracted.

## Public concepts

| Concept            | Closed values or states | Meaning                                            | Availability by variant/orientation/state | Default | Owner                | Stability | Invalid-value behavior |
| ------------------ | ----------------------- | -------------------------------------------------- | ----------------------------------------- | ------- | -------------------- | --------- | ---------------------- |
| Edge scroll button | available, run out      | Whether content remains in that button's direction | Both edges when the carousel overflows    | —       | `component:Carousel` | stable    | not applicable         |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                    | Basis                                    | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------ |
| FR1 | An edge scroll button whose direction has run out is hidden. While hidden it takes no tab stop and is not exposed to assistive technology. It stays mounted so layout does not shift. This is removal under `spec:AST-085` FR4, not a disabled control.                                                                | DEC-1                                    | settled            |
| FR2 | When the focused edge scroll button runs out, focus moves to the scroll area without scrolling it. This holds when the content no longer overflows and the scroll area is out of the tab order (`spec:AST-025` FR12): it still takes focus programmatically. Focus never lands on the page body or on a hidden button. | DEC-1; `spec:AST-085` FR4                | settled            |
| FR3 | The handoff happens once per edge transition, and only while the edge button held focus. An edge reached by swipe, resize, or wheel while focus is elsewhere moves nothing.                                                                                                                                            | `architecture:interaction-modality` INV8 | settled            |
| FR4 | An edge scroll button that is available behaves as an ordinary Button.                                                                                                                                                                                                                                                 | `family:buttons`                         | settled            |

### Representative states

| State                                  | Required invariant                                              | Allowed variation       |
| -------------------------------------- | --------------------------------------------------------------- | ----------------------- |
| Mid-scroll                             | Both edge buttons available                                     | Loop keeps both enabled |
| Focused "Scroll right" reaches the end | Button hides; focus is on the scroll area; no extra scroll      | Reduced motion          |
| Edge reached by swipe, focus elsewhere | Button hides; focus does not move                               | —                       |
| Content shrinks to fit                 | Both buttons hidden; a focused one hands off to the scroll area | —                       |

## Accessibility contract

- **AR1 — No invisible tab stops.** A hidden edge button is not focusable and is
  not exposed to assistive technology (FR1).
- **AR2 — Focus stays in the region.** The edge handoff keeps focus inside the
  labelled carousel region (FR2), and the keyboard focus indicator follows
  `architecture:interaction-modality` INV1.

## Design relationships

No design record governs Carousel yet. Edge button visuals stay in code and
visual evidence.

## Family and system relationships

- `spec:AST-085` FR4 lets a component name a focus destination for a control it
  removes; FR2 names the scroll area.
- `spec:AST-025` FR12 owns the scroll area's tab stop and naming.
- `family:buttons` owns the edge buttons' behavior while available.

## Verification map

| Contract | Verification                            | Representative states                                    | Mutation or failure expectation                                                | Audit section                  |
| -------- | --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| FR1, AR1 | Unit and accessibility-tree tests       | at rest at each edge; no overflow                        | A hidden button that is focusable or exposed fails                             | `audit:Carousel/accessibility` |
| FR2, AR2 | Real-browser keyboard test              | Enter on "Scroll right" until the end; same on the start | Focus on the page body, a hidden button, or the opposite button fails          | `audit:Carousel/accessibility` |
| FR3      | Real-browser test with swipe and resize | edge reached with focus outside the carousel             | Focus moving without an edge-button press, or moving twice for one edge, fails | `audit:Carousel/accessibility` |

## Decision log

### DEC-1 — The scroll area receives focus when an edge button runs out

**Reference:** `component:Carousel/DEC-1`
**Decider:** cixzhang, 2026-10-22

Carousel hides an edge button whose direction has run out, so keeping focus on
it would leave a keyboard user on an invisible control. The scroll area is always
mounted inside the labelled region and can take focus whether or not it is in the
tab order, so focus moving there keeps the user in place inside the carousel.

Rejected: the opposite edge button — it may be hidden too, and focus would jump
across the carousel.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
