---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] useLinkify and RichTextEditorAutoLinkPlugin: email detection now takes linear time. A long word with no email in it, such as a pasted hash or base64 string, no longer freezes the page for seconds. Valid email addresses link as before, except in the rich-text editor: an address directly after a period no longer links, and a quoted local part ends at the next quote.

@ChenyangLi4288 @cixzhang
