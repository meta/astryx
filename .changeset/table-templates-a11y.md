---
'@astryxdesign/cli': patch
---

[fix] The table page templates read correctly to screen readers: pages without an app shell mark their content as the main landmark, `table-tree`'s sidebar headings follow the page heading without skipping a level, and the icon-only status and actions columns in `table` and `table-grouped` get visually hidden header names. No visual change.

@josephfarina
