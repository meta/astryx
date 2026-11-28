---
'@astryxdesign/core': patch
---

[fix] Layer: under a finger, a tap or a pan outside a menu acts from the first frame the page draws after the menu's entrance ends, even when the page's timers run late. The input hold no longer covers the page until those timers run.

@vjeux
