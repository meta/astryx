---
'@astryxdesign/core': patch
---

[fix] Markdown: each paragraph, heading, quote and list item lays out in the direction of its own text. A Hebrew or Arabic paragraph in a left-to-right page now starts on the right, and an English paragraph in a right-to-left page starts on the left. A block with no letters, such as digits, punctuation or an image, takes the page's direction from the `InternationalizationProvider`, also inside a quote or list item that reads the other way. Lists, code blocks and tables keep the direction around them too, and the text in each table cell reads in its own direction. Nothing else changes in how a document looks.

@potatowagon @cixzhang
