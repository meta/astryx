---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, a plain fill color asked of a part that has colored or status variants now changes only its neutral variants. "white cards" changes the default, transparent and muted cards, and "blue tags" changes the neutral badge. Each colored or status variant (the blue card, the success badge) keeps its own color. The answer names those variants and gives a line to change each one too.

A color that is worked out from another color, an answer that already keeps a variant apart, and a part whose variants are roles (a button's primary, secondary and ghost) are unchanged.

@josephfarina
