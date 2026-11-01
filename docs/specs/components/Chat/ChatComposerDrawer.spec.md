---
schema_version: 3
template_version: 5
kind: component
id: component:ChatComposerDrawer
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-21
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Chat/ChatComposerDrawer.test.tsx,
    apps/storybook/stories/ChatComposerDrawer.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:knowledge-contracts,
    architecture:public-component-api,
  ]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-002/DEC-1, spec:AST-002/DEC-2]
---

# ChatComposerDrawer component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Add one optional `collapsedSummary?: ReactNode` slot, named from the canonical **Collapsed summary** anatomy part, for caller-composed visual content.                                                                      |
| Behavior                | `count` continues to enable the disclosure. Omitting `collapsedSummary` keeps the neutral Badge count plus resolved label; providing it replaces that complete visual summary without changing collapse behavior or naming. |
| End-user impact         | People retain the established Badge hierarchy by default. Products that need a quieter or differently composed collapsed row may provide one localized visual summary without weakening disclosure semantics.               |
| Builder impact          | Existing callsites do not change. A builder choosing the slot owns its visual content and localization, while `label` continues to identify the controlled content for the component-owned accessible name.                 |
| Compatibility/readiness | Additive and default-preserving. This record is current authority; the slot and its mapped implementation, consumer docs, tests, and rendered evidence have not shipped yet.                                                |
| Review checks           | Reject a plain-text default, a second summary API, custom content that changes naming or collapse state, reachable interactive descendants inside the visual summary, or any regression to the no-slot and no-count paths.  |
| Governing rules         | `component:ChatComposerDrawer/FR1–FR10, AR1–AR4, DEC-1–DEC-2`; `architecture:public-component-api/INV3–INV4, INV9, INV13`; `spec:AST-002/DEC-1, DEC-2`.                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

ChatComposerDrawer composes supplementary content above ChatComposer input. When
`count` is present, builders may let people collapse that content while keeping a
compact summary available.

Two otherwise identical drawers may need different visual hierarchy in the
collapsed state. The product builder knows whether the established count Badge or
a quieter, product-specific summary fits that context, and ChatComposerDrawer
cannot derive that distinction from count, content, layout, locale, or collapse
state. The component therefore exposes one visual composition seam while retaining
its existing default and owning all disclosure behavior.

## Compatibility and migration

- Released default preserved: yes. Omitting `collapsedSummary` keeps the neutral
  count Badge followed by the resolved label.
- Compatibility class: additive optional composition slot with no default change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: none. Existing callsites require no edits.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The drawer surface, optional disclosure state, disclosure association, and
  availability of collapsed descendants.
- Controlled and uncontrolled collapse requests.
- The Badge-preserving default summary and the presentation-only boundary for one
  caller-composed collapsed summary.
- The disclosure's localized accessible name, independently of visual summary
  content.

**Does not own / non-goals**

- The meaning, styling, or localization of caller-provided drawer children or custom
  summary content.
- Interactive behavior inside the custom summary; the summary is visual-only and
  never creates another focus or activation target.
- ChatComposer input, submission, status, and action behavior.
- A presentation enum, Badge toggle, render callback, summary-specific theme target,
  or a second accessible-name prop.

## Public concepts

| Concept           | Closed values or states          | Meaning                                                                                     | Availability by state               | Default                  | Owner                          | Stability           | Invalid-value behavior                                             |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------ | ------------------------------ | ------------------- | ------------------------------------------------------------------ |
| drawer content    | any React node                   | Supplementary content composed above the chat input.                                        | always                              | none                     | `component:ChatComposerDrawer` | stable              | Missing content is rejected by the required type.                  |
| collapse support  | unavailable, expanded, collapsed | Presence of `count`, including zero, enables one disclosure and supplies its summary count. | unavailable when `count` is omitted | unavailable              | `component:ChatComposerDrawer` | stable              | Collapse inputs have no visible effect without `count`.            |
| collapse control  | uncontrolled, controlled         | Internal state or `isCollapsed` determines the current disclosure state.                    | when collapse support is available  | uncontrolled             | `component:ChatComposerDrawer` | stable              | Controlled state wins over the initial default.                    |
| collapsed summary | default, caller-composed         | Visual content shown for the collapsed disclosure.                                          | when collapse support is available  | neutral Badge plus label | caller choice; component seam  | accepted, unshipped | Omission uses the default; without `count`, no summary is exposed. |
| collapse request  | next state                       | Activation asks for the opposite effective collapsed state.                                 | when collapse support is available  | none                     | `component:ChatComposerDrawer` | stable              | No request is emitted without a disclosure.                        |

