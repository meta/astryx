---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteItem
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, accessibility, public-api, compatibility, theming]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteItem.test.tsx,
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/CommandPaletteItem.stories.tsx,
    apps/storybook/rtl-audit/targets.json,
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
system_specs: [spec:AST-017, spec:AST-020]
---

# CommandPaletteItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One result option with context-backed identity, highlight, selection, and close behavior; explicit standalone visual state and pointer activation remain available. |
| Behavior                | Consumer click runs first; cancellation stops selection; successful activation reports locally, updates context, and closes; disabled items run no click callbacks. |
| End-user impact         | Disabled commands cannot activate, and keyboard focus, selected value, and option identity remain distinct and consistently exposed.                                |
| Builder impact          | Values stay unique; children stay non-interactive; CommandPalette owns composite keyboard navigation and reports keyboard selection through root `onValueChange`.   |
| Compatibility/readiness | Victim-free `[fix]` restores promised disabled and native-passthrough behavior; the standalone keyboard contract remains unsettled.                                 |
| Review checks           | Reject disabled activation, dropped standalone DOM identity, highlight-as-selection ARIA, nested interactive children, or a second context scroll owner.            |
| Governing rules         | `architecture:public-component-api/INV5,INV7`; `architecture:interaction-modality`; `spec:AST-017/FR1,FR3,FR5`; `spec:AST-020/FR1,FR2`; WAI-ARIA 1.2 `option`.      |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteItem presents one command result as an option. CommandPalette
context supplies composite state and keyboard ownership; the item owns its option
semantics, visual states, pointer activation, native passthrough boundary, and
standalone scroll behavior.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: victim-free contract restoration under
  `spec:AST-017/FR1,FR3,FR5`; `isDisabled` already promises a non-interactive
  item and the native `BaseProps` seam already promises standalone DOM props
- Controlled/uncontrolled behavior: explicit item state still precedes context
  state, then the existing false default
- Migration decision: none for these corrections; OQ1 holds any change to the
  standalone keyboard contract
- Documentation compatibility: item `onSelect` reports pointer activation only.
  No public runtime path delivers Enter to it — CommandPalette mints rows without
  item callbacks and standalone items have no keyboard owner — so describing
  keyboard selection through root `onValueChange` leaves no released consumer
  behind (`spec:AST-017/FR1,FR5`). OQ1 owns any standalone keyboard path.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The option root, item value marker, selected and disabled ARIA state, and
  `command-palette-item` theme target.
- Explicit → CommandPalette context → false precedence for highlighted and
  selected visual state.
- Pointer activation order, disabled suppression, and context selection/close.
- Standalone highlighted-item scroll behavior and the inline-preview initial
  scroll suppression.

**Does not own / non-goals**

- CommandPalette's listbox, query-field active descendant, arrow-key navigation,
  Enter handling, search results, or root `onValueChange` callback.
- Grouping, list layout, or caller-provided non-interactive item content.
- A standalone composite listbox keyboard model; its direction remains OQ1.
- Interactive descendants. Buttons and links are sibling actions or separate
  commands, not content inside an option.

## Public concepts

