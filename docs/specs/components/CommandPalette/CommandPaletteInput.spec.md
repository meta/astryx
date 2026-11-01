---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-14
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteInput.test.tsx,
    apps/storybook/stories/CommandPaletteInput.stories.tsx,
    apps/storybook/rtl-audit/targets.json,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-020, spec:AST-056]
---

# CommandPaletteInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | A query field with context-backed search state, optional trailing content, and a split wrapper/field attribute boundary.                                                                                           |
| Behavior                | Standalone use without popup attributes is a searchbox; caller popup attributes or CommandPalette context supply combobox state and relationships.                                                                 |
| End-user impact         | Screen-reader users receive role and popup state that match whether a controlled result popup exists.                                                                                                              |
| Builder impact          | Context-owned popup semantics cannot be replaced through native passthrough props; standalone caller-owned popup semantics remain supported.                                                                       |
| Compatibility/readiness | A `[fix]` restores no-popup semantics while preserving released caller-owned popup associations, and names the field "Search commands" by default instead of its placeholder; primary callback naming remains OQ1. |
| Review checks           | Reject unassociated standalone combobox state, clobberable owned popup semantics, empty trailing chrome, or changed input ref routing.                                                                             |
| Governing rules         | `architecture:public-component-api/INV2,INV5`; `spec:AST-017/FR1,FR3,FR5,FR53`; `spec:AST-020/FR1,FR2`; `spec:AST-056/AR2`; WCAG 2.2 4.1.2.                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteInput presents the text query for a command palette. It can bind
to CommandPalette search and navigation context or act as an independent search
field when no result-popup context is present.

## Compatibility and migration

- Released default preserved: `no` for no-popup standalone semantic output and
  for the default accessible name; caller-owned popup associations and all other
  CommandPalette output remain equivalent
- Compatibility class: contract restoration under `spec:AST-017/FR1,FR3,FR5` for
  standalone semantics, since no-popup standalone use has no released popup
  association to preserve; accessibility behavior fix under `spec:AST-017/FR53`
  for the default name
- Controlled/uncontrolled behavior: unchanged
- Migration decision: `role="combobox"` keeps the earlier standalone semantics,
  and `label` or `aria-label` keeps a specific name; the primary callback naming
  question remains OQ1

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The arrangement inside Input: Search glyph, native Query field, Loading spinner
  placement, and Trailing content.
- The query field's role and popup state when CommandPalette context is present.
- Context fallback for the search value, value updates, and keyboard navigation.

**Does not own / non-goals**

- The result popup, option collection, selection, or search orchestration — owned
  by `component:CommandPalette` and its list/item parts.
- Spinner and search-glyph rendering — delegated to Spinner and Icon.
- Caller-provided trailing content behavior — owned by the product callsite.

## Public concepts

| Concept          | Closed values or states                                                              | Meaning                                          | Availability by variant/orientation/state | Default              | Owner                           | Stability | Invalid-value behavior                                       |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------- | -------------------- | ------------------------------- | --------- | ------------------------------------------------------------ |
| Query binding    | explicit; CommandPalette context; native                                             | Source and destination of query text changes.    | All uses                                  | context, then native | `component:CommandPaletteInput` | Released  | Missing handlers leave native state                          |
| Popup semantics  | standalone searchbox; standalone caller-owned popup; contextual CommandPalette popup | Whether the query field controls a result popup. | Context-dependent                         | standalone searchbox | `component:CommandPaletteInput` | Stable    | Standalone overrides persist; CommandPalette context wins    |
| Trailing content | busy indicator; `endContent`; both; absent                                           | Supporting status or caller content after query. | All uses                                  | absent               | `component:CommandPaletteInput` | Released  | Boolean, empty-string, null, and undefined values are absent |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                            | Basis                                                              | Draft review state                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| FR1 | Explicit `value` and `onValueChange` take precedence; otherwise CommandPalette context supplies search state; native uncontrolled state remains when neither exists.                                                                                           | Released source, docs, and tests                                   | Verified current behavior                                  |
| FR2 | Consumer `onKeyDown` runs before contextual navigation; preventing the event, or an active IME composition, prevents contextual delegation.                                                                                                                    | Released source and tests                                          | Verified current behavior                                  |
| FR3 | `ref` and native passthrough attributes reach the native query field; standalone caller-owned popup semantics persist, while CommandPalette context owns its popup role and relationships; `xstyle`, `className`, and `style` customize the surrounding Input. | Released source and docs; `architecture:public-component-api/INV5` | Verified current routing                                   |
| FR4 | Pending state and renderable `endContent` share one trailing-content group; booleans, empty strings, null, and undefined do not create empty trailing chrome.                                                                                                  | React rendering semantics and current utility contract             | Verified current behavior                                  |
| FR5 | Auto-focus is enabled by default and suppressed inside an inline Dialog; `hasAutoFocus={false}` suppresses both focus work and the autofocus marker.                                                                                                           | Released source, docs, and tests                                   | Verified current behavior; browser timing evidence remains |

### Allowed variation

- **AV1 — Query content.** Value, placeholder, label, and caller-provided trailing
  content may vary without changing semantic ownership.
- **AV2 — Delegated visuals.** Icon and Spinner may change internal markup while
  preserving their public contracts.

### Representative states

