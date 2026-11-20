---
'@astryxdesign/core': patch
---

[docs] Table's `columns` prop now gives both ways to open a row: from a Link or Button in the main cell, or with a click anywhere on the row through a plugin's `transformBodyRow`. The plugin skips clicks on cell controls and text selections, and the Link or Button stays the keyboard and screen-reader path. A new example shows the whole-row version. No API or behavior changes.

@josephfarina
