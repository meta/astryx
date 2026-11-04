---
'@astryxdesign/core': patch
---

[fix] A text selection that an action's own handlers make when a claimed mouse or pen press lifts on it now stays. Before, the drag's selection hold put the press's selection back over it. When the handlers change nothing, the press's selection still comes back, as before. (#9848)

@vjeux
