---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: "even rows transparent" and "odd rows transparent" take that stripe away (`background-color transparent --on table-row --when parity:even`), as "no stripes on even rows" does, and only on striped tables when the ask says so ("even rows transparent on striped tables"). Before, they got no command.

@josephfarina
