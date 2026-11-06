---
'@astryxdesign/core': patch
---

[fix] `Slider`'s value tooltip stays on its thumb in every frame of a drag and of the coast after a finger lifts. It trailed the thumb by up to 14 px, because it was anchored to a box that moved only when the owner rendered the new value. The tooltip now moves with the thumb by the same translate, and its anchor box keeps its place until the drag ends. (#10228)

@vjeux
