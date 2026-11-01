---
'@astryxdesign/core': patch
---

[fix] A finger's tap that a DropdownMenu (or any menu on the press model) tracks now cancels that touch's `touchend`, on every device, so the browser sends no click and no compatibility mouse events for it (`spec:AST-094` FR21, FR43). Before, a busy main thread could hold that click past the 400 ms stray-click window, and after a tap that drilled into a sub-menu it picked the sub-menu row that had come under the finger and closed the menu. A mouse or pen release keeps the 400 ms window.

@vjeux
