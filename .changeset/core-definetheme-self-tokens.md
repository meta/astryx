---
'@astryxdesign/core': patch
---

[fix] `defineTheme` names a token map that holds itself ("tokens refers to itself: the value of self holds an object it sits in …") instead of recursing until the call stack overflows, when the theme extends one with adaptations. Themes whose tokens hold no such loop build as before.

@josephfarina
