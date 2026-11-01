---
'@astryxdesign/core': patch
---

[fix] A keyboard-focused `DropdownMenu` row now shows the standard focus ring, drawn inside the row, in every color mode. Rows showed focus only with a translucent background, which forced colors (Windows High Contrast and similar modes) replace with the page color, so a keyboard user there could not tell which row Enter would activate. The ring follows the last input: after a key press it marks the focused row, including a row the mouse then moves focus to; after a mouse or touch press it does not show. Action, destructive, checkbox, radio and sub-menu rows all show it, including in `ContextMenu` and breadcrumb menus. A `ContextMenu` opened by right-click or long-press focuses its first row without the ring; one opened from the keyboard shows it.

@cixzhang
