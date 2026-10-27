---
'@astryxdesign/richtext': patch
---

[feat] New `RichTextEditorSelectionToolbar`, rendered in `RichTextEditor`'s `plugins` slot, shows formatting beside a non-collapsed selection while the editor is editable: bold, italic, underline, strikethrough, inline code, and Link, with the same commands, glyphs, and link popover as `RichTextEditorToolbar`, then any `endContent`. It never takes focus when it appears. Alt+F10 (⌥F10) moves focus into it, arrow keys move along it, and Escape returns focus to the editor with the selection kept. It overlays the document beside the editable text without reflowing it, and read-only and disabled editors show none.

Props: `formats` picks and orders the formats, `hasLink` and `hasNewTabLinks` match the toolbar's, `label` names it, and it takes base props and a `ref` as the toolbar does. `presentation` (`'adaptive'` by default) docks it to the bottom of the visual viewport under a coarse pointer and floats it otherwise; `'floating'` and `'docked'` keep one surface on every device.

`RichTextEditorToolbar` is unchanged; its link popover and inline formats now come from code it shares with the new toolbar.

@emilyhorsman @ernestt
