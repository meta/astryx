---
'@astryxdesign/core': patch
---

[feat] Popover and `usePopover` take `anchorOutOfView`. With `'hide'`, a popover whose anchor scrolls out of view (out of the viewport or out of a scrolling panel) is hidden and takes no pointer input until the anchor returns, so it no longer floats over unrelated content. It stays open the whole time. `'hold'` (the default) keeps today's behavior.

@nynexman4464
