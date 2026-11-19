---
'@astryxdesign/core': patch
---

[fix] Outline: under reduced motion, following a link lands on the heading at once instead of scrolling there, the active indicator moves at once instead of sliding, and a link's hover and current colors change at once. A caller's `aria-label` now names the navigation, in place of `label` and the default name.

@cixzhang
