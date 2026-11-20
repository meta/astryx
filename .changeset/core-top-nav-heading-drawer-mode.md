---
'@astryxdesign/core': patch
---

[feat] TopNavHeading carries `data-mode="drawer"` when TopNav draws it as the phone menu's title, as TopNavItem already does, so a theme keys the menu's title with `mode:drawer` (for example a heading colored for a dark top bar, kept readable on the menu's own surface). In the bar it carries no `mode`; nothing else changes.

@josephfarina
