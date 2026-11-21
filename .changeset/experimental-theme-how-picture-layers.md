---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a part's two gradient layers as one value: in an ask that says `background` for a part, the comma between two gradient layers (`linear-gradient(…) 0 0 / 24px 24px, linear-gradient(90deg, …) 0 0 / 24px 24px`) no longer splits it. A comma before a color, after a plain color, before a layer said with a part of its own, or in an ask without the `background` word still starts a new ask, and the page keeps its own reading.

@josephfarina
