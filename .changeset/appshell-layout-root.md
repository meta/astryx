---
'@astryxdesign/core': patch
---

[fix] `AppShell` is a layout root: the layout values its ancestors pass down stop at its root, so it lays out the same inside a padded `Card`, a `Section` or a `Layout` as at the page root. Before, its internal Layout escaped a padded host's padding on all four sides, so in a host that clips overflow (a docs example card, for one) the shell's logo was cut at the inline start and its navigation and content at the other edges. A caller's own props and styles on `AppShell` still apply; theme, color mode, direction and translations keep inheriting.

@cixzhang @duytbp
