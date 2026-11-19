---
'@astryxdesign/core': patch
---

[fix] Outline: on a page whose `<html>` sets an overflow, such as `html { overflow-y: scroll }` or `html { overflow-x: hidden }`, the current heading now follows the page scroll, a link press with `offset` lands its heading below the fixed header, and `onNavigateEnd` fires when the scroll ends. The outline used to take `<html>` as its scroll container, but the page scroll reports to the window, so the current heading stayed on the first one and an `offset` landing overshot by the scroll position.

@oyobbeb
