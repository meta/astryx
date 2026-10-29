---
schema_version: 3
template_version: 3
kind: component
id: component:Table
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    apps/storybook/stories/Table.stories.tsx,
    packages/core/src/Table/Table.test.tsx,
    packages/core/src/Table/__tests__/TableScroll.a11y.chromium.spec.ts,
    packages/core/src/Table/__tests__/Table.a11y.test.tsx,
    packages/core/src/Table/__tests__/Table.a11y.chromium.spec.ts,
    packages/core/src/Table/Table.perf.test.tsx,
    packages/core/src/Table/plugins/selection/useTableSelection.test.tsx,
    packages/core/src/Table/plugins/sortable/useTableSortable.test.tsx,
    packages/core/src/Table/plugins/sortable/__tests__/useTableSortable.a11y.test.tsx,
    packages/core/src/Table/plugins/rowExpansion/useTableRowExpansion.test.tsx,
    packages/cli/foundation/discovery/theming-targets.test.mjs,
    packages/cli/api/theme/targets/targets.test.mjs,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules:
  [
    module:Table/useTableActivation,
    module:Table/useTableInfiniteScroll,
    module:Table/useTableRowStatus,
    module:Table/useTableVirtualization,
    module:Table/useTableColumnResize,
  ]
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-025]
---

# Table component contract

## Intent

Table presents consistently structured data in semantic rows and columns. This
contract records its current aggregate anatomy, parent-owned target inventory,
stable sorting, selection, expansion, and empty-state parts, and the shared
`TablePlugin` protocol through which public modules compose. Module-local API,
generated anatomy, accessibility, migration, and evidence belong to each listed
`module:*` record.

## Compatibility and migration

- Released default preserved: `no`; data-driven columns with omitted `width`
  keep their equal flexible share plus a compact 60px readability floor rather
  than collapsing toward zero. A column overrides that floor with
  `proportional(value, {minWidth})`. When those floors no longer fit, the existing Table Scroll
  region overflows horizontally. Explicit pixel and proportional widths are unchanged.
- Compatibility class: standards-conformance bug fix; no public prop, semantic
  Table element, or Scroll-region behavior changes. 0.7.0 removes the deprecated
  `base-table` target alias while preserving `table`.
- Controlled/uncontrolled behavior: unchanged
- FR15 adds `useTableRowExpansion`'s optional `animatedLayout` option, an
  additive change; without it, rows change at once as before.
- Migration decision: `spec:AST-025` FR12, FR14, FR19, FR21, and DEC-1; replace
  `base-table` theme keys and `.astryx-base-table` selectors with `table` and
  `.astryx-table`, or run `astryx upgrade --from 0.6.3 --apply --path .`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Table and Scroll region, the aggregate Header section, Body section,
  conditional Footer section, Row, Column header cell, and Cell anatomy, and the
  eight current `table*` targets mapped below.
- The stable Sort control and Sort priority rendered by useTableSortable.
- The stable Expansion control and Expanded detail panel rendered by
  useTableRowExpansion.
- Placement of selection-plugin CheckboxInput controls in generated header and
  body cells.
- The shared `TablePlugin` transform surface, phase order, sequential composition,
  named-plugin ordering, slot protocol, failure isolation, and stable plugin-array
  identity used by every Table module.

**Does not own / non-goals**

- CheckboxInput visuals, Icon glyphs, or the default EmptyState surface; those
  remain owned by their respective components.
- Cell values, custom cell renderers, custom empty states, footer content, or
  expanded detail content supplied by the caller.
- Pagination, filtering, column-management, tree, grouping, sticky-column, or
  context-menu anatomy beyond the stable parts explicitly recorded here.
- The public API, generated columns or other anatomy, internal precedence,
  accessibility, migration, performance evidence, or theming decisions of an
  independently contractible module. `module:Table/useTableRowStatus` owns those
  concerns for `useTableRowStatus`.
- New targets for current untargeted plugin parts, or correction of current
  target-reachability gaps.
- New public API, theme target, or alias, beyond `useTableRowExpansion`'s
  optional `animatedLayout` option (FR15).

## Public concepts

Table records two aggregate public concepts without duplicating module-local APIs:

