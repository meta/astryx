---
schema_version: 3
template_version: 7
kind: component
id: component:Item
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-16
owners: [cixzhang]
review_triggers: [public-api, layout, theming]
verified_by:
  [
    packages/core/src/Item/Item.test.tsx,
    packages/core/src/List/List.test.tsx,
    packages/core/src/RadioList/RadioList.test.tsx,
    packages/core/src/CheckboxList/CheckboxList.test.tsx,
    apps/storybook/stories/Item.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:internationalization,
  ]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-017/FR3, spec:AST-057]
---

# Item component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

This record governs how Item aligns its start and end content against the
label. Item's swipe actions are governed by `spec:AST-057`, and its link and
navigation semantics by `family:navigation-destinations`; other Item behavior
remains described by its source, tests, and `Item.doc.mjs` until a record
claims it.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `align?: 'center' \| 'start' \| 'first-line'` on Item, ListItem, RadioListItem, and CheckboxListItem; default `center`.                                                             |
| Behavior                | `first-line` centers each start and end slot on the label's first line, for any slot height; a slot taller than that line moves the text down rather than leaving the row.          |
| End-user impact         | A small status dot, radio, or age stays level with the first line of a wrapped label instead of drifting to the middle of the row (`center`) or riding above the line (`start`).    |
| Builder impact          | None by default. A builder opts in per row with `align="first-line"`; theme authors may style the `item` target's `first-line` alignment.                                           |
| Compatibility/readiness | Additive: a new value on an existing closed axis and typed forwarding of an existing runtime pass-through. Rows that omit `align` are unchanged.                                    |
| Review checks           | Reject a changed default, changed `center`/`start` geometry, JavaScript measurement, a slot pushed outside the row, a second theme target, or a composing row that drops the value. |
| Governing rules         | FR1–FR8 below; `architecture:component-theming-surface/INV6`; `spec:AST-017/FR3`.                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Item is the shared row behind lists, menus, pickers, and option rows. Its label
can wrap, while its start and end content is often a single-line-sized mark: a
status dot, a radio or checkbox, an icon, a short timestamp. Those marks belong
to the first line of text they annotate. Item owns the alignment because only
Item knows where its label's first line sits; a caller cannot place a slot
against it without copying Item's typography.

## Compatibility and migration

- Released default preserved: `yes`; omitted `align` resolves to `center`.
- Compatibility class: additive closed-axis value; additive typed prop on three
  composing rows that already forward unknown props to Item at runtime.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: `component:Item/DEC-1`.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `align` axis: its values, default, and the geometry of each value for
  the start and end content slots.
- Reflecting the resolved alignment on the `item` theme target.
- The forwarding rule for rows that compose Item and expose `align`.

**Does not own / non-goals**

- The `marker` slot's alignment — owned by whoever renders the marker; ListItem
  positions its own markers against the first line.
- Typography of caller content inside `label` — owned by the caller.
- A theme-wide default alignment — themes style values; they do not choose a
  component's prop default (`architecture:component-theming-surface`).
- Alignment inside a slot's own content (for example, an avatar stack) — owned
  by that content.

## Public concepts

| Concept   | Closed values or states         | Meaning                                                                                                                                              | Availability by variant/orientation/state                                   | Default  | Owner            | Stability | Invalid-value behavior                       |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- | ---------------- | --------- | -------------------------------------------- |
| Alignment | `center`, `start`, `first-line` | `center`: slots centered on the whole text block. `start`: slot tops on the text block's top. `first-line`: slot centers on the first line's center. | Every density, layout, interaction mode, and direction; start and end slots | `center` | `component:Item` | stable    | Other values are rejected by the public type |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                             | Basis                                                                 | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| FR1 | Item MUST accept `align` with exactly `center`, `start`, and `first-line`, and MUST resolve an omitted value to `center`. The geometry of `center` and `start` MUST NOT change.                                                                                                                                       | `component:Item/DEC-1`                                                | settled            |
| FR2 | Under `first-line`, the block-axis center of each rendered start-content and end-content slot MUST coincide with the block-axis center of the label's first line box, for every slot block size.                                                                                                                      | Owner direction                                                       | settled            |
| FR3 | Under `first-line`, a slot taller than the label's first line MUST stay inside the row's content box: the label and description move down by the difference, and the row grows to fit. No slot is clipped or painted into the row's block padding.                                                                    | Owner direction                                                       | settled            |
| FR4 | A row whose label renders a single line and which has no description MUST render identically under `first-line` and `center`, for every slot block size.                                                                                                                                                              | Follows from FR2 and FR3                                              | settled            |
| FR5 | The first line box is the label line as Item styles it, from the active theme's body text size and leading. A theme that changes those tokens moves the alignment with them. Caller content inside `label` that sets its own font size or line height is outside the FR2 guarantee.                                   | Shared typography source                                              | settled            |
| FR6 | `first-line` MUST hold in every density, in `stacked` and `inline` layouts, with `labelLines` truncation, and in plain, button, link, link-root, delegated, and parent-role rows. In right-to-left text it MUST produce the same block-axis placement with the slots mirrored by logical order and no DOM reordering. | `architecture:internationalization`                                   | settled            |
| FR7 | The `item` theme target MUST reflect the resolved alignment as its existing `align` selector axis, including `first-line`, and Item's public theming metadata MUST list that value. No new target, state, or theme-level default is added.                                                                            | `architecture:component-theming-surface/INV6`; `component:Item/DEC-2` | settled            |
| FR8 | ListItem, RadioListItem, and CheckboxListItem MUST expose `align` with Item's values and default and forward it unchanged to the Item row they render. A composing row MUST NOT drop, remap, or narrow the value.                                                                                                     | Owner direction                                                       | settled            |

