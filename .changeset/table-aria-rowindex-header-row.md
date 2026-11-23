---
'@astryxdesign/core': patch
---

[fix] Table: with `rowIndexStart` or `rowCount`, the header row now counts in ARIA row indexing. The header row gets `aria-rowindex="1"`, body rows start after it, and `aria-rowcount` is `rowCount` plus the header row. `rowIndexStart` and `rowCount` stay in body-row units.

Before, body rows were numbered from `rowIndexStart`, `aria-rowcount` equaled `rowCount`, and the header row had no `aria-rowindex`, so assistive technology announced every row position and the total one too low. This follows WAI-ARIA 1.2 `aria-rowindex` and `aria-rowcount`, which count header rows.

@wbaha
