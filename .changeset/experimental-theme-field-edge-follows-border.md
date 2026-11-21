---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> --color-border <color>`: a whole-theme border color also moves the edge the fields draw (the token the census reads for their border color, today `--color-border-emphasized`) to that color where it reads at 3:1 on the field's fill, else to the nearest shade of it that does, in each mode, so "thin light gray borders" reach inputs and selectors while they keep a boundary people can see. The result names the shade ("fields kept at 3:1"), with the line that gives fields the exact color; a field edge the theme sets itself keeps its value; one undo takes both back.

@josephfarina
