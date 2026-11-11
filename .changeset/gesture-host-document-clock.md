---
'@astryxdesign/core': patch
---

[fix] Gestures in a same-origin iframe or a Picture-in-Picture window now time touches on that window's own clock. Before, a short tap there could start a long press, because the page's clock reads ahead of the window's.

@vjeux