`collapsedSummary` is the camelCase public API projection of the canonical
**Collapsed summary** anatomy part. It is the complete custom visual summary, not
an addition before or after the default. The component does not parse, clone,
decorate, or supply data to the node. Builders already own the values they pass as
`count` and `label`; when a custom summary forms a sentence or formats a number,
its callsite owns the complete localized message.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                         | Basis                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| FR1  | When `count` is present, including when it is `0`, the component MUST expose one named disclosure control with `aria-expanded` and a resolvable `aria-controls` relationship.                                                                                                                                                     | released API and implementation; WAI-ARIA disclosure semantics                       |
| FR2  | Pointer activation, Enter, and Space MUST request the opposite effective collapsed state exactly once.                                                                                                                                                                                                                            | released implementation and public callback contract                                 |
| FR3  | In controlled mode, `isCollapsed` MUST remain authoritative; in uncontrolled mode, activation MUST update internal state before the next render.                                                                                                                                                                                  | released implementation and consumer docs                                            |
| FR4  | Collapsed drawer content MAY remain mounted for the grid transition, but its descendants MUST be absent from keyboard and assistive-technology navigation.                                                                                                                                                                        | WAI-ARIA disclosure semantics; WCAG 2.4.3 and 2.4.7                                  |
| FR5  | Keyboard focus on the disclosure MUST remain visibly perceivable through the shared focus-indicator mechanism.                                                                                                                                                                                                                    | `architecture:interaction-modality/INV1–INV4`                                        |
| FR6  | Omitting `count` MUST render drawer content directly, MUST NOT create a disclosure control, and MUST NOT expose `collapsedSummary`. Existing collapse inputs continue to have no visible effect in this state.                                                                                                                    | released no-count behavior and compatibility                                         |
| FR7  | The root MUST continue forwarding its ref, BaseProps attributes, and styling seams without moving them to an internal child.                                                                                                                                                                                                      | released public surface and `architecture:public-component-api/INV5–INV6, INV8–INV9` |
| FR8  | `collapsedSummary` MUST remain the camelCase public name of the canonical **Collapsed summary** anatomy part. When omitted, the collapsed disclosure MUST preserve the existing neutral Badge containing `count`, followed by the resolved `label`; when provided, the node MUST replace that complete anatomy part exactly once. | approved anatomy-aligned caller-composition boundary and released default            |
| FR9  | The custom summary MUST affect visual content only. It MUST NOT change whether collapse is available, effective collapse state, toggle activation, callback values, the controlled region, or the component-owned accessible name.                                                                                                | constrained slot contract and `spec:AST-002/DEC-2`                                   |
| FR10 | The summary subtree MUST remain presentation-only: the disclosure is the sole focus and activation target, summary descendants MUST be absent from the tab order and accessibility tree, and custom content MUST NOT add another action.                                                                                          | WAI-ARIA disclosure semantics and component-owned accessibility boundary             |

### Allowed variation

- **AV1 — Drawer child composition.** Builders choose the drawer content and its own
  semantics.
- **AV2 — Custom summary composition.** Builders may compose any visual content that
  fits the presentation-only boundary, including localized text or existing Astryx
  display components.
- **AV3 — Summary lifecycle.** The component may keep the default or custom summary
  mounted while visually expanded to preserve animation. Callers MUST NOT depend on
  mount or unmount timing.
