---
'@astryxdesign/core': patch
---

[fix] `BottomSheet`: opening a modal sheet no longer moves the page where the visual viewport can scroll, as on a zoomed-in page. Before, the browser scrolled the entering sheet into view as it focused it, and the page jumped. Focus still lands where it did.

@vjeux
