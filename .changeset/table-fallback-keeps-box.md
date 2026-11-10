---
'@astryxdesign/core': patch
---

[fix] A Table given `useTableRowsVirtualization` keeps the height its parent gives it when windowing falls back, for example for wrapped text. The fallback still renders every row, now inside the parent's height in a scroll area, instead of growing past it.

@humbertovirtudes
