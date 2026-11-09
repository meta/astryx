---
'@astryxdesign/richtext': patch
---

[feat] In `RichTextEditor`, Tab and Shift+Tab in a code block indent and outdent every line the selection touches, by the indent the block already uses (a tab when one of its lines starts with a tab, otherwise the fewest leading spaces of any indented line, kept between 2 and 8, otherwise 2 spaces). The selection stays on the same characters and each press is one undo step. Tab used to put a tab character in place of the selection, and Shift+Tab did the same. Escape then Tab still moves focus out of the editor.
@emilyhorsman @ernestt
