---
'@astryxdesign/core': patch
---

[fix] Under a finger or a pen, holding the box of a CheckboxInput, a CheckboxList row, a RadioList option or a Switch no longer selects the text beside it, and lifting it activates the control as a tap does. On iOS such a hold selected the label's text and, except on a Switch, toggled nothing. A long press that opens a ContextMenu or runs a row's own long press no longer also toggles a box under it, and a row that opens its own menu from its contextmenu keeps its box unchanged. A long press on the label still selects its text, and a mouse is unchanged. (#10091)

@vjeux
