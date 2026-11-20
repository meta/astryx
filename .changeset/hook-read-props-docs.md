---
'@astryxdesign/cli': patch
---

[fix] `astryx hook <name>` prints a hook documented with props (such as `useTableSelectionState`, `useTableSelection` and the other Table plugin hooks) in the component read's layout: its description and usage text, its props and its examples, where the default read printed only the title (and, for `useTableSortable`, `useTablePagination` and `useTableInfiniteScroll`, the usage text). The short and brief reads print the component read's description and prop lines, without its import line. The JSON is unchanged.

@josephfarina
