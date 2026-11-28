---
'@astryxdesign/core': patch
---

[fix] DateInput: with the native date picker, a caller's `dir` now also sets the direction of the drawn date, the text shown over the field. Before, the field took the caller's `dir` but the drawn date kept the locale's direction, so the two disagreed. Without a caller `dir`, a date still reads in its locale's direction.

@cixzhang