| Concept           | Closed values or states                                           | Meaning                                                                              | Availability by variant/orientation/state | Default                    | Owner             | Stability | Invalid-value behavior                                                                                        |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| Plugin collection | Named `Record<string, TablePlugin<T>>` or absent                  | Adds ordered transformations to the data-driven Table pipeline.                      | Data-driven Table                         | Absent                     | `component:Table` | Stable    | Development warns for unknown transform keys, non-functions, and empty plugins; unsupported keys are ignored. |
| Plugin transform  | Column, element-render-prop, scroll-wrapper, or context transform | Changes one owned pipeline phase while preserving the common `TablePlugin` protocol. | According to the transform method         | Omitted methods are no-ops | `component:Table` | Stable    | A throwing transform is isolated and the prior accumulated value continues.                                   |

Consumer data, columns, props, module signatures, defaults, and usage remain
documented in `Table.doc.mjs` and the member and module docs.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                  | Evidence state                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1  | By default, Styled Table renders one named Scroll region around one observed content box and one semantic Table. The Scroll region enters the keyboard order and contains inline overscroll only while inline content effectively overflows; fitting content passes scroll gestures to its ancestor. Explicit scroll-wrapper plugin HTML attributes remain authoritative.                                                                                                                                                                                                                                                                                                           | `spec:AST-025` FR12, FR14, FR19, FR21; current source, docs, and tests | Verified fitting and inline-overflow transitions through the shared `useScrollableArea` behavior core                                                                                |
| FR2  | Data-driven mode renders a Body section and a Header section with Column header cells when columns are present. Each data item renders a standard Row and Cells; an empty data array instead renders the configured empty-state row when enabled. It never creates a Footer section.                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests                                        | Verified current behavior; no new behavior decided                                                                                                                                   |
| FR3  | Children mode passes caller composition through to the Table. TableHeader, TableBody, and TableFooter provide the respective sections, and TableRow, TableHeaderCell, and TableCell provide standard rows and cells.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests                                        | Verified current composition; no new API or DOM rule                                                                                                                                 |
| FR4  | `Table.doc.mjs` is the canonical aggregate consumer owner for the eight current targets: `table`, `table-scroll-wrapper`, `table-header`, `table-body`, `table-footer`, `table-row`, `table-cell`, and `table-header-cell`. Member docs retain direct lookup metadata through `subComponentOf: 'Table'`.                                                                                                                                                                                                                                                                                                                                                                            | Current docs and CLI target tests                                      | Verified parent ownership; focused placement coverage is partial                                                                                                                     |
| FR5  | For a sortable column, useTableSortable renders a Sort control around the column label, an Icon-owned Sort indicator glyph, and a numeric Sort priority only while multi-sort has more than one active entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source, docs, and tests                                        | Control and priority are tested; glyph presence is source-inspected only                                                                                                             |
| FR6  | useTableSelection renders CheckboxInput-owned Selection controls in the generated selection Column header cell and each selectable body Cell; selection remains row state rather than separate anatomy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source, docs, and tests                                        | Verified stable delegated controls; no target or state change                                                                                                                        |
| FR7  | For an expandable row, useTableRowExpansion renders an Expansion control with an Icon-owned Expansion glyph and conditionally appends an Expanded detail panel whose cell spans the column count captured by that plugin's `transformColumns` step.                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source, docs, and tests                                        | Verified stable plugin parts; current target gaps remain                                                                                                                             |
| FR8  | Empty data renders the default compact EmptyState unless the caller supplies replacement content or disables it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source, docs, and tests                                        | Verified conditional delegation; caller content remains outside ownership                                                                                                            |
| FR9  | Table converts the caller's named plugin record into one ordered array after its built-in styling plugin. Known names use the current canonical sequence `columnSettings → sort → tree → selection → pagination`; every other name follows that known set while preserving its record insertion order.                                                                                                                                                                                                                                                                                                                                                                              | Current source and docs                                                | Current shared ordering; canonical-name coverage is source-inspected                                                                                                                 |
| FR10 | Every applicable non-context transform runs sequentially in the resolved plugin-array order, so a later plugin receives the value returned by every earlier successful plugin. A throwing transform reports a development error and leaves the prior accumulated value in the pipeline.                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests                                               | Sequential composition is tested; failure isolation is source-inspected                                                                                                              |
| FR11 | `transformColumns` completes before element transforms. Table then applies table, header-cell/header-row, body-cell/body-row, scroll-wrapper, and context phases at their render points. Header-cell contributions use `before`, `content`, `after`, `overlay`, and `below` slots. Context transforms run in reverse so the first plugin becomes the outermost provider.                                                                                                                                                                                                                                                                                                            | Current source, types, and tests                                       | Transform application is tested; complete cross-phase order is source-inspected                                                                                                      |
| FR12 | When built-in and named plugin references are unchanged, Table reuses the resolved plugin array; unknown/custom plugin value identity and insertion order remain stable inputs to memoization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and performance tests                                   | Current performance contract; focused named-order coverage is partial                                                                                                                |
| FR13 | In data-driven mode, each explicit column whose `width` is omitted keeps one equal flexible share and a 60px readability floor. A column sets its own floor with `proportional(value, {minWidth})`, which replaces the 60px floor for that column; Table has no table-wide floor setting. Resolution is a pure function of the final column definitions: row values, rendered header/body measurement, locale, sorting, filtering, virtualization, and loading state do not change any floor. Explicit pixel and proportional widths retain their authored floors. When the resolved floors exceed available inline space, the existing Scroll region provides horizontal overflow. | `component:Table/DEC-2`; current source and tests                      | Verified by width-resolution unit coverage and the ResponsiveScroll real-browser geometry fixture                                                                                    |
| FR14 | Wherever Table shows a row divider, including while rows glide and in pinned columns, the divider has the width, style and colour the row's border would have: the theme's tokens and any app override on `tr`, `tbody` or `td` borders, so customizations still show.                                                                                                                                                                                                                                                                                                                                                                                                              | `component:Table/DEC-3`                                                | Not implemented: rows do not glide yet, the pinned-column divider is pending, and an open detail panel's divider draws the default tokens, which `table-cell` overrides do not reach |
| FR15 | `useTableRowExpansion` takes an `animatedLayout` option, the handle `spec:AST-105` FR1 defines: when an Expanded detail row opens, the panel plays in and the rows after it glide to their new places; when one closes, it hides at once and the rows after it glide up into its space (`spec:AST-105` Coverage). The Expansion glyph turns on the same motion; under reduced motion the rows move without travel (`spec:AST-105` FR4). Without the option, rows change at once. A table that draws column lines (`dividers="grid"` or `"columns"`) does not glide yet: with the option its panel and rows change at once, as without it, and the glyph keeps its own turn.         | `spec:AST-105` FR1, FR4; owner decision, 2026-10-26                    | Not implemented                                                                                                                                                                      |

