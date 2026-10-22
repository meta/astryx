---
'@astryxdesign/richtext': patch
---

[fix] A RichText paragraph, heading, quote or list item now reads the way its own text reads, at any depth: a Hebrew paragraph in an English document flushes right and its caret follows the arrow keys instead of walking backwards, an English paragraph in a Hebrew document does the mirror, and an English list item or table cell in a right-to-left document no longer flushes right with its arrow keys reversed. A container with no direction of its own — digits, punctuation, an image, an empty line — keeps the document's, and so do a list, a table and a fenced code block, whose markers, columns and lines are ordered by the document.
@potatowagon
