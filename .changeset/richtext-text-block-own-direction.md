---
'@astryxdesign/richtext': patch
---

[fix] A RichText block now reads the way its own text reads, in either document: a Hebrew paragraph in an English document flushes right and its caret follows the arrow keys instead of walking backwards, and an English paragraph in a Hebrew document does the mirror. A block with no direction of its own — digits, punctuation, an image, an empty line — and every part of a table still follow the document, so a column keeps its order and an empty line keeps its caret on the document's start edge.
@potatowagon
