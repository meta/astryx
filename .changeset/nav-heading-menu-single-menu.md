---
'@astryxdesign/core': patch
---

[fix] A `NavHeadingMenu` passed as the `menu` of a `SideNavHeading` or `TopNavHeading` no longer adds a second, unnamed menu inside the heading's menu. Screen readers now meet one menu, named after the heading, that holds the items. A `NavHeadingMenu` used on its own is still a menu, named by the `aria-label` you pass.

@cixzhang
