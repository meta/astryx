---
'@astryxdesign/core': patch
---

[fix] Dragging a `BottomSheet` with snap points up from a shorter detent, or back down past it, no longer flashes the sheet away from the finger. For one frame the sheet jumped by the height its scrolling area gives up at that detent (about half the screen at a half-height stop) and then snapped back. The height and position now change in the same frame.

@cixzhang
