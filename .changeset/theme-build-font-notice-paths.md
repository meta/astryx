---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: its font notices name the typography recipe, written with the project's own runner in text output, and it compares real paths in the disk's own case, so a theme reached through a differently cased path is not reported as missing or as another file.

@josephfarina
