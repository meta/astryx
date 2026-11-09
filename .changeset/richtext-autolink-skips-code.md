---
'@astryxdesign/richtext': patch
---

[fix] `RichTextEditorAutoLinkPlugin` no longer turns a URL inside a code block into a link. A URL typed or pasted into a code block, or one in an imported fence, now stays code. Before, the link nested inside the code block, and the exported Markdown fence lost it.

@cixzhang
