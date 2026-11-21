---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes the color of a run said together right before a part's own text when the run has a weight word such as bold or semibold before its size ("tabs: bold 13px #3b5998 text", "tabs with bold uppercase 13px #3b5998 text", "tabs with italic bold 13px #3b5998 text"), instead of dropping it. A run with no weight word, or with its size before its weight, reads as before. Links said with the top bar or top nav ("top bar #3b5998 with white bold 11px links") take their weight, size and case on its nav items instead of being refused, and the bar keeps their color as its link color where it holds them (with a sidebar named first, their color goes on the nav items instead of every link). Elsewhere, such as a run with no part of its own, a run placed in another part, or links said with another part, it reads as before.

@josephfarina
