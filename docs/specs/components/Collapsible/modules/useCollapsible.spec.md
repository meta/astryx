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
review_triggers: [public-api, behavior, accessibility, motion]
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
    design:reduced-motion,
    spec:AST-055/DEC-4,
    spec:AST-105,
  ]
---

# useCollapsible module contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `useCollapsible` returns `triggerProps`, `contentProps`, `isPresent`, `isEntering`, and `isExiting`, typed on `UseCollapsibleReturn`, and takes two optional options, `hasContentAnimation` and `contentHeightProperty`. Its existing options and returns keep their meaning.                                                                                            |
| Behavior                | Spreading `triggerProps` on a `<button>` and `contentProps` on an always-rendered content element makes one disclosure. Children render only while `isPresent`, so closed content mounts nothing. With `hasContentAnimation`, a close keeps the children, inert, until the content's own CSS animation ends; Reduce Motion and a close with no animation end it at once. |
| End-user impact         | A person using a product whose whole list row is the disclosure button gets the same disclosure semantics as Collapsible's trigger, and long lists of closed rows mount no closed content.                                                                                                                                                                               |
| Builder impact          | A builder renders the trigger and the content element and spreads one object onto each. New caller choices: whether the content animates, and which custom property receives the measured height. The caller owns the trigger's paint, its keyframes, and focus inside content that closes (OQ2).                                                                        |
| Compatibility/readiness | Additive: every new option is off by default, and no existing return changes. Authority: `draft`. jsdom covers the props, presence, phases, and measurement; real-browser evidence of the measured grow and fade is pending.                                                                                                                                             |
| Review checks           | Reject a content element that renders only while open, a data attribute that carries the open or motion state, a phase that a mount starts, a close that keeps children with no running animation or under Reduce Motion, and a measurement on mount or with the keyframes applied.                                                                                      |
| Governing rules         | `architecture:public-component-api` INV2, INV21, DEC-2; `architecture:react-component-runtime` INV3, INV5, INV6; `design:reduced-motion` DR1, DR2a, DR3; `spec:AST-055/DEC-4` for hook trigger props.                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

A product sometimes needs a disclosure whose trigger is a whole row, such as a
list row whose label, detail, clock, and marker are one button. Collapsible
draws its own trigger and chevron, so it cannot host that row. `useCollapsible`
is the system's headless disclosure: it owns the open state and hands back the
props that wire a caller-rendered trigger to a caller-rendered content element.

The hook also owns content presence. A closed content element holds no
children, so a list of hundreds of closed rows mounts no closed subtree. When
the caller animates the content, the hook keeps the children through the close
animation and measures the content's natural height for the keyframes.

This record contracts the trigger and content wiring, presence, motion phases,
and the height measurement. The open-state modes (group, controlled,
uncontrolled) keep their consumer documentation, and
`component:CollapsibleGroup` owns group coordination.

## Compatibility and migration

- Released default preserved: yes. Without the new options, `isPresent`
  equals `isOpen`, `isEntering` and `isExiting` stay `false`, and the hook
  writes nothing to the DOM.
- Compatibility class: additive optional options and return fields.
- Migration decision: none required.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The trigger props and their disclosure attributes.
- The content props: the id the trigger names, `hidden`, `inert`, and the
  element ref.
- Content presence: when the caller's content children render.
- Motion phases: when a phase starts, what holds it, and what ends it.
- The natural-height measurement and the custom property it writes.

**Does not own / non-goals**

- The open-state modes and their callbacks, which keep their consumer
  documentation; group coordination — owned by `component:CollapsibleGroup`.
- The rendered Collapsible, its trigger, chevron, and `hasLazyMount` — owned by
  `component:Collapsible`.
- The caller's trigger element: its role, name, paint, focus ring, and
  disabled state.
- The caller's keyframes, durations, and curves.
- Core's own disclosure motion, the `animatedLayout` glide — owned by
  `spec:AST-105`.

## Public API and concepts

| Concept           | Closed values or states                                  | Meaning                                                                                      | Default               | Owner                               | Stability |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------- | --------- |
| trigger props     | `type`, `aria-expanded`, `aria-controls`, `onClick`      | everything a `<button>` needs to be the disclosure trigger                                   | —                     | `module:Collapsible/useCollapsible` | proposed  |
| content props     | `id`, `hidden`, `inert`, `ref`                           | everything the always-rendered content element needs                                         | —                     | `module:Collapsible/useCollapsible` | proposed  |
| presence          | present, absent                                          | whether the content's children render                                                        | equals the open state | `module:Collapsible/useCollapsible` | proposed  |
| motion phase      | none, entering, exiting                                  | whether the content's own open or close animation is playing                                 | none                  | `module:Collapsible/useCollapsible` | proposed  |
| content animation | off, on (`hasContentAnimation`)                          | whether the caller's content element plays a CSS animation that phases and presence wait for | off                   | `module:Collapsible/useCollapsible` | proposed  |
| height property   | absent, a custom property name (`contentHeightProperty`) | where the hook writes the content's natural height at each open and animated close           | absent                | `module:Collapsible/useCollapsible` | proposed  |

