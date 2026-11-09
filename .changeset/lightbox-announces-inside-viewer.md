---
'@astryxdesign/core': patch
---

[fix] `Lightbox`: a screen reader now hears the viewer's own messages while it is open. Moving to another item ("Mountain lake, 2 of 4") and zooming in or out are announced inside the open viewer; before, they went to the page behind the modal viewer, where a screen reader does not read them. The `0` key now returns a zoomed photo to its fitted size. The docs list the `0` key, and no longer say that the lightbox is only for images.

@cixzhang
