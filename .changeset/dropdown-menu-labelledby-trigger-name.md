---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a custom trigger (`renderTrigger`) named by `aria-labelledby` now names its open menu too. The menu points at the same ids, so a screen reader announces "Project actions menu" instead of an unnamed menu.

@cixzhang
