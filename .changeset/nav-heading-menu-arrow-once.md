---
'@astryxdesign/core': patch
---

[fix] In a SideNavHeading or TopNavHeading menu built with NavHeadingMenu, one ArrowDown or ArrowUp now moves focus one item. It used to move two, skipping every other item, and in a two-item menu ArrowDown never moved focus.

@cixzhang
