---
'@astryxdesign/cli': patch
---

[fix] `astryx component` reads the project's recorded theme without loading the code of the other theme commands, so a component read in text form finishes a little sooner. The output does not change.

@josephfarina
