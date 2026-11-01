---
schema_version: 3
template_version: 7
kind: component
id: component:InputGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by: [packages/core/src/InputGroup/InputGroup.test.tsx]
modules: []
families: [family:input-fields]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-038, spec:AST-085, spec:AST-102]
---

# InputGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. InputGroup takes `label`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `size`, `status`, `labelTooltip`, and input and addon children.                                                                                             |
| Behavior                | One Field-labelled `role="group"` row at the shared element height that joins admitted inputs, InputGroupText addons, and Button addons into one connected shape, and gives each grouped input the group's name and description.                                              |
| End-user impact         | People see a prefix, input, and suffix as one field, and screen-reader users hear the group label with each input's own label. A disabled group disables its inputs and Button addons together.                                                                               |
| Builder impact          | None.                                                                                                                                                                                                                                                                         |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The row holds a fixed height, Button addons scale under reduced motion, the row accepts root styling against FR10's scope, and the group border does not paint `status`; all are listed under Current-state impact. |
| Review checks           | Reject a grouped input that loses the group label or description, inner corners that round, a disabled group whose compatible children stay operable, or an internal input button reshaped as an addon.                                                                       |
| Governing rules         | `family:input-fields` FR3, AV3; `architecture:component-size-cascade` INV3–INV8; `spec:AST-085` FR7; `spec:AST-038` FR7, FR8; `spec:AST-102` FR4; `design:reduced-motion` DR1.                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

