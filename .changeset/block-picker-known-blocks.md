---
'@astryxdesign/cli': patch
---

[fix] `astryx build`'s block picker counts every block its doc-side word weights were fitted with as known, so those blocks no longer get the head start the picker gives blocks it has never seen.

@josephfarina
