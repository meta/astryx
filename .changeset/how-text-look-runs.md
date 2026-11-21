---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes every look of a run said together right before a part's own text, when the run starts with a weight word, a numeric weight or a color, or is a size and then a color ("tabs: bold 13px #3b5998 text", "tabs with #3b5998 bold 13px text", "tabs with 13px #3b5998 text"), instead of dropping its color. A run that starts with a size and then a weight, or with italic or uppercase, reads as before. Links said with the top bar or top nav ("top bar #3b5998 with white bold 11px links") take their weight, size and case on its nav items instead of being refused, and the bar keeps their color as its link color where it holds them (with a sidebar named first, their color goes on the nav items instead of every link). Elsewhere, such as a run with no part of its own, a run placed in another part, or links said with another part, it reads as before.

@josephfarina
