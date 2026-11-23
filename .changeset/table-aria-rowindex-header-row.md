---
'@astryxdesign/core': patch
---

[fix] Table: with `rowIndexStart` or `rowCount`, the header row now counts in ARIA row indexing. The header row gets `aria-rowindex="1"`, body rows start after it, and `aria-rowcount` is `rowCount` plus the header row. `rowIndexStart` and `rowCount` stay in body-row units.

@wbaha
