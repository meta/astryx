---
'@astryxdesign/core': patch
---

[fix] A toast shown while a modal `Drawer` is open now appears inside the drawer, above it, and can be pressed and reached with Tab, as it already does over a `Dialog` or a `BottomSheet`. Before, the toast stayed outside the drawer's modal dialog: it was inert there (a press on Undo did nothing, and Tab never reached it), and a wide drawer hid it completely. Toasts go back to the page as the drawer starts to close. A drawer without a scrim is unchanged.

@cixzhang @duytbp
