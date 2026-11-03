---
'@astryxdesign/richtext': patch
---

[feat] RichTextEditor takes `hasCellMerge`, so a surface that stores Lexical editor state can keep merged table cells. It stays off by default: GFM tables cannot express a merged cell, so a document that round-trips through Markdown loses the merge, and the editor un-merges a merged table on open as it does today. Turn it on where un-merging a table the author merged would be data loss.

Verify: with the prop unset, a merged table cell is still un-merged on open; with `hasCellMerge`, it survives.

@potatowagon
