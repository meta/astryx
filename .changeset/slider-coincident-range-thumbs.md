---
'@astryxdesign/core': patch
---

[fix] Slider: a range slider whose two thumbs sit on the same value can be dragged apart again. Only one of the two thumbs can travel toward where the pointer goes: a press on the track beside them picks the thumb on its side, and a press on the thumbs themselves waits for the pointer to move, so the direction of that first movement picks the thumb, which takes the drag's focus, pressed paint and value tooltip. Such a drag always follows the pointer: once the pointer passes the other thumb, the dragged thumb stops against it and the other one takes the drag, so a first step that drifts the wrong way never sticks it. Before, two thumbs at the maximum could not be dragged down, and a press on the track above two coincident thumbs moved neither.

@vjeux