The open and motion states reach the caller's styles as returned values and
as the `aria-expanded` and `hidden` attributes. The hook adds no data
attribute (`architecture:public-component-api` DEC-2).

## Behavioral contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                           | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| FR1 | `triggerProps` MUST carry `type: 'button'`, `aria-expanded` equal to the open state, `aria-controls` equal to the content element's id, and an `onClick` that toggles through the hook's state owner. Spreading it on a `<button>`, or on a component that renders one, MUST be the whole trigger integration.                                                                                                                           | proposal; `spec:AST-055/DEC-4`; WAI-ARIA APG disclosure pattern | human decision     |
| FR2 | `contentProps` MUST carry the id the trigger names, `hidden` while the content is closed and no close animation plays, `inert` while a close animation plays, and a ref. The caller renders the content element in every state, so `aria-controls` always names an element in the document.                                                                                                                                              | proposal; WAI-ARIA APG disclosure pattern                       | human decision     |
| FR3 | `isPresent` MUST be true while the content is open and while its close animation plays (FR5), and false otherwise. Without `hasContentAnimation`, it MUST equal the open state.                                                                                                                                                                                                                                                          | proposal                                                        | human decision     |
| FR4 | With `hasContentAnimation`, each open-state change while the hook is mounted MUST start a phase: `isEntering` after an open, `isExiting` after a close. A mount MUST start none, so content that mounts open does not replay its open animation. Without the option, both MUST stay false.                                                                                                                                               | proposal                                                        | human decision     |
| FR5 | A phase MUST end before the frame paints when no finite CSS animation runs on the content element itself after the change commits. Otherwise it MUST end at that element's own `animationend` or `animationcancel` once none of its own finite CSS animations still runs. CSS transitions, endless animations, and descendants' animations MUST NOT start or hold a phase.                                                               | proposal                                                        | human decision     |
| FR6 | When an exiting phase ends, the children MUST leave and `hidden` MUST apply in the same task as the ending event, so no frame paints the children after their close animation.                                                                                                                                                                                                                                                           | proposal                                                        | verify             |
| FR7 | An open during an exiting phase MUST keep the children mounted and start an entering phase. The content MUST NOT hide between the two.                                                                                                                                                                                                                                                                                                   | proposal                                                        | verify             |
| FR8 | Under `prefers-reduced-motion: reduce`, or inside a theme that reduces motion for everyone, a phase MUST end in the commit that starts it, before the frame paints.                                                                                                                                                                                                                                                                      | `design:reduced-motion` DR1, DR2a, DR3                          | settled            |
| FR9 | With `contentHeightProperty`, at each open, and at each close that keeps the children (FR5), the hook MUST measure the content element's natural height once, before the frame paints, with the element's CSS animations suppressed for the read. It MUST write the height to that property on the element as a `px` length that `height` takes, and MUST restore the element's own inline `animation-name`. A mount MUST write nothing. | proposal                                                        | human decision     |

### Transformation and precedence order

- **ORD1 — After an open-state change commits.** Measure the height (FR9) →
  end the phase under Reduce Motion (FR8) → end the phase when no animation of
  the content runs (FR5) → otherwise wait for the content's own animation
  events.
- **ORD2 — Height value.** The rendered height, unless a transformed ancestor
  makes it differ from the layout height by a pixel or more, then the layout
  height → minus block padding and borders for `content-box` sizing.

### Performance and resources

- **PR1 — Closed content costs nothing.** A closed content element holds no
  children. The hook reads no layout and installs no observer or timer for a
  content element. Without `hasContentAnimation` it installs no listener; with
  it, the content element carries one `animationend` and one `animationcancel`
  listener while it is attached, and a replaced element moves them to the new
  element.
- **PR2 — One read per change.** An open-state change makes at most one forced
  layout for the measurement and one animation read for the phase.

## Accessibility contract

- **AR1 — Disclosure semantics in every state.** The trigger MUST expose its
  expanded state and name the content element in every state, closed and empty
  included (WAI-ARIA APG disclosure pattern).
