---
'@astryxdesign/core': patch
---

[fix] Carousel snap paging: a stop that sits within half a step of the row's end is part of the last page, so a flick, a wheel or a key never rests a pixel short of the end, and a step back from the end moves a full step.

@vjeux
