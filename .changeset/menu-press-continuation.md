---
'@astryxdesign/core': patch
---

[chore] Internal: the menu press model takes a pointer that went down elsewhere, such as a context menu's long press, as the menu's opening press (`module:DropdownMenu/useMenuPress` FR11), and its trigger-less entry takes the touch model, so under the `'uikit'` touch model a finger handed to the menu, on every device, picks only past UIMenu's handoff distance. Not part of the public hooks API.

@vjeux
