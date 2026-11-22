---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a part's gradient layers as one value: in an ask whose `background` or `background-image` word comes straight before the first layer, the comma between gradient layers (`linear-gradient(…) 0 0 / 24px 24px, linear-gradient(90deg, …) 0 0 / 24px 24px`, three or more layers included) no longer splits it. A comma before a color, after a plain color, before an item that does not start with a gradient ("…, hover linear-gradient(…)"), before a layer said with a part of its own, or with other words between the property word and the first layer (`background on hover …`, `background to …`, `background-color …`) still starts a new ask. `table body` reads as a part's; `page` and any other `body` keep the page's own reading.

@josephfarina
