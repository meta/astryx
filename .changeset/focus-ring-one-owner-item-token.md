---
'@astryxdesign/core': patch
---

[fix] Focusing a control inside an `Item` (an action in `startContent` or `endContent`) or a `Token`'s remove button no longer also rings the whole row or token: each tab stop shows one focus ring. A row or token rings only for its own action, and a row without one draws no ring.

@cixzhang
