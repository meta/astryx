---
'@astryxdesign/core': patch
---

[fix] SideNav (`footerIcons`, `topContent`), SideNavHeading (`icon`, `headerEndContent`), SideNavItem (`endContent`) and SideNavSection (`endContent`): a slot whose value is `0` showed a stray "0" beside its slot, or nothing at all. Now each slot follows the shared presence check. Empty values (`null`, `false`, `''`) render no slot, as an omitted one does. `0` renders inside its slot as content, including a collapsed rail's icon-only heading and the footer and top areas around it.

@cixzhang
