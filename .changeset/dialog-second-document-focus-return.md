---
'@astryxdesign/core': patch
---

[fix] A `Dialog` rendered into a same-origin iframe through a portal now returns focus, when it closes, to the control in the iframe that opened it, as it does in the page.
@vjeux
