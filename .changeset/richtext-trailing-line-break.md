---
'@astryxdesign/richtext': patch
---

[fix] A line break typed with Shift+Enter at the end of a paragraph, list item or quote no longer saves as a backslash that comes back as a literal `\` the next time the Markdown loads. Markdown has no line break at the end of a block, so the editor leaves it out of the Markdown; a line break inside a block still saves and loads as a line break.

@cixzhang
