---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a finger's hold-slide-lift or tap no longer flashes the focus outline on the menu button. When a press opens the menu, the button takes focus first, so focus can return to it when the menu closes; that focus now follows the last input, so it shows the outline only after keyboard input. Returning focus to a sub-menu's row follows the same rule. A keyboard open and close still show the outline on the button.

@cixzhang