InputGroup joins an input with prefix and suffix addons into one connected
row, as `family:input-fields` assigns: it owns the row height, the connected
outer shape, edge alignment, and the group's label and supporting text.
Consumer usage lives in `InputGroup.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `size="md"`, label visible, not disabled
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The group Field (label, description, optional or required marker, label
  tooltip, detached status message) and the `role="group"` row.
- The row height and the size it provides to descendants up to the next layer boundary.
- The group context that tells admitted children they are grouped and which
  label and description ids to compose.
- Connected geometry for direct Button addons.
- The `input-group` target.

**Does not own / non-goals**

- Each grouped input's own adaptation (hidden inner label, no nested Field,
  grouped corners, status icon handling) — owned by that input under
  `family:input-fields` FR3.
- The text addon — owned by `component:InputGroupText` (this lane).
- Which inputs are admitted — decided per component under
  `family:input-fields` FR3; membership alone does not admit one.
- Disabling caller-owned controls that do not read the group — not provided.

## Public concepts

| Concept  | Closed values or states                         | Meaning                                         | Availability by variant/orientation/state | Default                   | Owner                  | Stability | Invalid-value behavior           |
| -------- | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | ------------------------- | ---------------------- | --------- | -------------------------------- |
| Size     | `sm`, `md`, `lg`                                | Row height and default size for children.       | Always.                                   | Inherited size, else `md` | `family:input-fields`  | Stable    | TypeScript rejects other values. |
| Status   | `error`, `warning`, `success`, optional message | Group validation state.                         | Always; the message is detached.          | none                      | `component:InputGroup` | Stable    | TypeScript rejects other types.  |
| Disabled | off, on                                         | Disables the group and its compatible children. | Always.                                   | off                       | `component:InputGroup` | Stable    | Not applicable.                  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FR1 | InputGroup renders one Field in group-label mode with `label` (visible unless `isLabelHidden`), `description`, the optional or required marker, `labelTooltip`, and `status` as a detached message. Inside it, the row is one element with `role="group"`, `aria-labelledby` set to the label, and `aria-describedby` set to the description and status message ids that exist.                                                                                                                                                                                                                                                                    | `family:input-fields` FR3; current tests                                            |
| FR2 | Grouped inputs receive the label id and description ids through context. Each admitted input is named by the group label plus its own label and described by the group's description and status plus its own.                                                                                                                                                                                                                                                                                                                                                                                                                                      | `family:input-fields` FR3; current tests                                            |
| FR3 | The row is inline-flex, stretched, and transparent; its height is the shared element height for its size, as a minimum that grows with a set text size under `spec:AST-102` FR4. Implementation gap: the height is fixed at that size. It provides its resolved size to descendants up to the next layer boundary (`spec:AST-038` FR7, FR8): explicit `size`, then the nearest outer provider, then `md`.                                                                                                                                                                                                                                          | `family:input-fields` FR3; `architecture:component-size-cascade`; current source    |
| FR4 | Direct Button addons join the shape: no inner corner rounding toward a neighbour, full row height, and their keyboard focus ring raised above the adjacent member. Buttons deeper inside a grouped input (clear, calendar, disclosure), and a Button addon wrapped in a Tooltip or HoverCard (not a direct child), keep their own shape. A following popover, template, or dialog element does not count as a neighbour. Addons are `component:Button`s outside a ButtonGroup, so their press scale MUST NOT apply under reduced motion (`design:reduced-motion` DR1). Implementation gap: it still applies under reduced motion.                  | Current source; `design:reduced-motion` DR1                                         |
| FR5 | The `role="group"` row inside the Field box carries `astryx-input-group` and reflects `data-size` and `data-status`. `ref`, `data-testid`, and other DOM props reach the row. InputGroup composes Field, so `family:input-fields` FR10 forbids root `xstyle`, `className`, and `style`. Implementation gap: they are accepted and reach the row.                                                                                                                                                                                                                                                                                                   | `architecture:component-theming-surface`; `family:input-fields` FR10; current tests |
| FR6 | The group is disabled when its own `isDisabled` or an enclosing InputGroup's is true. A disabled group sets `aria-disabled="true"` on the row, dims it to half opacity with the default cursor, passes the disabled state to the group Field, and disables every compatible child (TextInput, NumberInput, Selector, MultiSelector, DateInput, TimeInput, Typeahead, and Button addons) and nested group up to the next layer boundary; each child then follows its own disabled contract. A child or nested group that disables itself stays disabled when the group is enabled. Caller-owned controls that do not read the group are unaffected. | `spec:AST-085` FR7; `spec:AST-038` FR7, FR8; current tests                          |

### Allowed variation

- **AV1 — Members.** Any admitted input, InputGroupText, Button, and
  Button-triggered controls may appear in any order.
- **AV2 — Status paint.** A theme may paint the group from `data-status`; core
  paints no group border for it.

### Representative states

| State                       | Required invariant                                               | Allowed variation |
| --------------------------- | ---------------------------------------------------------------- | ----------------- |
| Prefix text + TextInput     | One row; outer corners only; input named by group and own label. | Size.             |
| Input + Button suffix       | Button full height, square toward the input.                     | Variant.          |
| With description and status | Group and inputs described by both; message detached below.      | —                 |
| Hidden label                | Label visually hidden; still names the group.                    | —                 |

### Transformation and precedence order

- **ORD1 — Size.** Explicit `size`, then outer provider, then `md`; a grouped
  input's own explicit `size` still wins for that input.
- **ORD2 — Description.** Group description, then group status message.

### Performance and resources

- **PR1 — No measurement.** Geometry comes from CSS selectors; InputGroup adds
  no observer or listener.

## Accessibility contract

- **AR1 — Group name.** `role="group"` labelled by the visible or hidden
  label (FR1).
- **AR2 — Input names.** Each admitted input combines the group label with its
  own label, so its purpose stays specific (FR2).
- **AR3 — Focus.** A focused member is raised above its neighbours so its
  focus presentation is not covered.

## Design relationships

| Anatomy or state | Design requirement                             | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Label            | Group label above the row, or hidden.          | Current source           | Prominent      | FR1                |
| Prefix addon     | Text or Button before the input, joined to it. | Current source           | Supporting     | FR4                |
| Input            | The admitted input, filling remaining width.   | Current source           | Prominent      | FR2                |
| Suffix addon     | Text or Button after the input, joined to it.  | Current source           | Supporting     | FR4                |

`design:reduced-motion` governs the Button addons' press scale (FR4); no other
design record governs InputGroup. The row carries `input-group`; the
consumer anatomy names no row part, so this record carries no anatomy-theming
map.

## Family and system relationships

- `family:input-fields` assigns InputGroup the row height, connected surface,
  edge alignment, and group focus; admission stays with each input.
- `component:InputGroupText` supplies the text addon.
- `component:Button` applies FR4's addon geometry from the group context.
- `architecture:component-size-cascade` owns size inheritance (FR3).

## Verification map

| Contract             | Verification                                                                                                                                    | Representative states                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                                         | Audit section                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, AR1             | `InputGroup.test.tsx` label, description, status, hidden-label cases                                                                            | Visible and hidden label; description and status                                                           | A missing group name or description fails. Evidence gap: no test asserts the optional or required marker or the label tooltip. The hidden-label case checks neither the group name nor the visual hiding, and no test asserts the description-then-status order (ORD2). | `audit:InputGroup/accessibility` |
| FR2, AR2             | `InputGroup.test.tsx` grouped-input naming cases and the grouped DateInput semantics case                                                       | TextInput, NumberInput, DateInput, Typeahead, Selector, MultiSelector                                      | A grouped input that loses the group or its own label fails.                                                                                                                                                                                                            | `audit:InputGroup/accessibility` |
| FR4                  | Evidence gap: no InputGroup-level test of addon geometry, wrapped addons, or the reduced-motion press; `component:Button` verifies its own side | —                                                                                                          | —                                                                                                                                                                                                                                                                       | `audit:InputGroup/layout`        |
| FR5                  | `InputGroup.test.tsx` data-testid case                                                                                                          | Root                                                                                                       | A dropped test id fails. Evidence gap: the size case asserts only rendering; no test asserts the target, `data-size`, `data-status`, `ref`, `className`, `style`, or `xstyle`.                                                                                          | `audit:InputGroup/theming`       |
| FR6                  | `InputGroup.test.tsx` disabled-propagation cases                                                                                                | Every compatible input and Button addon; nested groups; re-enabled group with an explicitly disabled child | A child that stays operable in a disabled group, a nested group that opts out, or a re-enabled explicitly disabled child fails.                                                                                                                                         | `audit:InputGroup/behavior`      |
| FR3, FR6 (paint)     | Evidence gap: no assertion of row height, size propagation, or disabled dimming                                                                 | —                                                                                                          | —                                                                                                                                                                                                                                                                       | `audit:InputGroup/layout`        |
| ORD1, ORD2, PR1, AR3 | Evidence gap: no test asserts size precedence, the description-then-status order, the absence of observers, or a raised focused member          | —                                                                                                          | —                                                                                                                                                                                                                                                                       | `audit:InputGroup/behavior`      |

## Current-state impact

- **Fixed height (FR3).** The row holds the fixed shared element height instead
  of growing with a set text size, against `spec:AST-102` FR4.
- **Addon press under reduced motion (FR4).** A Button addon scales to 0.98 on a
  press when the person prefers reduced motion, as `component:Button` FR15
  records, against `design:reduced-motion` DR1.
- **Root styling (FR5).** InputGroup accepts root `className`, `style`, and
  `xstyle` on its row, against the scope of `family:input-fields` FR10. FR10
  item 3 names InputGroup as the caller's styling surface, and the family
  coverage test `Field/fieldInputFamily.test.tsx` leaves InputGroup out of its
  field inputs, so this gap may close by clarifying FR10 rather than by
  changing code.
- **Status paint (AV2).** The consumer docs say `status` is applied to the group
  border; core reflects it as `data-status` and shows the detached message, and
  paints no group border.

## Decision log

No component-local decision. InputGroup applies `family:input-fields`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
