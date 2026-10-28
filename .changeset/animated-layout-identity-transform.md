---
'@astryxdesign/core': patch
---

[fix] With an `animatedLayout` handle, content after a change now glides even when it keeps a transform that leaves it in place. A resting Button (`scale(1)`, computed as `matrix(1, 0, 0, 1, 0, 0)`), a pressed one (`scale(0.98)`) and a row with swipe actions at rest (`translate3d(0, 0, 0)`) used to jump to their new place as if the app were moving them, and a pressed button jumped onto the button gliding beside it. A row a swipe holds open, or anything the app translates or rotates, is still left to the app.

@vjeux
