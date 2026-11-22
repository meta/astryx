---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` puts the text that reads on a fill in the fill's own answer: when one part's text would measure under 4.5:1 on the fill in a mode, the answer writes the fill and then, for each look and mode that fails, a readable text color (`secondary buttons #03dac6` writes the teal fill and a dark label in dark mode; light mode keeps its label). The text measured is the one the look draws in that mode: the theme's own text color for that state (one said for the mode before one said for both, the look's own before the whole part's), else the base theme's rule for that state or look (a destructive button's dark-red label in light mode), else Core's. The whole ask in order carries those lines too, and a status fill still offers its color for the whole theme as the second line. A fill on a group of parts (`make the menus navy`) carries no text line, and a state fill that names no look (`make the open select navy`) keeps its readable text as an answer of its own.

@josephfarina
