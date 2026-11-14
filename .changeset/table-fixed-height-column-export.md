---
'@astryxdesign/core': patch
---

[fix] Export `registerFixedHeightColumn` from the Table entry points so a custom `renderCell` column with a uniform row pitch can opt into row virtualization. Variable-height custom renderers remain on the safe full-render path.

@bezabyte
