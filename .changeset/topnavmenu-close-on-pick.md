---
'@astryxdesign/core': patch
---

[fix] TopNavMenu closes when you pick one of its items, with Enter, Space or a click, and returns focus to its trigger, as DropdownMenu does. Before, the menu stayed open with focus on the item, so after an in-app link or an action item focus never came back to the bar.

@josephfarina
