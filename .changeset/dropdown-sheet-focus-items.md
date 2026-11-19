---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: in a bottom sheet opened from the keyboard, focus stays on the row a person moved to when the menu re-renders with a new `items` array, such as after a choice that updates the app's state. It moved back to the first row before. The sheet still focuses its first row when it opens, and its heading when a sub-menu is entered or left.

Reported by duytbp.

@cixzhang
