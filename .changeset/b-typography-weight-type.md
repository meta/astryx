---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `astryx experimental theme` name a typography weight given as a number (`weight: 600`) as a type mismatch: the field takes the text `'600'`. The message says Core still writes a weight from 1 to 1000, and offers the text form.

@josephfarina
