---
'@astryxdesign/core': patch
---

[fix] On a right-to-left page, a cut Latin label keeps its start ("Mon…", not "…onth") in Button, SegmentedControl and a truncating plain-text Table heading (a heading with no sort or resize control). A label with a right-to-left letter keeps the page direction and is cut at its own end. An uncut Latin label that has punctuation at an edge or starts with a number now reads in its own order on a right-to-left page ("C++", not "++C"; "30 days", not "days 30").
