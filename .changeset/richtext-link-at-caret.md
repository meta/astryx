---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditorToolbar: Insert link with nothing selected did not insert a link at the caret. In an empty paragraph nothing was inserted, and with the caret inside text the whole text around it was linked, while the dialog closed as if it had worked. Now, with the caret outside a link, Insert link inserts the entered URL as link text at the caret; with a non-empty selection it links the selected text, and with the caret inside a link it updates that link, as before.

@cixzhang
