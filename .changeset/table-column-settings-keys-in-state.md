---
'@astryxdesign/core': patch
---

[fix] Table's column settings plugin keeps its active columns in state. When the table re-renders on its own after a render React discards, such as a suspended transition, it shows the committed columns.

@vjeux
