---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a tint word now picks, in each mode, the stop of the color's ramp where the text on the part reads at 4.5:1: the text the ask says ("buttons tinted blue with white text" deepens the light tint until white reads, and the label stays white), else the theme's primary and secondary text ("tinted cards" keep their secondary text readable in dark mode). The tint stays the nearest stop to Core's card-tint stop, never past the color itself; with no such stop it is that default stop, as before.

@josephfarina
