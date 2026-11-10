---
'@astryxdesign/core': patch
---

[fix] Motion: in WebKit on Linux, the last frame of an `animatedLayout` change shows where each motion ends once a frame has drawn the motion near its end. Under load, that frame, and every frame of a long task over its end, could show a glide, an exit's fade or an indicator's turn part of the way through: a collapsing `TreeList` drew the rows below 44 px back, its leaving rows half faded and its chevron mid-turn. A long task that starts before that frame, or a motion near its end only at its last keyframe, can still show it. At normal speed the motion is unchanged.

@vjeux
