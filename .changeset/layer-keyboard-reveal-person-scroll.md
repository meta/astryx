---
'@astryxdesign/core': patch
---

[fix] When the keyboard caps a layer such as a popover, a press, touch or scroll in it right then is no longer undone. On a busy page, the layer could scroll back to the focused field just after. A later keyboard change still brings the field being typed into back into view.

@vjeux
