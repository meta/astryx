---
schema_version: 3
template_version: 4
kind: module
id: module:Collapsible/useCollapsibleContentMotion
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, accessibility, motion]
verified_by:
  [
    packages/core/src/Collapsible/useCollapsibleContentMotion.test.tsx,
    packages/core/src/Collapsible/__tests__/useCollapsible.a11y.test.tsx,
  ]
parent_component: component:Collapsible
references:
  [
    architecture:component-import-boundaries,
    architecture:public-component-api,
    architecture:react-component-runtime,
    design:reduced-motion,
    spec:AST-105,
  ]
---

# useCollapsibleContentMotion module contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useCollapsibleContentMotion(collapsible, {heightProperty})` takes a `useCollapsible` result and returns `isPresent`, `isEntering`, `isExiting`, and `contentProps`. It is exported from `@astryxdesign/core/Collapsible`.                                                                                                  |
| Behavior                | A close keeps the children, inert, until the content's own CSS animation ends; a close with no animation ends at once. Under Reduce Motion the shared policy decides: it ends at once with a fine pointer and waits for the cross-fade with a coarse one. The hook measures the content's natural height into the property. |
| End-user impact         | A person sees a row's details grow and fade in, and shrink and fade out before they leave. Under Reduce Motion nothing travels or resizes.                                                                                                                                                                                  |
| Builder impact          | A builder adds one hook call, spreads its `contentProps` in place of the `useCollapsible` ones, and keys their own keyframes on the phases. The caller owns the keyframes, durations, and curves.                                                                                                                           |
| Compatibility/readiness | Additive: a new hook in its own module. A page that does not import it carries none of its code. Authority: `draft`. jsdom covers the presence, phases, Reduce Motion policy, and measurement.                                                                                                                              |
| Review checks           | Reject an import of this module from `useCollapsible`, Collapsible, or Banner; a phase that a mount starts; a close that keeps children with no running animation or when the policy completes it at once; and a measurement on mount, with the keyframes applied, or interleaved with another row's write.                 |
| Governing rules         | `architecture:component-import-boundaries` INV7, INV10; `architecture:public-component-api` INV2, DEC-2; `architecture:react-component-runtime` INV3, INV5, INV6, INV18; `design:reduced-motion` DR1, DR2, DR3.                                                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

A caller-rendered disclosure sometimes animates its content: the panel grows
and fades in to its natural height, and shrinks and fades out before its
children leave. `useCollapsible` mounts the children only while open, so a
close removes them before any close animation can play. This module keeps the
children through the close, reports the phases that the caller's keyframes key
on, and measures the content's natural height for those keyframes.

The motion is opt-in and lives in its own module. A product that renders
Collapsible, Banner, or an unanimated `useCollapsible` disclosure loads none of
it (`architecture:component-import-boundaries` INV7, INV10).

## Compatibility and migration

- Released default preserved: yes. The module is new, and no existing module
  imports it.
- Compatibility class: additive export.
- Migration decision: none required.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Content presence through the close: when the content's children render.
- Motion phases: when a phase starts, what holds it, and what ends it.
- The content props of animated content: the id, `hidden`, `inert`, and the
  element ref.
- The natural-height measurement and the custom property it writes.

**Does not own / non-goals**

- The open state, the trigger props, and the unanimated content props — owned
  by `module:Collapsible/useCollapsible`.
- The Reduce Motion policy: when a change completes at once and when it
  cross-fades — owned by `design:reduced-motion` and its shared runtime.
- The caller's keyframes, durations, and curves.
- Core's own disclosure motion, the `animatedLayout` glide — owned by
  `spec:AST-105`.

## Public API and concepts

| Concept         | Closed values or states                           | Meaning                                                        | Default               | Owner                                            | Stability |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------- | --------------------- | ------------------------------------------------ | --------- |
| presence        | present, absent                                   | whether the content's children render                          | equals the open state | `module:Collapsible/useCollapsibleContentMotion` | proposed  |
| motion phase    | none, entering, exiting                           | whether the content's own open or close animation is playing   | none                  | `module:Collapsible/useCollapsibleContentMotion` | proposed  |
| content props   | `id`, `hidden`, `inert`, `ref`                    | everything the always-rendered, animated content element needs | —                     | `module:Collapsible/useCollapsibleContentMotion` | proposed  |
| height property | absent, a custom property name (`heightProperty`) | where the hook writes the content's natural height             | absent                | `module:Collapsible/useCollapsibleContentMotion` | proposed  |

