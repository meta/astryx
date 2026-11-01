---
schema_version: 3
template_version: 7
kind: component
id: component:MetadataList
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/MetadataList/MetadataList.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009]
---

# MetadataList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children` (MetadataListItem entries), `columns`, `label` (`position`, `width`), `maxNumOfItems`, `orientation`, `title`, root `BaseProps`, `ref`. |
| Behavior                | A description list of label and value pairs in one column, several columns, or a wrapping row, with an optional show more and show less toggle.    |
| End-user impact         | People scan labelled facts in a predictable grid, and assistive technology reads each label with its value.                                        |
| Builder impact          | None; the record describes shipped behavior.                                                                                                       |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                         |
| Review checks           | Reject a list that is not a `dl`, a toggle without its expanded state or controlled list, an unlocalized toggle label, or overridable reflection.  |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`; WCAG 2.2 SC 1.3.1 and 4.1.2.                              |

This table is a review projection; the body below is authoritative.

## Intent

MetadataList presents read-only key and value facts as a description list. It
owns the arrangement of its entries, the label placement it passes to them, and
the optional disclosure that collapses a long list; callers own the facts.

Consumer syntax and examples belong in `MetadataList.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — one column, vertical, labels at the
  start, no collapse.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: the expanded state of the disclosure is
  uncontrolled.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The root, its `metadata-list` target, the optional title, the `dl`, and
  the show more and show less toggle.
- Column layout, orientation, and the label position and width its entries
  read.

**Does not own / non-goals**

- Each entry's label and value markup — owned by `component:MetadataListItem`.
- The facts shown and their formatting — owned by the caller.
- Editable fields — owned by form components.

## Public concepts

| Concept        | Closed values or states            | Meaning                                                                                                   | Availability by variant/orientation/state            | Default                                                  | Owner                    | Stability | Invalid-value behavior                                              |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ------------------------ | --------- | ------------------------------------------------------------------- |
| Columns        | `single`; `multi`; positive number | One column, auto-filling columns, or exactly N columns.                                                   | Vertical only                                        | `single`                                                 | `component:MetadataList` | Stable    | 1 acts as `single`; a number below 1 falls to the `multi` template. |
| Orientation    | `vertical`; `horizontal`           | A grid of entries, or one wrapping row of stacked entries.                                                | Always                                               | `vertical`                                               | `component:MetadataList` | Stable    | Closed union; rejected by types.                                    |
| Label position | `start`; `top`                     | Label beside its value, or stacked above it.                                                              | Vertical only                                        | `top` for `multi` or a number above 1, otherwise `start` | `component:MetadataList` | Stable    | Horizontal always stacks.                                           |
| Label width    | number (px); CSS length string     | The label track's width; on `multi` it replaces the auto-fill grid with one label and value pair per row. | Vertical with start labels, at one column or `multi` | content width                                            | `component:MetadataList` | Stable    | —                                                                   |
| Collapse       | positive number; unset             | Entries shown before a show more toggle.                                                                  | Vertical only                                        | unset                                                    | `component:MetadataList` | Stable    | Ignored when horizontal.                                            |
| Title          | ReactNode; unset                   | Content shown above the list.                                                                             | Always                                               | unset                                                    | `component:MetadataList` | Stable    | —                                                                   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | MetadataList renders a root `div` carrying the `metadata-list` target, which reflects `columns` and `orientation`, holding the optional title, a `dl` of the entries, and, when the list collapses, a toggle button. The title renders above the list with a `--spacing-3` gap as plain content; it is not a heading and does not name the list.                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                |
| FR2 | Vertical, one column with start labels is a two-track grid (label `auto`, value `minmax(0, 1fr)`) with `--spacing-2` row and `--spacing-4` column gaps and baseline alignment; a label `width` replaces the label track, and on `multi` with start labels a `width` replaces the auto-fill grid with the same two tracks. One column with top labels is a single track with a `--spacing-3` gap. `multi` auto-fills 280px-minimum columns with a `--spacing-4` gap. A number N above 1 makes exactly N columns, each `1fr` with top labels or a label `auto` and value `minmax(0, 1fr)` pair with start labels, ignoring a label `width`; a number below 1 falls to the `multi` template. | Current source and tests                                                |
| FR3 | Label position defaults to `top` for `multi` or a number above 1 and to `start` otherwise (including a number below 1), and a caller `position` wins. Horizontal orientation lays entries in one wrapping row with a `--spacing-4` gap, stacks every label above its value, and ignores `columns` and `maxNumOfItems`.                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                                                |
| FR4 | When vertical and the entries exceed `maxNumOfItems`, only the first `maxNumOfItems` render, followed by a native button labelled with the localized "Show more", with `aria-expanded="false"` and `aria-controls` naming the `dl`. Activating it renders every entry and switches to "Show less" with `aria-expanded="true"`; activating it again collapses. Focus stays on the button.                                                                                                                                                                                                                                                                                                  | Current source and tests; `architecture:public-component-api`           |
| FR5 | `ref`, DOM, data, ARIA, and event props, `xstyle`, `className`, and `style` reach or compose on the root; the reflected `data-columns` and `data-orientation` replace a caller's values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Facts.** Any MetadataListItem content may fill the list.
- **AV2 — Title.** Any ReactNode, including a caller's heading, may be the
  title.

### Representative states

