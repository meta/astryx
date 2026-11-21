---
'@astryxdesign/core': patch
---

[docs] Table's `columns` prop now names the supported ways to open a row's details: a Link or Button in the row's main cell (renderCell) opens a dialog, side panel or detail page, and `useTableRowExpansion` with `hasRowClickExpansion` shows a row's details inline on a click anywhere on it. Table has no onRowClick prop. No API or behavior changes.

@josephfarina
