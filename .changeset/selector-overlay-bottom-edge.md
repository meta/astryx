---
'@astryxdesign/core': patch
---

[fix] A Selector whose trigger sits near the bottom of the screen now opens its list on screen. The selected-item overlay measured only the list, not the popover border around it, so near the bottom edge the browser flipped the list below the viewport and its last options could not be reached. The overlay now keeps the whole popover in the viewport.

@cixzhang
