---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an undo that names a look takes back only that look's earlier change ("Make the headings bigger. Make the headings bold. Undo the heading size change." keeps the bold; "Undo the heading italic change" keeps the bold; "Undo the heading font size change" keeps the family), where it took back nothing before. An undo that names more than one change still takes back none and says so.

@josephfarina
