---
'@astryxdesign/core': patch
---

[fix] useScrollableArea: an ancestor's inline `style` change measures the scroll area again only when it changes the axis mapping or the boxes' existence (`direction`, `writing-mode`, `display`, `visibility`, `content-visibility`); a size change still reaches it through the resize observers. A BottomSheet writes its transform, and its scrim's custom property, on every input sample of a drag, and each write forced a full measurement (its computed-style reads and the scroll geometry) in the next frame, a style recalculation and a layout on every frame of the drag.

@imdreamrunner
