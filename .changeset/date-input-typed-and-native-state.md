---
'@astryxdesign/core': patch
---

[fix] DateInput keeps its typed field's and native field's bookkeeping in state. A render React discards, as a suspended transition does, no longer drops typed text, clears a refused date, or reports the same date twice.

@vjeux
