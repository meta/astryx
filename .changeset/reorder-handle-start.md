---
'@astryxdesign/core': patch
---

[feat] A reorderable List row's handle starts the row, before its start content, instead of ending it. Where no pointer is coarse, it stays hidden until its row is hovered or holds the focus, and it hangs 30px before the row's text, so the text keeps its place. The list takes that room from its container's padding, and where the padding is narrower its rows move in by the difference. Under a coarse pointer, under `edge` `'outset'` or `'bleed'`, and after a list marker, it always sits inside the row. Hidden, it keeps its tab stop; reorder mode always shows it.

@ernestt
