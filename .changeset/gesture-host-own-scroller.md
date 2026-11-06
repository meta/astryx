---
'@astryxdesign/core': patch
---

[fix] Gestures: a pan on its own scroller takes a trackpad's scroll on the axis its touch-action keeps, as it takes a finger's; a scroller inside it still takes the wheel first. A recognizer attached with `manageStyle: false` leaves the element's styles to its caller for that recognizer only.

@vjeux
