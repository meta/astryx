---
'@astryxdesign/core': patch
---

[feat] `presentation="adaptive"` on DropdownMenu, ContextMenu, MoreMenu, Selector and MultiSelector, and a DropdownMenu's or ContextMenu's default sub-menu drill-in, now use the theme's compact definition with a coarse primary pointer: a viewport narrower than the theme's `md` point (768px by default) or shorter than 500px. This is a behavior change. The old default was a bottom sheet at 768px wide and below on a coarse pointer. Now a coarse-pointer screen exactly 768px wide keeps the anchored popover, and a phone in landscape (wider than 768px but shorter than 500px) gets the bottom sheet and the drilled-in sub-menu. A theme that moves `md` moves the edge with it. To pin a component's presentation regardless of the rule, pass `presentation="popover"` or `presentation="bottom-sheet"`; to keep a sub-menu's flyout, pass `presentation="flyout"` on `DropdownMenuSubMenu`. Mouse and keyboard users on desktop see no change, because every case requires a coarse pointer.

@vjeux
