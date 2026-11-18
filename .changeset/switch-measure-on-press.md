---
'@astryxdesign/core': patch
---

[perf] `Switch` no longer measures its track when it mounts. It reads the track's size at the first press instead, so a settings page with hundreds of switches renders without one forced layout per switch. Dragging, right-to-left layouts and a press right after mount work as before. Two small differences: a mouse or pen drag after a toggle now flips at the thumb's current size (up to 4 px different at the medium size), and a theme that resizes the Switch thumb animates its first value change from the default size.

@cixzhang
