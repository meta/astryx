---
'@astryxdesign/richtext': patch
---

[fix] A RichText paragraph, heading or quote now reads the way its own text reads: a Hebrew paragraph in an English document flushes right and its caret follows the arrow keys instead of walking backwards, and an English paragraph in a Hebrew document does the mirror. A block with no direction of its own — digits, punctuation, an image, an empty line — keeps the document's, and so do a list, a fenced code block and every part of a table, whose lines and columns are each read on their own terms.
@potatowagon
