---
'@astryxdesign/core': patch
---

[feat] Under a coarse primary pointer, expanding a `TreeList` row glides the rows below it to their new places on the shared layout glide while its children fade in on the same timing, so the tree moves as one. A collapse fades the children out as the rows below glide up, and the chevron turns on that timing. The rows used to appear and leave in a single frame. Without an `animatedLayout` handle the motion stays inside the tree, so content after the tree takes its place at once, and the tree clips its bottom edge while it moves so no row paints over that content; pass a handle for it to glide too. The guide lines beside a group now show and hide with its rows. With reduced motion on and a finger, the children fade in where they land. With a mouse the rows still change at once. Under every pointer, a guide line now ends at the last row it joins instead of running on beside an expanded last row's children.

@vjeux