The phases reach the caller's styles as returned values and as the `hidden`
and `inert` attributes. The hook adds no data attribute
(`architecture:public-component-api` DEC-2).

## Behavioral contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                     | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------ |
| FR1 | `contentProps` MUST carry the id of the `useCollapsible` result, `hidden` while the content is closed and no close animation plays, `inert` while a close animation plays, and a ref. The caller spreads it in place of the `useCollapsible` content props.                                                                                                                                                                       | proposal; WAI-ARIA APG disclosure pattern | human decision     |
| FR2 | `isPresent` MUST be true while the content is open and while its close animation plays (FR4), and false otherwise.                                                                                                                                                                                                                                                                                                                | proposal                                  | human decision     |
| FR3 | Each open-state change while the hook is mounted MUST start a phase: `isEntering` after an open, `isExiting` after a close. A mount MUST start none, so content that mounts open does not replay its open animation.                                                                                                                                                                                                              | proposal                                  | human decision     |
| FR4 | A phase MUST end before the frame paints when no finite CSS animation runs on the content element itself after the change commits. Otherwise it MUST end at that element's own `animationend` or `animationcancel` once none of its own finite CSS animations still runs. CSS transitions, endless animations, and descendants' animations MUST NOT start or hold a phase.                                                        | proposal                                  | human decision     |
| FR5 | When an exiting phase ends, the children MUST leave and `hidden` MUST apply in the same task as the ending event, so no frame paints the children after their close animation.                                                                                                                                                                                                                                                    | proposal                                  | verify             |
| FR6 | An open during an exiting phase MUST keep the children mounted and start an entering phase. The content MUST NOT hide between the two.                                                                                                                                                                                                                                                                                            | proposal                                  | verify             |
| FR7 | The shared Reduce Motion policy decides each phase under Reduce Motion, from the media query or a theme that reduces motion for everyone. A change it completes at once MUST end its phase in the commit that starts it, before the frame paints. A change it cross-fades (a coarse pointer) MUST hold its phase by FR4, and the caller's animation is then an opacity-only fade of 200 ms or less.                               | `design:reduced-motion` DR1, DR2, DR3     | human decision     |
| FR8 | With `heightProperty`, at each open, and at each close that keeps the children (FR4), the hook MUST measure the content element's natural height once, before the frame paints, with the element's CSS animations suppressed for the read. It MUST write the height to that property on the element as a `px` length that `height` takes, and MUST restore the element's own inline `animation-name`. A mount MUST write nothing. | proposal                                  | human decision     |

### Transformation and precedence order

- **ORD1 — After an open-state change commits.** Decide whether the
  content's own animation holds the phase (FR4, FR7) → queue the height of an
  open, or of a close that the animation holds (FR8) → end a phase that
  nothing holds, before the frame paints → measure every queued element in
  one pass (PR3) → wait for the content's own animation events.
- **ORD2 — Height value.** The rendered height, unless a transformed ancestor
  makes it differ from the layout height by a pixel or more, then the layout
  height → minus block padding and borders for `content-box` sizing.

### Performance and resources

- **PR1 — Its own import.** `useCollapsible`, Collapsible, and Banner import
  none of this module, so a page that renders them without it carries none of
  its code (`architecture:component-import-boundaries` INV7, INV10).
- **PR2 — Closed content costs nothing.** A closed content element holds no
  children. The content element carries one `animationend` and one
  `animationcancel` listener while it is attached, and a replaced element moves
  them to the new element. The hook installs no observer or timer.
- **PR3 — One measurement pass per commit.** Every content element whose
  height a commit queues is measured in one pass after the commit and before
  the frame paints: the hook suppresses every element's animation, then reads
  every height, then writes every value. Rows of an accordion that open and
  close together force one layout, not one each
  (`architecture:react-component-runtime` INV18). Every copy of Core on a page
  shares the pass.

