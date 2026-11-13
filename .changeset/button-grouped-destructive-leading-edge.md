---
'@astryxdesign/core': patch
---

[fix] In forced colors, a `destructive` Button in a ButtonGroup now draws the divider before it in `CanvasText`, like its other edges. Before, that edge took the system's default border colour in the published package, while other builds drew it in `CanvasText`.

@cixzhang
