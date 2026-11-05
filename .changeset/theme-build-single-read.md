---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reads the theme's icon import from the source it loaded: a theme saved in place while it builds now builds with its import, or fails and builds on the next save, instead of producing a module without the import.

@vjeux
