---
'@astryxdesign/richtext': patch
---

[fix] RichText text reads the way it is written, in either document. A paragraph, heading, quote or list item takes the direction of its own text at any depth, so a Hebrew paragraph in an English document flushes right with its caret following the arrow keys instead of walking backwards, and an English paragraph, list item or table cell in a Hebrew document does the mirror. Each line of a fenced code block reads its own way too, so a Hebrew comment reads right-to-left while `const x = 1;` keeps its semicolon at the end. A container with no direction of its own keeps the document's, and so do a list's markers, a table's columns and a code block's frame.
@potatowagon
