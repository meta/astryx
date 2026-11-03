---
'@astryxdesign/richtext': patch
---

[feat] In `RichTextEditor`, Cmd+Option+Up and Cmd+Option+Down (Ctrl+Alt+Up and Ctrl+Alt+Down on other platforms) move the block holding the caret past the block above or below it. A list item moves with the items nested under it and stays within its list; any other block moves among the top-level blocks. Each move is one undo step, and a moved block keeps the Markdown it was written in.
@emilyhorsman @ernestt
