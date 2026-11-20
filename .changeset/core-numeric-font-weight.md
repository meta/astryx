---
'@astryxdesign/core': patch
---

[fix] defineTheme: a typography weight that reaches Core as a number (from a theme written in JavaScript or read from JSON, such as `heading: {weight: 700}`) is written as its text (`700`) everywhere it is read. A theme that extends a base with adaptation rules now builds instead of failing with "adaptations.rules[0]… must resolve to a concrete CSS string". The `FontWeight` type does not change.

@josephfarina
