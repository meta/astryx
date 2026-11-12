---
'@astryxdesign/richtext': patch
---

[feat] New opt-in `RichTextEditorLinkPopoverPlugin`, passed through `RichTextEditor`'s `plugins` prop. With the caret in a link while the editor has focus, it shows a popover under the link's line: the address without its scheme (which opens the link in a new tab), then Open in new tab, Edit, and Remove. Edit, or Cmd/Ctrl+K with the caret in a link, shows the same link form as the toolbar's link popover; an empty address removes the link and keeps its text. Escape closes the popover. The popover overlays the document without reflowing it and renders beside the editable text, not inside it. Without the plugin, nothing changes. Only addresses with an `http`, `https`, `mailto`, or `tel` scheme open.

@emilyhorsman @ernestt
