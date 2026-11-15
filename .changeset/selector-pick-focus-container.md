---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector: a pick in the list, or a press on a focusable container around it, returns focus to the trigger again. Before, when the list sat inside a container with `tabIndex={-1}`, such as a dialog's content box, the press moved focus to that container and focus stayed there, so keyboard and screen-reader users lost their place. A press on another field still leaves focus in that field.

@vjeux