| State      | Required invariant                                                   | Allowed variation |
| ---------- | -------------------------------------------------------------------- | ----------------- |
| One column | Label and value tracks; labels at the start.                         | Label width.      |
| N columns  | Exactly N columns; labels on top by default.                         | N.                |
| Horizontal | One wrapping row; labels stacked; no toggle.                         | —                 |
| Collapsed  | First `maxNumOfItems` entries; "Show more"; `aria-expanded="false"`. | Locale.           |
| Expanded   | Every entry; "Show less"; `aria-expanded="true"`.                    | Locale.           |

### Transformation and precedence order

- **ORD1 — Label position.** Horizontal → top; otherwise caller `position` →
  `top` for `multi` or a number above 1 → `start`.
- **ORD2 — Columns.** Horizontal → no grid; N above 1 → exactly N columns (N tracks with top labels, N label and value pairs with start labels); a
  start-label `width` → that label track; otherwise the static template.

### Performance and resources

- **PR1 — Local state only.** MetadataList holds one expanded flag and one
  generated id, and adds no listener, observer, timer, or measurement.

## Accessibility contract

- **AR1 — Description list semantics.** Entries are `dt` and `dd` pairs inside
  one `dl`, so assistive technology reads each label with its value
  (WCAG 2.2 SC 1.3.1).
- **AR2 — Disclosure state.** The toggle is a native button exposing its
  expanded state and the list it controls (WCAG 2.2 SC 4.1.2).
- **AR3 — Localized labels.** The toggle's text comes from the translation
  catalog, never assembled in the component.

## Design relationships

| Anatomy or state | Design requirement                          | Representation authority     | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------- | ---------------------------- | -------------- | ------------------ |
| Title            | Optional content above the list.            | Current source and docs      | Supporting     | FR1                |
| Label            | The key of each entry.                      | `component:MetadataListItem` | Supporting     | FR2, FR3           |
| Metadata         | The value of each entry.                    | `component:MetadataListItem` | Prominent      | FR2, FR3           |
| Disclosure       | Show more or show less in the accent color. | Current source and docs      | Supporting     | FR4                |

Theming: the root carries the `metadata-list` target, which reflects `columns`
and `orientation`, and each entry carries the `metadata-list-item` target
(`component:MetadataListItem`). `MetadataList.doc.mjs` names no root anatomy
part for the `metadata-list` target, so no anatomy-theming block is declared
here; the Title, value cell, and Disclosure carry no target.

## Family and system relationships

- `component:MetadataListItem` owns entry markup and reads the label position
  this record resolves.
- `architecture:component-theming-surface` owns target and anatomy mapping.
- `architecture:public-component-api` owns caller-input routing; FR5 applies
  it.
- `spec:AST-009` owns accessibility-tree evidence; the verification map names
  its gap.

## Verification map

| Contract        | Verification                                                                                                                                   | Representative states                                      | Mutation or failure expectation                                                                                                                                                                                                                                                                                                   | Audit section                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1, AR1        | `MetadataList.test.tsx` description-list, `dl`, and title tests; stable visual baselines `core-metadatalist--basic` (neutral and probe themes) | Items; title                                               | A missing `dl`, `dt`, or `dd`, or a missing title, fails; a changed default layout comes back changed for review. Gap: no accessibility-tree check proves the term and definition pairing (`spec:AST-009` FR3).                                                                                                                   | `audit:MetadataList/a11y`     |
| FR2, ORD2       | `MetadataList.test.tsx` numeric-column and label-width tests                                                                                   | N columns with top and start labels; `multi`; custom width | A wrong inline grid template for N columns or a label width, or a `repeat(` inline template for `multi`, fails. Gap: the static one-column and `multi` templates and the gaps have no unit check beyond the default baseline. No test covers a width beside N columns with start labels, a width on `multi`, or a number below 1. | `audit:MetadataList/layout`   |
| FR3, ORD1       | `MetadataList.test.tsx` orientation and default-position tests                                                                                 | Horizontal; omitted position; `columns={2}`                | A horizontal list without stacked labels or with a toggle, or a wrong default position, fails. No test covers `multi`'s top-label default or a number below 1's start-label default.                                                                                                                                              | `audit:MetadataList/layout`   |
| FR4, AR2, AR3   | `MetadataList.test.tsx` show more, toggle, and localization tests                                                                              | Collapsed; expanded; French catalog                        | A missing toggle, hidden entries that render, a toggle that does not expand and collapse, or English text under a French catalog fails. Gap: no test asserts `aria-expanded`, `aria-controls`, or that focus stays on the button.                                                                                                 | `audit:MetadataList/behavior` |
| FR5             | `MetadataList.test.tsx` root pass-through, event, and owned-metadata tests                                                                     | `aria-label`, `id`, data; click; colliding reflection      | A dropped attribute or handler, or a caller `data-columns` or `data-orientation` that wins, fails. Gap: no test covers `ref`, `className`, `style`, or the `xstyle` merge order.                                                                                                                                                  | `audit:MetadataList/api`      |
| PR1             | Source review                                                                                                                                  | Every state                                                | Gap: no automated check fails if MetadataList adds a listener, timer, or measurement.                                                                                                                                                                                                                                             | `audit:MetadataList/behavior` |
| Theming targets | `themingTargets.test.ts`                                                                                                                       | Root and item targets                                      | A renamed or undocumented target fails. Gap: no check fails if the side-by-side `dt` loses the `metadata-list-item` target.                                                                                                                                                                                                       | `audit:MetadataList/theming`  |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or entry markup. It links to their owners.
