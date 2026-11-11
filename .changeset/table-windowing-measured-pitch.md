---
'@astryxdesign/core': patch
---

[fix] A windowed Table keeps windowing when a text-size, zoom or theme change makes every row taller than `rowHeight`. It windows at the height the rows measure, instead of rendering every row, and warns in development. Rows of unequal height still render every row.

@humbertovirtudes
