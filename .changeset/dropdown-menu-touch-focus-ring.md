---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a finger's hold-slide-lift no longer flashes the focus outline on the menu button. When a held press opens the menu, the button takes focus first, so focus can return to it when the menu closes; that focus now shows the outline only after keyboard input. A keyboard open and close still show the outline on the button.

@cixzhang
