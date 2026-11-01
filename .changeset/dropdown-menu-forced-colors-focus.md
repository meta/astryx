---
'@astryxdesign/core': patch
---

[fix] A keyboard-focused `DropdownMenu` row now shows the standard focus ring, drawn inside the row, in every color mode. Rows showed focus only with a translucent background, which forced colors (Windows High Contrast and similar modes) replace with the page color, so a keyboard user there could not tell which row Enter would activate. The ring follows the last input: it appears after keyboard navigation, not on the row under the mouse. Action, destructive, checkbox, radio and sub-menu rows all show it, including in `ContextMenu` and breadcrumb menus.

@cixzhang
