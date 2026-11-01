---
'@astryxdesign/richtext': patch
---

[feat] `RichTextEditor` and `RichTextView` take `hasCellMerge`, so content made elsewhere keeps its merged table cells. A table cell can span columns or rows (`colSpan`, `rowSpan`); both surfaces split such a cell into single cells as the content loads, and with `hasCellMerge` they keep it merged. It defaults to `false`, so existing content opens as before. Markdown has no merged cells: `getMarkdown()` and `editorStateJSONToMarkdown` write a merged table as GFM with every row at the full column count, each merged cell's content in its top-left cell and the cells it covers empty, so every cell stays in its column when the Markdown is read.
@emilyhorsman @ernestt
