---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx doctor` no longer warn that a theme's font does not load for Noto Sans, Noto Serif and Noto Sans Mono (system fonts of Android, ChromeOS and Linux) or Cantarell, Ubuntu and Ubuntu Mono (system fonts of Linux). A system font stack that names them needs no font package.

@josephfarina
