---
'@astryxdesign/core': patch
---

[fix] ChatComposerInput's trigger menu announces its "Searching…" row through Core's shared busy announcement, like other busy controls: once per search, not repeated while typing continues, and not at all when results arrive first. Inside a native modal dialog an app renders without Astryx, it is now heard inside that dialog.

@HelloOjasMutreja
