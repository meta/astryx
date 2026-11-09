---
'@astryxdesign/core': patch
---

[chore] Internal: the layer's outside-press watch can follow chosen pointer types, close as a press that starts outside begins to pan (on either axis, at core's pan threshold) or when the browser takes it, and judge a press inside a closed shadow root, which the document sees as its host. No component passes these options yet, so every watch keeps today's behavior. Not exported from the package entry point.

@vjeux