## Accessibility contract

- **AR1 — Leaving content takes no input.** While an exiting phase plays, the
  content MUST be inert, so no pointer or key reaches its children and
  assistive technology does not read them.
- **AR2 — The disclosure stays intact.** The content element keeps the id the
  trigger names in every phase (`module:Collapsible/useCollapsible` AR1).

## Design relationships

| Anatomy or state  | Design requirement          | Representation authority                                              | Module contract |
| ----------------- | --------------------------- | --------------------------------------------------------------------- | --------------- |
| entering, exiting | `design:reduced-motion/DR1` | prescribed: no travel or resize under Reduce Motion                   | FR7             |
| entering, exiting | `design:reduced-motion/DR2` | prescribed: a coarse pointer cross-fades; the caller's keyframes fade | FR7             |
| entering, exiting | caller's keyframes          | caller-owned grow, fade, durations, and curves                        | FR3, FR8        |

## Parent and system relationships

- `module:Collapsible/useCollapsible` supplies the open state and the content
  id this hook takes.
- `component:Collapsible` does not use this hook; its own content motion is
  the `animatedLayout` glide (`spec:AST-105`).
- The shared Reduce Motion policy in Core's motion runtime answers FR7, as it
  does for Core's own motion.

## Verification map

| Contract               | Verification                                                                                                                                      | Representative states                                                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR4, FR6, AR1, AR2 | `useCollapsibleContentMotion.test.tsx` presence and phases suite, with a stubbed running animation; `useCollapsible.a11y.test.tsx` animated state | mount; open and close with a running animation; end and cancel; a descendant's end; reopen during the close; a replaced content element; no animation; endless animation; transition       | A phase on mount, children dropped while the content animation runs, children kept with none running, content that is not inert during the close, or an unmount on reopen fails.                |
| FR7                    | `useCollapsibleContentMotion.test.tsx` Reduce Motion suite                                                                                        | the media query with a fine and a coarse pointer; a theme that reduces motion for everyone, with a fine and a coarse pointer                                                               | Children kept after the commit with a fine pointer, or dropped during the cross-fade with a coarse pointer, fails.                                                                              |
| FR8, PR3               | `useCollapsibleContentMotion.test.tsx` content height suite, with a natural height visible only while the animation is suppressed                 | open; animated close; a close nothing holds; a close Reduce Motion completes at once; two rows that change in one commit; mount; own inline animation name; `content-box`; scaled ancestor | A value of `0px`, a value written on mount, a lost inline animation name, a border-box value for `content-box`, a measured close that nothing holds, or a read after another row's write fails. |
| PR1                    | `pnpm size:pages` against the merge base for pages that render Collapsible and Banner                                                             | Collapsible page; Banner page; the reference pages                                                                                                                                         | A page that grows by more than 0.3 KB gzip without the hook fails.                                                                                                                              |
| FR5                    | Real-browser frame capture of the `Core/Collapsible` headless rows story                                                                          | close with and without `animation-fill-mode: forwards`                                                                                                                                     | Evidence gap: no real-browser test shows that no frame paints the children after their close animation.                                                                                         |

## Decision log

None.

## Open questions

- **OQ1 — Which shape serves opt-in content motion?** (`human-api`) Options:
  this companion hook, which takes the `useCollapsible` result; a plugin value
  passed to `useCollapsible`, such as `contentMotion:
createCollapsibleContentMotion({heightProperty})`, which keeps one call; or an
  `animatedLayout` option that reports the change to the shared glide
  (`spec:AST-105` FR1), which keeps one disclosure motion in Core but plays no
  grow and fade.
- **OQ2 — Are the names final?** (`human-api`) Candidates beside the current
  ones: `useDisclosureMotion` for the hook; `contentHeightProperty` for
  `heightProperty`; `isMounted` for `isPresent`; one
  `contentMotion: 'entering' | 'exiting' | null` for `isEntering` and
  `isExiting`.

## Content boundary

This record does not duplicate consumer signatures/examples, parent aggregate
protocol or ordering, current audit results, implementation steps, or
family/design/system rules. It links to their canonical owners.
