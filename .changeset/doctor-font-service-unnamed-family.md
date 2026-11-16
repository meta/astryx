---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s font check no longer asks you to confirm a font service stylesheet (such as a Google Fonts `@import`) that names its families. A family the stylesheet does not name now fails with no proven loader, and the fix names the package that loads it (`@fontsource/jetbrains-mono`).

@josephfarina
