---
'@astryxdesign/core': patch
---

[chore] Internal: the UIKit constants table gains UIScrollView zooming for a photo viewer, measured on iOS 26.2. It holds the give past the zoom limits, the settle's eased curve and length law, and Photos' aspect-fill double tap and maximum zoom. The zoom stage geometry that Lightbox's touch zoom is built on comes with it. Neither is exported from the package entry point, and no component reads them yet.

@vjeux
