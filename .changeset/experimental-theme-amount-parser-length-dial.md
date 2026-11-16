---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads every way an amount is said ("a quarter bigger", "half again", "2x", "×2", "x0", "4 times", "by a factor of 2", "+50%", "-25%", "50 percent", "½") as a factor of what is there now, never as a length and never with an extra dial step; keeps fractions of a pixel; scales a part's line height and opacity the asked way ("50% more transparent" lowers the opacity and leaves the fill); answers whole-theme radius and border width amounts with exact token values (a whole-theme spacing or text amount it can only step says so); says when a part has no width to scale instead of giving a fixed cap; scales an own side padding with the rest; keeps the state and variant of a "2px rounder on hover" move and of a padding step; reads a corner percent with an amount ("50% of now", "20% bigger") as an exact radius, never a CSS percent; says when a corner amount can only step; and reads "no inner spacing", "zero padding" and "no gap" as zero of that thing, in the state asked.

@josephfarina
