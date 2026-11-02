---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditorToolbar: Insert link with nothing selected added no link. In an empty paragraph nothing was inserted, and with the caret inside text the whole text around it was linked, while the dialog closed as if it had worked. Now, with a collapsed selection, Insert link inserts the entered URL as link text at the caret; with a non-empty selection it links the selected text, as before.

@cixzhang
