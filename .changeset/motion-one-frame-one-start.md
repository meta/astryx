---
'@astryxdesign/core': patch
---

[fix] Motion: elements that start moving from rest in the same frame now start at one time. Before, each element took its own reading of the clock in that frame, so items starting together, such as a carousel's pages as they settle, could start apart by as long as the frame callbacks between them ran.

@vjeux
