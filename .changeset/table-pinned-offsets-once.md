---
'@astryxdesign/core': patch
---

[fix] Table: with pinned columns, a render computes the pinned offsets once instead of once per cell, so a wide table with many columns renders faster.

@cixzhang
