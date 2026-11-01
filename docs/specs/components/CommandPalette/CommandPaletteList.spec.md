---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteList
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, accessibility, public-api, theming]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteList.test.tsx,
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/CommandPaletteList.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# CommandPaletteList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. One named listbox container for result options, rendered by CommandPalette or directly for a standalone results list.                                                                             |
| Behavior                | The root is a `listbox` named by `label` or the translated default; inside CommandPalette it is one only while selectable results exist, and carries the context list id the query field controls.              |
| End-user impact         | Screen-reader users reach a named results list from the query field; overflowing results scroll inside the list instead of growing the palette.                                                                 |
| Builder impact          | None. CommandPalette renders its own list; standalone compositions render items and groups directly inside this one.                                                                                            |
| Compatibility/readiness | Draft. Inside CommandPalette an empty or pending result surface drops the listbox role and name (AR4, an accessibility fix); a standalone caller `id` is kept (FR1); the standalone keyboard model remains OQ1. |
| Review checks           | Reject a second list-id owner, a role or name that consumer props can replace, dropped native or styling inputs, or a list target moved off the scrolling root.                                                 |
| Governing rules         | `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface`; WAI-ARIA 1.2 `listbox`.                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteList is the scrolling results container of the command palette.
Inside CommandPalette it is the listbox the query field controls. Standalone, it
presents a named results listbox around caller-provided option content.

## Compatibility and migration

- Released default preserved: `yes`, except inside CommandPalette while no
  selectable result exists, where the root no longer exposes an empty listbox
- Compatibility class: accessibility behavior fix (`spec:AST-017/FR53`); styling,
  target, and public API are unchanged
- Controlled/uncontrolled behavior: not applicable; the list holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The listbox root and its accessible name from `label`, falling back to the
  translated default, and dropping both inside CommandPalette while no selectable
  result exists.
- Applying the CommandPalette context list id to the root.
- Native passthrough, `ref`, and styling-input composition on the root.
- Block-axis scrolling of overflowing children, with spacing-scale padding and
  gaps.

**Does not own / non-goals**

- List-id generation, query-field focus, active descendant, arrow-key
  navigation, hover highlight, Enter selection, search, and the choice between
  results and the empty state — owned by `component:CommandPalette`.
- The aggregate List anatomy entry and its `command-palette-list` target mapping
  — owned by `component:CommandPalette`.
- Option semantics, state, and activation; group semantics and headings — owned
  by CommandPaletteItem and CommandPaletteGroup.
- A standalone composite keyboard model; its direction remains OQ1.

## Public concepts

| Concept         | Closed values or states            | Meaning                                           | Availability by variant/orientation/state | Default                                                     | Owner                          | Stability | Invalid-value behavior                                                   |
| --------------- | ---------------------------------- | ------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ | --------- | ------------------------------------------------------------------------ |
| Accessible name | caller `label`; translated default | Name announced for the results listbox.           | All uses                                  | `@astryx.commandPalette.list.label` ("Commands" in English) | `component:CommandPaletteList` | Stable    | An empty `label` leaves the listbox unnamed; callers supply a real name. |
| List identity   | context list id; caller `id`       | DOM id the CommandPalette query field references. | Inside CommandPalette; standalone         | Context id inside CommandPalette; caller `id` standalone    | `component:CommandPalette`     | Stable    | Inside CommandPalette a caller `id` is replaced by the context id.       |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                 | Basis                                                               | Draft review state                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| FR1 | Native props and `ref` reach the listbox root, and consumer `className` and `style` combine with the list target and base styles. Inside CommandPalette the root id is the context list id; standalone, a caller `id` is kept.                                                      | Released source; `architecture:public-component-api/INV5,INV6,INV8` | Ref, styling, and the standalone `id` verified by focused tests                                                        |
| FR2 | Standalone, and inside CommandPalette while at least one selectable result exists, the root exposes `role=listbox` with an accessible name from `label`, falling back to the translated default; consumer `role` and `aria-label` props do not replace them. Otherwise AR4 applies. | Released source and docs; WAI-ARIA 1.2 `listbox`                    | Role and name verified by focused tests, with and without palette results; consumer-prop precedence is source-verified |
| FR3 | Inside CommandPalette, the query field's `aria-controls` names the listbox id.                                                                                                                                                                                                      | Released source and component docs                                  | Verified by a focused composition test                                                                                 |
| FR4 | The root lays out children in one column with spacing-scale padding and gaps, grows within a flex parent, caps its height at the parent's height, and scrolls overflowing children inside itself.                                                                                   | Released source and component docs                                  | Source-verified; the scrolling fixture renders it in a browser, but scroll geometry is not yet measured                |

