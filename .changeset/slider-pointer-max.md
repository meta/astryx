---
'@astryxdesign/core': patch
---

[fix] Slider reaches its explicit maximum when dragging or pressing the track endpoint, or pressing a mark at `max`, even when step rounding would select a lower value (for example, `min={0}`, `max={100}`, and `step={3}`).

@korkt-kim
