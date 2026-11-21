---
'@astryxdesign/core': patch
---

[fix] A clickable `Token` passes a caller's `aria-pressed` to its inner button, so a filter chip can expose a pressed toggle to screen readers. Before, `aria-pressed` landed on the outer container, which has no role, and assistive technology ignored it.

@cixzhang
