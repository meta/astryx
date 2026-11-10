---
'@astryxdesign/core': patch
---

[fix] ContextMenu closes on an outside press through the layer's outside-press watch. A mouse or pen press closes it at its `mousedown`, in the menu's own document, so a menu in an iframe or a Picture-in-Picture window no longer closes on a press in the page.

@vjeux
