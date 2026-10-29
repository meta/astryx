---
'@astryxdesign/core': patch
---

[fix] A mouse slide across the items of NavHeadingMenu or TabMenu no longer selects their text. In an expanded SideNavHeading, which stays open after a pick, the selection used to stay on the item the press began on. Caller content beside NavHeadingMenu's items stays selectable.

@cixzhang