- **AV4 — Custom summary styling.** Caller-composed content retains the styling and
  theme seams of the components it uses. ChatComposerDrawer adds no summary-specific
  target.

### Representative states

| State                            | Required invariant                                                                                                      | Allowed variation                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `count` omitted                  | Content is visible; no disclosure or summary is exposed.                                                                | Child content and root styling.                   |
| default summary, collapsed       | One disclosure shows the neutral count Badge plus resolved label.                                                       | Count value and localized label.                  |
| custom summary, collapsed        | One disclosure shows the caller node instead of both default summary parts.                                             | Presentation-only custom content and styling.     |
| custom summary, expanded         | The disclosure retains its state and name; the custom summary may stay mounted but is visually and semantically hidden. | Internal crossfade and mount timing.              |
| controlled expanded or collapsed | Rendered state follows `isCollapsed`; activation reports the requested next state.                                      | Parent timing and whether it accepts the request. |

### Transformation and precedence order

- **ORD1 — Collapse availability.** `count` present → disclosure enabled; `count`
  omitted → no disclosure or collapsed summary.
- **ORD2 — Effective state.** `isCollapsed` when defined → otherwise internal state
  initialized from `defaultIsCollapsed`.
- **ORD3 — Visual summary.** Caller-provided `collapsedSummary` → otherwise the
  neutral Badge for `count` followed by the resolved `label`.
- **ORD4 — Accessible name.** Resolve `label` from the prop or locale catalog → use
  the catalog's expand or collapse action message for the effective state. Visual
  summary content never enters or overrides this pipeline.

### Performance and resources

- **PR1 — Local state only.** The summary seam MUST NOT require an Effect, observer,
  listener, timer, or external resource.

## Accessibility contract

- **AR1 — Disclosure relationship.** The toggle exposes one localized name, expanded
  state, and a resolvable controlled-content ID.
- **AR2 — Naming stays component-owned.** `label` identifies the controlled drawer
  content in the expand/collapse catalog message. Default or custom visual summary
  text MUST NOT replace, duplicate, or concatenate into that accessible name.
- **AR3 — Hidden content is unavailable.** Visually collapsed drawer descendants are
  unavailable until expansion.
- **AR4 — Custom summary remains presentation-only.** Custom content cannot add a
  second focus stop, activation target, role, or announcement inside the disclosure.

## Design relationships

No current design specification governs this component-local representation.

| Anatomy or state  | Design requirement                                                                   | Representation authority                         | Hierarchy role | Component contract |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------- | ------------------ |
| root surface      | Existing released surface remains unchanged by this decision.                        | released behavior                                | supporting     | FR7                |
| disclosure toggle | One operable, named control owns collapse interaction.                               | component-owned                                  | supporting     | FR1–FR5, AR1       |
| collapsed summary | Badge hierarchy remains the default; callers may choose one visual composition slot. | component default or caller-selected composition | supporting     | FR8–FR10, AR2–AR4  |
| content area      | Collapsed descendants remain unavailable to keyboard and assistive technology.       | component-owned                                  | supporting     | FR4, FR6, AR3      |

The existing `chat-composer-drawer` target remains on the painted root. The
Badge-preserving default delegates count paint to Badge. Caller-composed summary
content retains the theme ownership of the components it supplies. This decision
adds no ChatComposerDrawer summary target and does not make arbitrary slot internals
part of ChatComposerDrawer's theming API.

## Family and system relationships

- `architecture:public-component-api` owns reachability, naming grammar, and
  compatibility of the additive slot; this component owns its local meaning and
  default.
- `architecture:interaction-modality` owns shared focus-visibility mechanics; this
  component owns the disclosure as its semantic focus owner.
- `architecture:component-theming-surface` owns target and anatomy mapping rules; the
  custom summary does not create a new target or transfer ownership of caller
  content.
- `architecture:knowledge-contracts` limits this current authority to the explicit
  claims in this record.
