---
'@astryxdesign/core': patch
---

[perf] A scrollable area measures once as it mounts. The content box's first resize notification arrives with the viewport's, and the first measurement already reads it, so it no longer schedules a second full measurement for the next frame. A later content resize still measures.

@bstcoc
