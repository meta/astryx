---
'@astryxdesign/core': patch
---

[fix] Under the Reduce Motion setting, the disclosure chevrons that still turned now land at once: Collapsible, Selector, MultiSelector, TabMenu, TreeList, CodeBlock, Table row expansion, grouped and tree rows, and the TopNav menus. The resize handle's pill now changes at once too. Core's transform transitions also read the reduced-motion signal that a theme with `reducedMotion: 'always'` writes, but no theme can set that option yet, so that part changes nothing for anyone today.

@cixzhang
