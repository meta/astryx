---
'@astryxdesign/core': patch
---

[feat] `usePopover` takes `anchorOutOfViewBehavior`. With `'hideWhileOutOfView'`, a popover whose anchor scrolls out of view (out of the viewport or out of a scrolling panel) or leaves the page is hidden and takes no pointer input until the anchor returns, so it no longer floats over unrelated content. It stays open the whole time. `'stay'` (the default) keeps today's behavior.

@nynexman4464
