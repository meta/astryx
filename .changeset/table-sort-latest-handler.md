---
'@astryxdesign/core': patch
---

[fix] Table sorting with `useTableSortableState` calls the latest `onSortChange`. Before, a sort header kept the handler from the last time the sort changed, so a parent that passed a new handler without a sort change had its old handler called, and that handler saw out-of-date state.

@cixzhang
