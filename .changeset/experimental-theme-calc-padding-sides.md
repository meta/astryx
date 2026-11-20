---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> padding '5px 0' --on dropdown-menu` (or any part whose padding Core reads inside `calc()`, where one length is all that works) now offers the sides it means. Before, it offered a pointer to `how` for two lengths, and for three or four lengths (or two variables) one line with the first value only, such as `padding 2px`, which dropped the other lengths. Now it offers `padding-block 5px` and `padding-inline 0` for two lengths, `padding-top`, `padding-inline` and `padding-bottom` for three, and each side for four, each with the length you typed for it. A repair gate fix lets such a refusal offer three or four side lines together.

@josephfarina
