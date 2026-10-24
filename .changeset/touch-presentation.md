---
'@astryxdesign/core': patch
---

[feat] `presentation="adaptive"` on DropdownMenu, ContextMenu, MoreMenu, Selector and MultiSelector, and a DropdownMenu's default sub-menu drill-in, now follow one shared touch rule: a coarse primary pointer on a compact viewport. Compact is narrower than 744px or shorter than 500px (it was 768px wide and below), so a phone in landscape now gets the bottom sheet and the drilled-in sub-menu, and an iPad mini in portrait keeps the anchored popover and flyout. This is a behavior change: the old default was the bottom sheet at 768px wide and below on a coarse pointer, and the new default is the rule above. To pin a component's presentation regardless of the rule, pass `presentation="popover"` or `presentation="bottom-sheet"`. Mouse and keyboard users on desktop see no change: every case still requires a coarse pointer.

@vjeux
