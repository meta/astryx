---
'@astryxdesign/core': patch
---

[fix] DateTimeInput keeps its native pickers' last value and commit epoch in state. A render React discards, as a suspended transition does, no longer drops a time chosen before the date, clears a refused date or time, or lets the same native edit commit twice.

@vjeux
