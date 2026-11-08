---
'@astryxdesign/core': patch
---

[fix] Motion: in WebKit, the last frame of an `animatedLayout` change now shows where each of its motions ends. Under load, Safari could draw that frame, and every frame of a long task over its end, with a glide, a fade or an indicator's turn part of the way through: a collapsing `TreeList` showed the rows below 44 px back, its leaving rows half faded and its chevron mid-turn. At normal speed the motion is unchanged.

@vjeux
