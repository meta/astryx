---
'@astryxdesign/core': patch
---

[feat] `presentation="adaptive"` on DropdownMenu, ContextMenu, MoreMenu, Selector and MultiSelector chooses the bottom sheet on a compact touch screen: a coarse primary pointer and a viewport narrower than 744px or shorter than 500px (it was 768px wide and below). An iPad mini in portrait keeps the anchored popover; a phone in landscape now gets the sheet.

@vjeux
