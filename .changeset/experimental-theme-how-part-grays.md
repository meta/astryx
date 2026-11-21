---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a bare "neutral grays" clause is now also read on a theme that sets part colors or a page, surface or card color of its own, or whose base keeps tinted grays in its part rules (such as one made like Stone or Butter). The answer names what keeps its tint whatever the seed is: the gray tokens part rules set (Stone's secondary text on a muted card), a page, surface or card color the theme sets, and a fill the theme sets on a part ("cream cards"). It never says the grays are already neutral while one of these stays tinted. A part value counts as a tinted gray by its color, so a strong color a part sets (red text on a card) is not named.

@josephfarina
