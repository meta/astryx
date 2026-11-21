---
'@astryxdesign/core': patch
---

[fix] On a right-to-left page, a cut Latin label keeps its start ("Mon…", not "…onth") in Button, SegmentedControl and a truncating Table heading. A label with a right-to-left letter keeps the page direction and is cut at its own end.