### Current evidence and gaps

- The `table`, `table-scroll-wrapper`, `table-row`, `table-cell`, and
  `table-header-cell` placements have focused runtime assertions. The
  `table-header`, `table-body`, and `table-footer` placements are source-inspected;
  existing section tests assert element structure and prop forwarding but not the
  target classes.
- Sort tests assert the Sort control, labels, state, and conditional priority, but
  the test named `renders sort icon for sortable columns` checks only the buttons.
  Sort indicator glyph presence is source-inspected and lacks focused regression
  evidence. Selection and expansion suites assert their stable controls, states,
  and panel structure; delegated Icon and CheckboxInput target classes also remain
  source-inspected.
- The Expanded detail panel uses raw `tr` and `td` elements rather than TableRow
  and TableCell, so the existing `table-row` and `table-cell` targets do not reach
  that panel wrapper. Its `colSpan` comes from the column count captured when the
  expansion plugin runs `transformColumns`; a later custom plugin can add or remove
  columns and leave the span stale. The current full-span test covers only the case
  where expansion captures the final column set. This contract records both gaps
  and does not correct them.

### Allowed variation

- **AV1 - Rendering mode.** Data-driven mode generates sections, rows, and cells;
  children mode uses the caller-supplied composition without changing aggregate
  ownership.
- **AV2 - Repetition and content.** Column, Row, and Cell counts and caller-owned
  content may vary without creating new anatomy parts.
- **AV3 - Optional parts.** Header section, Footer section, default EmptyState,
  Sort, Selection, and Expansion parts may be absent according to columns,
  rendering mode, plugin configuration, data, and row eligibility.
- **AV4 - Delegated rendering.** CheckboxInput, Icon, and EmptyState may change
  internal element shape while preserving their own public contracts.
