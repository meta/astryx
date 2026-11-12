---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditor: importing Markdown no longer freezes the page on a block that has a backtick and, below its first line, a line with a `|`, a dash and a long run of spaces. The check for a table delimiter row now takes linear time; which lines count as delimiter rows is unchanged.

@cixzhang
