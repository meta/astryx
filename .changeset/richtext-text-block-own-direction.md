---
'@astryxdesign/richtext': patch
---

[fix] A RichText block whose own text is strongly right-to-left now reads right-to-left wherever it sits, so a Hebrew paragraph in an English document flushes right and its caret follows the arrow keys instead of walking backwards. Every other block, and every part of a table, still takes the document's direction.
@potatowagon
