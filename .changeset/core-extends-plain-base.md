---
'@astryxdesign/core': patch
---

[fix] `defineTheme({extends})` refuses a base written as a plain theme object (a name and tokens, not built by `defineTheme()`) with the named "`extends` must be a theme from defineTheme()" error. Before, it merged the object's raw values, so a light/dark pair was written as `#fff,#000`. A base from `defineTheme()` or a built theme module merges as before.

@josephfarina
