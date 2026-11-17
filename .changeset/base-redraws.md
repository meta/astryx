---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a whole-theme token the base theme draws past on a part (neutral's neutral badge fills with its own gray, not `--color-neutral`) is no longer reported as reaching it. `set` says that part does not use the token and gives the command that does; `how <token>` lists those parts under `notIn`; and a value question about the part answers what it draws there, the theme's own setting on it first.

@josephfarina
