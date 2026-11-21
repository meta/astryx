---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an ask that starts with "clear the …" and says only parts, their mode or variant, and removable looks (background, border, shadow, …) takes those looks away, as "remove" does: "clear the dark mode card background" gives the card a transparent fill in dark mode. Before, it read as a reset and answered that the theme already uses the base value. Any other word in the ask (a way back, the person's edits, what someone added, a color, a value or a property of the thing) leaves the reset reading as before.

@josephfarina
