---
'@astryxdesign/core': patch
---

[perf] Opening a menu, popover, hover card or other anchored layer restyles less. The entrance-side values the layer writes as it shows no longer pass to every element inside it, so a Popover open restyles about 45 fewer elements and its focus move spends about half as long restyling. The entrance is unchanged.

@cixzhang
