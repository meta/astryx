---
schema_version: 3
template_version: 4
kind: module
id: module:Collapsible/useCollapsible
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/Collapsible/useCollapsible.test.tsx,
    packages/core/src/Collapsible/__tests__/useCollapsible.a11y.test.tsx,
  ]
parent_component: component:Collapsible
references:
  [
    architecture:public-component-api,
    architecture:react-component-runtime,
    spec:AST-055/DEC-4,
  ]
---

# useCollapsible module contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useCollapsible` returns `triggerProps` and `contentProps`, typed on `UseCollapsibleReturn`. Its options and existing returns keep their meaning.                                                                                                              |
| Behavior                | Spreading `triggerProps` on a `<button>` and `contentProps` on an always-rendered content element makes one disclosure. The caller renders the children only while `isOpen`, so closed content mounts nothing.                                                 |
| End-user impact         | A person using a product whose whole list row is the disclosure button gets the same disclosure semantics as Collapsible's trigger, and long lists of closed rows mount no closed content.                                                                     |
| Builder impact          | A builder renders the trigger and the content element and spreads one object onto each. The caller owns the trigger's paint and focus inside content that closes (OQ2). Content motion is a separate import, `module:Collapsible/useCollapsibleContentMotion`. |
| Compatibility/readiness | Additive: no option changes and no existing return changes. Authority: `draft`. jsdom covers the props and presence.                                                                                                                                           |
| Review checks           | Reject a content element that renders only while open, a data attribute that carries the open state, and motion code in this module.                                                                                                                           |
| Governing rules         | `architecture:public-component-api` INV2, INV21, DEC-2; `architecture:react-component-runtime` INV3, INV5; `spec:AST-055/DEC-4` for hook trigger props.                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

A product sometimes needs a disclosure whose trigger is a whole row, such as a
list row whose label, detail, clock, and marker are one button. Collapsible
draws its own trigger and chevron, so it cannot host that row. `useCollapsible`
is the system's headless disclosure: it owns the open state and hands back the
props that wire a caller-rendered trigger to a caller-rendered content element.
A closed content element holds no children, so a list of hundreds of closed
rows mounts no closed subtree.

This record contracts the trigger and content wiring. The open-state modes
(group, controlled, uncontrolled) keep their consumer documentation, and
`component:CollapsibleGroup` owns group coordination.

## Compatibility and migration

- Released default preserved: yes. The new returns are plain values, and the
  hook writes nothing to the DOM. Each call takes one id from React's `useId`,
  so ids generated after a direct call shift by one; Collapsible and Banner
  reuse the hook's id and keep theirs.
- Compatibility class: additive return fields.
- Migration decision: none required.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The trigger props and their disclosure attributes.
- The content props: the id the trigger names and `hidden`.

**Does not own / non-goals**

- The open-state modes and their callbacks, which keep their consumer
  documentation; group coordination — owned by `component:CollapsibleGroup`.
- The rendered Collapsible, its trigger, chevron, and `hasLazyMount` — owned by
  `component:Collapsible`.
- Content motion: presence through the close, motion phases, and the height
  measurement — owned by `module:Collapsible/useCollapsibleContentMotion`.
- The caller's trigger element: its role, name, paint, focus ring, and
  disabled state.

## Public API and concepts

| Concept       | Closed values or states                             | Meaning                                                          | Default | Owner                               | Stability |
| ------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ------- | ----------------------------------- | --------- |
| trigger props | `type`, `aria-expanded`, `aria-controls`, `onClick` | everything a `<button>` needs to be the disclosure trigger       | —       | `module:Collapsible/useCollapsible` | proposed  |
| content props | `id`, `hidden`                                      | everything the always-rendered, unanimated content element needs | —       | `module:Collapsible/useCollapsible` | proposed  |

The open state reaches the caller's styles as `isOpen` and as the
`aria-expanded` and `hidden` attributes. The hook adds no data attribute
(`architecture:public-component-api` DEC-2).

## Behavioral contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                            | Basis                                                           | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| FR1 | `triggerProps` MUST carry `type: 'button'`, `aria-expanded` equal to the open state, `aria-controls` equal to the content element's id, and an `onClick` that toggles through the hook's state owner. Spreading it on a `<button>`, or on a component that renders one, MUST be the whole trigger integration. | proposal; `spec:AST-055/DEC-4`; WAI-ARIA APG disclosure pattern | human decision     |
| FR2 | `contentProps` MUST carry the id the trigger names and `hidden` equal to the closed state. The caller renders the content element in every state, so `aria-controls` always names an element in the document, and renders its children only while `isOpen`.                                                    | proposal; WAI-ARIA APG disclosure pattern                       | human decision     |
| FR3 | The hook MUST read no layout and MUST install no listener, observer, or timer for the trigger or the content element.                                                                                                                                                                                          | proposal                                                        | verify             |

## Accessibility contract

- **AR1 — Disclosure semantics in every state.** The trigger MUST expose its
  expanded state and name the content element in every state, closed and empty
  included (WAI-ARIA APG disclosure pattern).
- **AR2 — Button semantics stay with the caller's element.** The hook adds no
  role or tabindex. Role, accessible name, keyboard activation, focus, and the
  disabled state come from the caller's `<button>`.

## Design relationships

| Anatomy or state | Design requirement           | Representation authority | Module contract |
| ---------------- | ---------------------------- | ------------------------ | --------------- |
| open, closed     | caller's trigger and content | caller-owned paint       | FR1, FR2        |

## Parent and system relationships

- `component:Collapsible` calls this hook for its open state and its content
  id, and renders its own trigger and content; its `hasLazyMount` keeps its own
  closed content unmounted.
- `component:CollapsibleGroup` owns the group mode the hook defers to.
- `module:Collapsible/useCollapsibleContentMotion` takes this hook's result and
  replaces its `contentProps` for animated content. This module imports none
  of it.
- `architecture:public-component-api` INV21: one hook owns headless disclosure
  state and its wiring.

## Verification map

| Contract      | Verification                                                                                                 | Representative states                                              | Mutation or failure expectation                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| FR1, AR1, AR2 | `useCollapsible.test.tsx` trigger and content props suite; `useCollapsible.a11y.test.tsx` disclosure binding | closed, open, closed with content motion; uncontrolled, controlled | A missing or wrong `aria-expanded`, an `aria-controls` that names no element, or a click that does not reach the state owner fails. |
| FR2           | `useCollapsible.test.tsx` trigger and content props suite                                                    | closed and empty; opened; closed again                             | Children mounted while closed, a content element that leaves the document, or a missing `hidden` fails.                             |
| FR3           | `useCollapsible.test.tsx` act-free state reads                                                               | the return value's keys                                            | A motion field or a `ref` in the return fails.                                                                                      |

## Decision log

None.

## Open questions

- **OQ1 — Does headless disclosure extend `useCollapsible`, or is it a
  separate hook?** (`human-api`) Options: extend `useCollapsible`, which keeps
  one hook for disclosure state (`architecture:public-component-api` INV21) and
  adds two returns its existing callers do not use; or a separate
  `useDisclosure` built on `useCollapsible`, which gives two hooks the
  open-state job.
- **OQ2 — Does the hook move focus out of content that closes, as
  `component:Collapsible` AR4 does?** (`human-api`) Options: the hook moves it
  to the trigger, which needs a trigger ref in `triggerProps`; or the caller
  owns it.

## Content boundary

This record does not duplicate consumer signatures/examples, parent aggregate
protocol or ordering, current audit results, implementation steps, or
family/design/system rules. It links to their canonical owners.
