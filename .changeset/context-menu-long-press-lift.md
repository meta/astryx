---
'@astryxdesign/core': patch
---

[fix] A ContextMenu opened by a finger's long press stays open as the finger lifts: the compatibility `mousedown` the browser sends for that press as it lifts no longer reads as a press outside. Every other press outside the menu closes it, or leaves it open, as before.

@vjeux
