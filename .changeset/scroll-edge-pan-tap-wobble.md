---
'@astryxdesign/core': patch
---

[fix] A tap that wobbles a few pixels on content under a scroll-edge pan keeps its click. The pan now holds the finger only once it has moved 5 px along its axis, so in Lab, a tap on a pushed NavigationStack screen that drifts toward the back swipe still runs.

@vjeux