- **AV5 - Module participation.** Any named module may omit transform phases it does
  not need. Unknown/custom plugin names remain valid and follow the shared fallback
  ordering without acquiring module-local semantics here.

### Representative states

| State                       | Required invariant                                                                                                                                       | Allowed variation                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Data-driven rows            | Scroll region contains Table, Header section when columns exist, Body section, and one standard Row with Cells per data item.                            | Counts, values, density, dividers, and cell content.                                                                           |
| Width-less explicit columns | Every omitted-width column remains equally flexible above a 60px floor; combined floors trigger the existing Scroll region only when they no longer fit. | Row values, header nodes, sorting/filtering, virtualization, loading or empty rows, direction, and responsive container width. |
| Empty data                  | Body section contains default EmptyState unless replaced or disabled.                                                                                    | Caller replacement content or no empty state.                                                                                  |
| Children mode               | Caller-supplied sections are passed directly to Table.                                                                                                   | Header, Body, and Footer section presence and content.                                                                         |
| Sortable column             | Column header cell contains Sort control and Sort indicator glyph.                                                                                       | Direction and conditional multi-sort priority.                                                                                 |
| Selectable rows             | Selection controls occupy generated header and body cells.                                                                                               | Checked, indeterminate, disabled, or absent per row.                                                                           |
| Expandable row              | Expansion control occupies a generated Cell; open state adds the detail panel after its row using the expansion plugin's captured column count.          | Expanded state, caller detail content, and later plugin column transforms.                                                     |
| Multiple plugins            | Built-in styling runs first, then named plugins compose in the resolved order; later transforms receive earlier results.                                 | Supported transform subset, custom names, and omitted phases.                                                                  |

### Transformation and precedence order

- **ORD1 - Plugin array.** Built-in plugins precede named consumer plugins. Known
  names sort by the canonical list; unknown/custom names retain record insertion
  order after the known set.
- **ORD2 - Sequential transforms.** Each non-context phase reduces over that array
  from first to last. A later plugin receives the earlier accumulated value.
- **ORD3 - Render phases.** Column transforms complete before element transforms;
  element transforms run at the table, header, body, and scroll-wrapper render
  points. Context transforms run from last to first so array priority and provider
  nesting agree: the first plugin is outermost.
- **ORD4 - Module boundary.** Module records may rely on this protocol and state the
  transforms they contribute, but they do not redefine aggregate phase or
  named-plugin ordering.

### Performance and resources

- **PR1 - Stable plugin array.** Table reuses the resolved plugin array while the
  built-in array and named plugin values are referentially unchanged, including
  when the caller recreates the containing record.
- **PR2 - Module ownership.** Each module owns any stronger render, allocation,
  listener, observer, or initialization constraint created by its transforms.
  Table owns only the common array and transform pipeline cost.
- **PR3 - Static width resolution.** Explicit-column floors resolve in the existing
  O(column count) pass without DOM measurement, observers, extra render passes, or
  dependence on row values. The server and client therefore derive the same inline
  width styles from the same column definitions.

## Accessibility contract

By default, the Scroll region is named as a `group`, enters sequential keyboard
navigation only while inline overflow is effective, and keeps native Arrow/Page
scrolling. A scroll-wrapper plugin may explicitly override its HTML accessibility
attributes. Losing overflow removes future default tab stops without moving current
focus. Effective inline scrolling contains overscroll at its edge; fitting content
leaves page scrolling available. Native table semantics, column-header scope, sort
`aria-sort`, selection `aria-selected`, CheckboxInput labels, and expansion
`aria-expanded` remain unchanged. Each public module owns accessibility introduced
by its transforms; the shared pipeline does not confer correctness on module output.

## Design relationships

