---
'@astryxdesign/core': patch
---

[fix] MobileNav: the drawer's content region is now a navigation landmark (`<nav>`) named like the drawer's dialog, so someone moving by landmarks on a phone finds the drawer's links, as they find SideNav's on a wide screen. SideNav items and a TopNav's drawer content both sit inside that one landmark.

@cixzhang
