---
'@astryxdesign/core': patch
---

[fix] Motion: a spring retarget that the browser commits late, behind a busy main thread, now starts at that frame, from where the element is on screen. Before, it kept the clock of the call, so the element jumped to where the new curve had got to: 42 px back in one frame for a retarget behind a 200 ms block. Motion calls made in one callback now share one clock, so the children of a pager line up after a retarget. A retarget made inside a page's own frame or ResizeObserver callback now shows its new curve one frame later.

@vjeux
