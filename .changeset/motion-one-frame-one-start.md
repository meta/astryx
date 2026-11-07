---
'@astryxdesign/core': patch
---

[fix] Motion: elements whose motions start in the same frame now start them at one time. Before, each element took its own reading of the clock in that frame, so items moving together, such as a carousel's pages as they settle, could start apart by as long as the frame callbacks between them ran.

@vjeux
