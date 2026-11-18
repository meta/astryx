---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` leaves `autofocus` out of the file's first paint. The page's script owns focus once it draws the page, as the app does, so a field the page focuses still gets focus. A viewer that shows the file in a cross-origin frame no longer logs a blocked-autofocus error.

@josephfarina
