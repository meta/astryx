---
'@astryxdesign/core': patch
---

[fix] `defineTheme({extends})` defines a base written as a plain theme object (light/dark pairs, typography, its own `extends`) the way it defines its own input before merging it, so a pair builds `light-dark(…)` instead of `#fff,#000`. A base from `defineTheme()` merges as before.

@josephfarina