| State                    | Required invariant                                                | Allowed variation                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------ |
| Standalone, no popup     | Named searchbox with no popup-only ARIA state.                    | Explicit value and change handler.   |
| Standalone, caller popup | Caller role, state, relationships, and active descendant persist. | Caller-owned popup model.            |
| Contextual, closed       | Named combobox references the list and reports collapsed state.   | Query value and trailing content.    |
| Contextual, no results   | Named combobox reports collapsed state and references no list.    | Empty or pending message.            |
| Contextual, open         | Named combobox references the list and reports expanded state.    | Highlighted option and result count. |
| Contextual, highlighted  | Active descendant names the context-owned highlighted option.     | Highlighted index.                   |
| Pending or trailing      | Supporting content remains at the logical trailing edge.          | Spinner, caller content, or both.    |
| Inline Dialog            | Mount does not steal focus from the surrounding page.             | Query and result content.            |

### Transformation and precedence order

- **ORD1 — Search state.** Explicit props → CommandPalette context → native
  uncontrolled state.
- **ORD2 — Keyboard handling.** Consumer handler → default-prevented or
  IME-composition check → CommandPalette context handler.
- **ORD3 — Accessible name.** Native `aria-label` → `label` → the translated
  default "Search commands" (DEC-1). Placeholder text is never the name.

### Performance and resources

- **PR1 — Focus scheduling.** At most one animation-frame focus request is
  scheduled by a mounted eligible field; no listener or observer is retained.

## Accessibility contract

- **AR1 — Name.** The native query field always has an explicit accessible name
  from ORD3 and never takes its name from placeholder text, satisfying
  `spec:AST-056/AR2` and WCAG 2.2 4.1.2.
- **AR2 — Role and popup state.** Standalone use without popup attributes exposes
  a `searchbox` without popup-only state. Standalone callers that provide their
  own popup relationships retain those semantics. CommandPalette context exposes
  a `combobox` with context-owned expanded state, list relationship, autocomplete
  mode, and active descendant, following `spec:AST-020/FR1,FR2` and the WAI-ARIA
  combobox pattern. While the palette holds no selectable result, the field
  reports collapsed state and has no list relationship or active descendant, and
  an active descendant always names an existing option.
- **AR3 — Semantic ownership.** With CommandPalette context, the field owns
  `role`, `aria-expanded`, `aria-autocomplete`, `aria-controls`, and
  `aria-activedescendant`, and these replace the same native passthrough props;
  other ARIA props, including `aria-haspopup` and `aria-owns`, pass through.
  Standalone caller-owned roles and relationships remain intact.

## Design relationships

| Anatomy or state | Design requirement                                                                | Representation authority                  | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ------------------ |
| Input            | Arranges Search glyph, Query field, Loading spinner, and Trailing content inline. | Current source and public docs            | Prominent      | FR3, FR4           |
| Search glyph     | Identifies the query affordance without adding a name.                            | Icon component                            | Supporting     | AR1                |
| Query field      | Receives text, focus, name, and popup semantics.                                  | Current source and accessibility standard | Prominent      | FR1–FR3, AR1–AR3   |
| Loading spinner  | Indicates a pending contextual search before Trailing content.                    | Spinner component                         | Supporting     | FR4                |
| Trailing content | Keeps caller content at logical inline-end.                                       | Current source and public docs            | Supporting     | FR4                |

## Family and system relationships

- `component:CommandPalette` owns the result-popup context, aggregate composition,
  and the open theming-reachability question; this component owns the default
  Input's query-field semantics and binds them to that context.
- `spec:AST-017` owns compatibility classification for the released standalone
  caller-popup and no-popup cases.
- `spec:AST-020` supplies the WCAG 2.2 and adopted-pattern evidence boundaries.
- `spec:AST-056/AR2` requires a query-field name distinct from placeholder text;
  ORD3 and AR1 satisfy it.

## Verification map

| Contract    | Verification                                              | Representative states                                  | Mutation or failure expectation                                                                                                                                | Audit section                        |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1–FR3     | `CommandPaletteInput.test.tsx`                            | explicit, context, prevented key, native, caller popup | Reversing state precedence, rerouting the ref, dropping standalone popup relationships, or allowing context semantics to be clobbered fails focused DOM tests. | `audit:CommandPaletteInput/testing`  |
| FR4         | `CommandPaletteInput.test.tsx`                            | numeric, empty, busy, caller content                   | Truthiness routing creates empty chrome or moves numeric content away from the trailing edge.                                                                  | `audit:CommandPaletteInput/behavior` |
| FR5         | focused unit tests plus exact-head browser evidence       | enabled, disabled, inline                              | Eligible focus is lost, disabled focus is scheduled, or inline mode steals focus.                                                                              | `audit:CommandPaletteInput/behavior` |
| AR1–AR3     | unit tests, exact-head axe/browser run, and source review | standalone, open, closed, highlighted                  | Wrong role/state, consumer clobbering of an owned attribute, or a placeholder-derived name fails semantics and name assertions.                                | `audit:CommandPaletteInput/a11y`     |
| Theming/RTL | target inventory, Storybook fixture, and RTL D2 audit     | standalone trailing content, contextual                | Target loss or physical ordering fails the owned fixture.                                                                                                      | `audit:CommandPaletteInput/theming`  |

## Decision log

### DEC-1 — The query field's default name is "Search commands"

**Reference:** `component:CommandPaletteInput/DEC-1`
**Decider:** `cixzhang`, 2026-10-14

A screen-reader user reaching the field hears what it does, whatever the
placeholder says or whether one is set. The default is a fixed, localizable
"Search commands"; `label` and `aria-label` replace it, and placeholder text is
never the name.

Rejected: falling back to the placeholder, which a caller writes as a visual
hint and AST-056 AR2 does not accept as a name.

## Open questions

- **OQ1 — How should the released `onValueChange(value)` primary callback and
  native-event `onChange(event)` exception migrate to the shared `onChange`
  callback grammar without breaking existing consumers?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
