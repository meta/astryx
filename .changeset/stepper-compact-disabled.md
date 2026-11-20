---
'@astryxdesign/core': patch
---

[fix] In a Stepper's compact horizontal layout, a disabled Step now tells screen-reader users it is unavailable, with a hidden word after its label, as the expanded layout's disabled button already does. The new translated string is `@astryx.step.status.unavailable`; locales without it fall back to English.

@duytbp
