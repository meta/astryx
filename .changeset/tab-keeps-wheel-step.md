---
'@astryxdesign/core': patch
---

[fix] Under a mouse, a key that cannot scroll a DateInput, TimeInput or DateTimeInput wheel, as Tab, no longer ends the wheel's key step. On a busy page, Tab right after an arrow key could commit the row the wheel was leaving.

@vjeux
