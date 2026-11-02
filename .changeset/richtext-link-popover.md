---
'@astryxdesign/richtext': patch
---

[feat] `RichTextEditorToolbar`'s Link button, and Cmd/Ctrl+K in the editor, open a popover anchored to the button instead of a modal dialog. The popover holds one URL field, applied with Enter, and Apply, Remove (when the selection is in a link), and Cancel icon buttons with tooltips. It is not modal: Escape or Cancel closes it and returns focus and the selection to the editor, and a URL that cannot be linked shows an error under the field, which keeps focus. The URL rules (`sanitizeUrl`), `hasNewTabLinks`, and `promptForUrl` are unchanged; with `promptForUrl` the Link button opens no popover, as it opened no dialog.

`RICHTEXT_ICON_KEYS` gains `applyLink`, `removeLink`, and `cancel` (`richtext:applyLink`, `richtext:removeLink`, `richtext:cancel`), so a theme can restyle the popover's glyphs as it restyles the toolbar's.

@emilyhorsman @ernestt
