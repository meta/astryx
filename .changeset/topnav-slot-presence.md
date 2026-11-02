---
'@astryxdesign/core': patch
---

[fix] TopNav, TopNavHeading, TopNavMegaMenuItem, TopNavMenu, NavHeadingMenuItem: a slot whose value is `0` showed a stray "0" beside its slot, or was dropped. That covers `heading`, `startContent`, `endContent`, the drawer's mobile content, `logo`, `headerEndContent`, `icon`, a menu item's `icon` and `description`. Now each slot follows the shared presence check. Empty values (`null`, `false`, `''`) render no slot, as an omitted one does: an empty `centerContent` or `startContent` no longer switches the bar to its center layout or opens an empty drawer section. `0` renders inside its slot as content.

@cixzhang
