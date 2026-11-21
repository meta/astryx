---
'@astryxdesign/core': patch
---

[fix] A Citation's label and number pills grow with their text when the text size grows past their 20 px height (iOS Dynamic Type at its accessibility sizes, or a browser's larger text), instead of clipping the label. At the default text size each pill keeps its height.

@cixzhang
