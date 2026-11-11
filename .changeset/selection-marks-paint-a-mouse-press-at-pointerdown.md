---
'@astryxdesign/core': patch
---

[feat] Where the primary pointer is fine, a mouse press on a CheckboxInput or a RadioList option paints at once on `pointerdown` and fades on release, as a finger's press does, instead of the browser's `:active`. A right click, or a press on a link or a button inside a RadioList option, does not paint the option. Other controls keep `:active` for a mouse.

@vjeux
