---
'@astryxdesign/core': patch
---

[chore] Internal: UIKit's paging values and math for touch presentations, measured on iOS 26.2: the thresholds that pick the page a release settles on, the settle that carries it there and `setContentOffset(animated:)`. The settle and `setContentOffset(animated:)` replay the recorded frames to under half a pixel. The unused projection rule (`selectPage` and `scroll.paging`) is gone, so the measured thresholds are the one paging rule. Not exported from the package entry point.

@vjeux
