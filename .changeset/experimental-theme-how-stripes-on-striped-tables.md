---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a stripe ask that says on, in or for striped tables ("odd rows #f9f9f9 on striped tables") stripes only the tables the app marks `isStriped` (`--state striped`), instead of every data-driven table. An ask that names any other table ("…on striped tables too", "every table, even on striped tables", "…and on plain tables", "…and every table header bold") stays on every table, as a stripe with no scope does; and one that excludes them ("but not on", "anywhere but on") stripes every table and takes it back on striped tables, which keep their rows as Core draws them. "zebra rows on striped tables" writes nothing while the theme fills none of those rows at rest or on striped tables (Core already stripes those tables), and writes the stripe back when a theme fill covers it: a cleared or recolored stripe, or a plain row fill. When the theme stripes the other rows itself, it writes nothing; when the theme made the stripe's color transparent ("no stripes"), it takes that back, and writes the stripe after it when a theme row fill also covers it. "striped tables" alone still stripes every data-driven table.

@josephfarina
