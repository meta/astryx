---
'@astryxdesign/core': patch
---

[fix] TableTree rows no longer carry `aria-expanded`, which is valid on a row only in a treegrid. Each row's expand and collapse button still exposes its expanded state, and rows keep `aria-level` for their depth.

@cixzhang
