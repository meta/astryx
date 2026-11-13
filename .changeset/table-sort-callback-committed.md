---
'@astryxdesign/core': patch
---

[fix] Table: `useTableSortableState` calls the `onSortChange` of the last committed render. Before, a sort click during a transition that had not committed yet called the callback from that pending render.

@cixzhang
