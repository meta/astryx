---
'@astryxdesign/core': patch
---

[fix] `useTableSortableState` sorts only when its data, sort or locale changes. It re-sorted every row on every render of its owner.

@vjeux
