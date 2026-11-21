---
'@astryxdesign/core': patch
---

[fix] NavHeadingMenu: after keyboard input, the focused item draws the focus ring, so keyboard users can see which item Enter opens. The hover fill alone measured under 3:1 against the menu. After pointer input the item keeps the fill alone, as in DropdownMenu.

@cixzhang
