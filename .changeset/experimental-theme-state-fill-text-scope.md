---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` measures a state's fill against the text that state draws, in its own variant: a part that draws no text (a switch's track, a tab's underline) gets no text problem, and a primary button's hover fill is measured against the primary button's own text, not another variant's. A page change that leaves the loading placeholder as faint as the base drew it no longer reports it as a new problem.

@josephfarina
