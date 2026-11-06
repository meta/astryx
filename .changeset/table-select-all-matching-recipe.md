---
'@astryxdesign/core': patch
---

[docs] `TableSelectionToolbar` documents how to select every row that matches a query across server pages with today's API: the app keeps "every matching row minus exclusions" and passes the toolbar its own count and label. In this mode the toolbar's `selectedKeys` holds only the loaded rows.

@cixzhang
