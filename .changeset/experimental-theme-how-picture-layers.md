---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a background's gradient layers as one value: in an ask that says `background`, a comma after a gradient layer that another gradient layer or the final color follows (`linear-gradient(…) 0 0 / 24px 24px, linear-gradient(90deg, …) 0 0 / 24px 24px`) no longer splits it. A comma after a plain color, or before a layer that names a part of its own ("… on cards"), still starts a new ask.

@josephfarina
