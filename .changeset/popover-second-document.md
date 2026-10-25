---
'@astryxdesign/core': patch
---

[fix] A `Popover` rendered into a second document through a portal, such as a same-origin iframe or a Document Picture-in-Picture window, now focuses its first control on open, keeps Tab inside, closes on Escape, and returns focus to its trigger, as it does in the page. Its trigger there stays the popover's invoker `source`.

@vjeux
