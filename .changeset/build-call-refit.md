---
'@astryxdesign/cli': patch
---

[fix] `astryx build` calls page or app shell with a refit word table and new blend numbers. The weights file stores that table once: the pick model reads the call model's tables when it carries none of its own.

@josephfarina
