---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
'@astryxdesign/theme-neutral': patch
---

[fix] A SegmentedControl's segments grow with their labels when the text size grows past their height (iOS Dynamic Type at its accessibility sizes, or a browser's larger text), instead of holding a fixed height that the label runs out of. At the default text size every segment keeps its height, on a desktop and on a phone.

@cixzhang
