---
'@astryxdesign/core': patch
---

[fix] DropdownMenu: a header or footer added to an open menu no longer lets the last rows slide under it. The menu keeps measuring its rows after the new frame mounts, so a height-capped list becomes scrollable again and every action stays reachable.

@cixzhang
