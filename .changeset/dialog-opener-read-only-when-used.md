---
'@astryxdesign/core': patch
---

[fix] Opening a full-screen Dialog, or any Dialog under `prefers-reduced-motion: reduce`, no longer reads its opener's position first: those entrances fade in place or do not animate, so the position is not used. A standard Dialog with full motion still enters from its opener's side.

@cixzhang
