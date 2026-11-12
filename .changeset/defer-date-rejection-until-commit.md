---
'@astryxdesign/core': patch
---

[fix] DateInput and DateTimeInput support opt-in `entryErrorBehavior="blur-or-enter"`, holding typed date rejection signals until Enter or blur while preserving the existing `complete` default.

@bezabyte
