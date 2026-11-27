---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx doctor` no longer report `SFMono-Regular` as a font the theme does not load. It is the PostScript name of SF Mono, which Core's own reset lists after `ui-monospace`.

@vjeux
