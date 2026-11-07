---
'@astryxdesign/core': patch
---

[fix] Once the keyboard caps a layer such as a popover, a scroll a person starts in it afterwards is no longer undone. On a busy page, the layer could scroll back to the focused field just after. A later keyboard change still brings the field being typed into back into view.

@vjeux
