---
'@astryxdesign/core': patch
---

Grid: `columns={{minWidth}}` without `max` no longer overflows a container narrower than `minWidth`. A lone column now shrinks to the container width, as it already did with `max`, so a phone no longer scrolls sideways.
