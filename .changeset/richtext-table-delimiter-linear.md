---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditor: importing Markdown with a long run of spaces on a line that could be a table's delimiter row no longer freezes the page. The check for a table delimiter row now takes linear time; which lines count as delimiter rows is unchanged.

@cixzhang