- `spec:AST-002/DEC-1` admits the slot because otherwise-identical drawers may need
  a caller-owned visual hierarchy the component cannot derive. `DEC-2` requires the
  seam to preserve a dependable, accessibility-safe outcome.

## Verification map

| Contract                 | Verification                                                            | Representative states                                                      | Mutation or failure expectation                                                                                                    | Audit section                            |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR1–FR3, FR6, ORD1–2     | focused ChatComposerDrawer state and keyboard tests                     | no count; zero count; controlled; uncontrolled; pointer; Enter; Space      | Presence/truthiness changes collapse availability, state authority changes, or callback reports the wrong next state.              | `audit:ChatComposerDrawer/behavior`      |
| FR8–FR9, ORD3            | focused default/custom summary tests and consumer-doc projection checks | default; custom node; expanded; collapsed; no count                        | The default Badge disappears, default and custom content render together, custom content changes behavior, or no-count exposes it. | `audit:ChatComposerDrawer/api`           |
| FR4, FR10, AR2–AR4       | focused inert-state and custom-descendant tests plus exact-head a11y CI | default text; custom text; custom focusable descendant; collapsed/expanded | Hidden drawer content or custom summary becomes focusable, announced, or a second action; visual text replaces the catalog name.   | `audit:ChatComposerDrawer/accessibility` |
| FR5, AR1                 | `KeyboardFocus` Storybook play and exact-head visual/a11y gates         | keyboard focus in representative light and dark themes                     | Focus has no shared visible indicator or the disclosure relationship/name breaks.                                                  | `audit:ChatComposerDrawer/accessibility` |
| FR7                      | focused DOM/type tests and package checks                               | ref, BaseProps, xstyle, className, style                                   | Root ownership or a styling seam moves or disappears.                                                                              | `audit:ChatComposerDrawer/api`           |
| AV4 and theming boundary | source/runtime theme inspection of default and custom summaries         | default Badge; caller-composed Astryx content                              | A new summary target appears, Badge loses its target, or caller-owned content is retargeted as ChatComposerDrawer anatomy.         | `audit:ChatComposerDrawer/theming`       |

## Decision log

### DEC-1 — One visual slot preserves the Badge default

**Reference:** `component:ChatComposerDrawer/DEC-1`
**Decider:** `cixzhang`, `2026-09-21`

ChatComposerDrawer admits one optional `collapsedSummary` node for the complete
visual summary. Product builders own whether a particular collapsed row needs the
established Badge hierarchy or a quieter localized composition, and the component
cannot derive that visual hierarchy. Omitting the slot preserves the existing
neutral Badge plus label, so no current builder receives a new choice or migration.

Rejected: replacing the default with a `{count} {label}` sentence, adding a Badge
boolean or finite presentation enum, adding a render callback for values already
owned by the caller, or exposing parallel summary seams. Those shapes either break
the released default, encode presentation machinery, invite locale-unsafe string
concatenation, or add more API than the caller-owned distinction requires.

### DEC-2 — Visual composition does not own disclosure semantics

**Reference:** `component:ChatComposerDrawer/DEC-2`
**Decider:** `cixzhang`, `2026-09-21`

The custom summary is presentation-only. The existing `label` and locale catalog
continue to name the expand/collapse action; `count` continues to enable the
disclosure; and the component keeps summary descendants out of focus, activation,
and assistive-technology navigation. The seam cannot replace these obligations.

Rejected: deriving the accessible name from arbitrary summary content or letting a
custom summary introduce another action inside the disclosure. Both make correct
semantics depend on caller markup the component cannot verify.

## Open questions

None for this contract slice.

## Content boundary

This file owns ChatComposerDrawer's collapsed-summary composition boundary,
Badge-preserving default, collapse gating and state behavior, accessible naming,
compatibility, and required evidence. It does not duplicate the complete consumer
prop reference, implementation steps, current audit score, or unrelated component
gaps. Current authority is claim-scoped to the explicit requirements above and does
not certify every ChatComposerDrawer behavior.
