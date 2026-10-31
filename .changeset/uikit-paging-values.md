---
'@astryxdesign/core': patch
---

[chore] Internal: UIKit's paging values and math for touch presentations. The thresholds that pick the page a release settles on, the settle that carries it there and `setContentOffset(animated:)` are measured on iOS 26.2 and replayed against the recorded frames to under half a pixel. Not exported from the package entry point.

@vjeux
