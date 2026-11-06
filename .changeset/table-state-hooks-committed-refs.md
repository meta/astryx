---
'@astryxdesign/core': patch
---

[fix] `useTableSelectionState`, `useTableTreeState`, `useTableColumnSettingsState` and `useTableColumnResize` read their latest values as last committed. A render that React discards, as a suspended transition does, no longer reaches their handlers. "Select all rows" now selects the rows on screen, not those of a page still loading. A row's expand toggle, a column toggle and a keyboard resize also start from what is on screen. (#10176)

@vjeux
