---
'@astryxdesign/richtext': patch
---

[feat] New `RichTextEditorSelectionToolbar`, rendered in `RichTextEditor`'s `plugins` slot, shows formatting beside a non-collapsed selection while the editor is editable: bold, italic, underline, strikethrough, inline code, and Link, with the same commands, glyphs, and link popover as `RichTextEditorToolbar`, then any `endContent`. It never takes focus when it appears. Alt+F10 (⌥F10) moves focus into it, arrow keys move along it, and Escape returns focus to the editor with the selection kept. It sits beside the selection as an anchored layer: it overlays the document without reflowing it, scrolls with the text, is never clipped by the field, and hides while the selection is scrolled out of view. Read-only and disabled editors show none.

Props: `formats` picks and orders the formats, `hasLink` and `hasNewTabLinks` match the toolbar's, `label` names it, and it takes base props and a `ref` as the toolbar does.

`RichTextEditorToolbar` is unchanged; its link popover and inline formats now come from code it shares with the new toolbar.

@emilyhorsman @ernestt @cixzhang
