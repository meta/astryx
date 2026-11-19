---
schema_version: 3
template_version: 7
kind: component
id: component:LinkProvider
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, navigation]
verified_by:
  [
    packages/core/src/Link/useLinkComponent.test.tsx,
    packages/core/src/Link/Link.test.tsx,
    packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-005]
---

# LinkProvider component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. LinkProvider takes a required `component` and `children`.                                                                                                        |
| Behavior                | Every Astryx link in the subtree that resolves through the shared link boundary renders with `component`, unless a per-component `as` overrides it. The nearest provider wins. |
| End-user impact         | People get the app's client-side routing from Astryx links (no full page reload) where the app's router supports it. Unsafe destinations still never navigate.                 |
| Builder impact          | None.                                                                                                                                                                          |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                                      |
| Review checks           | Reject a provider that renders its own element, overrides an explicit `as`, leaks past a nearer provider, or lets a rejected destination reach `component`.                    |
| Governing rules         | `family:navigation-destinations` FR1, FR2, FR5, FR6, AV2; `spec:AST-005`.                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

LinkProvider lets an app swap the native anchor for its router's link component
once, for every Astryx link in a subtree. It is a collaborator of
`family:navigation-destinations`. Consumer usage lives in
`LinkProvider.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; without a provider, links render native
  anchors
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Supplying `component` to the subtree and its scoping.

**Does not own / non-goals**

- The router-facing `href` and `to` handoff, including the default `to` in FR3
  — owned by the shared link boundary (`useLinkComponent`) under
  `family:navigation-destinations`; the same default reaches an `as` component
  without a provider.
- Destination checks and inert rendering of rejected destinations — owned by
  `family:navigation-destinations` FR6 and `spec:AST-005` FR7; FR4 points to
  them.
- When a component renders a link at all — owned by each component (for
  example `component:Link` FR1 and `component:Button` FR11).
- Imperative navigation from enlarged surfaces — owned by
  `family:navigation-destinations` through its own hook.
- The router component's own behavior.

## Public concepts

| Concept        | Closed values or states | Meaning                                      | Availability by variant/orientation/state | Default       | Owner                    | Stability | Invalid-value behavior                                    |
| -------------- | ----------------------- | -------------------------------------------- | ----------------------------------------- | ------------- | ------------------------ | --------- | --------------------------------------------------------- |
| Link component | any element type        | Renders accepted link destinations in scope. | Inside the provider.                      | native anchor | `component:LinkProvider` | Stable    | A component that ignores `href` and `to` cannot navigate. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                | Basis                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| FR1 | LinkProvider renders only its children and adds no element.                                                                                                                                                                              | Current source                                           |
| FR2 | Inside the provider, a link rendered through the shared link boundary uses `component`. A per-component `as` wins over the provider; with neither, a native anchor renders. The nearest provider wins.                                   | `family:navigation-destinations` FR2, AV2; current tests |
| FR3 | Through the shared link boundary, `component` receives the accepted `href` and a `to` equal to `href` unless an accepted explicit `to` is supplied, which wins; a native anchor receives no `to`. LinkProvider only selects `component`. | `family:navigation-destinations` FR6; current tests      |
| FR4 | A rejected destination never reaches `component`; the inert rendering and destination checks follow `family:navigation-destinations` FR6 and `spec:AST-005` FR7.                                                                         | `family:navigation-destinations` FR6; `spec:AST-005` FR7 |
| FR5 | A component that renders no link in a given state does not use the provider: a disabled `component:Link` never renders the provider's component; which element it renders instead follows `component:Link` FR1 and FR5.                  | Current source and tests                                 |

### Allowed variation

- **AV1 — Router shape.** `component` may be href-based or to-based; both
  receive FR3's props.

### Representative states

| State                  | Required invariant                                       | Allowed variation |
| ---------------------- | -------------------------------------------------------- | ----------------- |
| No provider            | Native anchors.                                          | —                 |
| Provider               | `component` renders accepted links with `href` and `to`. | Router.           |
| Nested providers       | The inner provider wins.                                 | —                 |
| `as` inside a provider | `as` wins for that link.                                 | —                 |
| Rejected destination   | Inert native anchor; `component` not rendered.           | —                 |

### Transformation and precedence order

- **ORD1 — Link component.** Per-component `as`, then the nearest
  LinkProvider, then a native anchor.
- **ORD2 — Router destination.** An accepted explicit `to`, then `href`.

### Performance and resources

- **PR1 — Stable value.** The provided value changes only when `component`
  changes, so consumers do not re-render for an unchanged provider.

## Accessibility contract

- **AR1 — No semantics of its own.** LinkProvider adds no role, name, or
  focus behavior; the link component it supplies is responsible for rendering
  an accessible link from the props it receives.

## Design relationships

LinkProvider has no visual output. No design record governs it.

## Family and system relationships

- `family:navigation-destinations` names LinkProvider a collaborator; the
  shared link boundary applies the family's destination rules before
  `component` sees a destination.
- Every component that renders a link through the shared link boundary
  consumes it, for example `component:Link` and `component:Button` link mode.
  A component that renders a native anchor directly, as the family's adoption
  table lists, does not.

## Verification map

| Contract  | Verification                                                                            | Representative states                              | Mutation or failure expectation                                             | Audit section                      |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| FR2, ORD1 | `useLinkComponent.test.tsx` provider cases; `Link.test.tsx` provider and `as` cases     | Provider, nested providers, `as` override          | The wrong component, or an outer provider winning, fails.                   | `audit:LinkProvider/behavior`      |
| FR3, ORD2 | `useLinkComponent.test.tsx` `to` suite                                                  | Provider and `as`; href-based and to-based routers | A missing or wrong `to`, or `to` on a native anchor, fails.                 | `audit:LinkProvider/behavior`      |
| FR4       | `useLinkComponent.test.tsx` scheme, structured, and inert suites                        | Rejected `href` or `to`; structured destinations   | A rejected destination that reaches `component`, or a lost identity, fails. | `audit:LinkProvider/behavior`      |
| FR5       | `Link.test.tsx` disabled custom-component case                                          | Disabled Link under a provider                     | A disabled Link rendered through `component` fails.                         | `audit:LinkProvider/behavior`      |
| AR1       | `Link.a11y.chromium.spec.ts` provider-router state                                      | Link under a provider                              | A router link that loses the link role or name fails.                       | `audit:LinkProvider/accessibility` |
| FR1, PR1  | Evidence gap: no test asserts that the provider adds no element or keeps a stable value | —                                                  | —                                                                           | `audit:LinkProvider/behavior`      |

## Decision log

No component-local decision. LinkProvider applies
`family:navigation-destinations`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