| Concept       | Closed values or states                             | Meaning                                           | Availability             | Default | Owner                          | Stability | Invalid-value behavior                                    |
| ------------- | --------------------------------------------------- | ------------------------------------------------- | ------------------------ | ------- | ------------------------------ | --------- | --------------------------------------------------------- |
| Highlight     | explicit; context index; false                      | Active keyboard result, painted but not selected. | All uses                 | false   | `component:CommandPaletteItem` | Stable    | Unknown context value leaves every item unhighlighted.    |
| Selection     | explicit; context value; false                      | Chosen value exposed through `aria-selected`.     | All uses                 | false   | `component:CommandPaletteItem` | Stable    | Duplicate values resolve ambiguously; values stay unique. |
| Availability  | enabled; disabled                                   | Whether pointer activation is available.          | All uses                 | enabled | `component:CommandPaletteItem` | Stable    | Disabled suppresses consumer and component callbacks.     |
| Item identity | context-generated id; standalone caller-provided id | DOM identity used by active-descendant or caller. | Contextual or standalone | absent  | component or caller            | Stable    | Context identity wins only for a registered item.         |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                  | Basis                                                        | Draft review state                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| FR1 | Native props and `ref` reach the option root. CommandPalette context owns registered-item id, role, selected state, disabled state, and value marker; standalone caller id persists. | Released source and `architecture:public-component-api/INV5` | Verified by focused DOM tests                                             |
| FR2 | Pointer activation runs consumer `onClick`, then stops when prevented; otherwise it calls item `onSelect`, then context selection and close. Disabled items run none of those paths. | Released callbacks and disabled promise                      | Verified; mutation-resistant                                              |
| FR3 | Explicit `isHighlighted` and `isSelected` precede context-derived values, then false. Highlight paints active state only; selection alone drives `aria-selected`.                    | Released source, docs, and listbox semantics                 | State semantics tested; precedence tested; combined paint gap remains OQ2 |
| FR4 | Context owns highlighted-item scrolling. Outside context, a highlighted item scrolls nearest, except an initially highlighted item inside an inline Dialog does not scroll.          | Released source and regression history                       | Verified by focused Effect tests                                          |
| FR5 | Children provide the option's label and supporting presentation, without nested interactive descendants.                                                                             | Option semantics and `spec:AST-020/FR1,FR2`                  | Documented; exact-head a11y remains a gate                                |

### Allowed variation

- **AV1 — Content.** Labels, icons, descriptions, and shortcut hints may vary
  while remaining non-interactive.
- **AV2 — Visual state.** Highlight, selection, and disabled state may occur
  independently or together. The current selected paint masks highlighted paint
  when both are true; OQ2 holds the visible-state remedy.
- **AV3 — Layout.** Consumer `xstyle`, class, and style may adjust the single
  root without replacing its option semantics.

### Representative states

| State                | Required invariant                                                        | Allowed variation                 |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Enabled standalone   | Caller id and native props persist; pointer activation reports locally.   | Content and visual state.         |
| Disabled standalone  | `aria-disabled` is true and no click callback fires.                      | Content.                          |
| Context highlighted  | Context item id matches active descendant and highlight is not selection. | Item index and content.           |
| Context selected     | Matching value exposes `aria-selected=true`.                              | Highlight may be same or another. |
| Consumer-cancelled   | Consumer click runs; local and context selection/close do not.            | Consumer side effect.             |
| Inline initial state | Initial standalone highlight does not scroll the surrounding preview.     | Selected value and content.       |

### Transformation and precedence order

- **ORD1 — Visual state.** Explicit item prop → CommandPalette context → false.
- **ORD2 — Pointer activation.** Disabled guard → consumer click → prevented
  check → item `onSelect` → context select → context close.
- **ORD3 — Identity.** Registered context id → standalone caller id → absent.

### Performance and resources

- **PR1 — Lookup.** Context matching remains bounded by the current flat result
  list and performs no listener, observer, or per-item registry work.
- **PR2 — Scroll ownership.** One owner scrolls a highlighted contextual item;
  standalone items schedule no work when not highlighted.

## Accessibility contract

- **AR1 — Option semantics.** The root exposes `role=option`; its content or
  caller label provides the accessible name, and `aria-selected` reports chosen
  value rather than visual highlight.
- **AR2 — Composite ownership.** Inside CommandPalette, the query field retains
  focus and points to the context-generated item id; CommandPalette owns arrow
  navigation and Enter selection under its adopted listbox/combobox model.
- **AR3 — Disabled state.** Disabled items expose `aria-disabled=true` and
  suppress every pointer activation callback. Source inspection confirms the
  interaction overlay is omitted; exact-head browser evidence remains the paint
  gate.
