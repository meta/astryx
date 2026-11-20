---
'@astryxdesign/core': patch
---

[feat] A body row of a data-driven `Table` carries the `table-row` target's `parity` (`data-parity="odd"` for the first, third, … row; `"even"` for the others), and every row an `isStriped` table may stripe (body and footer rows, not the header row) carries its `striped` state, so a theme can style either stripe, for example odd-row striping only where the app stripes: `components: {'table-row': {'parity:odd+striped': {backgroundColor: '#f9f9f9'}, 'parity:even+striped': {backgroundColor: 'transparent'}}}` (the second rule clears Core's own even stripe; in a `hasHover` table it also replaces Core's hover color on those rows, so give the stripe rules a `:hover` of their own to keep one). Core's own stripe stays on even rows and the default look is unchanged. Rows a caller places in a `TableBody` (children mode) carry `striped` but no `parity`. A theme's background on `table-row` (a stripe, or a hover) also reaches a pinned column (`useTableStickyColumns`), whose cells replay the row's fill; Core's theme build now lowers a component's pseudo-class blocks (`:hover`) like its resting rule: derived variables, container padding and `replaces`; pseudo-element blocks stay as written.

@josephfarina
