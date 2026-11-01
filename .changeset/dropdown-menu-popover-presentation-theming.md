---
'@astryxdesign/core': patch
---

[fix] The anchored `DropdownMenu` now reflects `data-presentation="popover"` on its `dropdown-menu` target, as the bottom sheet already reflected `bottom-sheet`. A theme rule written for `presentation:popover`, which the docs list as a visual prop of that target, now applies.

@cixzhang
