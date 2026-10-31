---
'@astryxdesign/core': patch
---

[fix] A `Table` column-resize handle is named by its column's visible text when the header is a node, such as `<span>Amount (EUR)</span>`, instead of by the column key. The key remains the fallback only for a header with no text.

@cixzhang @duytbp
