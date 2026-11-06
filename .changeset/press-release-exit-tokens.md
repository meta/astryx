---
'@astryxdesign/core': patch
---

[fix] A press's release now fades on the theme's exit motion tokens, `--duration-exit` and `--ease-exit`, instead of 200 ms, scaled by the theme's `tempo`, on a curve of its own. This covers every release that fades: a finger, mouse, pen or key press on a phone or tablet, and a pen press on a desktop, on buttons, cards, switches, checkboxes, list and tree rows, tabs, menu items and action groups. With the default tokens the release is 175 ms and holds its colour a little longer before it goes. A theme that changes `--duration-exit` or `--ease-exit` now changes the release too; a theme's `tempo` still does, through `--duration-exit`. Under Reduce Motion a finger's release still fades for no more than 200 ms. A mouse press on a desktop is unchanged.

@cixzhang
