---
'@astryxdesign/core': patch
---

[fix] Table: a row expansion panel with `panelVariant="muted"` now paints its wash on its cell, so with an `animatedLayout` handle the wash slides in with the panel's content. On iOS Safari the panel's edge trailed the rows gliding below it for a few frames; now they stay together. At rest the panel looks the same.

@vjeux
