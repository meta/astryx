---
'@astryxdesign/core': patch
---

[fix] Slider keeps a caller's `aria-labelledby`. The thumb of a single slider and the group of a range slider always replaced it with the label id, so the caller's ids never reached the accessible name. The control is now named by its label and then the caller's ids, the same order RadioList and TimeInput use.

@kyu-rong
