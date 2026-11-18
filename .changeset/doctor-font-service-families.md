---
'@astryxdesign/cli': patch
---

[fix] `doctor`'s theme font check now counts a family as loaded when a `family` parameter of a font service URL in the theme's font stylesheet names it. The Google Fonts import in every Astryx theme's font stylesheet does this. Before, an app set up correctly with the neutral theme got a warning it could not act on: "External font imports prevent proof for neutral: Figtree." A family that no `family` parameter names still gets that warning, as does a font service URL that names its families another way.

@josephfarina
