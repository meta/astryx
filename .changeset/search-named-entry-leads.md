---
'@astryxdesign/cli': patch
---

[fix] Search: a match whose name of two or more words the query writes as one word now comes first, also inside a longer query. `astryx search "TableSortableTable with pagination"`, `astryx search "table-sortable-table with pagination"` and `astryx search "tokens-color for dark mode"` list that block or doc first. Words written apart stay plain words (`astryx search "multiline text input"` keeps its order), and so does a one-word name such as `card`. A name inside a longer name the query holds, such as a block's display name or a doc's title, does not come first. Matches, scores, reasons and counts are unchanged; `build` is unchanged.

@josephfarina
