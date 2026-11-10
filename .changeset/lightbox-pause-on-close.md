---
'@astryxdesign/core': patch
---

[fix] Closing a Lightbox stops a video that was playing. The viewer stays mounted, so the picture and its sound would otherwise continue after Close, Escape, or a tap outside. A viewer that is already closed does not start playback either. Opening it again plays the current video when `hasAutoPlay` is set. A video inside the caption stays stopped.

@SebTardif
