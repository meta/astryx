---
'@astryxdesign/core': patch
---

[chore] Internal: ContextMenu's touch model uses the layer's outside-press watch. It closes the touch menu as a press outside begins to pan, and judges a mouse or pen press at its `mousedown` (`pressTypes`), in the menu's own document. Every other watch keeps today's behavior. Not exported from the package entry point.

@vjeux
