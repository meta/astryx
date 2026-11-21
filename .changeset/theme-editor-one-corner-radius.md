---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a radius named for one corner ("a 4px top left radius") writes that corner only on a part that shows no corners of its own, as it already did on a part that does. Before, it rounded all four corners there ("focused links: a shadow and a 4px top left radius" wrote `border-radius 4px`). With no edge on the part, the corner is refused with why, naming that corner.

@josephfarina
