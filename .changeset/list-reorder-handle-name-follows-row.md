---
'@astryxdesign/core': patch
---

[fix] When a reorderable `List` row does not render again, its handle's name still follows it. A handle named after its place ("Reorder item N") follows that place when rows above it go or the rows reorder. A label that gains or loses its text renames the handle.

@vjeux
