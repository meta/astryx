---
schema_version: 3
template_version: 7
kind: component
id: component:InputGroupText
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, layout, theming]
verified_by: [packages/core/src/InputGroup/InputGroup.test.tsx]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# InputGroupText component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. InputGroupText takes `children` and the base props.                                                                          |
| Behavior                | A non-interactive, muted text or icon cell inside InputGroup that joins its neighbours' borders and rounds only the group's outer corners. |
| End-user impact         | People see a fixed prefix or suffix such as `$` or `https://` as part of the field. It is read as plain text, not as a control.            |
| Builder impact          | None.                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                  |
| Review checks           | Reject an interactive role or tab stop on the cell, text that wraps or shrinks, or rounded inner corners.                                  |
| Governing rules         | `component:InputGroup`; `architecture:component-theming-surface`.                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

InputGroupText is InputGroup's text addon: a fixed piece of text or an icon
shown before or after the input. Consumer usage lives in
`InputGroupText.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The text cell's paint, sizing, border join, and corner rounding.
- The `input-group-text` target.

**Does not own / non-goals**

- Group label, row height, and description — owned by `component:InputGroup`.
- Naming or describing the input — the cell is not referenced by the input's
  name or description.
- Use outside InputGroup — uncontracted.

## Public concepts

No new public concept. Content is caller text or an icon.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                              | Basis                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| FR1 | InputGroupText renders one non-interactive element with no role, holding `children`. `ref`, `className`, `style`, `xstyle`, and other DOM props reach it.                                                                                              | Current source and tests                                 |
| FR2 | The cell centers its content vertically with small inline padding, uses body text in the secondary text color on the muted background, never wraps, and never shrinks.                                                                                 | Current source                                           |
| FR3 | The cell draws an emphasized one-border-width border. Every cell after the first overlaps its leading neighbour by one border width. Only the first child's leading corners and the last child's trailing corners are rounded with the element radius. | Current source                                           |
| FR4 | The cell carries `astryx-input-group-text`.                                                                                                                                                                                                            | `architecture:component-theming-surface`; current source |

### Allowed variation

- **AV1 — Content.** Any text or icon; the cell does not inspect it.
- **AV2 — Theme paint.** Themes may restyle the cell through
  `input-group-text`.

### Representative states

| State  | Required invariant                                     | Allowed variation |
| ------ | ------------------------------------------------------ | ----------------- |
| Prefix | Leading corners rounded; trailing edge square.         | Content.          |
| Suffix | Trailing corners rounded; overlaps the input's border. | Content.          |

### Transformation and precedence order

- **ORD1 — Styling.** Component styles, then `xstyle`, then `className` and
  `style`.

### Performance and resources

- **PR1 — Static.** No state, effect, or listener.

## Accessibility contract

- **AR1 — Plain text.** The cell has no role or tab stop and is read as
  ordinary text in reading order.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Text cell        | Muted, bordered, secondary-text cell joined to the row. | Current source           | Supporting     | FR2, FR3           |

No design record governs InputGroupText.

## Family and system relationships

- `component:InputGroup` hosts the cell and owns the row it joins.

## Verification map

| Contract | Verification                                                     | Representative states  | Mutation or failure expectation                                                                                     | Audit section                  |
| -------- | ---------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1      | `InputGroup.test.tsx` addon and prefix/suffix cases              | Prefix and suffix text | Missing addon text fails. Evidence gap: no test asserts the absent role or that `ref` and DOM props reach the cell. | `audit:InputGroupText/anatomy` |
| FR2–FR4  | Evidence gap: no assertion of cell paint, border join, or target | —                      | —                                                                                                                   | `audit:InputGroupText/layout`  |

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
