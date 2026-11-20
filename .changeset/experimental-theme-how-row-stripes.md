---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: table row stripes are answered with the stripe itself where Core marks it on each body row (`--when parity:odd` or `parity:even`). "zebra rows", "striped tables", "alternate row shading" and "shade every other row" (the stripes' names are read from the doc of the prop that turns them on) stripe every data-driven table on Core's own (even) stripe with the theme's stripe color; an ask naming a stripe ("odd rows #f9f9f9") sets that stripe and clears Core's other stripe on striped tables; "no stripes on even rows" takes that stripe away. Before, "zebra rows" and "striped tables" said set had no condition for every other row, "alternate row shading" and "shade every other row" were not read as a fill, and "odd rows <color>" colored every row. `set --when` names `parity:odd`/`parity:even`, with a zebra-rows example.

@josephfarina
