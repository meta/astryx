---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: padding and corners reach the elements Core draws them on.

- Padding on a table row, which CSS draws no padding on, is refused for its cells, and `how` answers a typed table row padding on the cells.
- Corners on a button group are written as the corner token its first and last buttons read, so the group's outer corners follow.

@josephfarina
