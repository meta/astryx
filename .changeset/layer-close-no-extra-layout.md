---
'@astryxdesign/core': patch
---

[perf] Closing a Popover, menu or other anchored layer no longer lays out the page an extra time. The layer runtime reads a closing layer's animations only when the layer's closed state declares a discrete `display` transition or a keyframe animation. It reads that style while the layer is still closed. Such a layer, as TopNavMegaMenu's panel is, still keeps its trigger's anchor name until its fade ends. An animation a script starts is not tracked.

@cixzhang
