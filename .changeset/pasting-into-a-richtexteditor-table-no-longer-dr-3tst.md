---
'@astryxdesign/richtext': patch
---

[fix] Pasting into a `RichTextEditor` table no longer drops the paste or empties cells. A pasted table fills the cells one by one from the caret's cell, or within the selected cells. A merged cell in it fills only the cell where it starts instead of emptying the cells it covered, and a table whose rows differ in length arrives whole. A table pasted together with other content, as a web page copies it, goes into the cell as text instead of being discarded.
@emilyhorsman @ernestt
