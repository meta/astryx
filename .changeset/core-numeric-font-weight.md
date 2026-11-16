---
'@astryxdesign/core': patch
---

[fix] defineTheme: a typography weight given as a number (`heading: {weight: 700}`) is written as its text (`700`) everywhere it is read, so a theme that extends a base with adaptation rules builds instead of failing with "adaptations.rules[0]… must resolve to a concrete CSS string". `FontWeight` takes a number too.

@josephfarina
