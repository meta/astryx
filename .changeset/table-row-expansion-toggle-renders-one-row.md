---
'@astryxdesign/core': patch
---

[fix] `useTableRowExpansion`: expanding or collapsing a row no longer re-renders every other row, even when the plugin's callbacks are written inline. On a long table the toggle used to rebuild every row, which froze the page for seconds and could make iOS Safari reload the tab; now only that row's chevron and panel update.

@cixzhang
