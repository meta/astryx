---
'@astryxdesign/core': patch
---

[fix] In iOS Safari, a tap that wobbles less than 5 px on content under a scroll-edge pan keeps its click. The pan now holds the finger only once it has moved 5 px along its axis. In Lab, in iOS Safari, a tap on a pushed NavigationStack screen that drifts less than 5 px toward the back swipe now runs; one that drifts 5 px or more toward it still loses its click.

@vjeux
