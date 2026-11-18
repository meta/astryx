---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> padding '5px 0' --on dropdown-menu` (or any part whose padding Core reads inside `calc()`, where one length is all that works) now offers the sides it means instead of only a pointer to `how`: `padding-block 5px` and `padding-inline 0` for two lengths, `padding-top`, `padding-inline` and `padding-bottom` for three, and each side for four, each with the length you typed for it. A repair gate fix lets such a refusal offer three or four side lines together.

@josephfarina
