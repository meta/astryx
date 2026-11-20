---
'@astryxdesign/core': patch
---

[fix] On an interactive Item or ListItem row (with onClick, href or a delegated control), the current marker (`aria-current`) is now on the element that takes focus, so a screen reader announces "current" when the row's button or link is focused. Before, it sat on the row's root, so a screen reader did not announce it on the focused button or link (WCAG 2.2 SC 4.1.2, Name, Role, Value). Rows whose root takes focus, and rows that are not interactive, keep it on the root. A selected row still carries `data-selected` on its root and looks the same at rest; while it slides past other rows, a selected row now keeps its fill whatever its `aria-current` value.

@josephfarina
