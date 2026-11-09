---
'@astryxdesign/core': patch
---

[perf] Under a finger, Popover plays its growth on the surface inside the layer, not on the anchored layer. Chromium restyles the growth's animations twice as they start and once as they end, and each restyle laid the anchored layer out twice, its backdrop included. Under load those layouts landed inside the growth. The popover looks the same.

@vjeux
