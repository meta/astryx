---
'@astryxdesign/core': patch
---

[fix] TopNav (`heading`, `startContent`, `endContent`), TopNavHeading (`logo`, `headerEndContent`), TopNavMegaMenuItem (`icon`), TopNavMenu drawer items' `icon` and NavHeadingMenuItem's `description`: a slot whose value is `0` showed a stray "0" beside its slot. Now each slot follows the shared presence check. Empty values (`null`, `false`, `''`) render no slot, as an omitted one does: an empty `centerContent` or `startContent` no longer switches the bar to its center layout, shows the mobile-bar menu toggle or opens an empty drawer section. `0` renders inside its slot as content. (#9500)

@cixzhang