| Anatomy or state      | Design requirement                                                                | Representation authority       | Hierarchy role | Component contract |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Table                 | Groups the semantic table structure.                                              | Current source and public docs | Supporting     | FR1-FR4            |
| Scroll region         | Provides keyboard-reachable horizontal overflow around Table.                     | Current source and public docs | Supporting     | FR1, FR4           |
| Header section        | Groups Column header cells separately from body data.                             | Current source and public docs | Supporting     | FR2-FR4            |
| Column header cell    | Identifies one column and hosts optional header controls.                         | Current source and public docs | Prominent      | FR2-FR6            |
| Sort control          | Activates sorting for one sortable column.                                        | Current source and public docs | Prominent      | FR5                |
| Sort indicator glyph  | Shows the current sort direction through Icon.                                    | `component:Icon`               | Supporting     | FR5                |
| Sort priority         | Shows a column's position in active multi-sort order.                             | Current source and public docs | Supporting     | FR5                |
| Selection control     | Selects all eligible rows or one eligible row through CheckboxInput.              | `component:CheckboxInput`      | Prominent      | FR6                |
| Body section          | Groups data, empty-state, and expanded-detail rows.                               | Current source and public docs | Supporting     | FR2-FR4, FR7, FR8  |
| Row                   | Groups standard header, body, or footer cells.                                    | Current source and public docs | Supporting     | FR2-FR4, FR6       |
| Cell                  | Contains one value or caller-provided content in a standard body or footer row.   | Current source and public docs | Prominent      | FR2-FR4, FR6, FR7  |
| Default empty state   | Communicates that the current data array has no rows through EmptyState.          | `component:EmptyState`         | Prominent      | FR8                |
| Expansion control     | Expands or collapses one eligible row.                                            | Current source and public docs | Prominent      | FR7                |
| Expansion glyph       | Shows the current expansion direction through Icon.                               | `component:Icon`               | Supporting     | FR7                |
| Expanded detail panel | Presents caller-provided detail content in a spanning row below the expanded row. | Current source and public docs | Prominent      | FR7                |
| Footer section        | Groups caller-supplied summary or total rows below the body.                      | Current source and public docs | Supporting     | FR3, FR4           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Table": {"target": "table"},
  "Scroll region": {"target": "table-scroll-wrapper"},
  "Header section": {"target": "table-header"},
  "Column header cell": {"target": "table-header-cell"},
  "Sort control": {"inherits": "table-header-cell"},
  "Sort indicator glyph": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Sort priority": {
    "none": {
      "reason": "unsettled: The multi-sort rank has no direct public target and uses a component-owned accent style; future exposure still needs an owner decision"
    }
  },
  "Selection control": {
    "delegatesTo": {
      "owner": "component:CheckboxInput",
      "target": "checkbox-input"
    }
  },
  "Body section": {"target": "table-body"},
  "Row": {"target": "table-row"},
  "Cell": {"target": "table-cell"},
  "Default empty state": {
    "delegatesTo": {"owner": "component:EmptyState", "target": "empty-state"}
  },
  "Expansion control": {
    "none": {
      "reason": "unsettled: The expansion button has no direct public target and uses component-owned styles; future exposure still needs an owner decision"
    }
  },
  "Expansion glyph": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Expanded detail panel": {
    "none": {
      "reason": "reachability-gap: The plugin renders its detail row and cell as raw elements, so the current table-row and table-cell targets do not reach the panel wrapper"
    }
  },
  "Footer section": {"target": "table-footer"}
}
```

The exact map records all eight canonical Table targets once. TableHeader,
TableBody, TableFooter, TableRow, TableCell, and TableHeaderCell retain direct docs
linked by `subComponentOf: 'Table'`; they do not need independent component specs
for this aggregate ownership.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, exact
  target mapping, delegation, inheritance, factual `none` classifications, and
  canonical target naming.
- `architecture:container-padding` owns the inherited inset protocol consumed by
  the Scroll region and Cell edge compensation. This container-system
  participation does not make Table a structural member of
  `family:layout-regions`.
- `architecture:interaction-modality` owns shared keyboard and pointer modality;
  Table and its plugins retain their current local interactions.
- `architecture:public-component-api` owns the stable props, components, hooks,
  exports, and compatibility boundary; this record adds only
  `useTableRowExpansion`'s optional `animatedLayout` option (FR15).
- `module:Table/useTableRowStatus` owns the row-status module's API, generated
  anatomy, resolution and warning precedence, accessibility, performance,
  migration, and evidence. Table owns only the shared plugin protocol and its
  aggregate composition order.

## Verification map

| Contract               | Verification                                                                                                                                                                                                                                                                                                                                                                                                    | Representative states                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                   | Audit section               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1-FR3                | `Table.test.tsx` render, structure, fit/overflow transitions, children-mode, section, and target assertions                                                                                                                                                                                                                                                                                                     | Fitting and inline-overflowing data-driven tables, empty data, and children composition                                                                                                           | Removing Table, Scroll region, observed content box, conditional keyboard access, or effective-axis containment fails existing role, structure, state, class, style, or prop-forwarding assertions; Row and Cell are conditional on rendered data or caller composition.                                                                                                                                          | `audit:Table/anatomy`       |
| FR4                    | CLI discovery and API target tests plus source inspection                                                                                                                                                                                                                                                                                                                                                       | Direct member docs and unfiltered/scoped target output                                                                                                                                            | Duplicating a parent/member target or changing the canonical owner fails parent-aware discovery assertions; section target placement remains source-inspected.                                                                                                                                                                                                                                                    | `audit:Table/theming`       |
| FR5                    | `plugins/sortable/useTableSortable.test.tsx`; the sort module contract (`plugins/sortable/__tests__/useTableSortable.a11y.ts`, self-tested by `useTableSortable.a11y.test.tsx`), which the Table binding composes onto the base Table contract for its sorted state (`__tests__/Table.a11y.test.tsx`, `__tests__/Table.a11y.chromium.spec.ts`); plus source inspection                                          | Unsorted, ascending, descending, and multi-sort                                                                                                                                                   | Removing the Sort control, conditional priority, or ARIA state fails existing assertions. Removing the Sort indicator glyph does not currently fail a focused test; glyph presence and delegated Icon target placement remain source-inspected.                                                                                                                                                                   | `audit:Table/anatomy`       |
| FR6                    | `plugins/selection/useTableSelection.test.tsx`                                                                                                                                                                                                                                                                                                                                                                  | Select all, individual, disabled, and non-selectable                                                                                                                                              | Removing header/body Selection controls or row selection state fails existing structure, label, interaction, and ARIA assertions; delegated CheckboxInput target placement remains source-inspected.                                                                                                                                                                                                              | `audit:Table/anatomy`       |
| FR7                    | `plugins/rowExpansion/useTableRowExpansion.test.tsx` plus source inspection                                                                                                                                                                                                                                                                                                                                     | Collapsed, expanded, and non-expandable rows                                                                                                                                                      | Removing the Expansion control, conditional detail panel, captured-count `colSpan`, or ARIA state fails existing assertions in the covered plugin order; later column transforms, delegated Icon target placement, and untargeted panel wrappers remain source-inspected.                                                                                                                                         | `audit:Table/anatomy`       |
| FR8                    | `Table.test.tsx` empty-state suite plus EmptyState public target metadata                                                                                                                                                                                                                                                                                                                                       | Default, custom, disabled, and non-empty                                                                                                                                                          | Removing conditional empty behavior fails existing assertions; default EmptyState delegation remains source-inspected.                                                                                                                                                                                                                                                                                            | `audit:Table/anatomy`       |
| FR9-FR11               | `Table.test.tsx`, `types.ts`, `BaseTable.tsx`, and `useBaseTablePlugins.ts`                                                                                                                                                                                                                                                                                                                                     | Built-in plus known and custom named plugins; every transform phase                                                                                                                               | Sequential composition, base-before-user behavior, transform application, and slot output have focused coverage; complete known-name sorting, phase order, exception continuation, and context nesting remain source-inspected.                                                                                                                                                                                   | `audit:Table/plugins`       |
| FR12, PR1              | `Table.perf.test.tsx` plus `useBaseTablePlugins.ts` source inspection                                                                                                                                                                                                                                                                                                                                           | Same plugin references, recreated record, and changed plugin value                                                                                                                                | Unchanged plugin values must preserve the resolved array and representative no-op row-update budgets; focused named-record identity coverage remains partial.                                                                                                                                                                                                                                                     | `audit:Table/performance`   |
| FR13, PR3              | `Table.test.tsx`, `plugins/columnResize/useTableColumnResize.test.tsx`, `plugins/stickyColumns/useTableStickyColumns.test.tsx`, and `Table.stories.tsx` ResponsiveScroll play assertions                                                                                                                                                                                                                        | Width-less columns with empty, short, and long-token rows; mixed explicit widths; pinned columns; narrow and fitting containers                                                                   | Removing the 60px floor, deriving it from row content, changing explicit width semantics, desynchronizing resize bounds or sticky offsets, or preventing the existing Scroll region from activating fails focused unit or real-browser geometry assertions.                                                                                                                                                       | `audit:Table/layout`        |
| FR14                   | Real-browser computed-style checks of the divider mid-glide, in pinned columns, and under an open detail panel (pending)                                                                                                                                                                                                                                                                                        | a theme with a custom divider colour; an app override of a row's border; both mid-glide and on a pinned cell; an open detail panel's divider under the same theme and override                    | a divider whose width, style or colour differs from the row's border, or that drops a theme or app override, fails                                                                                                                                                                                                                                                                                                | `audit:Table/theming`       |
| FR15                   | Real-browser tests of row expansion with and without `animatedLayout` (pending)                                                                                                                                                                                                                                                                                                                                 | open and close with the handle; without it; reduced motion under a coarse and a fine pointer; a glyph turn beside the glide; a `dividers="grid"` and a `dividers="columns"` table with the option | rows that jump with the handle in a table without column lines, a closing panel that animates or leaves its space empty before the rows arrive, a panel and rows on different motion, a glyph on its own timing beside the glide, travel under reduced motion, or any motion without the handle a table with column lines that glides or animates its panel, or one whose glyph does not keep its own turn, fails | `audit:Table/plugins`       |
| Accessibility contract | `__tests__/Table.a11y.test.tsx` and `__tests__/Table.a11y.chromium.spec.ts` bind Table to the base Table contract (`internal/a11y-spec`), composing each module's contract only for the states rendered with that module: the sort module contract (`plugins/sortable/__tests__/useTableSortable.a11y.ts`) for the sorted state; `__tests__/TableScroll.a11y.chromium.spec.ts` keeps the Scroll region evidence | Labelled data-driven, sorted descending, composed RTL with row headers, and empty data                                                                                                            | Losing the table role or declared name, row, header, or cell roles, or a part leaving its row or the table, fails the base binding; a missing or stale `aria-sort` fails the composed sort module contract.                                                                                                                                                                                                       | `audit:Table/accessibility` |
| Module backlink        | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                   | Active parent and colocated module record                                                                                                                                                         | A missing, duplicate, mis-parented, wrong-kind, misnamed, or undiscovered module record fails knowledge validation.                                                                                                                                                                                                                                                                                               | `audit:Table/modules`       |
| Theming anatomy map    | `scripts/check-knowledge.mjs`, `themingTargets.test.ts`, and CLI parent-aware target discovery tests                                                                                                                                                                                                                                                                                                            | Canonical anatomy and eight current targets                                                                                                                                                       | Missing, extra, duplicated, prefixed, stale, or independently owned member mappings fail repository validation or discovery coverage.                                                                                                                                                                                                                                                                             | `audit:Table/theming`       |

## Decision log

### DEC-1 — Table adopts the shared scroll behavior on its owned viewport

**Reference:** `component:Table/DEC-1`
**Decider:** `cixzhang`, 2026-09-20

Table uses `useScrollableArea` on its existing Scroll region with a private observed
content box. Inline overflow remains native and keyboard reachable. Containment is
active only while that axis can scroll, so a fitting Table does not create a dead
scroll zone for an ancestor. This keeps one Table-owned viewport and adds no public
prop or parallel overflow detector.

### DEC-2 — Width-less explicit columns use a compact static floor

**Reference:** `component:Table/DEC-2`
**Decider:** `cixzhang`, 2026-10-07

A data-driven column with omitted `width` resolves as one flexible share with a
60px minimum. The floor is configured per column: `proportional(value,
{minWidth})` sets that column's floor, and `proportional()` without `minWidth`
keeps its 120px default. Resolution uses only column definitions, so pagination,
sorting, filtering, virtualization, empty and loading states, SSR, and hydration
cannot change any floor. Rejected: deriving the floor from rendered or sampled
content, because it shifts with data and view state.

### DEC-3 — A drawn divider keeps the row border's source

**Reference:** `component:Table/DEC-3`
**Decider:** `cixzhang`, `2026-10-26`

A divider drawn in place of the real border, during a row glide or in a
pinned column, reads the row border's width, style and colour, from theme tokens and app overrides alike, so a
themed or customized table looks the same while rows move and where columns
are pinned.

Rejected: a drawn divider with its own fixed look.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, module-local API or
generated anatomy, plugin usage recipes, container-padding mechanics, shared
modality rules, current audit results, or implementation steps. It links to their
owners.
