---
'@astryxdesign/core': patch
---

[fix] Dialog, AlertDialog, Drawer, Popover, HoverCard, BottomSheet and MobileNav paint the theme's primary text color on their surfaces. Before, text that inherited its color, such as a plain `<label>`, `<textarea>` or text node, took the browser's `CanvasText` for `<dialog>` and `[popover]`. That rendered as pure black or white instead of the theme's text color, and as black on a dark surface where dark mode is applied without `color-scheme`.

@nynexman4464
