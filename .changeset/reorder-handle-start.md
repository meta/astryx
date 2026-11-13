---
'@astryxdesign/core': patch
---

[feat] A reorderable List row's handle starts the row, before its start content, instead of ending it. Where no pointer is coarse, it stays hidden until its row is hovered or holds the focus, and it hangs before the row's text, so the text keeps its place: leave about 24px of room before a reorderable list. Under a coarse pointer it always shows, inside the row. Hidden, it keeps its tab stop; reorder mode always shows it.

@ernestt
