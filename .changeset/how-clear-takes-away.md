---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an ask that starts with "clear the …" and says only parts (one, or several joined by "and": "clear the card and button borders"), their mode or variant, and removable looks (background, border, shadow, …) takes those looks away, as "remove" does: "clear the dark mode card background" gives the card a transparent fill in dark mode. Before, it read as a reset and answered that the theme already uses the base value. On a theme that sets that look, the ask now takes it away instead of undoing the setting; an ask for the person's edits ("clear my card background changes") still undoes them. Any other word in the ask (a way back, also in a next ask that points back with "it"; the person's edits; what someone added; a second look; a color, a value or a property of the thing) leaves the reset reading as before.

@josephfarina
