---
'@astryxdesign/core': patch
---

[feat] Table: a sortable column's sort indicator resolves its glyph through the `table-sort-indicator` component icon slot with state `{direction}` (`'ascending' | 'descending' | 'none'`). With no theme entry it draws `arrowUp`, `arrowDown`, or `arrowsUpDown`, as before. A theme maps it with `defineTheme({componentIcons: {'table-sort-indicator': …}})`; `null` hides only the glyph, and the sort control keeps its label, its sorting, and the header's `aria-sort`.

@imdreamrunner
