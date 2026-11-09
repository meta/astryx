---
'@astryxdesign/core': patch
---

[perf] useTableRowIndex builds its number column once per plugin, so a parent re-render no longer re-renders every row of a table that shows row numbers.

@humbertovirtudes
