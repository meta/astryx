---
'@astryxdesign/core': patch
---

[fix] On an interactive Item or ListItem row (with onClick, href or a delegated control), the current marker (`aria-current`) is now on the element that takes focus, so a screen reader announces "current" when the row's button or link is focused. Rows whose root takes focus, and rows that are not interactive, keep it on the root. A selected row still carries `data-selected` on its root, and it looks the same.

@josephfarina
