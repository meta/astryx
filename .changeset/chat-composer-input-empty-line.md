---
'@astryxdesign/core': patch
---

[fix] ChatComposerInput: an empty input keeps its one-line height and takes typing after a page restyle, for example after an open Dialog that holds a SegmentedControl unmounts. Before, its editable area could collapse to 0px, so a click landed beside it and typing did nothing until a reload.

@lzcmian
