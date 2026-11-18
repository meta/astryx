---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reads a base theme defined in the same file as the theme it extends, not as the theme itself: a setting the base's variant beats is named, and the theme's own lookup never reads an object the theme extends.

@josephfarina
