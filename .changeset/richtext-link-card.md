---
'@astryxdesign/richtext': patch
---

[feat] `RichTextEditorToolbar` shows a card for a link while the editor is editable: under the link holding the caret, or the one the pointer rests on for 300 ms. It shows the address without its scheme, which opens the link in a new tab, and Open in new tab, Edit, and Remove buttons, plus a reminder that Cmd-click (Ctrl-click off Apple platforms) opens a link. Edit turns the card into Text and Link fields: Enter applies both as one undo step, new text keeps the format of the link's first run, and an empty address removes the link and keeps its text. Cmd/Ctrl+K with the caret in a link opens Edit; elsewhere it still opens the link popover.

The card overlays the document without reflowing it, renders beside the editable text rather than inside it, and comes with the toolbar, with no new prop. In an editable editor, Cmd/Ctrl-click opens a link, and a link shows the pointer cursor only while that key is held over it. Read-only and disabled editors keep their links as they were. `promptForUrl` replaces the card as it replaces the popover. Only addresses with an `http`, `https`, `mailto`, or `tel` scheme open.

`RICHTEXT_ICON_KEYS` gains `openLink` and `editLink` (`richtext:openLink`, `richtext:editLink`).

@emilyhorsman @ernestt
