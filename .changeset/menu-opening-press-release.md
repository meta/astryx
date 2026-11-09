---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a menu that a mouse press opens stays open when that press is released quickly away from the trigger, or after the trigger moved away under the pointer. Before, the browser's light dismiss read that release as a press outside and closed the menu at once. A press released after the settle time outside the menu still closes it, and a later press outside dismisses it.

@vjeux
