---
'@astryxdesign/cli': patch
---

[fix] `astryx component VStack --detail full` (and any read of one member of a component family) prints the props list once, under Props, instead of again under Components. The JSON is unchanged.

@josephfarina