- **AR4 — Content.** Item children contain no nested button, link, or other
  interactive descendant whose semantics would be lost when the `option`
  role makes its descendants presentational, following WAI-ARIA 1.2 and
  `spec:AST-020/FR1,FR2`.
- **AR5 — Standalone gap.** A standalone option has no owning composite keyboard
  model. OQ1 must settle that public contract before runtime semantics change.

## Design relationships

| Anatomy | Design requirement                                                                                                                       | Representation authority       | Hierarchy role | Component contract |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Item    | Paints enabled, highlighted, selected, disabled, and press states on one root. Selected currently masks highlight when both apply (OQ2). | Current source and public docs | Prominent      | FR1–FR4, AR1–AR3   |
| Content | Supplies the option name and non-interactive supporting presentation.                                                                    | Product callsite               | Supporting     | FR5, AR1, AR4      |

## Family and system relationships

- `component:CommandPalette` owns composite search, listbox, active-descendant,
  keyboard, and close orchestration; this component binds one option to it.
- `architecture:interaction-modality` owns shared pointer and keyboard behavior.
- `architecture:public-component-api` owns native passthrough and released API
  compatibility.
- `architecture:component-theming-surface` owns the aggregate Item anatomy map
  and stable `command-palette-item` target.
- `spec:AST-017` classifies the victim-free corrections and holds OQ1 against
  silent released-contract changes.
- `spec:AST-020` supplies accessibility evidence and adopted-pattern boundaries.
- WAI-ARIA 1.2 option semantics make descendants presentational, so interactive
  controls do not belong inside this option root.

## Verification map

| Contract          | Verification                                                                           | Representative states                             | Mutation or failure expectation                                                                             | Audit section                       |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, FR3, AR1–AR2 | `CommandPaletteItem.test.tsx`, `CommandPalette.test.tsx`                               | standalone; context highlighted/selected          | Dropped id/ref/native prop, clobberable role/state, or highlight-as-selection fails focused DOM assertions. | `audit:CommandPaletteItem/a11y`     |
| FR2, AR3          | `CommandPaletteItem.test.tsx`                                                          | enabled; disabled; consumer-cancelled; contextual | Disabled consumer activation, ignored cancellation, missing local report, selection, or close fails tests.  | `audit:CommandPaletteItem/behavior` |
| FR4               | `CommandPaletteItem.test.tsx`, `CommandPalette.test.tsx`                               | standalone; inline initial; changed highlight     | Lost nearest scrolling, duplicate contextual scrolling, or initial inline scroll fails Effect assertions.   | `audit:CommandPaletteItem/behavior` |
| FR5, AR4          | public docs, dedicated Storybook states, exact-head a11y/browser evidence              | label; shortcut; disabled                         | Interactive descendant guidance regresses or supported composition fails exact-head accessibility evidence. | `audit:CommandPaletteItem/a11y`     |
| Theme/RTL         | focused class assertion, `themingTargets.test.ts`, Storybook fixture, RTL verified N/A | all visual states                                 | Target loss fails inventory/DOM tests; any new directional behavior requires a non-empty RTL dimension.     | `audit:CommandPaletteItem/theming`  |

## Decision log

No component-local API, keyboard, or visual decision is settled in this draft.
Objective corrections preserve the current public shape.

## Open questions

- **OQ1 — What standalone keyboard contract should CommandPaletteItem expose?**
  (`human-api`) Current standalone use exposes an option and pointer activation
  but no owning listbox keyboard model. Decide whether a public composite owner
  must supply that model, the item should gain a different standalone role and
  interaction contract, or standalone activation should enter a migration path.
- **OQ2 — How should keyboard highlight remain visible when the item is also
  selected?** (`human-design`) Current selected background paint follows and
  masks the highlighted background. Real-browser pixels must confirm the gap;
  any appearance remedy requires owner direction and a separate visual change.

## Content boundary

This file does not duplicate consumer examples, audit scores, implementation
steps, aggregate CommandPalette search/list behavior, or shared system rules.
