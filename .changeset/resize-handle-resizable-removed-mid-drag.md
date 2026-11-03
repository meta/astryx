---
'@astryxdesign/core': patch
---

[fix] A `ResizeHandle` whose `resizable` prop goes away in the middle of a drag now ends the drag as it does on unmount: it releases the page's resize cursor and text selection, and the region hears that its gesture is over.

@vjeux
