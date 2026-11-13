---
'@astryxdesign/richtext': patch
---

[feat] `RichTextEditorToolbar`'s Link button, and Cmd/Ctrl+K in the editor, open a popover anchored to the button instead of a modal dialog. The popover holds one URL field, applied with Enter, and Apply, Remove (when the selection is in a link), and Cancel icon buttons with tooltips. It is not modal: Escape or Cancel closes it and returns focus and the selection to the editor, and a URL that cannot be linked shows an error under the field, which keeps focus. The URL rules (`sanitizeUrl`), `hasNewTabLinks`, and `promptForUrl` are unchanged; with `promptForUrl` the Link button opens no popover, as it opened no dialog.

The popover opens above the toolbar and flips below it only when there is no room above. Apply and Cancel use the shared `check` and `close` icons, so a theme that restyles those icons restyles them too; Remove's glyph is fixed artwork. `RICHTEXT_ICON_KEYS` is unchanged.

@emilyhorsman @ernestt