- **AR2 — Leaving content takes no input.** While an exiting phase plays, the
  content MUST be inert, so no pointer or key reaches its children and
  assistive technology does not read them.
- **AR3 — Button semantics stay with the caller's element.** The hook adds no
  role or tabindex. Role, accessible name, keyboard activation, focus, and the
  disabled state come from the caller's `<button>`.

## Design relationships

| Anatomy or state  | Design requirement           | Representation authority                            | Module contract |
| ----------------- | ---------------------------- | --------------------------------------------------- | --------------- |
| entering, exiting | `design:reduced-motion/DR1`  | prescribed: no travel or resize under Reduce Motion | FR8             |
| open, closed      | caller's trigger and content | caller-owned paint and keyframes                    | FR1, FR2        |

## Parent and system relationships

- `component:Collapsible` calls this hook for its open state and renders its
  own trigger and content; its `hasLazyMount` keeps its own closed content
  unmounted.
- `component:CollapsibleGroup` owns the group mode the hook defers to.
- `spec:AST-105` owns Core's own disclosure motion. The phases and the height
  measurement here serve CSS animations the caller owns.
- `architecture:public-component-api` INV21: one hook owns headless disclosure
  state and its wiring.

## Verification map

| Contract     | Verification                                                                                                         | Representative states                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, AR1     | `useCollapsible.test.tsx` trigger and content props suite; `useCollapsible.a11y.test.tsx` disclosure binding         | closed, open, closed with content animation; uncontrolled and controlled                                                                                                             | A missing or wrong `aria-expanded`, an `aria-controls` that names no element, or a click that does not reach the state owner fails.                                                |
| FR2, FR3     | `useCollapsible.test.tsx` trigger and content props suite                                                            | closed and empty; opened; closed again                                                                                                                                               | Children mounted while closed, a content element that leaves the document, or a missing `hidden` fails.                                                                            |
| FR4–FR7, AR2 | `useCollapsible.test.tsx` content animation suite, with a stubbed running animation                                  | mount; open and close with a running animation; end and cancel; a descendant's end; reopen during the close; a replaced content element; no animation; endless animation; transition | A phase on mount, children dropped while the content animation runs, children kept with none running, a content that is not inert during the close, or an unmount on reopen fails. |
| FR8          | `useCollapsible.test.tsx` Reduce Motion and theme-mark cases                                                         | the media query; a theme that reduces motion for everyone                                                                                                                            | Children kept, or a phase left, after the commit fails.                                                                                                                            |
| FR9          | `useCollapsible.test.tsx` content height suite, with a natural height visible only while the animation is suppressed | open; animated close; close without the hold; mount; own inline animation name; `content-box`; scaled ancestor                                                                       | A value of `0px`, a value written on mount, a lost inline animation name, or a border-box value for `content-box` fails.                                                           |
| FR6          | Real-browser frame capture of the `Core/Collapsible` headless rows story                                             | close with and without `animation-fill-mode: forwards`                                                                                                                               | Evidence gap: no real-browser test shows that no frame paints the children after their close animation.                                                                            |

## Decision log

None.

## Open questions

- **OQ1 — Does headless disclosure extend `useCollapsible`, or is it a
  separate hook?** (`human-api`) Options: extend `useCollapsible`, which keeps
  one hook for disclosure state (`architecture:public-component-api` INV21) and
  adds unused returns for its existing callers; or a separate `useDisclosure`
  built on `useCollapsible`, which keeps each return small but gives two hooks
  the open-state job.
- **OQ2 — Does the hook move focus out of content that closes, as
  `component:Collapsible` AR4 does?** (`human-api`) Options: the hook moves it
  to the trigger, which needs a trigger ref in `triggerProps`; or the caller
  owns it.
- **OQ3 — Which motion API serves a caller-rendered disclosure?**
  (`human-design`) Options: caller-owned CSS animations keyed on the phases,
  with a measured height property; an `animatedLayout` option that reports the
  change to the shared glide (`spec:AST-105` FR1), which keeps one disclosure
  motion in Core but needs a container handle and plays no grow and fade; or
  both.
- **OQ4 — Are the names final?** (`human-api`) Candidates beside the current
  ones: `animatesContent` or `hasExitAnimation` for `hasContentAnimation`;
  `heightProperty` for `contentHeightProperty`; `isMounted` for `isPresent`;
  one `contentMotion: 'entering' | 'exiting' | null` for `isEntering` and
  `isExiting`.

## Content boundary

This record does not duplicate consumer signatures/examples, parent aggregate
protocol or ordering, current audit results, implementation steps, or
family/design/system rules. It links to their canonical owners.