### Allowed variation

- **AV1 — Children.** Items, groups, and empty states may vary in count, order,
  and content without changing the root, except as AR4 states.
- **AV2 — Layout.** Consumer `xstyle`, class, and style may adjust the root
  without replacing its role, name, id, or target.

### Representative states

| State                 | Required invariant                                                             | Allowed variation          |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Standalone results    | The listbox is named by `label` or the translated default.                     | Item count and grouping.   |
| Inside CommandPalette | The root id equals the query field's `aria-controls` value.                    | Results count and groups.  |
| Overflowing results   | Results scroll inside the list instead of growing past the container.          | Container and item height. |
| Empty palette results | Inside CommandPalette with no selectable result, the root has no role or name. | Empty or pending message.  |

### Transformation and precedence order

- **ORD1 — Root attributes.** Consumer native props, then the component-owned
  id, `listbox` role, and accessible name.
- **ORD2 — Styling.** List target, then base styles with `xstyle`, then
  consumer class, then consumer style.

### Performance and resources

- **PR1 — No work beyond render.** The list adds no state, effect, listener, or
  observer; it reads translation and CommandPalette context during render only.

## Accessibility contract

- **AR1 — Name.** The listbox takes `label` as its accessible name and falls back
  to the translated default when `label` is omitted.
- **AR2 — Relationship.** Inside CommandPalette, the query field controls the
  listbox through its id; CommandPalette owns focus and keyboard navigation under
  its combobox model.
- **AR3 — Standalone gap.** A standalone list exposes a listbox of options with
  no owning keyboard model. OQ1 must settle that contract before runtime
  semantics change.
- **AR4 — Empty content.** Inside CommandPalette, while no selectable result
  exists, the root has no role and no accessible name, so screen readers meet the
  empty or pending message as plain content and no empty popup; WAI-ARIA 1.2
  requires a listbox to own options. A standalone list stays a listbox, and its
  caller supplies the options.

## Design relationships

| Anatomy or state | Design requirement                                                                  | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| List             | Presents result options in one scrolling column with spacing-scale padding and gap. | Current source and public docs | Supporting     | FR1, FR4           |

## Family and system relationships

- `component:CommandPalette` owns list-id generation, keyboard navigation, hover
  highlight, the aggregate anatomy, and the `command-palette-list` target
  mapping; this component applies the id and paints the List.
- `architecture:public-component-api` owns native passthrough, styling
  composition, and refs.
- `architecture:component-theming-surface` owns target qualification and the
  aggregate List anatomy map.
- `architecture:component-test-sufficiency` owns the evidence rules behind the
  verification map below.

## Verification map

| Contract      | Verification                                                                            | Representative states                                      | Mutation or failure expectation                                                                                | Audit section                      |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1           | `CommandPaletteList.test.tsx`                                                           | standalone root with ref, class, and style                 | Disconnecting `ref`, or dropping the consumer class or the list target, fails focused DOM assertions.          | `audit:CommandPaletteList/api`     |
| FR2, AR1, AR4 | `CommandPaletteList.test.tsx`                                                           | default and caller label; palette with and without results | Removing the role or name, or keeping them on an empty palette surface, fails the role and name assertions.    | `audit:CommandPaletteList/a11y`    |
| FR3, AR2      | `CommandPaletteList.test.tsx`, `CommandPalette.test.tsx`                                | inline CommandPalette                                      | Dropping the context id breaks the query-field relationship assertion.                                         | `audit:CommandPaletteList/a11y`    |
| FR4           | Storybook fixtures, `themingTargets.test.ts`, exact-head accessibility and RTL evidence | standalone list; scrolling palette                         | Losing the target fails the target inventory; any new directional behavior requires a non-empty RTL dimension. | `audit:CommandPaletteList/theming` |

## Decision log

None. This draft records current facts and settles no component-local API,
keyboard, or visual decision; AR4 applies the WAI-ARIA 1.2 listbox rule.

## Open questions

- **OQ1 — What standalone keyboard contract should CommandPaletteList expose?**
  (`human-api`) A standalone list exposes a listbox of options but no owning
  keyboard model. Decide whether a public composite owner supplies that model,
  the standalone composition takes a different role, or standalone use remains
  pointer-only presentation.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