### Allowed variation

- **AV1 — Slot content.** Any slot content and size may appear; FR2 holds for
  each slot independently, so a start slot and an end slot of different heights
  each center on the first line.
- **AV2 — Theme typography.** Body text size and leading may vary by theme; the
  first line box follows them (FR5).
- **AV3 — Row height.** Under `first-line` a row may be taller than the same
  row under `center` when a slot is taller than the first line and a
  description or second label line is present (FR3).

### Representative states

| State                                        | Required invariant                                                    | Allowed variation                     |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| Wrapped label, 6px dot start, short-text end | Both slot centers on the first line's center.                         | Density, theme typography, direction. |
| One-line label, no description, any slot     | Identical to `center`.                                                | Slot size.                            |
| Label and description, 40px avatar start     | Avatar center on the first line's center; text moves down; row grows. | Avatar size.                          |
| Radio or checkbox row with a wrapped label   | The control centers on the first line.                                | Control size by Field size.           |
| Right-to-left                                | Same block-axis placement; slots mirrored by logical order.           | Writing direction.                    |
| Omitted `align`                              | Identical to today's `center`.                                        | None.                                 |

### Transformation and precedence order

- **ORD1 — Resolution.** An explicit `align` on a composing row forwards to
  Item unchanged; Item resolves an omitted value to `center`; the resolved value
  drives both geometry and the `item` target's selector axis, so the two never
  disagree.

### Performance and resources

- **PR1 — CSS geometry only.** Every alignment value MUST be achieved in CSS:
  no measurement, observer, listener, state, Effect, or extra render pass.

## Accessibility contract

- **AR1 — Presentation only.** Alignment MUST NOT change the DOM order, role,
  accessible name or description, focus target, tab order, or hit target of the
  row or its slots.
- **AR2 — No exposed text.** Any construct that implements `first-line` MUST
  contribute no text to the accessibility tree.

## Design relationships

| Anatomy or state      | Design requirement                                    | Representation authority | Hierarchy role | Component contract |
| --------------------- | ----------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Start and end content | Annotates the first line of the label it sits beside. | Owner direction          | Supporting     | FR2–FR4            |
| Label first line      | The reference line the slots align to.                | Item typography          | Prominent      | FR5                |

## Family and system relationships

- `spec:AST-057` owns Item's swipe actions and their panels; alignment does
  not change them, because the panels sit outside the row's flow.
- `family:navigation-destinations` owns Item's link and navigation semantics;
  alignment does not change them.
- `architecture:component-theming-surface` owns how visual axes reach theme
  targets; this record adds one value to Item's existing `align` axis.
- `architecture:public-component-api` owns prop admission; FR8 types an existing
  runtime pass-through rather than adding a parallel concept.
- `architecture:internationalization` owns logical-direction behavior; FR6
  applies it.
- `spec:AST-017/FR3` classifies this as a non-breaking feature: it adds a value
  and a typed prop, narrows nothing, and a caller who never sets `align` sees no
  change.

## Verification map

| Contract | Verification                                                                    | Representative states                                         | Mutation or failure expectation                                                       | Audit section       |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| FR1, FR7 | `Item.test.tsx` alignment and theme-reflection suites; public type test         | Omitted, `center`, `start`, `first-line`                      | A changed default, a missing `data-align="first-line"`, or a widened type fails.      | `audit:Item/api`    |
| FR2–FR6  | Real-Chromium geometry assertions over the Item alignment stories               | Wrapped label with dot and age; avatar; densities; RTL; theme | A slot center off the first line center by more than 0.5px, or a clipped slot, fails. | `audit:Item/layout` |
| FR8      | `List.test.tsx`, `RadioList.test.tsx`, `CheckboxList.test.tsx` forwarding cases | Each composing row with `align="first-line"`                  | A row whose Item root lacks `data-align="first-line"` fails.                          | `audit:Item/api`    |
| AR1, AR2 | Accessibility-tree snapshot of a `first-line` row against a `center` row        | Plain and option rows                                         | Any difference in name, role, description, or order fails.                            | `audit:Item/a11y`   |
| PR1      | Source review of Item's alignment styles                                        | All values                                                    | A ref, observer, or Effect added for alignment fails review.                          | `audit:Item/layout` |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — `first-line` is an opt-in value; `center` stays the default

**Reference:** `component:Item/DEC-1`
**Decider:** cixzhang, 2026-10-16

A wrapped label with a single-line-sized mark needs the mark on its first line,
and neither existing value does that: `center` drops the mark to the middle of
the row and `start` pins its top, which leaves a small mark above the line's
center. A new value fixes those rows without moving any row that relies on
today's default.

Rejected: making `first-line` the default, because a slot sized to the whole
text block, such as an avatar beside a label and description, is correct under
`center`.

### DEC-2 — The theme setting is the `item` target's alignment axis

**Reference:** `component:Item/DEC-2`
**Decider:** cixzhang, 2026-10-16

Themes reach `first-line` rows through the `item` target's existing `align`
selector axis, the same way they reach `center` and `start`. A theme can style
those rows; it does not choose which value a row receives.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
