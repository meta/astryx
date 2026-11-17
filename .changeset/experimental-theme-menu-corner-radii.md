---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … border-radius '0 0 6px 6px' --on dropdown-menu`: a radius of two to four corners is taken on a part whose corners Core reads inside calc() (a menu's popup and its rows); each corner goes on the box, and the first corner is the one length the inner rows follow. `how` reads "menu corners 0 0 6px 6px" as that radius, each corner as written.

@josephfarina
