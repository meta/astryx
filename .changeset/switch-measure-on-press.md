---
'@astryxdesign/core': patch
---

[perf] `Switch` no longer measures its track when it mounts. It reads the track's size at the first press instead, so a settings page with hundreds of switches renders without one forced layout per switch. Dragging the thumb, the flip point and right-to-left layouts work as before.

@cixzhang
