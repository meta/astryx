---
'@astryxdesign/core': patch
'@astryxdesign/theme-neutral': patch
---

[fix] A SegmentedControl's segments grow with their labels when the text size grows past their height (iOS Dynamic Type at its accessibility sizes, or a browser's larger text), instead of holding a fixed height that the label runs out of. At the default text size on a desktop every segment keeps its height. On a phone, Neutral's small segment, whose label line is 21 px, grows from 20 to 21 px so the label is no longer clipped.

@cixzhang
